import { useEffect, useRef } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@workos-inc/authkit-react";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import { Skeleton } from "@/components/ui/skeleton";
import { UsernameSetup } from "@/components/auth/UsernameSetup";
import { RecoveryCodeSetup } from "@/components/auth/RecoveryCodeSetup";
import { NewDeviceUnlock } from "@/components/auth/NewDeviceUnlock";
import {
  EncryptionProvider,
  useEncryption,
} from "@/lib/encryption-provider";
import { ensureUser } from "@/lib/api";

export function ProtectedRoute() {
  const { user, isLoading: authLoading, getAccessToken } = useAuth();
  const navigate = useNavigate();
  // Prevents duplicate in-flight ensureUser calls.
  const ensuringRef = useRef(false);
  // Set to true the first time convexUser is non-null. Once a user has existed
  // in Convex during this session, we never re-create them (guards against the
  // deletion race: deleteUserCascade → reactive null → ensureUser re-fires).
  const hasExistedRef = useRef(false);

  const convexUser = useQuery(
    api.users.getUser,
    user ? undefined : "skip"
  );

  useEffect(() => {
    if (convexUser) hasExistedRef.current = true;
  }, [convexUser]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [authLoading, user, navigate]);

  // First login: no Convex record yet — create one. Skipped for returning users
  // whose record was just deleted (hasExistedRef guards the re-creation race).
  useEffect(() => {
    if (
      !authLoading &&
      user &&
      convexUser === null &&
      !hasExistedRef.current &&
      !ensuringRef.current
    ) {
      ensuringRef.current = true;
      getAccessToken()
        .then((token) => {
          if (!token) throw new Error("No token");
          return ensureUser(token, user.email);
        })
        .catch((err) => {
          console.error("Failed to create user record:", err);
          ensuringRef.current = false;
        });
    }
  }, [authLoading, user, convexUser, getAccessToken]);

  // Show skeleton while auth loads, Convex query loads, or user record is being created.
  if (authLoading || convexUser === undefined || convexUser === null) {
    return <ProtectedRouteSkeleton />;
  }

  if (!user) return null;

  // New user — needs to pick a username before accessing the app.
  if (convexUser.username === "") {
    return <UsernameSetup />;
  }

  // Past the username gate, hand off to the encryption layer. The provider
  // checks IndexedDB for an existing DEK and either lets the user through,
  // routes them to setup (no wrappedDek on server yet), or to new-device
  // unlock (server has wrappedDek but this device has no DEK).
  return (
    <EncryptionProvider
      // key forces a clean remount when the user changes (e.g. sign-out
      // followed by a different user signing in), avoiding any need for
      // user-change-reset effects inside the provider.
      key={user.id ?? "anon"}
      workosUserId={user.id ?? null}
      wrappedDek={convexUser.wrappedDek}
      keySalt={convexUser.keySalt}
      convexUserLoading={false}
    >
      <EncryptionGate />
    </EncryptionProvider>
  );
}

function EncryptionGate() {
  const { status } = useEncryption();
  if (status === "loading") return <ProtectedRouteSkeleton />;
  if (status === "needs-setup") return <RecoveryCodeSetup />;
  if (status === "needs-unlock") return <NewDeviceUnlock />;
  return <Outlet />;
}

function ProtectedRouteSkeleton() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
