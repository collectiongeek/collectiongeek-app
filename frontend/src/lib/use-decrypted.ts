import { useEffect, useState } from "react";

/**
 * Generic "run an async transform when inputs change" hook, used for
 * decrypting Convex documents in the browser.
 *
 *   - Returns `undefined` while either the input is missing or the
 *     transform is in-flight (UI should treat this the same as loading).
 *   - Re-runs whenever `input` or `dek` change.
 *   - Cancels stale results if inputs change mid-flight.
 *   - Catches errors inside the transform — never throws into render.
 *
 * Wrappers for specific record types live next to the pages that use them.
 */
export function useDecrypted<TInput, TOutput>(
  input: TInput | null | undefined,
  dek: CryptoKey | null,
  transform: (input: TInput, dek: CryptoKey) => Promise<TOutput>
): TOutput | undefined {
  const [output, setOutput] = useState<TOutput | undefined>(undefined);

  useEffect(() => {
    if (input == null || dek == null) {
      // Async clear so we don't trip react-hooks/set-state-in-effect. The
      // next render will see undefined.
      const id = setTimeout(() => setOutput(undefined), 0);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    transform(input, dek)
      .then((result) => {
        if (!cancelled) setOutput(result);
      })
      .catch((err) => {
        console.warn("Decryption failed:", err);
        if (!cancelled) setOutput(undefined);
      });
    return () => {
      cancelled = true;
    };
    // The transform function is intentionally not a dep — callers usually
    // pass an inline function, which would re-fire the effect every render
    // and never resolve. Inputs (`input`, `dek`) drive correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, dek]);

  return output;
}
