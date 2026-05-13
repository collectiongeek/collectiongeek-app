import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getUserFromIdentity } from "./auth";

const descriptorValueInput = v.object({
  descriptorId: v.id("assetTypeDescriptors"),
  value: v.string(),
});

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
        q.search("name", searchQuery).eq("userId", user._id)
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

    return { id: assetId };
  },
});

export const updateAsset = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
    assetTypeId: v.optional(v.id("assetTypes")),
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

    if (assetTypeId !== undefined && assetTypeId) {
      const at = await ctx.db.get(assetTypeId);
      if (!at || at.userId !== user._id)
        throw new Error("Asset type not found");
    }

    await ctx.db.patch(assetId, {
      ...fields,
      ...(assetTypeId !== undefined ? { assetTypeId } : {}),
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
        assetTypeId !== undefined ? assetTypeId : asset.assetTypeId;
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
      await Promise.all(existing.map((v) => ctx.db.delete(v._id)));
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
    await Promise.all(values.map((v) => ctx.db.delete(v._id)));

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
