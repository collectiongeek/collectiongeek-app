import { internalMutation } from "./_generated/server";

// Admin-only orphan sweep. Convex `internalMutation`s are unreachable from
// clients; the only caller is whoever holds the deployment admin key (the
// Convex CLI / dashboard / scripts/admin-sweep-orphans.mjs).
//
// Anything in the `_storage` system table whose `_id` is not referenced by
// an `assetImages.storageId` is treated as an orphan and hard-deleted.
// Returns counts plus the deleted ids for an audit trail.
//
// Scale note: both .collect() calls are full-table scans. Fine while the
// app is small — Convex mutations have ~1s of wall time and `.collect()`
// caps somewhere in the tens of thousands of rows. Revisit if either
// table starts exceeding ~5k rows in production: pagination with a
// `cursor` arg + a runner-loop in the .mjs script is the natural next
// step, before promoting this to a cron.
export const sweepOrphanedImages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("assetImages").collect();
    const referenced = new Set(rows.map((r) => r.storageId as unknown as string));

    const storage = await ctx.db.system.query("_storage").collect();
    const deletedIds: string[] = [];

    for (const blob of storage) {
      const id = blob._id as unknown as string;
      if (referenced.has(id)) continue;
      await ctx.storage.delete(blob._id);
      deletedIds.push(id);
    }

    return {
      scanned: storage.length,
      referenced: referenced.size,
      deleted: deletedIds.length,
      deletedIds,
    };
  },
});
