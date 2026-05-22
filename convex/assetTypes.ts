import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getUserFromIdentity } from "./auth";

// `name` is ciphertext; `options` is a single ciphertext blob containing the
// JSON-stringified array (we encrypt once per descriptor, not per option).
// dataType / required / order stay plaintext — structural, not content.
const descriptorInput = v.object({
  name: v.string(),
  dataType: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("date"),
    v.literal("year"),
    v.literal("boolean"),
    v.literal("select")
  ),
  options: v.optional(v.string()),
  required: v.boolean(),
  order: v.number(),
  // Plaintext provenance: set when this descriptor was installed from a
  // template (carries the template descriptor's stable `key`). Absent for
  // user-authored descriptors. Edits preserve it so the upgrade-diff still
  // matches identity even after the user renames the field.
  sourceKey: v.optional(v.string()),
});

export const listAssetTypes = query({
  handler: async (ctx) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return [];

    return ctx.db
      .query("assetTypes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const getAssetType = query({
  args: { assetTypeId: v.id("assetTypes") },
  handler: async (ctx, { assetTypeId }) => {
    const user = await getUserFromIdentity(ctx);
    if (!user) return null;

    const assetType = await ctx.db.get(assetTypeId);
    if (!assetType || assetType.userId !== user._id) return null;

    const descriptors = await ctx.db
      .query("assetTypeDescriptors")
      .withIndex("by_asset_type", (q) => q.eq("assetTypeId", assetTypeId))
      .collect();

    descriptors.sort((a, b) => a.order - b.order);
    return { ...assetType, descriptors };
  },
});

export const createAssetType = internalMutation({
  args: {
    workosUserId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    descriptors: v.optional(v.array(descriptorInput)),
    // Set by the client when this asset type was installed from a public
    // template. Both plaintext (public template identifiers, not user content).
    sourceTemplateSlug: v.optional(v.string()),
    sourceTemplateVersion: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      workosUserId,
      name,
      description,
      descriptors,
      sourceTemplateSlug,
      sourceTemplateVersion,
    }
  ) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    // Provenance is all-or-nothing. Half-set state would mislead the future
    // upgrade-diff UI (slug without version = no comparison target;
    // version without slug = orphaned). Reject early.
    if ((sourceTemplateSlug == null) !== (sourceTemplateVersion == null)) {
      throw new Error(
        "sourceTemplateSlug and sourceTemplateVersion must both be set or both omitted"
      );
    }

    const now = Date.now();
    const assetTypeId = await ctx.db.insert("assetTypes", {
      userId: user._id,
      name,
      description,
      createdAt: now,
      updatedAt: now,
      sourceTemplateSlug,
      sourceTemplateVersion,
    });

    if (descriptors && descriptors.length > 0) {
      await Promise.all(
        descriptors.map((d) =>
          ctx.db.insert("assetTypeDescriptors", { assetTypeId, ...d })
        )
      );
    }

    // Bump installCount on the source template (best-effort: silently skip if
    // the slug no longer exists — a template could have been deprecated since
    // the client fetched it).
    if (sourceTemplateSlug) {
      const template = await ctx.db
        .query("assetTypeTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", sourceTemplateSlug))
        .unique();
      if (template) {
        await ctx.db.patch(template._id, {
          installCount: template.installCount + 1,
        });
      }
    }

    return { id: assetTypeId };
  },
});

export const updateAssetType = internalMutation({
  args: {
    workosUserId: v.string(),
    assetTypeId: v.id("assetTypes"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    descriptors: v.optional(v.array(descriptorInput)),
  },
  handler: async (
    ctx,
    { workosUserId, assetTypeId, descriptors, ...fields }
  ) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const assetType = await ctx.db.get(assetTypeId);
    if (!assetType || assetType.userId !== user._id)
      throw new Error("Asset type not found");

    await ctx.db.patch(assetTypeId, { ...fields, updatedAt: Date.now() });

    if (descriptors !== undefined) {
      const existing = await ctx.db
        .query("assetTypeDescriptors")
        .withIndex("by_asset_type", (q) => q.eq("assetTypeId", assetTypeId))
        .collect();
      // Cascade: also clear values pointing at the descriptors we're replacing.
      for (const d of existing) {
        const values = await ctx.db
          .query("assetDescriptorValues")
          .withIndex("by_descriptor", (q) => q.eq("descriptorId", d._id))
          .collect();
        await Promise.all(values.map((dv) => ctx.db.delete(dv._id)));
        await ctx.db.delete(d._id);
      }
      await Promise.all(
        descriptors.map((d) =>
          ctx.db.insert("assetTypeDescriptors", { assetTypeId, ...d })
        )
      );
    }
  },
});

export const deleteAssetType = internalMutation({
  args: {
    workosUserId: v.string(),
    assetTypeId: v.id("assetTypes"),
  },
  handler: async (ctx, { workosUserId, assetTypeId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();
    if (!user) throw new Error("User not found");

    const assetType = await ctx.db.get(assetTypeId);
    if (!assetType || assetType.userId !== user._id)
      throw new Error("Asset type not found");

    // Block delete if any asset still references this type.
    const referencing = await ctx.db
      .query("assets")
      .withIndex("by_asset_type", (q) => q.eq("assetTypeId", assetTypeId))
      .first();
    if (referencing) {
      throw new Error("Asset type is in use by one or more assets");
    }

    // Remove association rows (collection type ↔ asset type).
    const assocs = await ctx.db
      .query("collectionTypeAssetTypes")
      .withIndex("by_asset_type", (q) => q.eq("assetTypeId", assetTypeId))
      .collect();
    await Promise.all(assocs.map((a) => ctx.db.delete(a._id)));

    // Remove descriptors.
    const descriptors = await ctx.db
      .query("assetTypeDescriptors")
      .withIndex("by_asset_type", (q) => q.eq("assetTypeId", assetTypeId))
      .collect();
    await Promise.all(descriptors.map((d) => ctx.db.delete(d._id)));

    await ctx.db.delete(assetTypeId);
  },
});
