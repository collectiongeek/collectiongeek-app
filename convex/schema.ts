import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    workosUserId: v.string(),
    email: v.string(),
    username: v.string(),
    createdAt: v.number(),
  })
    .index("by_workos_id", ["workosUserId"])
    .index("by_username", ["username"])
    .index("by_email", ["email"]),

  collections: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    collectionType: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_name", ["userId", "name"]),

  assets: defineTable({
    userId: v.id("users"),
    collectionId: v.id("collections"),
    name: v.string(),
    description: v.optional(v.string()),
    dateAcquired: v.optional(v.string()),
    purchasedValue: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_collection", ["collectionId"])
    .index("by_user", ["userId"])
    .searchIndex("search_assets", {
      searchField: "name",
      filterFields: ["userId", "collectionId"],
    }),

  customFields: defineTable({
    assetId: v.id("assets"),
    fieldName: v.string(),
    fieldValue: v.string(),
    fieldType: v.string(),
  }).index("by_asset", ["assetId"]),
});
