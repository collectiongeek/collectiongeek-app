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
    // Zero-knowledge encryption material. The wrapped Data Encryption Key
    // is the user's DEK encrypted with a KEK derived from their recovery
    // code (PBKDF2). Both are base64. The presence of wrappedDek signals
    // the user has completed encryption setup; absence means they're a new
    // user who hasn't seen the recovery code yet.
    wrappedDek: v.optional(v.string()),
    keySalt: v.optional(v.string()),
  })
    .index("by_workos_id", ["workosUserId"])
    .index("by_username", ["username"])
    .index("by_email", ["email"]),

  // From here down, every "user-content" field is stored as opaque ciphertext
  // (base64 of AES-GCM output). The server cannot read these values. Validators
  // are `v.string()` because we no longer know what's inside; size/format
  // checks moved to the client. Names removed from indexes too — they're
  // ciphertext and can't be sorted/filtered server-side.
  //
  // TODO (encryption follow-up): add a shared ciphertext-shape check
  // (base64 + min/max length) in the write-path mutations so a buggy or
  // stale client can't persist plaintext into these fields. Shape-only —
  // doesn't compromise ZK. Tracked alongside CSP/SRI/perf in the followups.

  assetTypes: defineTable({
    userId: v.id("users"),
    name: v.string(), // ciphertext
    description: v.optional(v.string()), // ciphertext
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  assetTypeDescriptors: defineTable({
    assetTypeId: v.id("assetTypes"),
    name: v.string(), // ciphertext
    // dataType, required, order stay plaintext — they're structural metadata,
    // not user-authored content. The client needs them to render the correct
    // input widget without decrypting first.
    dataType: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("date"),
      v.literal("year"),
      v.literal("boolean"),
      v.literal("select")
    ),
    // For "select" descriptors: ciphertext of JSON.stringify(options[]).
    // Stored as a single string instead of an array so we encrypt once per
    // descriptor instead of per option.
    options: v.optional(v.string()),
    required: v.boolean(),
    order: v.number(),
  }).index("by_asset_type", ["assetTypeId"]),

  collectionTypes: defineTable({
    userId: v.id("users"),
    name: v.string(), // ciphertext
    description: v.optional(v.string()), // ciphertext
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  collectionTypeAssetTypes: defineTable({
    collectionTypeId: v.id("collectionTypes"),
    assetTypeId: v.id("assetTypes"),
  })
    .index("by_collection_type", ["collectionTypeId"])
    .index("by_asset_type", ["assetTypeId"]),

  collections: defineTable({
    userId: v.id("users"),
    collectionTypeId: v.optional(v.id("collectionTypes")),
    name: v.string(), // ciphertext
    description: v.optional(v.string()), // ciphertext
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_collection_type", ["collectionTypeId"]),

  assets: defineTable({
    userId: v.id("users"),
    assetTypeId: v.optional(v.id("assetTypes")),
    name: v.string(), // ciphertext
    description: v.optional(v.string()), // ciphertext
    // Stored as ciphertext strings (even the numerics) — the client encrypts
    // the stringified value. Tags are ciphertext of JSON.stringify(tags[]).
    dateAcquired: v.optional(v.string()), // ciphertext
    purchasedValue: v.optional(v.string()), // ciphertext of stringified number
    marketValue: v.optional(v.string()), // ciphertext of stringified number
    tags: v.optional(v.string()), // ciphertext of JSON-stringified array
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_asset_type", ["assetTypeId"]),

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
    value: v.string(), // ciphertext
  })
    .index("by_asset", ["assetId"])
    .index("by_descriptor", ["descriptorId"]),
});
