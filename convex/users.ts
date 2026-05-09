import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const getUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) =>
        q.eq("workosUserId", identity.subject)
      )
      .unique();
  },
});

export const isUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    return existing === null;
  },
});

// Called by Go backend: creates a user if they don't exist yet (first login, no webhook needed).
export const upsertUser = internalMutation({
  args: { workosUserId: v.string(), email: v.string() },
  handler: async (ctx, { workosUserId, email }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (existing) return { id: existing._id };
    const id = await ctx.db.insert("users", {
      workosUserId,
      email,
      username: "",
      createdAt: Date.now(),
    });
    return { id };
  },
});

// Called by Go backend: sets or updates a user's username.
export const updateUser = internalMutation({
  args: {
    workosUserId: v.string(),
    username: v.string(),
  },
  handler: async (ctx, { workosUserId, username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (taken && taken._id !== user._id) throw new Error("Username taken");

    await ctx.db.patch(user._id, { username });
    return { id: user._id };
  },
});

// Called by Go backend: deletes the user and all their data in dependency order.
export const deleteUserCascade = internalMutation({
  args: { workosUserId: v.string() },
  handler: async (ctx, { workosUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) return;

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const asset of assets) {
      const fields = await ctx.db
        .query("customFields")
        .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
        .collect();
      await Promise.all(fields.map((f) => ctx.db.delete(f._id)));
      await ctx.db.delete(asset._id);
    }

    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    await Promise.all(collections.map((c) => ctx.db.delete(c._id)));

    await ctx.db.delete(user._id);
  },
});

// Called by the WorkOS webhook handler when a new user signs up.
export const createUserFromWebhook = internalMutation({
  args: {
    workosUserId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, { workosUserId, email }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (existing) return existing._id;

    return ctx.db.insert("users", {
      workosUserId,
      email,
      username: "",
      createdAt: Date.now(),
    });
  },
});

// Called by the WorkOS webhook handler when a user is deleted in WorkOS.
export const deleteUserFromWebhook = internalMutation({
  args: { workosUserId: v.string() },
  handler: async (ctx, { workosUserId }) => {
    // Reuse cascade logic by calling directly
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) return;

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const asset of assets) {
      const fields = await ctx.db
        .query("customFields")
        .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
        .collect();
      await Promise.all(fields.map((f) => ctx.db.delete(f._id)));
      await ctx.db.delete(asset._id);
    }

    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    await Promise.all(collections.map((c) => ctx.db.delete(c._id)));

    await ctx.db.delete(user._id);
  },
});
