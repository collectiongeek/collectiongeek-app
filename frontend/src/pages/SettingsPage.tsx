import { useState } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import { deleteAccount } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Eye, Lock, ShieldCheck } from "lucide-react";
import { RotateRecoveryCodeDialog } from "@/components/auth/RotateRecoveryCodeDialog";
import { useEncryption } from "@/lib/encryption-provider";

export function SettingsPage() {
  const { user, getAccessToken, signOut } = useAuth();
  const { clearLocalKey } = useEncryption();
  const convexUser = useQuery(api.users.getUser);
  const [deleting, setDeleting] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteAccount(token);
      // Now that the server-side data is gone, wipe the local DEK too — the
      // user explicitly chose 'delete everything', and a stale key on disk
      // is data that should be gone.
      await clearLocalKey();
      // signOut({ navigate: false }) clears the in-memory JWT and localStorage
      // refresh tokens without redirecting through the WorkOS-hosted logout URL
      // (which can error when the user has just been deleted). The background
      // fetch it sends is best-effort; we redirect regardless.
      await signOut({ navigate: false }).catch(() => {});

      // Belt-and-braces cleanup: signOut should clear AuthKit state, but in
      // proxied dev setups a refresh token or session cookie can survive and
      // cause a follow-up sign-up to silently re-authenticate as the
      // just-deleted user — which then 401s when its (now-stale) token hits
      // the backend. The account is gone, so nothing client-side is worth
      // preserving. This wipes what JS can reach:
      //   - localStorage + sessionStorage in full,
      //   - cookies visible to document.cookie (i.e. not HttpOnly) on path=/.
      // Cookies set with a different path/domain, or set HttpOnly by the
      // server, are unreachable from JS by design and stay until they
      // expire on their own or the next request that responds with a
      // matching Set-Cookie clears them. This is best-effort — sufficient
      // to dislodge the AuthKit refresh-token + session blob we've seen in
      // practice, but not an exhaustive wipe.
      try {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach((c) => {
          const eq = c.indexOf("=");
          const name = (eq > -1 ? c.slice(0, eq) : c).trim();
          if (!name) return;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        });
      } catch {
        // Storage APIs can throw in private browsing; the redirect below
        // still happens.
      }
      // Redirect to the unprotected /account-deleted page instead of "/" to
      // avoid the auth redirect loop: "/" detects a live WorkOS session and
      // bounces to /dashboard → ProtectedRoute re-runs ensureUser → the
      // just-deleted Convex user is re-created with an empty username.
      window.location.replace("/account-deleted");
    } catch {
      toast.error("Failed to delete account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your account and preferences.
        </p>
      </div>

      <Separator />

      {/* Profile */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Profile</h2>
        <div className="grid gap-1 text-sm">
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Username</span>
            <span>{convexUser?.username || "—"}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Member since</span>
            <span>
              {convexUser
                ? new Date(convexUser.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </span>
          </div>
        </div>
      </section>

      <Separator />

      {/* Encryption */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Encryption</h2>
        <div className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="size-5 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium text-sm">Recovery code</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Your data is end-to-end encrypted. The recovery code is the
                  only way to unlock your account on a new device. Rotate it
                  if you suspect it has been seen by anyone else.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRotateOpen(true)}
              className="shrink-0"
            >
              Rotate
            </Button>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <p className="font-medium text-sm">What's protected</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            We encrypt your data in your browser before sending it to our
            servers. We can't read it. Here's what that does and doesn't
            cover.
          </p>

          <div className="grid gap-4 mt-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Lock className="size-4 text-muted-foreground" />
                Encrypted in your browser
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc pl-5">
                <li>Names and descriptions of asset types, collection types, collections, and assets</li>
                <li>Asset values, dates, tags, and descriptor fields</li>
                <li>Descriptor names and select options</li>
              </ul>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Eye className="size-4 text-muted-foreground" />
                Visible to operators
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc pl-5">
                <li>Your email and username</li>
                <li>Timestamps and the structure of relationships (which asset is in which collection)</li>
                <li>How many records you have and the type of widget each descriptor uses</li>
                <li>Your theme preferences</li>
              </ul>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            <a
              href="https://github.com/collectiongeek/collectiongeek-app/blob/main/SECURITY.md"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Read the full security model
            </a>
            {" "}— threat model, algorithms, key lifecycle, and where to verify
            each claim in the source.
          </p>
        </div>
      </section>

      <RotateRecoveryCodeDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
      />

      <Separator />

      {/* Danger zone */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Danger zone</h2>
        <div className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Delete account</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Permanently delete your account and all collections, assets, and
                metadata. This cannot be undone.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={deleting}>
                  Delete account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete your account and{" "}
                    <strong>all your collections and assets</strong>. There is no
                    recovery. This action is immediate and irreversible.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Yes, delete everything"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </section>
    </div>
  );
}
