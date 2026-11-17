import { createServer, defineConfig } from "vite";
import type { Plugin } from "vite";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
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

const aliases = {
  "@": path.resolve(__dirname, "./src"),
  // The layout engine is read from source, so nothing here needs it
  // built: its package.json points at dist/, which only exists in the
  // published package (#22). Same alias in vitest.config.ts and
  // tsconfig.app.json.
  "@pedigree-editor/layout-engine": path.resolve(__dirname, "../layout-engine/src/index.ts"),
  ...googleOAuthAlias,
};

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

/**
 * Error reporting (#49): when the build has a Rollbar token, print the code
 * version the reports will carry, which is what Rollbar files source maps
 * under (INSTALL.md, "Error reporting").
 */
function errorReportingReleasePlugin(buildDate: string): Plugin {
  return {
    name: "pededit-error-reporting-release",
    apply: "build",
    closeBundle() {
      if (process.env.VITE_ROLLBAR_ACCESS_TOKEN) console.log(`\nError reporting is on. Code version: pededit-frontend@${buildDate}`);
    },
  };
}

/**
 * The JSON format reference and its schema, published at pededit.com/docs/
 * so an assistant with only web access can read them (#200, linked from
 * public/llms.txt). Copied from the repository's docs/, the one source,
 * into the build, and served from there by the dev server.
 */
const PUBLISHED_DOCS: Record<string, { file: string; type: string }> = {
  "docs/pedigree-json-format.md": { file: "pedigree-json-format.md", type: "text/markdown; charset=utf-8" },
  "docs/pedigree-json-schema.json": { file: "pedigree-json-schema.json", type: "application/json" },
};
const DOCS_DIR = path.resolve(__dirname, "../docs");

function publishedDocsPlugin(): Plugin {
  return {
    name: "pededit-published-docs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const doc = PUBLISHED_DOCS[(req.url ?? "").split("?")[0].replace(/^\//, "")];
        if (!doc) return next();
        res.setHeader("Content-Type", doc.type);
        res.end(readFileSync(path.join(DOCS_DIR, doc.file)));
      });
    },
    generateBundle() {
      for (const [fileName, doc] of Object.entries(PUBLISHED_DOCS)) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(path.join(DOCS_DIR, doc.file)) });
      }
    },
  };
}

/** Where index.html takes the prerendered landing page. */
const PRERENDER_MARKER = "<!--prerendered-landing-->";

/**
 * Search engines and assistants read the landing page as HTML (#25):
 * after the build, render `src/prerender.tsx` through Vite's SSR loader
 * and write it into dist/index.html in place of the marker. Nginx serves
 * that file for every app route, so index.html hides it on any path but
 * "/" until the app draws over it.
 */
function prerenderLandingPlugin(): Plugin {
  let outDir = "";
  return {
    name: "pededit-prerender-landing",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const server = await createServer({
        configFile: false,
        root: __dirname,
        logLevel: "error",
        server: { middlewareMode: true, hmr: false },
        appType: "custom",
        // react-router-dom's ESM build is under "module-sync"; without it
        // Vite takes the CommonJS build, which hides its named exports.
        ssr: { resolve: { externalConditions: ["module-sync"] } },
        optimizeDeps: { noDiscovery: true, entries: [] },
        // Its own cache: sharing node_modules/.vite would invalidate the
        // dependencies of a dev server running from the same checkout.
        cacheDir: "node_modules/.vite-prerender",
        plugins: [react()],
        define: { __PEDEDIT_BUILD_DATE__: JSON.stringify(BUILD_DATE) },
        resolve: { alias: aliases },
      });
      // The page is drawn for a first visit: no sign-in tokens, nothing recent.
      const hadStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
      const memory = new Map<string, string>();
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
          getItem: (k: string) => memory.get(k) ?? null,
          setItem: (k: string, v: string) => { memory.set(k, String(v)); },
          removeItem: (k: string) => { memory.delete(k); },
          clear: () => memory.clear(),
          key: (i: number) => [...memory.keys()][i] ?? null,
          get length() { return memory.size; },
        },
      });
      try {
        const { renderLanding } = await server.ssrLoadModule("/src/prerender.tsx");
        const html = renderLanding() as string;
        if (!html.includes("No account required")) throw new Error("prerendered landing page is missing its text");
        const file = path.join(outDir, "index.html");
        const page = readFileSync(file, "utf8");
        if (!page.includes(PRERENDER_MARKER)) throw new Error(`index.html has no ${PRERENDER_MARKER}`);
        writeFileSync(file, page.replace(PRERENDER_MARKER, `<div data-prerendered>${html}</div>`));
      } finally {
        if (hadStorage) Object.defineProperty(globalThis, "localStorage", hadStorage);
        else delete (globalThis as { localStorage?: unknown }).localStorage;
        await server.close();
      }
    },
  };
}

const BUILD_DATE = new Date().toISOString();

export default defineConfig({
  plugins: [react(), servedCommitPlugin(), errorReportingReleasePlugin(BUILD_DATE), publishedDocsPlugin(), prerenderLandingPlugin()],
  // Source maps are published beside the scripts (#49). The code is public
  // anyway, browsers fetch them only with developer tools open, and Rollbar
  // downloads them from the site (each report sets source_map_enabled) to
  // turn a minified stack into source lines, so readable error reports need
  // no upload step and no server token in the build.
  build: { sourcemap: true },
  // Shown as "Last deployed" in the footer and on /changelog (#79). Production
  // builds run in deploy.sh, so build time is deploy time.
  define: { __PEDEDIT_BUILD_DATE__: JSON.stringify(BUILD_DATE) },
  resolve: { alias: aliases },
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
