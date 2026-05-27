// Shape-only validation for ciphertext fields. Defense-in-depth: even though
// the client is the only honest writer, a buggy/stale client (or a malicious
// caller hitting the API directly) shouldn't be able to persist plaintext or
// runaway-sized blobs into the user-content columns.
//
// This does NOT decrypt or compromise the zero-knowledge story — it only
// asserts that what's being written *looks like* a base64-encoded AES-GCM
// envelope from frontend/src/lib/crypto.ts.

// AES-GCM envelope = 12-byte IV + ciphertext + 16-byte tag. Empty plaintext
// still produces 28 bytes → 40 base64 chars (with `=` padding).
const MIN_CIPHERTEXT_LEN = 40;

// Generous ceiling. Names, descriptions, JSON tag/option arrays, and the
// image metadata blob all sit under a few KiB in practice. 64 KiB ≈ 48 KiB
// of plaintext — well above any honest write, low enough that a buggy
// client can't dump megabytes into a row.
const MAX_CIPHERTEXT_LEN = 64 * 1024;

// Standard base64 alphabet with optional `=` padding (0–2 chars) at the end.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function assertCiphertextShape(value: string, field: string): void {
  if (typeof value !== "string") {
    throw new Error(`${field}: ciphertext must be a string`);
  }
  if (value.length < MIN_CIPHERTEXT_LEN) {
    throw new Error(
      `${field}: ciphertext too short (got ${value.length}, min ${MIN_CIPHERTEXT_LEN})`
    );
  }
  if (value.length > MAX_CIPHERTEXT_LEN) {
    throw new Error(
      `${field}: ciphertext too long (got ${value.length}, max ${MAX_CIPHERTEXT_LEN})`
    );
  }
  if (value.length % 4 !== 0) {
    throw new Error(`${field}: ciphertext length must be a multiple of 4`);
  }
  if (!BASE64_RE.test(value)) {
    throw new Error(`${field}: ciphertext is not valid base64`);
  }
}

export function assertOptionalCiphertextShape(
  value: string | undefined,
  field: string
): void {
  if (value === undefined) return;
  assertCiphertextShape(value, field);
}
