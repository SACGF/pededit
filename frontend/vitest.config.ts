import path from "node:path";
import { defineConfig } from "vitest/config";
// JSX in .tsx tests and the components they render needs the automatic runtime,
// as vite.config.ts gets from the React plugin. The "@" alias matches
// vite.config.ts so tests can render components that import with it.
export default defineConfig({
  test: { globals: true },
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
