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

export function SettingsPage() {
  const { user, getAccessToken, signOut } = useAuth();
  const convexUser = useQuery(api.users.getUser);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteAccount(token);
      // signOut({ navigate: false }) clears the in-memory JWT and localStorage
      // refresh tokens without redirecting through the WorkOS-hosted logout URL
      // (which can error when the user has just been deleted). The background
      // fetch it sends is best-effort; we redirect regardless.
      await signOut({ navigate: false }).catch(() => {});
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

      {/* Danger zone */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
        <div className="rounded-lg border border-destructive/30 p-4">
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
                <Button variant="destructive" size="sm" disabled={deleting}>
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
                    className="bg-destructive text-white hover:bg-destructive/90"
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
