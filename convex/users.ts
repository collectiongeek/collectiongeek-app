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

// Called by Go backend: persists the user's wrapped DEK + salt the first
// time they complete encryption setup. Refuses to overwrite an existing
// value — once a user has a wrappedDek, replacing it would orphan all of
// their previously-encrypted data.
export const setEncryptionKey = internalMutation({
  args: {
    workosUserId: v.string(),
    wrappedDek: v.string(),
    keySalt: v.string(),
  },
  handler: async (ctx, { workosUserId, wrappedDek, keySalt }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");
    if (user.wrappedDek) {
      throw new Error("Encryption key already set");
    }
    await ctx.db.patch(user._id, { wrappedDek, keySalt });
  },
});

// Called by Go backend during recovery-code rotation. Overwrites wrappedDek
// + keySalt. The server can't tell whether the new wrap is over the same
// underlying DEK as before — that's enforced client-side by requiring the
// caller to prove they have the OLD recovery code (decrypting the existing
// wrap before re-wrapping under a new code). The server's only job here is
// to accept the swap once the client has done the work.
export const rotateEncryptionKey = internalMutation({
  args: {
    workosUserId: v.string(),
    wrappedDek: v.string(),
    keySalt: v.string(),
  },
  handler: async (ctx, { workosUserId, wrappedDek, keySalt }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");
    if (!user.wrappedDek) {
      throw new Error("No encryption key to rotate");
    }
    await ctx.db.patch(user._id, { wrappedDek, keySalt });
  },
});

// Called by Go backend: persists the user's UI theme + mode preference.
export const updateTheme = internalMutation({
  args: {
    workosUserId: v.string(),
    theme: v.optional(v.string()),
    themeMode: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system"))
    ),
  },
  handler: async (ctx, { workosUserId, theme, themeMode }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");
    const patch: Record<string, unknown> = {};
    if (theme !== undefined) patch.theme = theme;
    if (themeMode !== undefined) patch.themeMode = themeMode;
    if (Object.keys(patch).length > 0) await ctx.db.patch(user._id, patch);
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

async function cascadeDeleteUser(ctx: any, userId: any) {
  // Sweep all asset↔collection join rows for this user up front. The by_user
  // index makes this a single query and avoids leaving orphans when assets or
  // collections are deleted below.
  const memberships = await ctx.db
    .query("assetCollections")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  await Promise.all(memberships.map((m: any) => ctx.db.delete(m._id)));

  const assets = await ctx.db
    .query("assets")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

  for (const asset of assets) {
    const values = await ctx.db
      .query("assetDescriptorValues")
      .withIndex("by_asset", (q: any) => q.eq("assetId", asset._id))
      .collect();
    await Promise.all(values.map((v: any) => ctx.db.delete(v._id)));

    await ctx.db.delete(asset._id);
  }

  const collections = await ctx.db
    .query("collections")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  await Promise.all(collections.map((c: any) => ctx.db.delete(c._id)));

  const assetTypes = await ctx.db
    .query("assetTypes")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  for (const at of assetTypes) {
    const descriptors = await ctx.db
      .query("assetTypeDescriptors")
      .withIndex("by_asset_type", (q: any) => q.eq("assetTypeId", at._id))
      .collect();
    await Promise.all(descriptors.map((d: any) => ctx.db.delete(d._id)));
    await ctx.db.delete(at._id);
  }

  const collectionTypes = await ctx.db
    .query("collectionTypes")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  for (const ct of collectionTypes) {
    const assocs = await ctx.db
      .query("collectionTypeAssetTypes")
      .withIndex("by_collection_type", (q: any) =>
        q.eq("collectionTypeId", ct._id)
      )
      .collect();
    await Promise.all(assocs.map((a: any) => ctx.db.delete(a._id)));
    await ctx.db.delete(ct._id);
  }

  await ctx.db.delete(userId);
}

// Called by Go backend: deletes the user and all their data in dependency order.
export const deleteUserCascade = internalMutation({
  args: { workosUserId: v.string() },
  handler: async (ctx, { workosUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) return;
    await cascadeDeleteUser(ctx, user._id);
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) return;
    await cascadeDeleteUser(ctx, user._id);
  },
});
