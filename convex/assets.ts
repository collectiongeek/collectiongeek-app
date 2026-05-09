import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const listAssets = query({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) =>
        q.eq("workosUserId", identity.subject)
      )
      .unique();
    if (!user) return [];

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id) return [];

    return ctx.db
      .query("assets")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .order("desc")
      .collect();
  },
});

export const getAsset = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, { assetId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) =>
        q.eq("workosUserId", identity.subject)
      )
      .unique();
    if (!user) return null;

    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id) return null;

    const customFields = await ctx.db
      .query("customFields")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();

    return { ...asset, customFields };
  },
});

export const searchAssets = query({
  args: {
    searchQuery: v.string(),
    collectionId: v.optional(v.id("collections")),
  },
  handler: async (ctx, { searchQuery, collectionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !searchQuery.trim()) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) =>
        q.eq("workosUserId", identity.subject)
      )
      .unique();
    if (!user) return [];

    let results = ctx.db
      .search("assets", "search_assets", (q) => {
        const base = q.search("name", searchQuery).eq("userId", user._id);
        return collectionId ? base.eq("collectionId", collectionId) : base;
      });

    return results.take(20);
  },
});

export const createAsset = internalMutation({
  args: {
    workosUserId: v.string(),
    collectionId: v.id("collections"),
    name: v.string(),
    description: v.optional(v.string()),
    dateAcquired: v.optional(v.string()),
    purchasedValue: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    customFields: v.optional(
      v.array(
        v.object({
          fieldName: v.string(),
          fieldValue: v.string(),
          fieldType: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, { workosUserId, customFields, ...assetData }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const collection = await ctx.db.get(assetData.collectionId);
    if (!collection || collection.userId !== user._id)
      throw new Error("Collection not found");

    const assetId = await ctx.db.insert("assets", {
      ...assetData,
      userId: user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (customFields) {
      await Promise.all(
        customFields.map((f) => ctx.db.insert("customFields", { assetId, ...f }))
      );
    }

    return { id: assetId };
  },
});

export const updateAsset = internalMutation({
  args: {
    workosUserId: v.string(),
    assetId: v.id("assets"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    dateAcquired: v.optional(v.string()),
    purchasedValue: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    customFields: v.optional(
      v.array(
        v.object({
          fieldName: v.string(),
          fieldValue: v.string(),
          fieldType: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, { workosUserId, assetId, customFields, ...fields }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id) throw new Error("Asset not found");

    await ctx.db.patch(assetId, { ...fields, updatedAt: Date.now() });

    if (customFields !== undefined) {
      const existing = await ctx.db
        .query("customFields")
        .withIndex("by_asset", (q) => q.eq("assetId", assetId))
        .collect();
      await Promise.all(existing.map((f) => ctx.db.delete(f._id)));
      await Promise.all(
        customFields.map((f) => ctx.db.insert("customFields", { assetId, ...f }))
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

    const fields = await ctx.db
      .query("customFields")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect();
    await Promise.all(fields.map((f) => ctx.db.delete(f._id)));
    await ctx.db.delete(assetId);
  },
});
