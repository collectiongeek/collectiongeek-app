/**
 * Application-level encryption primitives for CollectionGeek's zero-knowledge
 * data model.
 *
 * Threat model: even the people running the service (Convex staff,
 * CollectionGeek admins) cannot read user-authored data. Anything sensitive
 * is encrypted in the browser with a key the server never holds in plaintext.
 *
 * Key hierarchy:
 *   - DEK ("Data Encryption Key"): a random AES-GCM-256 key that encrypts
 *     all of a user's data. Lives in IndexedDB on each device the user has
 *     unlocked, as a non-extractable CryptoKey (so XSS can use it for
 *     encrypt/decrypt operations but can't exfiltrate the raw bytes).
 *   - KEK ("Key Encryption Key"): derived from the user's recovery code via
 *     PBKDF2. Only exists transiently in memory when wrapping/unwrapping.
 *   - Wrapped DEK: the DEK encrypted with the KEK. Stored on the server.
 *     Useless without the recovery code.
 *
 * On signup:
 *   1. Generate DEK and recovery code.
 *   2. Derive KEK from recovery code + random salt.
 *   3. Wrap DEK with KEK.
 *   4. Send wrapped DEK + salt to the server; show recovery code to the user
 *      once (we never see it again).
 *   5. Re-import DEK locally as non-extractable; store in IndexedDB.
 *
 * On new-device login:
 *   1. Fetch wrapped DEK + salt from server.
 *   2. Prompt user for recovery code.
 *   3. Derive KEK, unwrap DEK.
 *   4. Re-import DEK as non-extractable; store in IndexedDB.
 */

// AES-GCM 12-byte IV is the standard NIST recommendation.
const IV_BYTES = 12;
// AES-GCM appends a 16-byte authentication tag, so any valid ciphertext
// is at least this long (the plaintext itself can be 0 bytes).
const GCM_TAG_BYTES = 16;
// 16-byte salt for PBKDF2 KEK derivation — overkill but cheap.
const SALT_BYTES = 16;
// PBKDF2 iteration count. OWASP 2023 minimum is 600,000 for SHA-256.
const PBKDF2_ITERATIONS = 600_000;
// 20 bytes = 160 bits of entropy, encoded as 32 base32 chars.
const RECOVERY_BYTES = 20;

// Crockford base32, minus I/L/O/U (commonly confused with 1/1/0/V).
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// -- Encoding helpers ---------------------------------------------------

function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

function base32ToBytes(input: string): Uint8Array {
  // Forgiving parse: uppercase, strip whitespace and hyphens, normalize
  // commonly-confused chars to their canonical alphabet members.
  const canonical = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
  const bytes = new Uint8Array(Math.floor((canonical.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let outIdx = 0;
  for (const ch of canonical) {
    const v = BASE32_ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("Invalid recovery code");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes[outIdx++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// -- Recovery code ------------------------------------------------------

/** Generates a 32-char base32 recovery code, displayed as 8 groups of 4. */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_BYTES));
  const raw = bytesToBase32(bytes);
  return raw.match(/.{1,4}/g)!.join("-");
}

/**
 * Quick format check on a user-entered recovery code, used to give a faster
 * "this isn't a real code" error than letting it fail at the PBKDF2/decrypt
 * stage. Returns true if the input is well-formed; doesn't say anything
 * about whether it matches a specific user's wrapped DEK.
 */
export function isValidRecoveryCode(input: string): boolean {
  try {
    const bytes = base32ToBytes(input);
    return bytes.length === RECOVERY_BYTES;
  } catch {
    return false;
  }
}

// -- Key derivation -----------------------------------------------------

async function deriveKekFromCode(
  recoveryCode: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const codeBytes = new TextEncoder().encode(
    recoveryCode.toUpperCase().replace(/[\s-]/g, "")
  );
  const baseKey = await crypto.subtle.importKey(
    "raw",
    codeBytes as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
  );
}

// -- DEK lifecycle ------------------------------------------------------

export interface NewKeyBundle {
  /** The active DEK, ready to encrypt/decrypt (non-extractable). */
  dek: CryptoKey;
  /** Wrapped DEK to send to the server, base64-encoded. */
  wrappedDek: string;
  /** Salt used for KEK derivation, base64-encoded. */
  salt: string;
  /** Recovery code to show the user once. */
  recoveryCode: string;
}

/**
 * Creates a fresh DEK for a brand-new user. Generates the recovery code,
 * derives the KEK, wraps the DEK, and returns everything the caller needs
 * (server-bound material + the active key for in-memory use).
 */
export async function createNewKeyBundle(): Promise<NewKeyBundle> {
  // Generate the DEK as EXTRACTABLE — we need raw bytes briefly to wrap it.
  const extractableDek = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawDek = await crypto.subtle.exportKey("raw", extractableDek);
  const wrap = await wrapDekBytes(rawDek);
  const nonExtractableDek = await importDekBytes(rawDek);
  return { dek: nonExtractableDek, ...wrap };
}

/**
 * Rotates the user's recovery code. Requires the OLD code (proving the
 * caller is the legitimate user) and re-wraps the same DEK under a fresh
 * code + salt. Returns the new server-bound material plus a freshly
 * non-extractable CryptoKey for the same DEK — the local IndexedDB copy
 * should be replaced so the new instance is consistent with the new wrap.
 */
export async function rotateRecoveryCode(
  oldRecoveryCode: string,
  wrappedDekB64: string,
  saltB64: string
): Promise<NewKeyBundle> {
  const rawDek = await decryptWrappedDek(
    oldRecoveryCode,
    wrappedDekB64,
    saltB64
  );
  const wrap = await wrapDekBytes(rawDek);
  const nonExtractableDek = await importDekBytes(rawDek);
  return { dek: nonExtractableDek, ...wrap };
}

/**
 * Decrypts a wrapped DEK and returns the raw key bytes. Internal: callers
 * should immediately use either {@link wrapDekBytes} (to re-wrap) or
 * {@link importDekBytes} (to import as a non-extractable CryptoKey).
 */
async function decryptWrappedDek(
  recoveryCode: string,
  wrappedDekB64: string,
  saltB64: string
): Promise<ArrayBuffer> {
  const salt = base64ToBytes(saltB64);
  const kek = await deriveKekFromCode(recoveryCode, salt);

  const wrapped = base64ToBytes(wrappedDekB64);
  if (wrapped.length < IV_BYTES + GCM_TAG_BYTES) {
    throw new Error("Wrapped key is malformed");
  }
  const iv = wrapped.subarray(0, IV_BYTES);
  const ct = wrapped.subarray(IV_BYTES);

  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      kek,
      ct as BufferSource
    );
  } catch {
    throw new Error("Wrong recovery code");
  }
}

async function importDekBytes(rawDek: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawDek, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

interface WrapResult {
  wrappedDek: string;
  salt: string;
  recoveryCode: string;
}

async function wrapDekBytes(rawDek: ArrayBuffer): Promise<WrapResult> {
  const recoveryCode = generateRecoveryCode();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const kek = await deriveKekFromCode(recoveryCode, salt);
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrappedCt = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv as BufferSource },
    kek,
    rawDek
  );
  const wrappedBytes = new Uint8Array(IV_BYTES + wrappedCt.byteLength);
  wrappedBytes.set(wrapIv, 0);
  wrappedBytes.set(new Uint8Array(wrappedCt), IV_BYTES);
  return {
    wrappedDek: bytesToBase64(wrappedBytes),
    salt: bytesToBase64(salt),
    recoveryCode,
  };
}

/**
 * Decrypts a wrapped DEK using the recovery code + salt fetched from the
 * server. Used during new-device unlock.
 */
export async function unwrapDekWithRecoveryCode(
  recoveryCode: string,
  wrappedDekB64: string,
  saltB64: string
): Promise<CryptoKey> {
  const rawDek = await decryptWrappedDek(recoveryCode, wrappedDekB64, saltB64);
  return importDekBytes(rawDek);
}

// -- Data encryption ----------------------------------------------------

/** Encrypts a UTF-8 string with the user's DEK. Returns base64(iv | ct+tag). */
export async function encryptString(
  plaintext: string,
  dek: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dek,
    new TextEncoder().encode(plaintext) as BufferSource
  );
  const out = new Uint8Array(IV_BYTES + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), IV_BYTES);
  return bytesToBase64(out);
}

/** Decrypts a string produced by {@link encryptString}. */
export async function decryptString(
  ciphertext: string,
  dek: CryptoKey
): Promise<string> {
  const buf = base64ToBytes(ciphertext);
  if (buf.length < IV_BYTES + GCM_TAG_BYTES) {
    throw new Error("Ciphertext is malformed");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const ct = buf.subarray(IV_BYTES);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dek,
    ct as BufferSource
  );
  return new TextDecoder().decode(pt);
}

// -- Binary encryption (for image bytes) -------------------------------

/**
 * Encrypts arbitrary bytes with the user's DEK. Returns raw bytes
 * (iv || ciphertext+tag) so the caller can prepend its own envelope —
 * see {@link wrapWithOwnerHeader}.
 */
export async function encryptBinary(
  data: Uint8Array | ArrayBuffer,
  dek: CryptoKey
): Promise<Uint8Array> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dek,
    bytes as BufferSource
  );
  const out = new Uint8Array(IV_BYTES + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), IV_BYTES);
  return out;
}

/** Inverse of {@link encryptBinary}. */
export async function decryptBinary(
  data: Uint8Array,
  dek: CryptoKey
): Promise<Uint8Array> {
  if (data.length < IV_BYTES + GCM_TAG_BYTES) {
    throw new Error("Ciphertext is malformed");
  }
  const iv = data.subarray(0, IV_BYTES);
  const ct = data.subarray(IV_BYTES);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dek,
    ct as BufferSource
  );
  return new Uint8Array(pt);
}

// -- Owner-tagged image envelope ---------------------------------------
//
// Image bytes on storage have this prefix so an admin sweeping orphaned
// blobs can attribute them to a user without joining against the DB:
//
//   [CGEK][0x01][uLen][userId ASCII][encrypted body…]
//    4 B   1 B   1 B    uLen bytes   variable
//
// This is the only place where any plaintext leaks alongside encrypted
// content — see plan/docs. The server already observes ownership via
// authenticated traffic, so it doesn't reveal new information.

const OWNER_HEADER_MAGIC = new Uint8Array([0x43, 0x47, 0x45, 0x4b]); // "CGEK"
const OWNER_HEADER_VERSION = 0x01;

export function wrapWithOwnerHeader(
  workosUserId: string,
  encryptedBody: Uint8Array
): Uint8Array {
  const idBytes = new TextEncoder().encode(workosUserId);
  if (idBytes.length === 0 || idBytes.length > 255) {
    throw new Error("WorkOS user id is empty or too long");
  }
  const headerLen = OWNER_HEADER_MAGIC.length + 1 + 1 + idBytes.length;
  const out = new Uint8Array(headerLen + encryptedBody.length);
  out.set(OWNER_HEADER_MAGIC, 0);
  out[OWNER_HEADER_MAGIC.length] = OWNER_HEADER_VERSION;
  out[OWNER_HEADER_MAGIC.length + 1] = idBytes.length;
  out.set(idBytes, OWNER_HEADER_MAGIC.length + 2);
  out.set(encryptedBody, headerLen);
  return out;
}

export interface OwnerHeader {
  workosUserId: string;
  body: Uint8Array;
}

export function unwrapOwnerHeader(blob: Uint8Array): OwnerHeader {
  const fixed = OWNER_HEADER_MAGIC.length + 2;
  if (blob.length < fixed) throw new Error("Blob too short for owner header");
  for (let i = 0; i < OWNER_HEADER_MAGIC.length; i++) {
    if (blob[i] !== OWNER_HEADER_MAGIC[i]) {
      throw new Error("Missing CGEK magic in blob header");
    }
  }
  if (blob[OWNER_HEADER_MAGIC.length] !== OWNER_HEADER_VERSION) {
    throw new Error("Unsupported owner-header version");
  }
  const uLen = blob[OWNER_HEADER_MAGIC.length + 1];
  if (blob.length < fixed + uLen) throw new Error("Truncated owner header");
  const workosUserId = new TextDecoder().decode(
    blob.subarray(fixed, fixed + uLen)
  );
  return { workosUserId, body: blob.subarray(fixed + uLen) };
}

// -- IndexedDB key storage ---------------------------------------------

const IDB_NAME = "cg-keys";
const IDB_STORE = "deks";
const IDB_VERSION = 1;

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persists the DEK in IndexedDB keyed by the user's workosUserId. */
export async function storeDek(
  workosUserId: string,
  dek: CryptoKey
): Promise<void> {
  const db = await openKeyDb();
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    await idbRequest(tx.objectStore(IDB_STORE).put(dek, workosUserId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Returns the DEK if this device has been unlocked for the user, else null. */
export async function loadDek(
  workosUserId: string
): Promise<CryptoKey | null> {
  const db = await openKeyDb();
  try {
    const tx = db.transaction(IDB_STORE, "readonly");
    const result = await idbRequest<unknown>(
      tx.objectStore(IDB_STORE).get(workosUserId)
    );
    return result instanceof CryptoKey ? result : null;
  } finally {
    db.close();
  }
}

/** Removes the DEK for this user from IndexedDB (e.g. on sign-out). */
export async function clearDek(workosUserId: string): Promise<void> {
  const db = await openKeyDb();
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    await idbRequest(tx.objectStore(IDB_STORE).delete(workosUserId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
