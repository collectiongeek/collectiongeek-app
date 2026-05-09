// In production the Nginx entrypoint writes /config.js which sets window.__CG_CONFIG__
// before the app bundle loads. In local dev that file doesn't exist so we fall back to
// Vite's import.meta.env (populated from frontend/.env.local).

declare global {
  interface Window {
    __CG_CONFIG__?: {
      apiBaseUrl: string;
      workosClientId: string;
      convexUrl: string;
    };
  }
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export const config = {
  apiBaseUrl: trimSlash(
    window.__CG_CONFIG__?.apiBaseUrl ??
      (import.meta.env.VITE_API_BASE_URL as string) ??
      ""
  ),
  workosClientId:
    window.__CG_CONFIG__?.workosClientId ??
    (import.meta.env.VITE_WORKOS_CLIENT_ID as string) ??
    "",
  convexUrl: trimSlash(
    window.__CG_CONFIG__?.convexUrl ??
      (import.meta.env.VITE_CONVEX_URL as string) ??
      ""
  ),
};
