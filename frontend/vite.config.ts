import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { execFileSync } from "child_process";
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

/**
 * What code this dev server is serving, so agent page checks can tell when a
 * shared Vite runs from a checkout that lags origin/main (see
 * scripts/browser/README.md). Read live on every request because files can
 * change under a running server; the define is the state at server start.
 */
function servedCommit() {
  const root = path.resolve(__dirname, "..");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const commit = git("rev-parse", "HEAD");
    const behind = (() => {
      try { return Number(git("rev-list", "--count", "HEAD..origin/main")); } catch { return null; }
    })();
    return {
      root,
      commit,
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      dirty: git("status", "--porcelain").split("\n").filter(Boolean).length,
      originMain: (() => { try { return git("rev-parse", "origin/main"); } catch { return null; } })(),
      behindOriginMain: behind,
    };
  } catch {
    return null;
  }
}

function servedCommitPlugin(): Plugin {
  return {
    name: "pededit-served-commit",
    apply: "serve",
    config: () => {
      const c = servedCommit();
      return { define: { __PEDEDIT_COMMIT__: JSON.stringify(c && { commit: c.commit, branch: c.branch, dirty: c.dirty, root: c.root }) } };
    },
    configureServer(server) {
      server.middlewares.use("/__pededit/commit", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(servedCommit()));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), servedCommitPlugin()],
  // Shown as "Last deployed" in the footer and on /changelog (#79). Production
  // builds run in deploy.sh, so build time is deploy time.
  define: { __PEDEDIT_BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
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
        // PEDEDIT_API_TARGET lets a second checkout run its own Django.
        target: process.env.PEDEDIT_API_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
