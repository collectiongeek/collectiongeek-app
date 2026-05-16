/**
 * Field-level encryption/decryption helpers built on top of the primitives
 * in lib/crypto.ts. These handle the shape conversions specific to each
 * field type:
 *
 *   - text: string ↔ ciphertext
 *   - number: number ↔ stringified-and-encrypted ↔ parsed back
 *   - string[]: JSON-stringify ↔ encrypt ↔ JSON-parse
 *
 * Every helper has an "optional" variant: if the input is undefined or an
 * empty string/array, the output is undefined (we don't store empty
 * ciphertext blobs on the server).
 */

import { decryptString, encryptString } from "./crypto";

// --- Encryption (plaintext → ciphertext) -----------------------------

export async function encryptText(
  plaintext: string,
  dek: CryptoKey
): Promise<string> {
  return encryptString(plaintext, dek);
}

export async function encryptOptionalText(
  plaintext: string | undefined,
  dek: CryptoKey
): Promise<string | undefined> {
  if (plaintext === undefined || plaintext === "") return undefined;
  return encryptString(plaintext, dek);
}

export async function encryptOptionalNumber(
  value: number | undefined,
  dek: CryptoKey
): Promise<string | undefined> {
  // Symmetric with decryptOptionalNumber, which uses Number.isFinite to reject
  // NaN / ±Infinity on read. Without this guard, ±Infinity would be encrypted
  // as the string "Infinity" and silently round-trip back to undefined.
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return encryptString(String(value), dek);
}

export async function encryptOptionalArray(
  arr: readonly string[] | undefined,
  dek: CryptoKey
): Promise<string | undefined> {
  if (!arr || arr.length === 0) return undefined;
  return encryptString(JSON.stringify(arr), dek);
}

// --- Decryption (ciphertext → plaintext) -----------------------------

/**
 * Decrypts a required text field. Returns a fallback string on failure so
 * the UI can still render something — better than throwing inside a render.
 */
export async function decryptText(
  ciphertext: string,
  dek: CryptoKey
): Promise<string> {
  try {
    return await decryptString(ciphertext, dek);
  } catch {
    return "[decryption failed]";
  }
}

/**
 * Decrypts an optional text field. Inherits decryptText's failure behaviour
 * by design: if the ciphertext is present but unreadable, return the visible
 * "[decryption failed]" marker rather than `undefined`. The marker is louder
 * than a silently-missing field — a user with a corrupted record should see
 * that something went wrong, not assume the field was always empty. The
 * other optional decryptors (number, array) can't follow this pattern
 * because their return type can't carry a sentinel string.
 */
export async function decryptOptionalText(
  ciphertext: string | undefined,
  dek: CryptoKey
): Promise<string | undefined> {
  if (ciphertext === undefined || ciphertext === "") return undefined;
  return decryptText(ciphertext, dek);
}

export async function decryptOptionalNumber(
  ciphertext: string | undefined,
  dek: CryptoKey
): Promise<number | undefined> {
  if (ciphertext === undefined || ciphertext === "") return undefined;
  try {
    const s = await decryptString(ciphertext, dek);
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

export async function decryptOptionalArray(
  ciphertext: string | undefined,
  dek: CryptoKey
): Promise<string[] | undefined> {
  if (ciphertext === undefined || ciphertext === "") return undefined;
  try {
    const s = await decryptString(ciphertext, dek);
    const parsed: unknown = JSON.parse(s);
    if (!Array.isArray(parsed)) return undefined;
    // Element-level check — the encryption side only writes string[], but the
    // ciphertext could come from a future schema or a corrupted blob. Refuse
    // rather than silently cast a mixed array.
    if (!parsed.every((el): el is string => typeof el === "string")) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}
