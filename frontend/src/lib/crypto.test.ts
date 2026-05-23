import { describe, it, expect } from "vitest";
import {
  createNewKeyBundle,
  decryptBinary,
  decryptString,
  encryptBinary,
  encryptString,
  generateRecoveryCode,
  isValidRecoveryCode,
  rotateRecoveryCode,
  unwrapDekWithRecoveryCode,
  unwrapOwnerHeader,
  wrapWithOwnerHeader,
} from "./crypto";

describe("crypto", () => {
  it("encrypts and decrypts strings with the same DEK", async () => {
    const bundle = await createNewKeyBundle();
    const plaintext = "2003 Nissan 350Z";
    const ciphertext = await encryptString(plaintext, bundle.dek);
    expect(ciphertext).not.toContain(plaintext);
    const roundtrip = await decryptString(ciphertext, bundle.dek);
    expect(roundtrip).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    const bundle = await createNewKeyBundle();
    const a = await encryptString("hello", bundle.dek);
    const b = await encryptString("hello", bundle.dek);
    expect(a).not.toBe(b);
  });

  it("unwraps the DEK using the recovery code", async () => {
    const bundle = await createNewKeyBundle();
    const ciphertext = await encryptString("orange", bundle.dek);

    const unwrapped = await unwrapDekWithRecoveryCode(
      bundle.recoveryCode,
      bundle.wrappedDek,
      bundle.salt
    );
    const roundtrip = await decryptString(ciphertext, unwrapped);
    expect(roundtrip).toBe("orange");
  });

  it("rejects the wrong recovery code", async () => {
    const bundle = await createNewKeyBundle();
    const wrong = generateRecoveryCode();
    await expect(
      unwrapDekWithRecoveryCode(wrong, bundle.wrappedDek, bundle.salt)
    ).rejects.toThrow("Wrong recovery code");
  });

  it("normalizes recovery codes: hyphens, whitespace, case all forgiven", async () => {
    const bundle = await createNewKeyBundle();
    const ct = await encryptString("vin12345", bundle.dek);
    const noisy = ` ${bundle.recoveryCode.toLowerCase().replace(/-/g, " ")} `;
    const unwrapped = await unwrapDekWithRecoveryCode(
      noisy,
      bundle.wrappedDek,
      bundle.salt
    );
    expect(await decryptString(ct, unwrapped)).toBe("vin12345");
  });

  it("rotates the recovery code while preserving the DEK", async () => {
    const bundle = await createNewKeyBundle();
    const ciphertext = await encryptString("Morgan dollar", bundle.dek);

    const rotated = await rotateRecoveryCode(
      bundle.recoveryCode,
      bundle.wrappedDek,
      bundle.salt
    );
    // The new code is different, and the new wrap is different.
    expect(rotated.recoveryCode).not.toBe(bundle.recoveryCode);
    expect(rotated.wrappedDek).not.toBe(bundle.wrappedDek);
    // The DEK still decrypts old ciphertext.
    expect(await decryptString(ciphertext, rotated.dek)).toBe("Morgan dollar");
    // The new code unwraps to the same DEK.
    const unwrapped = await unwrapDekWithRecoveryCode(
      rotated.recoveryCode,
      rotated.wrappedDek,
      rotated.salt
    );
    expect(await decryptString(ciphertext, unwrapped)).toBe("Morgan dollar");
  });

  it("rotation rejects the wrong old recovery code", async () => {
    const bundle = await createNewKeyBundle();
    const wrong = generateRecoveryCode();
    await expect(
      rotateRecoveryCode(wrong, bundle.wrappedDek, bundle.salt)
    ).rejects.toThrow("Wrong recovery code");
  });

  it("old recovery code no longer unwraps after rotation", async () => {
    const bundle = await createNewKeyBundle();
    const rotated = await rotateRecoveryCode(
      bundle.recoveryCode,
      bundle.wrappedDek,
      bundle.salt
    );
    await expect(
      unwrapDekWithRecoveryCode(
        bundle.recoveryCode,
        rotated.wrappedDek,
        rotated.salt
      )
    ).rejects.toThrow("Wrong recovery code");
  });

  it("validates recovery-code format", () => {
    expect(isValidRecoveryCode(generateRecoveryCode())).toBe(true);
    expect(isValidRecoveryCode("")).toBe(false);
    expect(isValidRecoveryCode("nope")).toBe(false);
    // 32 chars but with confusables — should still parse because of normalization.
    const code = generateRecoveryCode();
    expect(isValidRecoveryCode(code.replace(/-/g, ""))).toBe(true);
  });

  it("encrypts and decrypts arbitrary binary data", async () => {
    const bundle = await createNewKeyBundle();
    const bytes = new Uint8Array(2048);
    crypto.getRandomValues(bytes);
    const ct = await encryptBinary(bytes, bundle.dek);
    expect(ct.length).toBeGreaterThan(bytes.length); // iv + tag overhead
    const round = await decryptBinary(ct, bundle.dek);
    expect(round.length).toBe(bytes.length);
    expect(Array.from(round)).toEqual(Array.from(bytes));
  });

  it("produces different binary ciphertexts for the same plaintext", async () => {
    const bundle = await createNewKeyBundle();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const a = await encryptBinary(bytes, bundle.dek);
    const b = await encryptBinary(bytes, bundle.dek);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("wraps and unwraps an owner header round-trip", async () => {
    const body = new Uint8Array([10, 20, 30, 40]);
    const userId = "user_01HW8K8N3X4Y5Z6";
    const wrapped = wrapWithOwnerHeader(userId, body);
    expect(wrapped[0]).toBe(0x43); // 'C'
    expect(wrapped[1]).toBe(0x47); // 'G'
    expect(wrapped[2]).toBe(0x45); // 'E'
    expect(wrapped[3]).toBe(0x4b); // 'K'
    const { workosUserId, body: unwrappedBody } = unwrapOwnerHeader(wrapped);
    expect(workosUserId).toBe(userId);
    expect(Array.from(unwrappedBody)).toEqual(Array.from(body));
  });

  it("rejects a blob missing the CGEK magic", () => {
    const bogus = new Uint8Array([0, 0, 0, 0, 1, 1, 0xff]);
    expect(() => unwrapOwnerHeader(bogus)).toThrow(/CGEK/);
  });

  it("survives an end-to-end image-style round trip", async () => {
    const bundle = await createNewKeyBundle();
    const userId = "user_round_trip";
    const original = new Uint8Array(512);
    crypto.getRandomValues(original);
    const encrypted = await encryptBinary(original, bundle.dek);
    const wireBytes = wrapWithOwnerHeader(userId, encrypted);
    const { workosUserId, body } = unwrapOwnerHeader(wireBytes);
    expect(workosUserId).toBe(userId);
    const decrypted = await decryptBinary(body, bundle.dek);
    expect(Array.from(decrypted)).toEqual(Array.from(original));
  });
});
