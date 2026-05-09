import { useState, useEffect } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { useQuery } from "convex/react";
import { api } from "@convex-gen/api";
import { setUsername } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, CheckCircle, XCircle } from "lucide-react";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function UsernameSetup() {
  const { user, getAccessToken } = useAuth();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const debouncedValue = useDebounced(value, 400);
  const isFormatValid = USERNAME_RE.test(debouncedValue);

  const isAvailable = useQuery(
    api.users.isUsernameAvailable,
    isFormatValid ? { username: debouncedValue } : "skip"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAvailable || !isFormatValid) return;

    setSaving(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await setUsername(token, user?.email ?? "", value.trim());
      // Force a full page reload so Convex re-fetches the user with the username set.
      window.location.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  const showStatus = debouncedValue.length >= 3;
  const statusOk = isFormatValid && isAvailable === true;
  const statusBad = (isFormatValid && isAvailable === false) || (debouncedValue.length >= 3 && !isFormatValid);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary">
            <BookOpen className="size-5 text-primary-foreground" />
          </div>
          <CardTitle>Choose your username</CardTitle>
          <CardDescription>
            Pick a unique username for your CollectionGeek profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <Input
                  id="username"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="collector42"
                  autoComplete="off"
                  className="pr-8"
                />
                {showStatus && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {statusOk && <CheckCircle className="size-4 text-green-500" />}
                    {statusBad && <XCircle className="size-4 text-destructive" />}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                3–20 characters · letters, numbers, underscores
              </p>
              {showStatus && isAvailable === false && (
                <p className="text-xs text-destructive">That username is taken.</p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={!statusOk || saving}
            >
              {saving ? "Saving…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
