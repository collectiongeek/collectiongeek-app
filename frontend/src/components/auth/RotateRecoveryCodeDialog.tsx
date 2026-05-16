import { useState } from "react";
import { AlertTriangle, Check, Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEncryption } from "@/lib/encryption-provider";
import { isValidRecoveryCode, type NewKeyBundle } from "@/lib/crypto";
import { toast } from "sonner";

type Stage = "verify" | "show-new" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Two-stage dialog for rotating the user's recovery code:
 *   1. "verify"   — user enters their current code; we unwrap+re-wrap the
 *                   same DEK under a fresh code (nothing persisted yet).
 *   2. "show-new" — display the new code, require explicit confirmation,
 *                   then commit (server-side rotate + local DEK swap).
 *
 * Closing the dialog mid-flow discards an un-committed bundle; the OLD code
 * remains valid because nothing was sent to the server.
 */
export function RotateRecoveryCodeDialog({ open, onOpenChange }: Props) {
  const { rotateRecoveryCode, commitRotatedKey } = useEncryption();
  const [stage, setStage] = useState<Stage>("verify");
  const [oldCode, setOldCode] = useState("");
  const [bundle, setBundle] = useState<NewKeyBundle | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setStage("verify");
    setOldCode("");
    setBundle(null);
    setConfirmed(false);
    setCopied(false);
    setBusy(false);
    setError("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!oldCode.trim()) return;
    if (!isValidRecoveryCode(oldCode)) {
      setError("That doesn't look like a recovery code.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const b = await rotateRecoveryCode(oldCode);
      setBundle(b);
      setStage("show-new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!bundle || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      await commitRotatedKey(bundle);
      setStage("done");
      toast.success("Recovery code rotated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!bundle) return;
    try {
      await navigator.clipboard.writeText(bundle.recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in some contexts; silently ignore.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {stage === "verify" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <DialogHeader>
              <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary">
                <ShieldCheck className="size-5 text-primary-foreground" />
              </div>
              <DialogTitle>Rotate your recovery code</DialogTitle>
              <DialogDescription>
                Enter your current recovery code to confirm it's you. We'll
                generate a new one — your data won't need to be re-encrypted.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="oldCode">Current recovery code</Label>
              <Input
                id="oldCode"
                value={oldCode}
                onChange={(e) => setOldCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="font-mono"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!oldCode.trim() || busy}>
                {busy ? "Verifying…" : "Continue"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {stage === "show-new" && bundle && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary">
                <ShieldCheck className="size-5 text-primary-foreground" />
              </div>
              <DialogTitle>Your new recovery code</DialogTitle>
              <DialogDescription>
                Save this code before continuing. The old code will stop
                working as soon as you confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/40 p-4 text-center">
              <div
                className="select-all font-mono text-base leading-relaxed tracking-wider break-all"
                aria-label="New recovery code"
              >
                {bundle.recoveryCode}
              </div>
            </div>

            <div className="flex items-center justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="size-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" /> Copy code
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
              <AlertTriangle className="size-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="font-medium">Replace the old code wherever you saved it.</p>
                <p className="text-muted-foreground mt-1">
                  If you lose this one, your data cannot be recovered. We
                  don't have a copy.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 size-4"
              />
              <span>
                I've saved my new recovery code and understand the old one
                will stop working.
              </span>
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!confirmed || busy}
              >
                {busy ? "Saving…" : "Confirm and rotate"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage === "done" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary">
                <Check className="size-5 text-primary-foreground" />
              </div>
              <DialogTitle>Recovery code rotated</DialogTitle>
              <DialogDescription>
                The old code no longer works. Your data is unchanged and still
                accessible on this device.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
