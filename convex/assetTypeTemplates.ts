import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Shared with the personal-asset-type path, but here `options` is a real
// plaintext array — templates are public, no encryption.
const templateDescriptorInput = v.object({
  // Stable identity across versions; see schema.ts for the rationale.
  key: v.string(),
  name: v.string(),
  dataType: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("date"),
    v.literal("year"),
    v.literal("boolean"),
    v.literal("select")
  ),
  options: v.optional(v.array(v.string())),
  required: v.boolean(),
  order: v.number(),
});

// --------------------------------------------------------------------------
// Reads — public, no identity required. Frontend hits these directly via
// useQuery (same pattern as listAssetTypes), no Go proxy.
// --------------------------------------------------------------------------

export const listCategories = query({
  handler: async (ctx) => {
    const cats = await ctx.db.query("assetTypeTemplateCategories").collect();
    cats.sort((a, b) => a.name.localeCompare(b.name));
    return cats;
  },
});

export const listTemplates = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    const rows = category
      ? await ctx.db
          .query("assetTypeTemplates")
          .withIndex("by_category_and_status", (q) =>
            q.eq("category", category).eq("status", "published")
          )
          .collect()
      : await ctx.db
          .query("assetTypeTemplates")
          .withIndex("by_status", (q) => q.eq("status", "published"))
          .collect();

    // Sort by installCount desc, then name asc — popularity-first browsing.
    rows.sort(
      (a, b) => b.installCount - a.installCount || a.name.localeCompare(b.name)
    );
    return rows;
  },
});

export const getTemplateBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const template = await ctx.db
      .query("assetTypeTemplates")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!template || template.status !== "published") return null;

    const descriptors = await ctx.db
      .query("assetTypeTemplateDescriptors")
      .withIndex("by_template", (q) => q.eq("templateId", template._id))
      .collect();
    descriptors.sort((a, b) => a.order - b.order);
    return { ...template, descriptors };
  },
});

// --------------------------------------------------------------------------
// Seed mutation — idempotent upsert by slug. Called by scripts/seed-asset-
// templates.mjs via the Convex admin auth. Internal: never called by the
// frontend or by end users.
// --------------------------------------------------------------------------

export const upsertSeedBatch = internalMutation({
  args: {
    categories: v.array(
      v.object({
        slug: v.string(),
        name: v.string(),
        icon: v.optional(v.string()),
      })
    ),
    templates: v.array(
      v.object({
        slug: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        category: v.string(),
        tags: v.array(v.string()),
        version: v.string(),
        descriptors: v.array(templateDescriptorInput),
      })
    ),
  },
  handler: async (ctx, { categories, templates }) => {
    const now = Date.now();
    let categoriesUpserted = 0;
    let templatesUpserted = 0;

    for (const c of categories) {
      const existing = await ctx.db
        .query("assetTypeTemplateCategories")
        .withIndex("by_slug", (q) => q.eq("slug", c.slug))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { name: c.name, icon: c.icon });
      } else {
        await ctx.db.insert("assetTypeTemplateCategories", c);
      }
      categoriesUpserted++;
    }

    for (const t of templates) {
      const existing = await ctx.db
        .query("assetTypeTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", t.slug))
        .unique();

      let templateId: Id<"assetTypeTemplates">;
      if (existing) {
        await ctx.db.patch(existing._id, {
          name: t.name,
          description: t.description,
          category: t.category,
          tags: t.tags,
          version: t.version,
          updatedAt: now,
        });
        templateId = existing._id;
        // Replace descriptors wholesale — version bumps are what signal a
        // breaking change to users who installed an earlier version.
        const existingDescriptors = await ctx.db
          .query("assetTypeTemplateDescriptors")
          .withIndex("by_template", (q) => q.eq("templateId", templateId))
          .collect();
        await Promise.all(existingDescriptors.map((d) => ctx.db.delete(d._id)));
      } else {
        templateId = await ctx.db.insert("assetTypeTemplates", {
          slug: t.slug,
          name: t.name,
          description: t.description,
          category: t.category,
          tags: t.tags,
          version: t.version,
          status: "published",
          authorType: "official",
          installCount: 0,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      await Promise.all(
        t.descriptors.map((d) =>
          ctx.db.insert("assetTypeTemplateDescriptors", { templateId, ...d })
        )
      );
      templatesUpserted++;
    }

    return { categoriesUpserted, templatesUpserted };
  },
});
