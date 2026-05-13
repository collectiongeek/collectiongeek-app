import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getUserFromIdentity } from "./auth";

export const listCollections = query({
  handler: async (ctx) => {
    const user = await getUserFromIdentity(ctx);
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
    const user = await getUserFromIdentity(ctx);
    if (!user) return null;

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id) return null;

    let collectionType = null;
    let suggestedAssetTypes: any[] = [];
    if (collection.collectionTypeId) {
      collectionType = await ctx.db.get(collection.collectionTypeId);
      const assocs = await ctx.db
        .query("collectionTypeAssetTypes")
        .withIndex("by_collection_type", (q) =>
          q.eq("collectionTypeId", collection.collectionTypeId!)
        )
        .collect();
      const fetched = await Promise.all(
        assocs.map((a) => ctx.db.get(a.assetTypeId))
      );
      suggestedAssetTypes = fetched.filter(
        (t): t is NonNullable<typeof t> => t !== null && t.userId === user._id
      );
    }

    return { ...collection, collectionType, suggestedAssetTypes };
  },
});

export const getCollectionValue = query({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return null;

    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== user._id) return null;

    const memberships = await ctx.db
      .query("assetCollections")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect();

    const assets = await Promise.all(
      memberships.map((m) => ctx.db.get(m.assetId))
    );

    const ownedAssets = assets.filter(
      (a): a is NonNullable<typeof a> => a !== null && a.userId === user._id
    );
    const totalCents = ownedAssets.reduce(
      (sum, a) => sum + (a.marketValue ?? 0),
      0
    );
    return { totalCents, assetCount: ownedAssets.length };
  },
});

export const createCollection = internalMutation({
  args: {
    workosUserId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    collectionTypeId: v.optional(v.id("collectionTypes")),
  },
  handler: async (
    ctx,
    { workosUserId, name, description, collectionTypeId }
  ) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    if (collectionTypeId) {
      const ct = await ctx.db.get(collectionTypeId);
      if (!ct || ct.userId !== user._id)
        throw new Error("Collection type not found");
    }

    const id = await ctx.db.insert("collections", {
      userId: user._id,
      name,
      description,
      collectionTypeId,
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
    collectionTypeId: v.optional(v.id("collectionTypes")),
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

    if (fields.collectionTypeId) {
      const ct = await ctx.db.get(fields.collectionTypeId);
      if (!ct || ct.userId !== user._id)
        throw new Error("Collection type not found");
    }

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

    // Remove memberships, but leave the assets themselves (they may belong
    // to other collections or be standalone).
    const memberships = await ctx.db
      .query("assetCollections")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect();
    await Promise.all(memberships.map((m) => ctx.db.delete(m._id)));

    await ctx.db.delete(collectionId);
  },
});
