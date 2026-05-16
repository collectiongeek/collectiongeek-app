import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createNewKeyBundle, type NewKeyBundle } from "@/lib/crypto";
import { useEncryption } from "@/lib/encryption-provider";

/**
 * First-time encryption setup. Generates a recovery code in the browser,
 * shows it to the user, and requires explicit acknowledgment before the
 * wrapped DEK is committed to the server. Until the user clicks Continue,
 * nothing has been persisted anywhere — refreshing regenerates a new code.
 */
export function RecoveryCodeSetup() {
  const { commitNewKey } = useEncryption();
  const [bundle, setBundle] = useState<NewKeyBundle | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");

  // Generate the bundle once on mount. If the user refreshes before clicking
  // Continue, they'll get a fresh bundle — the previously-shown code is
  // discarded along with its DEK. Nothing is persisted yet at this stage.
  useEffect(() => {
    let cancelled = false;
    createNewKeyBundle()
      .then((b) => {
        if (!cancelled) setBundle(b);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to generate key");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleContinue() {
    if (!bundle || !confirmed) return;
    setCommitting(true);
    setError("");
    try {
      await commitNewKey(bundle);
      // Status flips to "unlocked" inside the provider; the parent will
      // swap this screen for the dashboard automatically.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setCommitting(false);
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary">
            <ShieldCheck className="size-5 text-primary-foreground" />
          </div>
          <CardTitle>Secure your collection</CardTitle>
          <CardDescription>
            Your data is end-to-end encrypted. The recovery code below is the
            only way to get back into your account from another device — or
            after clearing this browser's storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-md border bg-muted/40 p-4 text-center">
            {bundle ? (
              <div
                className="select-all font-mono text-base leading-relaxed tracking-wider break-all"
                aria-label="Recovery code"
              >
                {bundle.recoveryCode}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Generating recovery code…
              </div>
            )}
          </div>

          <div className="flex items-center justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!bundle}
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
              <p className="font-medium">Save this code somewhere safe.</p>
              <p className="text-muted-foreground mt-1">
                Password manager, a printed copy in a drawer — anywhere you
                trust to keep secrets. If you lose it, your data cannot be
                recovered. We don't have a copy.
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
              I've saved my recovery code somewhere safe and understand it
              cannot be recovered if lost.
            </span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="button"
            className="w-full"
            onClick={handleContinue}
            disabled={!bundle || !confirmed || committing}
          >
            {committing ? "Finalizing…" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
