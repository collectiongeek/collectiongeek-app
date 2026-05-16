import { useState } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isValidRecoveryCode } from "@/lib/crypto";
import { useEncryption } from "@/lib/encryption-provider";

/**
 * Shown when a user logs in on a new device (or after clearing browser
 * storage). They must enter their recovery code to unwrap the DEK held on
 * the server. We do not store anything until the unwrap succeeds.
 */
export function NewDeviceUnlock() {
  const { unlockWithRecoveryCode, clearLocalKey } = useEncryption();
  const { signOut } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const formatLooksValid = code.trim() !== "" && isValidRecoveryCode(code);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formatLooksValid || busy) return;
    setBusy(true);
    setError("");
    try {
      await unlockWithRecoveryCode(code);
      // Provider status flips to "unlocked"; parent swaps to the app.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to unlock"
      );
      setBusy(false);
    }
  }

  async function handleSignOut() {
    // No DEK is present in this state (that's why we're on this screen),
    // but clearLocalKey is idempotent and also recovers from transient
    // IndexedDB issues that may have triggered the unlock prompt.
    await clearLocalKey();
    await signOut({ navigate: false }).catch(() => {});
    window.location.replace("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary">
            <KeyRound className="size-5 text-primary-foreground" />
          </div>
          <CardTitle>Unlock your collection</CardTitle>
          <CardDescription>
            Enter the recovery code you saved when you created your account
            to decrypt your data on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="recovery">Recovery code</Label>
              <Input
                id="recovery"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-wider"
              />
              <p className="text-xs text-muted-foreground">
                Hyphens, spaces and case don't matter.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={!formatLooksValid || busy}
            >
              {busy ? "Unlocking…" : "Unlock"}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Lost your recovery code? Your data is encrypted with it and
              can't be recovered. You can delete the account and start over
              — sign out, then choose &ldquo;Delete account&rdquo; in
              Settings on a device where you're already unlocked, or contact
              us.
            </p>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="w-full"
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
