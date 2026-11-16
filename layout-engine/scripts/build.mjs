// Builds what npm publishes: dist/ (ESM and .d.ts, from tsconfig.build.json).
// Run by `npm run build` and by `prepack`, so `npm pack` and `npm publish`
// always pack a fresh build. dist/ is not committed, and nothing in the
// repository reads it: the frontend imports src/ (see "Publishing" in
// AGENTS.md).
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

rmSync(path.join(pkg, "dist"), { recursive: true, force: true });
execFileSync(process.execPath, [tsc, "-p", path.join(pkg, "tsconfig.build.json")], { stdio: "inherit" });
