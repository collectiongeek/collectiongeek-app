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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, "..", "convex", "seed");

// Inline mini-loader for .env.local. Node's --env-file-if-exists flag would
// be cleaner but only landed in 22.7, which is above this repo's documented
// Node 20+ baseline. Stays tiny: KEY=value lines only, strips matching
// quotes, never overrides an already-set process.env value (so explicit
// shell exports still win), silently no-ops if the file is missing.
//
// We record which keys we loaded so main() can print the source per env var
// — that's how you catch a shell-quoting mistake (where you THOUGHT you
// passed `FOO=...` inline but a `|` in the value broke the assignment and
// .env.local filled in unwanted defaults).
const ENV_LOCAL = join(__dirname, "..", ".env.local");
const ENV_FROM_FILE = new Set();
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
    ENV_FROM_FILE.add(m[1]);
  }
}

const envSource = (key) =>
  ENV_FROM_FILE.has(key) ? ".env.local" : "inline";

const ALLOWED_DATA_TYPES = new Set([
  "text",
  "number",
  "date",
  "year",
  "boolean",
  "select",
]);

// Strict kebab-case: lowercase alphanumeric segments separated by single
// hyphens. Rejects leading/trailing/consecutive hyphens. Mirrors slugRE in
// backend/internal/assettypetemplates/seed.go.
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    // description is optional, but if present must be a non-empty string —
    // an empty value passes the JSON schema but leaves the template UI
    // with a blank caption that looks broken.
    if (t.description !== undefined) {
      if (typeof t.description !== "string" || t.description.trim() === "") {
        errs.push("description must be a non-empty string when present");
      }
    }
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

  const rawUrl = process.env.CONVEX_URL || process.env.CONVEX_DEPLOY_URL;
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!rawUrl) throw new Error("CONVEX_URL (or CONVEX_DEPLOY_URL) is required");
  if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY is required");

  // Strip any trailing slash. ConvexHttpClient appends `/api/mutation`
  // verbatim, so `https://host/` becomes `https://host//api/mutation` —
  // Convex / Cloudflare responds with status:"error" and an EMPTY
  // errorMessage, which surfaces as a bare `Error` with no detail.
  // Diagnosing that without this guard cost us hours; never again.
  const url = rawUrl.replace(/\/+$/, "");
  if (url !== rawUrl) {
    console.warn(
      `Note: stripped trailing slash from CONVEX_URL (was ${rawUrl}).`
    );
  }

  // Print the resolved target so a misconfigured env is obvious before the
  // mutation fires. Deploy key prefix only — never the full secret. Source
  // (.env.local vs inline) surfaces shell-quoting accidents — e.g. a `|` in
  // an unquoted CONVEX_DEPLOY_KEY silently sends node with neither var set.
  const urlSrc = envSource(
    process.env.CONVEX_URL !== undefined ? "CONVEX_URL" : "CONVEX_DEPLOY_URL"
  );
  const keyPrefix = deployKey.slice(0, deployKey.indexOf(":") + 1) || "?:";
  console.log(
    `Targeting ${new URL(url).hostname} (from ${urlSrc}) with ${keyPrefix}... key (from ${envSource("CONVEX_DEPLOY_KEY")})`
  );

  const client = new ConvexHttpClient(url);
  client.setAdminAuth(deployKey);

  const result = await client.mutation(
    api.assetTypeTemplates.upsertSeedBatch,
    { categories: cats, templates }
  );
  console.log("Upserted:", result);
}

main().catch((err) => {
  // Convex SDK errors sometimes throw with .toString() === "Error" — the
  // useful payload lives in .message / .data / .name. Surface all of them
  // so a seed failure is diagnosable from the terminal alone.
  console.error("Seed failed.");
  if (err?.name) console.error("  name:", err.name);
  if (err?.message) console.error("  message:", err.message);
  if (err?.data !== undefined) {
    console.error("  data:", JSON.stringify(err.data, null, 2));
  }
  // Cloudflare in front of Convex returns 502 / "Bad gateway" HTML when the
  // deploy key is invalid — presumably to make auth brute-forcing harder.
  // Surface that as a credentials hint instead of letting it look like a
  // transient infra outage that "just needs a retry."
  const msg = String(err?.message ?? "");
  if (msg.includes("Bad gateway") || msg.includes("<!DOCTYPE html>")) {
    console.error(
      "\nHint: a 502 from Convex usually means the deploy key is wrong " +
      "for the targeted deployment. Verify CONVEX_DEPLOY_KEY matches the " +
      "deployment at CONVEX_URL (dev key vs prod key, project mismatch, " +
      "expired key). Do NOT just retry — Cloudflare may rate-limit."
    );
  }
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
