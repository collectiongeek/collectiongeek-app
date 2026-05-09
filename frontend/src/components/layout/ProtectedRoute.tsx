import { useEffect, useRef } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@workos-inc/authkit-react";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import { Skeleton } from "@/components/ui/skeleton";
import { UsernameSetup } from "@/components/auth/UsernameSetup";
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

  if (!user) return null;

  // New user — needs to pick a username before accessing the app.
  if (convexUser.username === "") {
    return <UsernameSetup />;
  }

  return <Outlet />;
}
