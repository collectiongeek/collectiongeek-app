import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AccountDeletedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm px-4">
        <div className="rounded-full bg-muted p-4">
          <BookOpen className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Account deleted</h1>
          <p className="text-sm text-muted-foreground">
            Your account and all associated data have been permanently removed.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/">Return to home</a>
        </Button>
      </div>
    </div>
  );
}
