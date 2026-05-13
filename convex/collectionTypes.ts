import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

import { getUserFromIdentity } from "./auth";

export const listCollectionTypes = query({
  handler: async (ctx) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return [];

    return ctx.db
      .query("collectionTypes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const getCollectionType = query({
  args: { collectionTypeId: v.id("collectionTypes") },
  handler: async (ctx, { collectionTypeId }) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return null;

    const collectionType = await ctx.db.get(collectionTypeId);
    if (!collectionType || collectionType.userId !== user._id) return null;

    const assocs = await ctx.db
      .query("collectionTypeAssetTypes")
      .withIndex("by_collection_type", (q) =>
        q.eq("collectionTypeId", collectionTypeId)
      )
      .collect();

    const assetTypes = await Promise.all(
      assocs.map((a) => ctx.db.get(a.assetTypeId))
    );

    return {
      ...collectionType,
      assetTypes: assetTypes.filter(
        (t): t is NonNullable<typeof t> => t !== null && t.userId === user._id
      ),
    };
  },
});

export const createCollectionType = internalMutation({
  args: {
    workosUserId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    assetTypeIds: v.optional(v.array(v.id("assetTypes"))),
  },
  handler: async (
    ctx,
    { workosUserId, name, description, assetTypeIds }
  ) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const collectionTypeId = await ctx.db.insert("collectionTypes", {
      userId: user._id,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (assetTypeIds && assetTypeIds.length > 0) {
      // Validate ownership before associating.
      for (const id of assetTypeIds) {
        const at = await ctx.db.get(id);
        if (!at || at.userId !== user._id)
          throw new Error("Asset type not found");
      }
      await Promise.all(
        assetTypeIds.map((assetTypeId) =>
          ctx.db.insert("collectionTypeAssetTypes", {
            collectionTypeId,
            assetTypeId,
          })
        )
      );
    }

    return { id: collectionTypeId };
  },
});

export const updateCollectionType = internalMutation({
  args: {
    workosUserId: v.string(),
    collectionTypeId: v.id("collectionTypes"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    assetTypeIds: v.optional(v.array(v.id("assetTypes"))),
  },
  handler: async (
    ctx,
    { workosUserId, collectionTypeId, assetTypeIds, ...fields }
  ) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const collectionType = await ctx.db.get(collectionTypeId);
    if (!collectionType || collectionType.userId !== user._id)
      throw new Error("Collection type not found");

    await ctx.db.patch(collectionTypeId, { ...fields, updatedAt: Date.now() });

    if (assetTypeIds !== undefined) {
      const existing = await ctx.db
        .query("collectionTypeAssetTypes")
        .withIndex("by_collection_type", (q) =>
          q.eq("collectionTypeId", collectionTypeId)
        )
        .collect();
      await Promise.all(existing.map((a) => ctx.db.delete(a._id)));

      for (const id of assetTypeIds) {
        const at = await ctx.db.get(id);
        if (!at || at.userId !== user._id)
          throw new Error("Asset type not found");
      }
      await Promise.all(
        assetTypeIds.map((assetTypeId) =>
          ctx.db.insert("collectionTypeAssetTypes", {
            collectionTypeId,
            assetTypeId,
          })
        )
      );
    }
  },
});

export const deleteCollectionType = internalMutation({
  args: {
    workosUserId: v.string(),
    collectionTypeId: v.id("collectionTypes"),
  },
  handler: async (ctx, { workosUserId, collectionTypeId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const collectionType = await ctx.db.get(collectionTypeId);
    if (!collectionType || collectionType.userId !== user._id)
      throw new Error("Collection type not found");

    const referencing = await ctx.db
      .query("collections")
      .withIndex("by_collection_type", (q) =>
        q.eq("collectionTypeId", collectionTypeId)
      )
      .first();
    if (referencing) {
      throw new Error("Collection type is in use by one or more collections");
    }

    const assocs = await ctx.db
      .query("collectionTypeAssetTypes")
      .withIndex("by_collection_type", (q) =>
        q.eq("collectionTypeId", collectionTypeId)
      )
      .collect();
    await Promise.all(assocs.map((a) => ctx.db.delete(a._id)));

    await ctx.db.delete(collectionTypeId);
  },
});
