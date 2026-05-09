import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@workos-inc/authkit-react";
import { BookOpen } from "lucide-react";

export function AuthCallback() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    // AuthKit cleans the URL via window.history.replaceState (not React Router),
    // so useLocation won't reflect the change. Read window.location directly.
    const hasCode = new URLSearchParams(window.location.search).has("code");
    if (hasCode) return;
    navigate(user ? "/dashboard" : "/", { replace: true });
  }, [isLoading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <BookOpen className="size-8 animate-pulse" />
        <p className="text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
