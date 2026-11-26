import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/*
 * #146: the scene is plain data, so the exports, the lints and
 * de-identification can draw without React Flow (and in Node, for #38).
 * Every module they reach, import by import, must stay free of it.
 * #147: the chart components draw without React Flow or the editor's
 * stores, so they render to a string for an export.
 */

const SRC = resolve(__dirname, "../..");

/** The module a relative import names, as a file. */
function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const f of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

/** Every module `entry` reaches through relative imports, and the packages it names. */
function reach(entry: string): { files: Set<string>; packages: Map<string, string> } {
  const files = new Set<string>(), packages = new Map<string, string>();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/g)) {
      const spec = m[1]!;
      if (spec.startsWith(".")) {
        const next = resolveImport(file, spec);
        if (next) todo.push(next);
      } else if (!packages.has(spec)) {
        packages.set(spec, relative(SRC, file));
      }
    }
  }
  return { files, packages };
}

const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
  return /\.tsx?$/.test(name) ? [path] : [];
});

const ENTRIES = [
  "pedigree/scene.ts",
  "pedigree/renderLint.ts",
  ...sources(join(SRC, "io")).map(f => relative(SRC, f)),
  ...sources(join(SRC, "pedigree/chart")).map(f => relative(SRC, f)),
];

describe("the scene and what draws from it import nothing of React Flow or the stores (#146, #147)", () => {
  for (const entry of ENTRIES) {
    it(entry, () => {
      const { files, packages } = reach(join(SRC, entry));
      expect(packages.get("@xyflow/react"), `@xyflow/react, imported by ${packages.get("@xyflow/react")}`).toBeUndefined();
      expect([...files].map(f => relative(SRC, f)).filter(f => f === "pedigree/sceneToFlow.ts" || f.startsWith("store/"))).toEqual([]);
    });
  }
});
