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
- Legal compulsion of *you*. We can't produce your recovery code, but a court could compel you to.
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

## What is NOT encrypted

Plaintext on the server. None of these contain user-authored content beyond what's listed:

- Your **email** and **username** (needed to sign you in and uniquely identify you).
- Your **WorkOS user ID**.
- **Timestamps** of record creation and updates (`createdAt`, `updatedAt`).
- **Foreign keys and relationships**: which collection an asset is in, which asset type it uses, which descriptor a value is for.
- **Descriptor structural metadata**: `dataType` (`text` / `number` / `date` / `year` / `boolean` / `select`), `required`, and display `order`. The client needs these to render the right input widget without first decrypting anything. The descriptor's *name* and a `select`'s *options* are still encrypted; only the *kind* of widget is plaintext.
- **Counts and sizes**: an operator can see that you have N collections containing M assets each, even without knowing their names.
- Your **UI preferences** (theme, theme mode).
- **The fact that you have encryption set up** (the presence of `wrappedDek`/`keySalt` on your user record).

## Key model

```
recovery code  ── PBKDF2(600k iterations, SHA-256, 16-byte random salt) ──▶  KEK
DEK            ── random AES-GCM-256, generated in browser            ──▶  encrypts all your data
DEK            ── AES-GCM wrap with KEK                                ──▶  wrappedDek  (sent to server)
```

- **DEK** (*Data Encryption Key*): a 256-bit AES-GCM key generated in your browser at sign-up. Stored on each device as a **non-extractable** `CryptoKey` in IndexedDB. This means even a script running on the page can use the key for encrypt/decrypt operations but cannot read the raw key bytes — they're held by the browser's crypto subsystem, not by JavaScript.
- **KEK** (*Key Encryption Key*): derived on demand from your recovery code via PBKDF2 (600,000 iterations, SHA-256, with a per-user random salt — OWASP 2023 minimum). Used only momentarily to wrap or unwrap the DEK. Never stored anywhere.
- **Wrapped DEK**: the DEK encrypted with the KEK, base64-encoded. Stored on the server alongside the salt. Useless without the recovery code.
- **Recovery code**: 32-char Crockford base32 (no `I`, `L`, `O`, or `U` to avoid character confusion), 160 bits of entropy, generated client-side at sign-up. Shown to you exactly once. The server never receives, stores, or sees it.

## Cryptography specifics

| Purpose            | Algorithm        | Parameters                                              |
| ------------------ | ---------------- | ------------------------------------------------------- |
| Data encryption    | AES-GCM          | 256-bit key, fresh 12-byte random IV per blob           |
| Key wrap           | AES-GCM          | 256-bit KEK, fresh 12-byte random IV                    |
| KEK derivation     | PBKDF2-HMAC      | SHA-256, 600,000 iterations, 16-byte random salt        |
| Storage encoding   | base64           | IV is prepended to ciphertext before base64-encoding    |
| Recovery code      | Crockford base32 | 20 random bytes → 32 chars, displayed in 4-char groups  |

All cryptography goes through the browser's Web Crypto API (`window.crypto.subtle`). No custom or rolled-your-own crypto is used.

## Recovery model

There is **no key escrow**. The server stores the wrapped DEK and salt — neither is usable without the recovery code.

A recovery code is validated *implicitly*, by attempting to unwrap the stored wrapped DEK with the KEK derived from it. If AES-GCM's authentication tag verifies, the code was right and you get your DEK back; if it doesn't, the unwrap throws and the code is rejected. There is no separate password hash, verification token, or any server-side check — and there couldn't be without breaking the zero-knowledge property.

- **You lose the recovery code AND your browser data is wiped.** Your encrypted records are unrecoverable. The only path forward is to delete the account from Settings → Delete account and start over. We can't help, and we will not pretend otherwise.
- **You suspect your code has been seen.** Go to Settings → Encryption → Rotate. A new code is generated in your browser, the same DEK is re-wrapped under a freshly derived KEK, and the old code stops working — all without re-encrypting your data, because the DEK itself doesn't change.
- **You sign in on a new device.** You'll be prompted for the recovery code. Once entered, it's used to unwrap the server-held wrapped DEK, the resulting key is re-imported as a non-extractable `CryptoKey`, and stored in this device's IndexedDB. The recovery code is *not* persisted anywhere.

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
- Schema (every ciphertext field is annotated): [convex/schema.ts](convex/schema.ts)
- Server-side encryption endpoints: [convex/users.ts](convex/users.ts) — `setEncryptionKey`, `rotateEncryptionKey`
- Crypto tests (round-trip, rotation, wrong-code rejection): [frontend/src/lib/crypto.test.ts](frontend/src/lib/crypto.test.ts)

## Reporting a vulnerability

If you find a flaw in the encryption design or implementation, please report it privately first. Email the maintainer (see the repo README for current contact) rather than opening a public issue. We'll acknowledge within a reasonable window and credit you in the fix unless you'd rather stay anonymous.
