import { defineConfig } from "vitest/config";
// JSX in .tsx tests and the components they render needs the automatic runtime,
// as vite.config.ts gets from the React plugin.
export default defineConfig({ test: { globals: true }, esbuild: { jsx: "automatic" } });
