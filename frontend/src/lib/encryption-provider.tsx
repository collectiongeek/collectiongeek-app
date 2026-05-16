import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@workos-inc/authkit-react";
import {
  clearDek,
  loadDek,
  rotateRecoveryCode as cryptoRotateRecoveryCode,
  storeDek,
  unwrapDekWithRecoveryCode,
  type NewKeyBundle,
} from "@/lib/crypto";
import {
  rotateEncryptionKey as apiRotateEncryptionKey,
  setEncryptionKey as apiSetEncryptionKey,
} from "@/lib/api";

/**
 * The encryption state a user can be in on the current device:
 *
 * - "loading": we're still checking IndexedDB to see if there's a DEK here.
 * - "unlocked": we have a DEK in memory; the app is usable.
 * - "needs-setup": there is no wrappedDek on the user record yet — this is
 *   the user's first-ever device. Show the recovery-code generation flow.
 * - "needs-unlock": there IS a wrappedDek on the server but no DEK here.
 *   The user has logged in on a new device (or wiped browser data) and
 *   must enter their recovery code.
 */
export type EncryptionStatus =
  | "loading"
  | "unlocked"
  | "needs-setup"
  | "needs-unlock";

interface EncryptionContextValue {
  status: EncryptionStatus;
  dek: CryptoKey | null;
  /** Called from RecoveryCodeSetup once the user confirms they've saved
   *  their recovery code. Pushes the wrapped DEK + salt to the server and
   *  stores the DEK in IndexedDB on this device. Splitting "generate" from
   *  "commit" lets the UI display the recovery code locally and only
   *  commit once the user has explicitly acknowledged saving it. */
  commitNewKey: (bundle: NewKeyBundle) => Promise<void>;
  /** Called from NewDeviceUnlock with the user-entered recovery code.
   *  Resolves once the DEK is unwrapped and stored locally. Throws on a
   *  wrong code. */
  unlockWithRecoveryCode: (recoveryCode: string) => Promise<void>;
  /** Stage 1 of rotation: verify the OLD recovery code by unwrapping the
   *  server-held wrappedDek, then re-wrap under a fresh code + salt.
   *  Nothing is persisted yet — the caller shows the new code to the user
   *  and only calls {@link commitRotatedKey} once they've confirmed they've
   *  saved it. Throws on a wrong old code. */
  rotateRecoveryCode: (oldRecoveryCode: string) => Promise<NewKeyBundle>;
  /** Stage 2 of rotation: persist the new wrap on the server and swap the
   *  local IndexedDB DEK to the bundle's fresh CryptoKey instance. */
  commitRotatedKey: (bundle: NewKeyBundle) => Promise<void>;
  /** Wipes the local DEK from IndexedDB and in-memory state. Call this
   *  before sign-out (so the next sign-in must re-enter the recovery code)
   *  and after account deletion (so no stale key data lingers on disk).
   *  Idempotent — safe to call when no DEK is present. */
  clearLocalKey: () => Promise<void>;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

// Co-located with EncryptionProvider for cohesion; splitting would gain
// perfect Fast Refresh at the cost of an extra file for one hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useEncryption(): EncryptionContextValue {
  const ctx = useContext(EncryptionContext);
  if (!ctx) {
    throw new Error("useEncryption must be used within EncryptionProvider");
  }
  return ctx;
}

interface Props {
  /** The user's WorkOS id. Used to key the local DEK in IndexedDB. */
  workosUserId: string | null;
  /** The server-stored wrapped DEK and salt (both base64), if encryption
   *  has been set up. Both undefined means the user is brand new. */
  wrappedDek: string | undefined;
  keySalt: string | undefined;
  /** True if the Convex query for the user record hasn't resolved yet. */
  convexUserLoading: boolean;
  children: React.ReactNode;
}

export function EncryptionProvider({
  workosUserId,
  wrappedDek,
  keySalt,
  convexUserLoading,
  children,
}: Props) {
  const { getAccessToken } = useAuth();
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [checkedLocal, setCheckedLocal] = useState(false);

  // On mount, check IndexedDB for an existing DEK. We rely on the parent
  // re-mounting this provider (via `key={workosUserId}`) when the user
  // changes, so we don't need to handle user changes here.
  useEffect(() => {
    let cancelled = false;
    if (!workosUserId) return;
    loadDek(workosUserId)
      .then((key) => {
        if (cancelled) return;
        setDek(key);
        setCheckedLocal(true);
      })
      .catch((err) => {
        // IndexedDB unavailable (private browsing in some cases) or storage
        // corruption. Treat as "no key" — the user can re-enter their
        // recovery code to recover.
        console.warn("Failed to load local DEK:", err);
        if (cancelled) return;
        setCheckedLocal(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workosUserId]);

  const commitNewKey = useCallback(
    async (bundle: NewKeyBundle): Promise<void> => {
      if (!workosUserId) throw new Error("Not authenticated");
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");
      await apiSetEncryptionKey(token, {
        wrappedDek: bundle.wrappedDek,
        keySalt: bundle.salt,
      });
      await storeDek(workosUserId, bundle.dek);
      setDek(bundle.dek);
    },
    [workosUserId, getAccessToken]
  );

  const unlockWithRecoveryCode = useCallback(
    async (recoveryCode: string): Promise<void> => {
      if (!workosUserId) throw new Error("Not authenticated");
      if (!wrappedDek || !keySalt) {
        throw new Error("No wrapped key on this account yet");
      }
      const unwrapped = await unwrapDekWithRecoveryCode(
        recoveryCode,
        wrappedDek,
        keySalt
      );
      await storeDek(workosUserId, unwrapped);
      setDek(unwrapped);
    },
    [workosUserId, wrappedDek, keySalt]
  );

  const rotateRecoveryCode = useCallback(
    async (oldRecoveryCode: string): Promise<NewKeyBundle> => {
      if (!wrappedDek || !keySalt) {
        throw new Error("No wrapped key on this account yet");
      }
      return cryptoRotateRecoveryCode(oldRecoveryCode, wrappedDek, keySalt);
    },
    [wrappedDek, keySalt]
  );

  const clearLocalKey = useCallback(async (): Promise<void> => {
    if (workosUserId) {
      await clearDek(workosUserId).catch((err) => {
        // IndexedDB may be unavailable (private browsing, storage corruption).
        // Don't fail loudly — the page is about to be torn down anyway.
        console.warn("Failed to clear local DEK:", err);
      });
    }
    // Deliberately not calling setDek(null) here. Every caller navigates
    // away immediately (window.location.replace), so flipping state would
    // just briefly re-render the encryption gate as 'needs-unlock' before
    // the page unmounts — producing a visible flash of the unlock screen
    // during sign-out. The in-memory CryptoKey reference is GC'd on reload.
  }, [workosUserId]);

  const commitRotatedKey = useCallback(
    async (bundle: NewKeyBundle): Promise<void> => {
      if (!workosUserId) throw new Error("Not authenticated");
      const token = await getAccessToken();
      if (!token) throw new Error("No access token");
      await apiRotateEncryptionKey(token, {
        wrappedDek: bundle.wrappedDek,
        keySalt: bundle.salt,
      });
      await storeDek(workosUserId, bundle.dek);
      setDek(bundle.dek);
    },
    [workosUserId, getAccessToken]
  );

  const status: EncryptionStatus = (() => {
    if (convexUserLoading || !checkedLocal) return "loading";
    if (dek) return "unlocked";
    if (wrappedDek && keySalt) return "needs-unlock";
    return "needs-setup";
  })();

  return (
    <EncryptionContext.Provider
      value={{
        status,
        dek,
        commitNewKey,
        unlockWithRecoveryCode,
        rotateRecoveryCode,
        commitRotatedKey,
        clearLocalKey,
      }}
    >
      {children}
    </EncryptionContext.Provider>
  );
}
