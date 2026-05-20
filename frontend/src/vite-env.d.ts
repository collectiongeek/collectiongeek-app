/// <reference types="vite/client" />

// Build-time version metadata injected by `define:` in vite.config.ts.
// Values come from APP_VERSION / APP_COMMIT / APP_BUILT_AT env vars
// (set by CI), or fall back to git + "dev" for local builds.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT_AT__: string;
