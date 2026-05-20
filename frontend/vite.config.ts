import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import sri from "vite-plugin-sri4";
import path from "path";
import { execSync } from "node:child_process";

// Version metadata baked into the bundle at build time. CI supplies
// APP_VERSION / APP_COMMIT / APP_BUILT_AT as env vars (see frontend/Dockerfile
// and .github/workflows/build-and-push.yml). For local `npm run build` /
// `npm run dev` we fall back to git: an exact tag if HEAD is tagged, else
// "dev", plus the short SHA and the current time.
function sh(cmd: string, fallback = "unknown"): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}
const appVersion = process.env.APP_VERSION ?? sh("git describe --tags --exact-match", "dev");
const appCommit = process.env.APP_COMMIT ?? sh("git rev-parse --short=7 HEAD");
const appBuiltAt = process.env.APP_BUILT_AT ?? new Date().toISOString();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_BUILT_AT__: JSON.stringify(appBuiltAt),
  },
  // sri4 injects integrity="sha384-..." onto built <script> and <link>
  // references in index.html, so a tampered bundle served by a compromised
  // CDN or proxy is refused by the browser. Build-time only; the dev server
  // is unaffected.
  plugins: [
    react(),
    tailwindcss(),
    // /config.js is written at container startup with runtime env vars, so
    // it's not present in the build bundle and has no precomputed hash.
    // Tell the plugin to skip it instead of erroring out for the entire
    // index.html. CSP still constrains /config.js via `script-src 'self'`.
    sri({ ignoreMissingAsset: true }),
  ],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/user_management": {
        target: "https://api.workos.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex-gen": path.resolve(__dirname, "../convex/_generated"),
      // Anchor all convex/* imports to frontend's node_modules so Vite can
      // resolve them regardless of where the importing file lives in the tree
      // (e.g. convex/_generated/api.js sits outside the frontend directory).
      "convex": path.resolve(__dirname, "./node_modules/convex"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heaviest third-party libraries into their own chunks so
        // the main bundle stays under Vite's 500KB warning threshold and the
        // browser cache hits across releases that don't touch these deps.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/react/") || id.includes("/react-dom/")) return "vendor-react";
          if (id.includes("/react-router-dom/") || id.includes("/react-router/")) return "vendor-router";
          if (id.includes("/@radix-ui/")) return "vendor-radix";
          if (id.includes("/lucide-react/")) return "vendor-icons";
          if (id.includes("/sonner/")) return "vendor-toast";
        },
      },
    },
  },
});
