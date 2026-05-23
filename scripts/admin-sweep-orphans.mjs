#!/usr/bin/env node
// Admin-only orphan-image sweep. Compares the Convex `_storage` system table
// against the `assetImages.storageId` references and hard-deletes any blob
// that has lost its database row.
//
// Idempotent: rerun any time. Logs counts + deleted ids for an audit trail.
//
// Usage:
//   CONVEX_URL=https://<deployment>.convex.cloud \
//   CONVEX_DEPLOY_KEY=prod:... \
//     node scripts/admin-sweep-orphans.mjs
//
// Same env-loading conventions as scripts/seed-asset-templates.mjs: pulls
// CONVEX_URL / CONVEX_DEPLOY_KEY from the environment, falling back to
// .env.local if present.

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { internal } from "../convex/_generated/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_LOCAL = join(__dirname, "..", ".env.local");

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
  }
}

async function main() {
  const rawUrl = process.env.CONVEX_URL || process.env.CONVEX_DEPLOY_URL;
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!rawUrl) throw new Error("CONVEX_URL (or CONVEX_DEPLOY_URL) is required");
  if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY is required");

  // Trailing-slash guard — same gotcha as seed-asset-templates.mjs.
  const url = rawUrl.replace(/\/+$/, "");
  const keyPrefix = deployKey.slice(0, deployKey.indexOf(":") + 1) || "?:";
  console.log(
    `Sweeping orphans on ${new URL(url).hostname} with ${keyPrefix}... key`
  );

  const client = new ConvexHttpClient(url);
  client.setAdminAuth(deployKey);

  const result = await client.mutation(internal.admin.sweepOrphanedImages, {});
  console.log(
    `Scanned ${result.scanned} blob(s); ${result.referenced} referenced; deleted ${result.deleted} orphan(s).`
  );
  if (result.deleted > 0) {
    console.log("Deleted ids:");
    for (const id of result.deletedIds) console.log("  -", id);
  }
}

main().catch((err) => {
  console.error("Orphan sweep failed.");
  if (err?.name) console.error("  name:", err.name);
  if (err?.message) console.error("  message:", err.message);
  if (err?.data !== undefined) {
    console.error("  data:", JSON.stringify(err.data, null, 2));
  }
  process.exit(1);
});
