# Architecture

This document explains how CollectionGeek is put together — not just the tech list, but _why_ the pieces sit where they do and how a new feature flows through the stack. It's aimed at contributors who want to make non-trivial changes, and curious users who want to verify the privacy claims for themselves. The encryption model has its own home in [SECURITY.md](SECURITY.md); this doc focuses on application structure.

> **TL;DR.** The browser does the heavy lifting: it holds the key, encrypts data before sending it, and reads ciphertext back. The Go backend mediates writes (auth → Convex). Convex is the database, the realtime sync layer, AND the file store. There is no S3, no Redis, no separate CDN.

---

## Layered architecture

```
┌───────────────────────────────────────────────────────────────────┐
│ Browser  (React 19 + Vite + Tailwind + shadcn)                    │
│   ├─ WorkOS AuthKit  ───── JWT (Bearer token)                     │
│   ├─ DEK in IndexedDB (non-extractable CryptoKey)                 │
│   └─ Encrypt before send  /  Decrypt after receive                │
└───┬──────────────────────────────────────────────────┬────────────┘
    │ writes: REST + JWT                               │ reads: WS + JWT
    ▼                                                  ▼
┌───────────────────────────┐                ┌────────────────────────┐
│ Go backend (Chi, REST)    │                │ Convex                 │
│   ├─ JWKS-validates JWT   │  Convex admin  │   ├─ queries (public)  │
│   ├─ Forwards to Convex   │ ─────────────▶│   ├─ mutations         │
│   │  via deploy-key       │     auth       │   │   (internal-only)  │
│   └─ Maps errors → HTTP   │                │   ├─ schema + indexes  │
└───────────────────────────┘                │   └─ File Storage      │
                                             └────────────────────────┘
```

| Layer    | Tech                                   | Location    |
| -------- | -------------------------------------- | ----------- |
| Frontend | React 19 + Vite + Tailwind v4 + shadcn | `frontend/` |
| Backend  | Go 1.22+ (Chi router)                  | `backend/`  |
| Database | Convex (queries, mutations, schema)    | `convex/`   |
| Files    | Convex File Storage (encrypted blobs)  | (in Convex) |
| Auth     | WorkOS AuthKit                         | —           |
| Infra    | AWS EKS + ArgoCD (in a separate repo)  | —           |

**The single most important property:** the Go backend never sees plaintext content. It shuttles ciphertext strings and metadata; it can't decrypt anything even if compromised.

---

## Request flow: reads vs. writes

Two distinct paths, by design.

**Reads go directly client ↔ Convex over WebSocket.** Convex authenticates with the same WorkOS JWT, runs the `query` function, returns rows. The client then decrypts ciphertext fields with its in-memory DEK using the `useDecrypted` async-transform hook.

**Writes go client → Go → Convex.** The Go backend exists so we have a place to (a) validate WorkOS JWTs against JWKS, (b) hold the Convex admin deploy key without exposing it to the browser, and (c) map Convex's text errors to HTTP status codes that match the project's conventions. Mutations are declared as `internalMutation` in Convex specifically because Convex's runtime refuses to expose them to authenticated clients — only callers with the deploy key (i.e., the Go backend or admin scripts) can invoke them.

```
Write — "create an asset"
────────────────────────────
[Browser]
  1. encrypt name/value fields with DEK
  2. POST /api/v1/assets  (+ Bearer JWT)
     ▼
[Go backend]
  3. JWKS-verify JWT → subject = workosUserId
  4. forward to Convex internal mutation
     ▼
[Convex internalMutation: assets.createAsset]
  5. lookup user via by_workos_id index
  6. assert ownership of referenced entities (assetTypeId, collectionIds)
  7. ctx.db.insert("assets", {...})
  8. fan out: assetCollections + assetDescriptorValues
     ▲
[Go backend]
  9. map specific Convex errors to HTTP (404 / 400 / 409 / …)
 10. respond with { id } or error
     ▲
[Browser]
 11. on success, optimistic UI update / refetch
```

```
Read — "show the asset list"
────────────────────────────
[Browser]
  1. useQuery(api.assets.listAllAssets)  → WS subscription
     ▼
[Convex public query: assets.listAllAssets]
  2. getUserFromIdentity(ctx)  ← resolves via JWT subject
  3. ctx.db.query("assets").withIndex("by_user", …).collect()
     ▲
[Browser]
  4. decrypt each row's ciphertext fields via useDecrypted hook
  5. render
```

This split also explains the strange-looking duplication where some logic ends up both in `assets.ts` (Convex) and `images.go` (backend): the backend handler is mostly a typed pass-through. The actual rules live in Convex.

---

## Conventions catalog

These are the project-wide patterns. New code should follow them; deviations should come with an explanation in the PR.

### 1. Encrypted field shape

User content fields use `v.string()` in [convex/schema.ts](convex/schema.ts) and carry a `// ciphertext` annotation. The server cannot validate length or format on these — those checks live on the client _before_ encryption. There's a deferred [ciphertext-shape validator TODO](convex/schema.ts) ([SECURITY.md](SECURITY.md) covers why it's deferred); when it lands, every write-path mutation will gain a `assertCiphertextShape(v)` call.

### 2. Specific-substring error mapping

Go handlers route Convex errors to HTTP via `strings.Contains` matches on **specific** substrings — never the bare `"not found"`:

```go
if strings.Contains(err.Error(), "Asset not found") {
    http.Error(w, "Asset not found", http.StatusNotFound)
    return
}
```

The reason is in the project's history: Convex throws `"User not found"` for a JWKS race condition that should surface as 500, not get misreported as a 404 on whatever resource the client asked for. Match the specific entity, not the generic phrase. See [backend/internal/handlers/assets.go](backend/internal/handlers/assets.go) and [backend/internal/handlers/images.go](backend/internal/handlers/images.go) for the full set of pairings.

### 3. Auth helper on the Convex side

All public queries call [`getUserFromIdentity(ctx)`](convex/auth.ts) from `convex/auth.ts`. It resolves the WorkOS JWT subject to a Convex `users` row via the `by_workos_id` index. If there's no identity or no matching row, it returns `null` — callers return an empty result rather than throwing, so a not-yet-provisioned user just sees an empty UI instead of an error screen.

Internal mutations don't use this helper directly; they take `workosUserId` as an arg (sent by the Go backend) and do the lookup inline. The asymmetry is intentional — internal mutations have no `ctx.auth` context because they're called by the deploy key, not a user session.

### 4. Wrapper / inner route-param pattern

React Router pages that depend on a route param use a two-component split:

```tsx
export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <AssetDetail id={id} />;
}

function AssetDetail({ id }: { id: string }) {
  // hooks here see id as a definite string
}
```

The outer guards the param; the inner takes a non-nullable prop and uses hooks freely. Keeps rules-of-hooks happy and removes `id!` non-null assertions throughout the component.

### 5. Cascading delete idiom

Per-row sweeps use `withIndex().collect()` + `Promise.all(map(db.delete))`:

```ts
const memberships = await ctx.db
  .query("assetCollections")
  .withIndex("by_asset", (q) => q.eq("assetId", assetId))
  .collect();
await Promise.all(memberships.map((m) => ctx.db.delete(m._id)));
```

Account-deletion cascades through every user-owned table in [convex/users.ts](convex/users.ts) `cascadeDeleteUser`. **Order matters** for tables holding `_storage` ids: delete the storage blob before the database row, otherwise a mid-flight crash leaves an orphan.

### 6. Internal mutations + admin scripts

Anything privileged — orphan sweeps, batch maintenance — is an `internalMutation` callable only via the Convex deploy key. The user-facing app cannot reach these. Operators invoke them through small Node scripts in [scripts/](scripts/) that use `ConvexHttpClient.setAdminAuth(deployKey)`. This pattern means we get "admin-only" semantics without needing to invent an admin-flag in the schema.

### 7. Clickable cards are `<Link>`, not `<div onClick>`

Cards with a primary action wrap the action area in `<Link>` for keyboard accessibility. If the card also has an overlay menu (kebab dropdown), the `<Link>` covers the inner content only and the dropdown sits as a sibling — never a child — so clicks on the menu don't navigate.

---

## Data lifecycle

### User creation

Two paths converge on the same `users` row:

1. **First login** (the common path). The browser calls `POST /api/v1/users/me`, the backend forwards to `users.upsertUser`, the row is inserted if absent.
2. **WorkOS webhook** (`user.created`) — backup path. `convex/http.ts` verifies the signature and forwards to `users.createUserFromWebhook`. The mutation no-ops if the row already exists.

The webhook is the only reason `convex/http.ts` exists. It is **not** used by the application itself.

### Account deletion (cascade)

`DELETE /api/v1/users/me` triggers `users.deleteUserCascade`, which sweeps every owned table in dependency order. See [convex/users.ts](convex/users.ts) `cascadeDeleteUser`. After the Convex cascade, the backend calls the WorkOS `DELETE /user_management/users/{id}` API to remove the auth-side record. Partial failure (Convex succeeds, WorkOS fails) is surfaced to the client so they can retry.

### Orphan sweeps

Storage blobs whose database row has gone missing can be hard-deleted via the admin orphan sweep in [convex/admin.ts](convex/admin.ts), invoked through `npm run admin:sweep-orphans`. Today it's a manual operation; the long-term plan is to promote it to a Convex cron once first runs have validated correctness in production.

---

## Worked example: asset images

Asset images are the canonical worked example because they exercise nearly every convention above (binary content, encrypted metadata, three-step write handshake, cascading lifecycle, an admin maintenance utility). The full design lives in code; this section ties the pieces together.

### Storage substrate

Image bytes live in **Convex File Storage**, addressed by `Id<"_storage">`. We chose Convex over S3/R2 for two reasons:

1. **The deletion cascade already runs through Convex.** Putting bytes anywhere else means duplicating the lifecycle logic — and a missed delete is a privacy bug, since the bytes are user data.
2. **Zero new infra.** No S3 bucket, no IAM, no CDN, no ArgoCD manifest change. The collectiongeek-infra repo wasn't touched at all to land this feature.

### Encrypted-blob envelope

Each blob on storage has this layout:

```
┌──────┬──────┬─────┬───────────────────┬─────┬──────────────────────┐
│ CGEK │ 0x01 │ uLen│ workosUserId[uLen]│ IV  │ AES-GCM(ciphertext)  │
│ 4 B  │ 1 B  │ 1 B │   ASCII bytes     │12 B │   …(tag included)    │
└──────┴──────┴─────┴───────────────────┴─────┴──────────────────────┘
   plaintext header (owner identifier)        encrypted body
```

The leading magic + version + owner-id is the **one deliberate departure from strict zero-knowledge** in the app: image bytes carry their owner in the clear so the orphan-sweep utility can attribute a stray blob without joining against the database. Image _content_ remains encrypted. The trade-off is discussed in [SECURITY.md](SECURITY.md).

Wrap/unwrap helpers: `wrapWithOwnerHeader` and `unwrapOwnerHeader` in [frontend/src/lib/crypto.ts](frontend/src/lib/crypto.ts).

### Upload handshake (three steps)

```
[Browser]
  1. compress + resize  (browser-image-compression, 1500px / 500KB)
  2. encrypt body       (encryptBinary with DEK)
  3. prepend CGEK header  (wrapWithOwnerHeader)
     │
     ├─ POST /api/v1/assets/{id}/images/upload-url
     │       (Go → Convex images.generateUploadUrl)
     │       Convex: verify ownership, count < 6, return signed URL
     │
     ├─ POST <signed URL>  (encrypted blob, octet-stream)
     │       Convex storage returns { storageId }
     │
     └─ POST /api/v1/assets/{id}/images
             (Go → Convex images.recordImage)
             Convex: re-verify count, insert assetImages row,
                     manage isPrimary if applicable
```

The count check is duplicated on purpose. The signed URL is one-shot but its issuance and the row insert are not in the same transaction; a concurrent upload could push the asset over the limit between steps. `recordImage` is the authoritative gate — if count ≥ 6 at insert time it deletes the just-uploaded blob and throws `"Image limit reached"`.

### Read path

`useQuery(api.images.listByAsset, { assetId })` returns each row plus a short-lived `storageUrl` from `ctx.storage.getUrl(storageId)`. The browser fetches the encrypted bytes from that URL, strips the CGEK header, decrypts the body, and creates an `objectURL` for `<img src>`. The shared cache lives in [frontend/src/lib/images.ts](frontend/src/lib/images.ts) (`getDecryptedImageUrl`); both the thumbnail and the lightbox go through it so each image is decrypted at most once per tab.

### Crop view: metadata, not bytes

When the user "crops" an image in the manager, the source file is unchanged. We persist a normalized crop region `{ x, y, width, height }` (each 0..1 of natural image dimensions) inside the encrypted metadata blob. The thumbnail uses CSS positioning to make that region exactly fill the container; the lightbox ignores the crop entirely and shows the full image. The derivation of the CSS formula is documented inline in [frontend/src/components/images/EncryptedThumbnail.tsx](frontend/src/components/images/EncryptedThumbnail.tsx).

### Lifecycle hooks

Three places sweep image bytes when the row goes away:

1. **Per-image delete** ([convex/images.ts](convex/images.ts) `deleteImage`) — `ctx.storage.delete` then `ctx.db.delete`, in that order. If the removed row was `isPrimary` and others remain, promote the lowest-`position` survivor.
2. **Per-asset delete** ([convex/assets.ts](convex/assets.ts) `deleteAsset`) — extended to sweep `assetImages by_asset` before deleting the asset row.
3. **Per-user cascade** ([convex/users.ts](convex/users.ts) `cascadeDeleteUser`) — sweeps `assetImages by_user` up front, same idiom as the existing `assetCollections` sweep.

### Orphan sweep

[convex/admin.ts](convex/admin.ts) `sweepOrphanedImages` diffs `_storage` against the set of referenced `assetImages.storageId`s and deletes the difference. Internal-only mutation; invoked via `npm run admin:sweep-orphans`. Scales fine while the app is small — see the inline comment for the threshold at which pagination becomes necessary.

---

## The pattern for future binary content

The image feature established a reusable substrate. If you're adding audio clips, scanned documents, video walkarounds, or anything else file-shaped, the answers are:

1. **Encrypt the bytes** client-side with the user's DEK using `encryptBinary` in [crypto.ts](frontend/src/lib/crypto.ts).
2. **Wrap with the CGEK owner header** so the orphan sweep can attribute the blob without database state. Image content stays encrypted; only the owner id is in the clear.
3. **Store via Convex File Storage**, not external object storage. Add a new table (`assetAudio`, `assetScans`, …) that holds `storageId: v.id("_storage")` plus encrypted metadata.
4. **Extend the lifecycle hooks** — `deleteAsset`, `cascadeDeleteUser`, and the orphan sweep — to include the new table.
5. **Use the same write handshake**: signed-URL → upload → recordRow, with the count/quota check authoritative in the recordRow mutation.

What you'll need to _decide_ per feature: the UX surface (preview, gallery, player, inline rendering) and any feature-specific quotas. The substrate doesn't change.

---

## Where to look

| Concern                   | File                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------ |
| Schema, all tables        | [convex/schema.ts](convex/schema.ts)                                                 |
| Convex auth helper        | [convex/auth.ts](convex/auth.ts)                                                     |
| Account-delete cascade    | [convex/users.ts](convex/users.ts) `cascadeDeleteUser`                               |
| Image mutations & queries | [convex/images.ts](convex/images.ts)                                                 |
| Admin maintenance         | [convex/admin.ts](convex/admin.ts)                                                   |
| Crypto primitives         | [frontend/src/lib/crypto.ts](frontend/src/lib/crypto.ts)                             |
| Field encrypt/decrypt     | [frontend/src/lib/encrypted-fields.ts](frontend/src/lib/encrypted-fields.ts)         |
| DEK provider              | [frontend/src/lib/encryption-provider.tsx](frontend/src/lib/encryption-provider.tsx) |
| Image orchestration       | [frontend/src/lib/images.ts](frontend/src/lib/images.ts)                             |
| Go JWKS middleware        | [backend/internal/middleware/auth.go](backend/internal/middleware/auth.go)           |
| Convex HTTP client (Go)   | [backend/internal/convex/client.go](backend/internal/convex/client.go)               |
| Image handlers (Go)       | [backend/internal/handlers/images.go](backend/internal/handlers/images.go)           |
| Admin scripts             | [scripts/](scripts/)                                                                 |
