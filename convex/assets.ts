import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getUserFromIdentity } from "./auth";

const descriptorValueInput = v.object({
  descriptorId: v.id("assetTypeDescriptors"),
  value: v.string(),
});

// Recomputes the searchBlob for an asset and writes it back. Called from
// createAsset / updateAsset / backfill — anywhere asset text or descriptor
// values change. Convex search indexes only support a single searchField, so
// we collapse name + description + tags + descriptor values into one string.
async function refreshSearchBlob(ctx: MutationCtx, assetId: Id<"assets">) {
  const asset = await ctx.db.get(assetId);
  if (!asset) return;
  const values = await ctx.db
    .query("assetDescriptorValues")
    .withIndex("by_asset", (q) => q.eq("assetId", assetId))
    .collect();
  const parts: string[] = [];
  if (asset.name) parts.push(asset.name);
  if (asset.description) parts.push(asset.description);
  if (asset.tags) parts.push(...asset.tags);
  for (const dv of values) if (dv.value) parts.push(dv.value);
  await ctx.db.patch(assetId, { searchBlob: parts.join(" ") });
}

export const listAllAssets = query({
  handler: async (ctx) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return [];

    return ctx.db
      .query("assets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

// Count-only variant used by the Dashboard's "All assets · N" card. Avoids
// shipping the full per-asset payload to a component that only needs the
// number, and re-renders only when the count itself changes.
export const getAssetCount = query({
  handler: async (ctx) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return 0;
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return assets.length;
  },
});

export const listAssetsInCollection = query({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return [];

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id) return [];

    const memberships = await ctx.db
      .query("assetCollections")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect();

    const assets = await Promise.all(
      memberships.map((m) => ctx.db.get(m.assetId))
    );

    return assets
      .filter(
        (a): a is NonNullable<typeof a> => a !== null && a.userId === user._id
      )
      .sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const getAsset = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, { assetId }) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return null;

    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id) return null;

    let assetType = null;
    let descriptors: any[] = [];
    if (asset.assetTypeId) {
      assetType = await ctx.db.get(asset.assetTypeId);
      descriptors = await ctx.db
        .query("assetTypeDescriptors")
        .withIndex("by_asset_type", (q) =>
          q.eq("assetTypeId", asset.assetTypeId!)
        )
        .collect();
      descriptors.sort((a, b) => a.order - b.order);
    }

    const values = await ctx.db
      .query("assetDescriptorValues")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();

    const memberships = await ctx.db
      .query("assetCollections")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();
    const collections = await Promise.all(
      memberships.map((m) => ctx.db.get(m.collectionId))
    );

    return {
      ...asset,
      assetType,
      descriptors,
      descriptorValues: values,
      collections: collections.filter(
        (c): c is NonNullable<typeof c> => c !== null && c.userId === user._id
      ),
    };
  },
});

export const searchAssets = query({
  args: { searchQuery: v.string() },
  handler: async (ctx, { searchQuery }) => {
    const user = await getUserFromIdentity(ctx);
    if (!user || !searchQuery.trim()) return [];

    return ctx.db
      .query("assets")
      .withSearchIndex("search_assets", (q) =>
        q.search("searchBlob", searchQuery).eq("userId", user._id)
      )
      .take(20);
  },
});

export const createAsset = internalMutation({
  args: {
    workosUserId: v.string(),
    assetTypeId: v.optional(v.id("assetTypes")),
    name: v.string(),
    description: v.optional(v.string()),
    dateAcquired: v.optional(v.string()),
    purchasedValue: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    collectionIds: v.optional(v.array(v.id("collections"))),
    descriptorValues: v.optional(v.array(descriptorValueInput)),
  },
  handler: async (
    ctx,
    { workosUserId, collectionIds, descriptorValues, assetTypeId, ...assetData }
  ) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    if (assetTypeId) {
      const at = await ctx.db.get(assetTypeId);
      if (!at || at.userId !== user._id) throw new Error("Asset type not found");
    }

    if (collectionIds) {
      for (const cid of collectionIds) {
        const c = await ctx.db.get(cid);
        if (!c || c.userId !== user._id)
          throw new Error("Collection not found");
      }
    }

    if (descriptorValues && descriptorValues.length > 0) {
      if (!assetTypeId) {
        throw new Error("Cannot set descriptor values without an asset type");
      }
      for (const dv of descriptorValues) {
        const d = await ctx.db.get(dv.descriptorId);
        if (!d || d.assetTypeId !== assetTypeId)
          throw new Error("Descriptor does not belong to asset type");
      }
    }

    const assetId = await ctx.db.insert("assets", {
      ...assetData,
      userId: user._id,
      assetTypeId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (collectionIds && collectionIds.length > 0) {
      await Promise.all(
        collectionIds.map((collectionId) =>
          ctx.db.insert("assetCollections", {
            assetId,
            collectionId,
            userId: user._id,
            addedAt: Date.now(),
          })
        )
      );
    }

    if (descriptorValues && descriptorValues.length > 0) {
      await Promise.all(
        descriptorValues.map((dv) =>
          ctx.db.insert("assetDescriptorValues", {
            assetId,
            descriptorId: dv.descriptorId,
            value: dv.value,
          })
        )
      );
    }

    await refreshSearchBlob(ctx, assetId);
    return { id: assetId };
  },
});

export const updateAsset = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
    // null = clear the asset type; undefined = leave unchanged.
    assetTypeId: v.optional(v.union(v.id("assetTypes"), v.null())),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    dateAcquired: v.optional(v.string()),
    purchasedValue: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    collectionIds: v.optional(v.array(v.id("collections"))),
    descriptorValues: v.optional(v.array(descriptorValueInput)),
  },
  handler: async (
    ctx,
    {
      workosUserId,
      assetId,
      collectionIds,
      descriptorValues,
      assetTypeId,
      ...fields
    }
  ) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id) throw new Error("Asset not found");

    if (assetTypeId) {
      const at = await ctx.db.get(assetTypeId);
      if (!at || at.userId !== user._id)
        throw new Error("Asset type not found");
    }

    // Compare the desired type to the existing one. `null` means clear, so
    // normalize to `undefined` for the comparison.
    const newType = assetTypeId === null ? undefined : assetTypeId;
    const typeChanged =
      assetTypeId !== undefined && newType !== asset.assetTypeId;

    await ctx.db.patch(assetId, {
      ...fields,
      // `assetTypeId: undefined` in a patch clears the optional field;
      // omitting the key entirely leaves it unchanged.
      ...(assetTypeId !== undefined ? { assetTypeId: newType } : {}),
      updatedAt: Date.now(),
    });

    if (collectionIds !== undefined) {
      for (const cid of collectionIds) {
        const c = await ctx.db.get(cid);
        if (!c || c.userId !== user._id)
          throw new Error("Collection not found");
      }
      const existing = await ctx.db
        .query("assetCollections")
        .withIndex("by_asset", (q) => q.eq("assetId", assetId))
        .collect();
      await Promise.all(existing.map((m) => ctx.db.delete(m._id)));
      await Promise.all(
        collectionIds.map((collectionId) =>
          ctx.db.insert("assetCollections", {
            assetId,
            collectionId,
            userId: user._id,
            addedAt: Date.now(),
          })
        )
      );
    }

    if (descriptorValues !== undefined) {
      const effectiveTypeId =
        assetTypeId !== undefined ? newType : asset.assetTypeId;
      if (descriptorValues.length > 0 && !effectiveTypeId) {
        throw new Error("Cannot set descriptor values without an asset type");
      }
      for (const dv of descriptorValues) {
        const d = await ctx.db.get(dv.descriptorId);
        if (!d || d.assetTypeId !== effectiveTypeId)
          throw new Error("Descriptor does not belong to asset type");
      }
      const existing = await ctx.db
        .query("assetDescriptorValues")
        .withIndex("by_asset", (q) => q.eq("assetId", assetId))
        .collect();
      await Promise.all(existing.map((dv) => ctx.db.delete(dv._id)));
      await Promise.all(
        descriptorValues.map((dv) =>
          ctx.db.insert("assetDescriptorValues", {
            assetId,
            descriptorId: dv.descriptorId,
            value: dv.value,
          })
        )
      );
    } else if (typeChanged) {
      // Type changed but the caller didn't pass replacement values — drop the
      // stale ones so we don't end up with values pointing at the previous
      // type's descriptors.
      const existing = await ctx.db
        .query("assetDescriptorValues")
        .withIndex("by_asset", (q) => q.eq("assetId", assetId))
        .collect();
      await Promise.all(existing.map((dv) => ctx.db.delete(dv._id)));
    }

    await refreshSearchBlob(ctx, assetId);
  },
});

// One-off migration: populate searchBlob on every existing asset. Safe to
// re-run — refreshSearchBlob always recomputes from current data.
//
// Paginated to stay within Convex's mutation execution budget on large
// datasets. Call once with no args, then keep re-invoking with the returned
// cursor until isDone is true. From the CLI:
//   npx convex run assets:backfillSearchBlobs '{}'
//   npx convex run assets:backfillSearchBlobs '{"cursor":"<value>"}'
//   ...repeat...
export const backfillSearchBlobs = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, batchSize }) => {
    const result = await ctx.db
      .query("assets")
      .paginate({ cursor: cursor ?? null, numItems: batchSize ?? 100 });

    for (const asset of result.page) {
      await refreshSearchBlob(ctx, asset._id);
    }

    return {
      processed: result.page.length,
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const deleteAsset = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
  },
  handler: async (ctx, { workosUserId, assetId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id) throw new Error("Asset not found");

    const memberships = await ctx.db
      .query("assetCollections")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();
    await Promise.all(memberships.map((m) => ctx.db.delete(m._id)));

    const values = await ctx.db
      .query("assetDescriptorValues")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();
    await Promise.all(values.map((dv) => ctx.db.delete(dv._id)));

    await ctx.db.delete(assetId);
  },
});

export const addAssetToCollection = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
    collectionId: v.id("collections"),
  },
  handler: async (ctx, { workosUserId, assetId, collectionId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id) throw new Error("Asset not found");

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id)
      throw new Error("Collection not found");

    const existing = await ctx.db
      .query("assetCollections")
      .withIndex("by_asset_and_collection", (q) =>
        q.eq("assetId", assetId).eq("collectionId", collectionId)
      )
      .unique();
    if (existing) return;

    await ctx.db.insert("assetCollections", {
      assetId,
      collectionId,
      userId: user._id,
      addedAt: Date.now(),
    });
  },
});

export const removeAssetFromCollection = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
    collectionId: v.id("collections"),
  },
  handler: async (ctx, { workosUserId, assetId, collectionId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("assetCollections")
      .withIndex("by_asset_and_collection", (q) =>
        q.eq("assetId", assetId).eq("collectionId", collectionId)
      )
      .unique();
    if (!existing) return;
    if (existing.userId !== user._id) throw new Error("Not authorized");

    await ctx.db.delete(existing._id);
  },
});
