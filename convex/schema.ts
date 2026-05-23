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
    // Provenance when this asset type was installed from a public template.
    // Plaintext on purpose — these are public template identifiers, not user
    // content. Lets the UI offer "newer version available" later.
    sourceTemplateSlug: v.optional(v.string()),
    sourceTemplateVersion: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_source_template", ["sourceTemplateSlug"]),

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
    // Plaintext stable identifier copied from the source template descriptor
    // at install time. Lets the future "newer version available" UX diff
    // installed-vs-current by identity rather than by name (so a user-renamed
    // descriptor still matches its source). Absent when the descriptor was
    // user-authored, and absent on rows that pre-date this field.
    sourceKey: v.optional(v.string()),
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

  // Asset image attachments. Bytes live in Convex File Storage; this row
  // holds the foreign keys plus an encrypted metadata blob carrying the
  // viewport crop (zoom/x/y) and any other non-keying metadata. The image
  // bytes themselves are prefixed with a small plaintext owner header
  // (magic + WorkOS user ID) so an admin scanning storage can attribute
  // an orphaned blob without joining the DB — content stays zero-knowledge.
  // Capped at 6 rows per asset by the recordImage mutation.
  assetImages: defineTable({
    assetId: v.id("assets"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    // Ciphertext of JSON { cropView: { x, y, zoom }, contentType, sizeBytes }.
    metadataCiphertext: v.string(),
    isPrimary: v.boolean(),
    // 0..5, stable display order. Write-once on upload for v1.
    position: v.number(),
    createdAt: v.number(),
  })
    .index("by_asset", ["assetId"])
    .index("by_user", ["userId"])
    .index("by_storage", ["storageId"]),

  // ---------------------------------------------------------------------------
  // Public asset-type template catalog. Everything below this line is PLAINTEXT
  // — these rows are shared across all users. When a user "installs" a template
  // the client reads it, encrypts each field under the user's DEK, then writes
  // a normal personal assetType row (see assetTypes.sourceTemplate* fields).
  //
  // Slug uniqueness on the by_slug indexes below is NOT enforced by Convex —
  // its index API has no `unique` option. The invariant is upheld by two
  // layers above the schema: (1) the seed validators (Go + Node) reject
  // duplicate slugs in the source JSON, and (2) the only write path
  // (assetTypeTemplates.upsertSeedBatch) reads with `.unique()` then patches
  // an existing row instead of inserting a duplicate.
  // ---------------------------------------------------------------------------

  assetTypeTemplateCategories: defineTable({
    slug: v.string(),
    name: v.string(),
    icon: v.optional(v.string()), // lucide-react icon name
  }).index("by_slug", ["slug"]),

  assetTypeTemplates: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(), // references assetTypeTemplateCategories.slug
    tags: v.array(v.string()),
    version: v.string(), // semver
    status: v.union(
      v.literal("draft"),
      v.literal("pending_review"),
      v.literal("published"),
      v.literal("deprecated")
    ),
    authorType: v.union(v.literal("official"), v.literal("community")),
    authorId: v.optional(v.id("users")), // null for "official"
    installCount: v.number(),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_category_and_status", ["category", "status"]),

  assetTypeTemplateDescriptors: defineTable({
    templateId: v.id("assetTypeTemplates"),
    // Stable identity for this descriptor across template versions. Kebab-case,
    // unique within the template, NEVER renamed (renames break the upgrade-diff
    // story this field exists to support). The display `name` can change freely.
    key: v.string(),
    name: v.string(), // plaintext (templates are public)
    dataType: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("date"),
      v.literal("year"),
      v.literal("boolean"),
      v.literal("select")
    ),
    // Real array of plaintext options. The personal-asset-type variant stores
    // a single ciphertext blob; here we don't need to (or want to) encrypt.
    options: v.optional(v.array(v.string())),
    required: v.boolean(),
    order: v.number(),
  }).index("by_template", ["templateId"]),
});
