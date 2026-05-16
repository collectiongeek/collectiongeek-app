import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches errors thrown beneath the lazy-loaded route outlet. The most likely
 * failure mode is a deploy happening mid-session: the open tab still
 * references old content-hashed chunk URLs, those 404 against the freshly
 * uploaded build, and the dynamic import rejects with a "Failed to fetch
 * dynamically imported module" TypeError. Without this boundary, React
 * unmounts the subtree and the user sees a blank page.
 *
 * A full-page reload is the right recovery — it re-fetches index.html, which
 * carries the new asset URLs in its <script> tags.
 *
 * Doubles as a safety net for any other unexpected throw inside a route, so
 * a page-level render bug doesn't blank the whole shell.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Surface the underlying reason in the console for debugging — the
    // failure UI only shows the generic "reload" affordance, not a stack.
    console.error("Route subtree failed to render:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md space-y-4 text-center">
          <h2 className="text-xl font-semibold">Couldn't load this page</h2>
          <p className="text-sm text-muted-foreground">
            This usually means the app was updated while your tab was open.
            Reloading will pull the latest version.
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
