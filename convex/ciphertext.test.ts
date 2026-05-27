import { describe, expect, it } from "vitest";
import {
  assertCiphertextShape,
  assertOptionalCiphertextShape,
} from "./ciphertext";

// Smallest possible AES-GCM envelope output (12-byte IV + 16-byte tag = 28
// bytes) encoded as base64. Exactly 40 chars including `=` padding.
const MIN_VALID = "A".repeat(38) + "==";

// A representative longer ciphertext (the bytes themselves are gibberish —
// the helper is shape-only and doesn't care).
const LONGER_VALID = "Q".repeat(100) + "=="; // length 102 → not %4
const TYPICAL_VALID = "Q".repeat(100); // length 100 → %4 OK

describe("ciphertext shape guard", () => {
  it("accepts a minimum-length base64 ciphertext", () => {
    expect(() => assertCiphertextShape(MIN_VALID, "field")).not.toThrow();
  });

  it("accepts typical longer ciphertext", () => {
    expect(() => assertCiphertextShape(TYPICAL_VALID, "field")).not.toThrow();
  });

  it("rejects values shorter than the AES-GCM minimum", () => {
    expect(() => assertCiphertextShape("AAAA", "name")).toThrow(/too short/);
  });

  it("rejects values longer than the cap", () => {
    const tooLong = "A".repeat(64 * 1024 + 4);
    expect(() => assertCiphertextShape(tooLong, "tags")).toThrow(/too long/);
  });

  it("rejects values whose length is not a multiple of 4", () => {
    expect(() => assertCiphertextShape(LONGER_VALID, "field")).toThrow(
      /multiple of 4/
    );
  });

  it("rejects values with non-base64 characters", () => {
    // 40 chars including a `!` that's outside the base64 alphabet.
    const bad = "A".repeat(39) + "!";
    expect(() => assertCiphertextShape(bad, "field")).toThrow(/not valid base64/);
  });

  it("rejects empty strings (a classic 'wrote plaintext' case)", () => {
    expect(() => assertCiphertextShape("", "name")).toThrow(/too short/);
  });

  it("includes the field name in error messages", () => {
    expect(() => assertCiphertextShape("AAAA", "marketValue")).toThrow(
      /^marketValue:/
    );
  });

  describe("assertOptionalCiphertextShape", () => {
    it("treats undefined as valid", () => {
      expect(() =>
        assertOptionalCiphertextShape(undefined, "description")
      ).not.toThrow();
    });

    it("still validates when a value is present", () => {
      expect(() => assertOptionalCiphertextShape("", "description")).toThrow(
        /too short/
      );
    });

    it("accepts a valid present value", () => {
      expect(() =>
        assertOptionalCiphertextShape(MIN_VALID, "description")
      ).not.toThrow();
    });
  });
});
