import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
});
