import { describe, it, expect } from "vitest";
import {
  createNewKeyBundle,
  decryptString,
  encryptString,
  generateRecoveryCode,
  isValidRecoveryCode,
  rotateRecoveryCode,
  unwrapDekWithRecoveryCode,
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
});
