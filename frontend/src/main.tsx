import { StrictMode, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { Toaster } from "sonner";
import { router } from "./router";
import { config } from "@/lib/config";
import { ThemeProvider, useTheme } from "@/lib/theme-provider";
import "./index.css";

function ThemedToaster() {
  // Pass the current theme mode so Sonner's panel inherits light/dark from
  // the app rather than defaulting to its own palette. "system" is resolved
  // by Sonner itself.
  const { mode } = useTheme();

  // Sonner has no built-in "click anywhere on the toast to dismiss" — only
  // the corner close button. We synthesize the behavior by listening for
  // clicks on toast bodies and programmatically clicking the (hidden) close
  // button, which is far less invasive than wrapping every toast call.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const toast = target.closest("[data-sonner-toast]");
      if (!toast) return;
      // Don't hijack clicks on the toast's own controls (close button,
      // action button, cancel button).
      if (
        target.closest(
          "[data-close-button], [data-button], [data-cancel]"
        )
      ) {
        return;
      }
      const closeBtn = toast.querySelector<HTMLButtonElement>(
        "[data-close-button]"
      );
      closeBtn?.click();
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <Toaster
      position="top-right"
      theme={mode}
      closeButton
      toastOptions={{ className: "cursor-pointer" }}
    />
  );
}

const convex = new ConvexReactClient(config.convexUrl);

// Bridges WorkOS auth tokens into Convex's auth system.
function useConvexAuth() {
  const { user, isLoading, getAccessToken } = useAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) return null;
      try {
        return await getAccessToken({ forceRefresh: forceRefreshToken });
      } catch {
        return null;
      }
    },
    [user, getAccessToken]
  );

  return { isLoading, isAuthenticated: !!user, fetchAccessToken };
}

// Route WorkOS API calls through our own host (Vite proxy in dev, Nginx proxy in prod)
// so the browser never hits api.workos.com directly (which blocks CORS).
function getWorkOSProxyProps() {
  return {
    apiHostname: window.location.hostname,
    https: window.location.protocol === "https:",
    port: window.location.port ? Number(window.location.port) : undefined,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
function App() {
  const workosProxy = getWorkOSProxyProps();
  return (
    <AuthKitProvider
      clientId={config.workosClientId}
      redirectUri={`${window.location.origin}/callback`}
      devMode={true}
      {...workosProxy}
    >
      <ConvexProviderWithAuth client={convex} useAuth={useConvexAuth}>
        <ThemeProvider>
          <RouterProvider router={router} />
          <ThemedToaster />
        </ThemeProvider>
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
