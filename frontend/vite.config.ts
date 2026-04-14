import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function isInstalled(pkg: string): boolean {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

const googleOAuthAlias = isInstalled("@react-oauth/google")
  ? {}
  : { "@react-oauth/google": path.resolve(__dirname, "./src/lib/google-oauth-noop.tsx") };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...googleOAuthAlias,
    },
  },
  optimizeDeps: {
    include: ["quadprog"],
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /api calls to Django during development
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
