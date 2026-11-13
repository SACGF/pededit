import path from "node:path";
import { defineConfig } from "vitest/config";
// JSX in .tsx tests and the components they render needs the automatic runtime,
// as vite.config.ts gets from the React plugin. The "@" alias matches
// vite.config.ts so tests can render components that import with it.
// The whole-example sweeps (swap sides over every couple, U-shape label lint on
// House Targaryen) take about 4s alone and overran the 5s default on a loaded
// machine, so the default is raised for every test.
export default defineConfig({
  test: { globals: true, testTimeout: 30_000 },
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
