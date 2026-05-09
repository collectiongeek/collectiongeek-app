import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const listCollections = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) =>
        q.eq("workosUserId", identity.subject)
      )
      .unique();
    if (!user) return [];

    return ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const getCollection = query({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) =>
        q.eq("workosUserId", identity.subject)
      )
      .unique();
    if (!user) return null;

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id) return null;
    return collection;
  },
});

export const getCollectionValue = query({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) =>
        q.eq("workosUserId", identity.subject)
      )
      .unique();
    if (!user) return null;

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id) return null;

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect();

    const totalCents = assets.reduce(
      (sum, a) => sum + (a.marketValue ?? 0),
      0
    );
    return { totalCents, assetCount: assets.length };
  },
});

export const createCollection = internalMutation({
  args: {
    workosUserId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    collectionType: v.optional(v.string()),
  },
  handler: async (ctx, { workosUserId, name, description, collectionType }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const id = await ctx.db.insert("collections", {
      userId: user._id,
      name,
      description,
      collectionType,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { id };
  },
});

export const updateCollection = internalMutation({
  args: {
    workosUserId: v.string(),
    collectionId: v.id("collections"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    collectionType: v.optional(v.string()),
  },
  handler: async (ctx, { workosUserId, collectionId, ...fields }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id)
      throw new Error("Collection not found");

    await ctx.db.patch(collectionId, { ...fields, updatedAt: Date.now() });
  },
});

export const deleteCollection = internalMutation({
  args: {
    workosUserId: v.string(),
    collectionId: v.id("collections"),
  },
  handler: async (ctx, { workosUserId, collectionId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id)
      throw new Error("Collection not found");

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect();

    for (const asset of assets) {
      const fields = await ctx.db
        .query("customFields")
        .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
        .collect();
      await Promise.all(fields.map((f) => ctx.db.delete(f._id)));
      await ctx.db.delete(asset._id);
    }

    await ctx.db.delete(collectionId);
  },
});
