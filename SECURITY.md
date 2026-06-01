# Security Model

CollectionGeek uses **client-side, zero-knowledge encryption** to protect the contents of your collections. This document explains, in concrete terms, what is and isn't protected, the cryptography in use, and where to find the relevant code so you can audit the claims for yourself.

The codebase is open source. Nothing here should be taken on faith.

## TL;DR

Your collection data is encrypted in your browser with a key only you have. The CollectionGeek operators (and the Convex backend the app runs on) store the encrypted blobs but cannot read them. The single recovery code you save at sign-up is the only way to get your data back on a new device. If you lose it, your data is unrecoverable — there is no support backdoor.

## Threat model

**Protected against:**

- An operator (CollectionGeek admin, Convex staff, a contractor with database access) reading the contents of your collections in the production database.
- A database leak, backup-tape compromise, or insider snooping revealing what you've cataloged.

**Not protected against:**

- A malicious script running in your authenticated browser (XSS). Such a script would have the same access to your data as you do, including the in-memory CryptoKey handle. Defense here is the usual web defense: CSP, dependency hygiene, no `dangerouslySetInnerHTML` on user content.
- A compromised device. Anyone with access to your unlocked browser profile can use the locally-stored DEK to read/write data without entering the recovery code.
- A compromised WorkOS sign-in. Someone who can authenticate as you in a new browser will be prompted for the recovery code; they still need it to unlock data. But on a device where you're already unlocked, no further code is required.
- Legal compulsion of _you_. We can't produce your recovery code, but a court could compel you to.
- **Metadata.** Operators can see record counts, sizes, timestamps, and the graph of which assets belong to which collections — just not the contents. See the next two sections.

## What's encrypted

Stored as opaque ciphertext (AES-GCM-256, base64). The server has no way to read these:

- Asset Type **names** and **descriptions**
- Asset Type descriptor **names** and (for `select` descriptors) the list of **options**
- Collection Type **names** and **descriptions**
- Collection **names** and **descriptions**
- Asset **names** and **descriptions**
- Asset **`dateAcquired`**, **`purchasedValue`**, **`marketValue`**, and **`tags`**
- The **value** of every descriptor field on every individual asset
- **Asset image bytes** — every uploaded photo is AES-GCM-encrypted in your browser before it leaves your device. The Convex file store holds opaque ciphertext; operators cannot view your photos. See "Image bytes and the owner header" below for the one nuance.
- **Image crop view metadata** — the per-image viewport adjustment ({ x, y, width, height } region) is encrypted with the rest of the image metadata.

## What is NOT encrypted

Plaintext on the server. None of these contain user-authored content beyond what's listed:

- Your **email** and **username** (needed to sign you in and uniquely identify you).
- Your **WorkOS user ID**.
- **Timestamps** of record creation and updates (`createdAt`, `updatedAt`).
- **Foreign keys and relationships**: which collection an asset is in, which asset type it uses, which descriptor a value is for.
- **Descriptor structural metadata**: `dataType` (`text` / `number` / `date` / `year` / `boolean` / `select`), `required`, and display `order`. The client needs these to render the right input widget without first decrypting anything. The descriptor's _name_ and a `select`'s _options_ are still encrypted; only the _kind_ of widget is plaintext.
- **Counts and sizes**: an operator can see that you have N collections containing M assets each, even without knowing their names.
- Your **UI preferences** (theme, theme mode).
- **The fact that you have encryption set up** (the presence of `wrappedDek`/`keySalt` on your user record).
- **The owner identifier on each image blob.** A 6-byte fixed header (4-byte `CGEK` magic + 1-byte version + 1-byte user-id length) followed by your WorkOS user id rides in the clear at the front of every encrypted image. The image _content_ stays encrypted. See the next section for what this is for.

## Image bytes and the owner header

Image content is end-to-end encrypted with the same DEK and the same AES-GCM construction as the rest of your data. There is one **deliberate** plaintext concession unique to image blobs: the encrypted bytes are prefixed with a tiny header carrying your WorkOS user id:

```text
┌──────┬──────┬─────┬──────────────────┬─────┬──────────────────────┐
│ CGEK │ 0x01 │ uLen│  WorkOS user id  │ IV  │ AES-GCM(image bytes) │
│ 4 B  │ 1 B  │ 1 B │   ASCII bytes    │12 B │   …(tag included)    │
└──────┴──────┴─────┴──────────────────┴─────┴──────────────────────┘
   plaintext header (owner identifier)        encrypted body
```

**Why this exists.** If a database row pointing at a stored blob ever goes missing — bug, partial outage, abandoned upload — the blob becomes invisible to your account but still occupies space. The admin orphan-sweep utility identifies and deletes those by comparing what's in the file store against what's referenced from the database. The plaintext header makes it possible to attribute an orphan back to a user account for audit logging _without_ needing to decrypt anything.

**What it doesn't reveal.** Your image content stays end-to-end encrypted. The header reveals only your WorkOS user identifier — the same identifier already present in your authenticated traffic, on your user row in the database, and in WorkOS's own systems. It does not say anything about what the image is, what asset it belongs to, when it was taken, or what device shot it.

**What it does reveal.** If an attacker with database read access also reads the file store, they can list which blobs belong to which user — something they could already infer from the `assetImages.userId` foreign key. The header reveals nothing they didn't already have.

This is the only place in the app where plaintext rides alongside encrypted content. The trade is documented here so it's an informed choice, not an oversight.

## Key model

```text
recovery code  ── PBKDF2(600k iterations, SHA-256, 16-byte random salt) ──▶  KEK
DEK            ── random AES-GCM-256, generated in browser              ──▶  encrypts all your data
DEK            ── AES-GCM wrap with KEK                                 ──▶  wrappedDek  (sent to server)
```

- **DEK** (_Data Encryption Key_): a 256-bit AES-GCM key generated in your browser at sign-up. Stored on each device as a **non-extractable** `CryptoKey` in IndexedDB. This means even a script running on the page can use the key for encrypt/decrypt operations but cannot read the raw key bytes — they're held by the browser's crypto subsystem, not by JavaScript.
- **KEK** (_Key Encryption Key_): derived on demand from your recovery code via PBKDF2 (600,000 iterations, SHA-256, with a per-user random salt — OWASP 2023 minimum). Used only momentarily to wrap or unwrap the DEK. Never stored anywhere.
- **Wrapped DEK**: the DEK encrypted with the KEK, base64-encoded. Stored on the server alongside the salt. Useless without the recovery code.
- **Recovery code**: 32-char Crockford base32 (no `I`, `L`, `O`, or `U` to avoid character confusion), 160 bits of entropy, generated client-side at sign-up. Shown to you exactly once. The server never receives, stores, or sees it.

## Cryptography specifics

| Purpose          | Algorithm        | Parameters                                             |
| ---------------- | ---------------- | ------------------------------------------------------ |
| Data encryption  | AES-GCM          | 256-bit key, fresh 12-byte random IV per blob          |
| Key wrap         | AES-GCM          | 256-bit KEK, fresh 12-byte random IV                   |
| KEK derivation   | PBKDF2-HMAC      | SHA-256, 600,000 iterations, 16-byte random salt       |
| Storage encoding | base64           | IV is prepended to ciphertext before base64-encoding   |
| Recovery code    | Crockford base32 | 20 random bytes → 32 chars, displayed in 4-char groups |

All cryptography goes through the browser's Web Crypto API (`window.crypto.subtle`). No custom or rolled-your-own crypto is used.

## Recovery model

There is **no key escrow**. The server stores the wrapped DEK and salt — neither is usable without the recovery code.

A recovery code is validated _implicitly_, by attempting to unwrap the stored wrapped DEK with the KEK derived from it. If AES-GCM's authentication tag verifies, the code was right and you get your DEK back; if it doesn't, the unwrap throws and the code is rejected. There is no separate password hash, verification token, or any server-side check — and there couldn't be without breaking the zero-knowledge property.

- **You lose the recovery code AND your browser data is wiped.** Your encrypted records are unrecoverable. The only path forward is to delete the account from Settings → Delete account and start over. We can't help, and we will not pretend otherwise.
- **You suspect your code has been seen.** Go to Settings → Encryption → Rotate. A new code is generated in your browser, the same DEK is re-wrapped under a freshly derived KEK, and the old code stops working — all without re-encrypting your data, because the DEK itself doesn't change.
- **You sign in on a new device.** You'll be prompted for the recovery code. Once entered, it's used to unwrap the server-held wrapped DEK, the resulting key is re-imported as a non-extractable `CryptoKey`, and stored in this device's IndexedDB. The recovery code is _not_ persisted anywhere.

## Sign-out and account deletion

- **Sign-out** wipes the DEK from this device's IndexedDB before clearing the auth session. Re-signing in on the same browser will require the recovery code again. This is deliberate: a deliberate sign-out should require a deliberate sign-in to regain access.
- **Account deletion** does two things on the server, then cleans up the client:
  1. Cascade-deletes the Convex user record and every encrypted blob belonging to you.
  2. Calls the WorkOS `DELETE /user_management/users/{id}` API to remove the WorkOS user record (your email, sign-in method, session). After both succeed, neither system retains a record of you.
  3. On the client: wipes the local DEK, `localStorage`, `sessionStorage`, and JS-accessible cookies.

If the WorkOS step fails after the Convex cascade has already run, you may end up in a partial state where your content is gone but the WorkOS user record still exists. The handler surfaces an error in that case so you know to retry or contact support.

## Where to look in the code

If you want to verify any of the claims above, these are the relevant files:

- Crypto primitives: [frontend/src/lib/crypto.ts](frontend/src/lib/crypto.ts)
- Field-level encrypt / decrypt helpers: [frontend/src/lib/encrypted-fields.ts](frontend/src/lib/encrypted-fields.ts)
- DEK lifecycle on the device: [frontend/src/lib/encryption-provider.tsx](frontend/src/lib/encryption-provider.tsx)
- Image-byte encryption + owner-header wrap/unwrap: [frontend/src/lib/crypto.ts](frontend/src/lib/crypto.ts) (`encryptBinary`, `wrapWithOwnerHeader`, `unwrapOwnerHeader`)
- Image upload + storage orchestration: [frontend/src/lib/images.ts](frontend/src/lib/images.ts)
- Schema (every ciphertext field is annotated): [convex/schema.ts](convex/schema.ts)
- Server-side encryption endpoints: [convex/users.ts](convex/users.ts) — `setEncryptionKey`, `rotateEncryptionKey`
- Crypto tests (round-trip, rotation, wrong-code rejection, binary + owner header): [frontend/src/lib/crypto.test.ts](frontend/src/lib/crypto.test.ts)

## Automated security scanning

This repo is scanned continuously, and you can run the same scans locally. See
[docs/security-scanning.md](docs/security-scanning.md) for the full setup. In short:

- **Opengrep** — SAST for the TypeScript/React frontend, Convex functions, and the
  Go backend. Catches injection, dangerous sinks, and auth mistakes via taint
  analysis. Run locally with `npm run scan:sast`.
- **Trivy** — dependency CVEs (npm + Go modules), leaked-secret detection, and
  Dockerfile/compose misconfiguration in one pass. Run locally with `npm run scan:trivy`.
- **GitHub-native** — CodeQL code scanning, secret scanning with push protection,
  and Dependabot, all free on this public repo. Results land in the **Security** tab.

Scanner versions are pinned and (for Opengrep) cosign-verified — the scanners are
treated as supply-chain dependencies in their own right.

## Reporting a vulnerability

If you find a flaw in the encryption design or implementation, please report it privately first. Email the maintainer (see the repo README for current contact) rather than opening a public issue. We'll acknowledge within a reasonable window and credit you in the fix unless you'd rather stay anonymous.
