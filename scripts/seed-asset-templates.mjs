#!/usr/bin/env node
// Reads convex/seed/categories.json and convex/seed/templates/*.json,
// validates them against the rules the catalog enforces, then upserts the
// whole batch via the internal Convex mutation assetTypeTemplates:upsertSeedBatch.
//
// Idempotent: rerun any time. New rows get inserted, changed rows get patched
// (descriptors are replaced wholesale on each run — version field controls
// the user-facing "newer version available" UX, not seed idempotency).
//
// Usage:
//   CONVEX_URL=https://<deployment>.convex.cloud \
//   CONVEX_DEPLOY_KEY=prod:... \
//     node scripts/seed-asset-templates.mjs
//
// In local dev, source the same env vars the backend uses (CONVEX_DEPLOY_URL
// works as a fallback for CONVEX_URL).

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, "..", "convex", "seed");

const ALLOWED_DATA_TYPES = new Set([
  "text",
  "number",
  "date",
  "year",
  "boolean",
  "select",
]);

const KEBAB_RE = /^[a-z0-9-]+$/;

function loadCategories() {
  const cats = JSON.parse(
    readFileSync(join(SEED_DIR, "categories.json"), "utf8")
  );
  const slugs = new Set();
  for (const c of cats) {
    if (!c.slug || !KEBAB_RE.test(c.slug)) {
      throw new Error(`Category has invalid slug: ${JSON.stringify(c)}`);
    }
    if (slugs.has(c.slug)) throw new Error(`Duplicate category slug: ${c.slug}`);
    slugs.add(c.slug);
    if (!c.name) throw new Error(`Category ${c.slug} missing name`);
  }
  return { cats, slugs };
}

function loadTemplates(categorySlugs) {
  const dir = join(SEED_DIR, "templates");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const templates = [];
  const slugs = new Set();

  for (const f of files) {
    const t = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const errs = [];

    if (!t.slug || !KEBAB_RE.test(t.slug)) errs.push("invalid slug");
    if (slugs.has(t.slug)) errs.push(`duplicate slug ${t.slug}`);
    if (!t.name) errs.push("missing name");
    if (!categorySlugs.has(t.category))
      errs.push(`unknown category ${t.category}`);
    if (!/^\d+\.\d+\.\d+$/.test(t.version || ""))
      errs.push(`invalid semver ${t.version}`);
    if (!Array.isArray(t.descriptors) || t.descriptors.length === 0)
      errs.push("descriptors[] required");

    const orders = (t.descriptors || []).map((d) => d.order).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i + 1) {
        errs.push(`orders not 1..N contiguous: ${orders.join(",")}`);
        break;
      }
    }
    const seenKeys = new Set();
    for (const d of t.descriptors || []) {
      if (!d.name) errs.push("descriptor missing name");
      if (!d.key || !KEBAB_RE.test(d.key))
        errs.push(
          `descriptor "${d.name}" has invalid key ${JSON.stringify(d.key)} (must be kebab-case)`
        );
      if (seenKeys.has(d.key))
        errs.push(`duplicate descriptor key "${d.key}"`);
      seenKeys.add(d.key);
      if (!ALLOWED_DATA_TYPES.has(d.dataType))
        errs.push(`bad dataType: ${d.dataType}`);
      if (
        d.dataType === "select" &&
        (!Array.isArray(d.options) || d.options.length === 0)
      ) {
        errs.push(`select descriptor "${d.name}" missing options`);
      }
    }

    if (errs.length) {
      throw new Error(`${f}: ${errs.join("; ")}`);
    }
    slugs.add(t.slug);
    templates.push({
      slug: t.slug,
      name: t.name,
      description: t.description,
      category: t.category,
      tags: t.tags || [],
      version: t.version,
      descriptors: t.descriptors.map((d) => ({
        key: d.key,
        name: d.name,
        dataType: d.dataType,
        options: d.options,
        required: !!d.required,
        order: d.order,
      })),
    });
  }
  return templates;
}

async function main() {
  // Always validate first — `--check` lets you run the validator in CI
  // without touching Convex.
  const checkOnly = process.argv.includes("--check");

  const { cats, slugs } = loadCategories();
  const templates = loadTemplates(slugs);
  console.log(
    `Validated ${cats.length} categories and ${templates.length} templates.`
  );

  if (checkOnly) return;

  const url = process.env.CONVEX_URL || process.env.CONVEX_DEPLOY_URL;
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!url) throw new Error("CONVEX_URL (or CONVEX_DEPLOY_URL) is required");
  if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY is required");

  const client = new ConvexHttpClient(url);
  client.setAdminAuth(deployKey);

  const result = await client.mutation(
    api.assetTypeTemplates.upsertSeedBatch,
    { categories: cats, templates }
  );
  console.log("Upserted:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
