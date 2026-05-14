import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    workosUserId: v.string(),
    email: v.string(),
    username: v.string(),
    createdAt: v.number(),
    // UI theme preference. Both optional; defaults applied client-side.
    theme: v.optional(v.string()),
    themeMode: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system"))
    ),
  })
    .index("by_workos_id", ["workosUserId"])
    .index("by_username", ["username"])
    .index("by_email", ["email"]),

  assetTypes: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_name", ["userId", "name"]),

  assetTypeDescriptors: defineTable({
    assetTypeId: v.id("assetTypes"),
    name: v.string(),
    dataType: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("date"),
      v.literal("boolean"),
      v.literal("select")
    ),
    options: v.optional(v.array(v.string())),
    required: v.boolean(),
    order: v.number(),
  }).index("by_asset_type", ["assetTypeId"]),

  collectionTypes: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_name", ["userId", "name"]),

  collectionTypeAssetTypes: defineTable({
    collectionTypeId: v.id("collectionTypes"),
    assetTypeId: v.id("assetTypes"),
  })
    .index("by_collection_type", ["collectionTypeId"])
    .index("by_asset_type", ["assetTypeId"]),

  collections: defineTable({
    userId: v.id("users"),
    collectionTypeId: v.optional(v.id("collectionTypes")),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_name", ["userId", "name"])
    .index("by_collection_type", ["collectionTypeId"]),

  assets: defineTable({
    userId: v.id("users"),
    assetTypeId: v.optional(v.id("assetTypes")),
    name: v.string(),
    description: v.optional(v.string()),
    dateAcquired: v.optional(v.string()),
    purchasedValue: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_asset_type", ["assetTypeId"])
    .searchIndex("search_assets", {
      searchField: "name",
      filterFields: ["userId"],
    }),

  assetCollections: defineTable({
    assetId: v.id("assets"),
    collectionId: v.id("collections"),
    userId: v.id("users"),
    addedAt: v.number(),
  })
    .index("by_asset", ["assetId"])
    .index("by_collection", ["collectionId"])
    .index("by_user", ["userId"])
    .index("by_asset_and_collection", ["assetId", "collectionId"]),

  assetDescriptorValues: defineTable({
    assetId: v.id("assets"),
    descriptorId: v.id("assetTypeDescriptors"),
    value: v.string(),
  })
    .index("by_asset", ["assetId"])
    .index("by_descriptor", ["descriptorId"]),
});
