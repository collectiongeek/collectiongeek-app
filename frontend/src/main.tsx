import { StrictMode, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { Toaster } from "sonner";
import { router } from "./router";
import { config } from "@/lib/config";
import { ThemeProvider } from "@/lib/theme-provider";
import "./index.css";

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
          <Toaster richColors position="top-right" />
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
