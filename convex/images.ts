import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getUserFromIdentity } from "./auth";

// Max image attachments per asset. Enforced authoritatively by recordImage
// (the one-shot upload URL is not enough — between issuing it and the
// recordImage call the count could change).
const MAX_IMAGES_PER_ASSET = 6;

async function resolveUser(ctx: any, workosUserId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_id", (q: any) => q.eq("workosUserId", workosUserId))
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

async function assertAssetOwned(ctx: any, assetId: any, userId: any) {
  const asset = await ctx.db.get(assetId);
  if (!asset || asset.userId !== userId) throw new Error("Asset not found");
  return asset;
}

// --- Public reads -----------------------------------------------------

// Returns the asset's images with short-lived storage URLs for each row.
// The bytes at those URLs are encrypted; the client decrypts them with the
// user's DEK.
export const listByAsset = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, { assetId }) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return [];

    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id) return [];

    const rows = await ctx.db
      .query("assetImages")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();
    rows.sort((a, b) => a.position - b.position);

    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        storageUrl: await ctx.storage.getUrl(row.storageId),
      }))
    );
  },
});

// Returns the primary image (if any) for each of the requested assets,
// keyed by assetId. Used by list views (cards) so a single query covers
// the whole grid instead of N parallel subscriptions. Silently drops
// assets the requester doesn't own.
export const listPrimariesByAssetIds = query({
  args: { assetIds: v.array(v.id("assets")) },
  handler: async (ctx, { assetIds }) => {
    const user = await getUserFromIdentity(ctx);
    if (!user || assetIds.length === 0) return [];

    const results = await Promise.all(
      assetIds.map(async (assetId) => {
        const asset = await ctx.db.get(assetId);
        if (!asset || asset.userId !== user._id) return null;
        const rows = await ctx.db
          .query("assetImages")
          .withIndex("by_asset", (q) => q.eq("assetId", assetId))
          .collect();
        // Sort before the fallback so the "no primary flagged" path
        // picks the lowest-position survivor deterministically — that's
        // also what deleteImage promotes when removing a primary, so
        // the two stay consistent.
        rows.sort((a, b) => a.position - b.position);
        const primary = rows.find((r) => r.isPrimary) ?? rows[0];
        if (!primary) return null;
        return {
          assetId,
          _id: primary._id,
          storageId: primary.storageId,
          storageUrl: await ctx.storage.getUrl(primary.storageId),
          metadataCiphertext: primary.metadataCiphertext,
        };
      })
    );
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  },
});

// --- Write path: upload URL → record → patch / delete ---------------

// Generates a one-shot upload URL the client POSTs encrypted bytes to.
// Verifies asset ownership and the 6-image cap up front; the authoritative
// re-check happens in recordImage.
export const generateUploadUrl = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
  },
  handler: async (ctx, { workosUserId, assetId }) => {
    const user = await resolveUser(ctx, workosUserId);
    await assertAssetOwned(ctx, assetId, user._id);

    const existing = await ctx.db
      .query("assetImages")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();
    if (existing.length >= MAX_IMAGES_PER_ASSET) {
      throw new Error("Image limit reached");
    }

    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

// Persists an image row after the client has uploaded bytes to storage.
// If the asset has no images yet, this row is forced to be the primary.
// Otherwise, setPrimary=true makes this the new primary (and unflags the
// previous one); setPrimary=false leaves the existing primary alone.
export const recordImage = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
    storageId: v.id("_storage"),
    metadataCiphertext: v.string(),
    setPrimary: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { workosUserId, assetId, storageId, metadataCiphertext, setPrimary }
  ) => {
    const user = await resolveUser(ctx, workosUserId);
    await assertAssetOwned(ctx, assetId, user._id);

    // A retried recordImage call (network blip after a successful upload)
    // would create a second row pointing at the same storage blob.
    // Deleting either row later would then nuke bytes the other still
    // references — image-lifecycle corruption. Reject duplicates here.
    // DO NOT delete the storage blob in this branch: it's legitimately
    // owned by the existing row.
    const dupForStorage = await ctx.db
      .query("assetImages")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (dupForStorage) {
      throw new Error("Image already recorded");
    }

    const existing = await ctx.db
      .query("assetImages")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();
    if (existing.length >= MAX_IMAGES_PER_ASSET) {
      // The upload URL has already been consumed (storage has the blob), so
      // we must clean up the orphan we'd otherwise create.
      await ctx.storage.delete(storageId);
      throw new Error("Image limit reached");
    }

    const isFirst = existing.length === 0;
    const makePrimary = isFirst || setPrimary === true;

    if (makePrimary) {
      await Promise.all(
        existing
          .filter((r) => r.isPrimary)
          .map((r) => ctx.db.patch(r._id, { isPrimary: false }))
      );
    }

    const position = existing.length;
    const imageId = await ctx.db.insert("assetImages", {
      assetId,
      userId: user._id,
      storageId,
      metadataCiphertext,
      isPrimary: makePrimary,
      position,
      createdAt: Date.now(),
    });
    return { id: imageId };
  },
});

// Patches metadata (crop-view changes) or flips the primary flag. The two
// modes are mutually exclusive in the UI but the mutation accepts either or
// both without complaint.
export const updateImage = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
    imageId: v.id("assetImages"),
    metadataCiphertext: v.optional(v.string()),
    setPrimary: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { workosUserId, assetId, imageId, metadataCiphertext, setPrimary }
  ) => {
    const user = await resolveUser(ctx, workosUserId);
    await assertAssetOwned(ctx, assetId, user._id);

    const row = await ctx.db.get(imageId);
    if (!row || row.assetId !== assetId || row.userId !== user._id) {
      throw new Error("Image not found");
    }

    const patch: Record<string, unknown> = {};
    if (metadataCiphertext !== undefined) {
      patch.metadataCiphertext = metadataCiphertext;
    }

    if (setPrimary === true && !row.isPrimary) {
      const siblings = await ctx.db
        .query("assetImages")
        .withIndex("by_asset", (q) => q.eq("assetId", assetId))
        .collect();
      await Promise.all(
        siblings
          .filter((s) => s._id !== imageId && s.isPrimary)
          .map((s) => ctx.db.patch(s._id, { isPrimary: false }))
      );
      patch.isPrimary = true;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(imageId, patch);
    }
  },
});

// Hard-deletes the row AND the underlying storage blob. If the removed row
// was the primary and others remain, promotes the lowest-position survivor.
export const deleteImage = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
    imageId: v.id("assetImages"),
  },
  handler: async (ctx, { workosUserId, assetId, imageId }) => {
    const user = await resolveUser(ctx, workosUserId);
    await assertAssetOwned(ctx, assetId, user._id);

    const row = await ctx.db.get(imageId);
    if (!row || row.assetId !== assetId || row.userId !== user._id) {
      throw new Error("Image not found");
    }

    const wasPrimary = row.isPrimary;
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(imageId);

    if (wasPrimary) {
      const survivors = await ctx.db
        .query("assetImages")
        .withIndex("by_asset", (q) => q.eq("assetId", assetId))
        .collect();
      if (survivors.length > 0) {
        survivors.sort((a, b) => a.position - b.position);
        await ctx.db.patch(survivors[0]._id, { isPrimary: true });
      }
    }
  },
});
