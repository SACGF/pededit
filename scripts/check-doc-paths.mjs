#!/usr/bin/env node
// Every backticked path in the agent guides (each AGENTS.md, the browser
// checks README and the claude/ index files) must exist, so a rename fails
// `npm run check` instead of leaving a guide pointing at nothing (#234).
//
// A path is resolved against the guide's own directory, the repo root and
// the source roots the guides write paths from (`frontend/src`, ...). A bare
// file name (`deidentify.ts`) is found anywhere in the tree. A guide can
// name a path that is deliberately absent (a file the code creates, one a
// sentence says is gone) by listing it in ALLOWED below.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".claude", ".worktrees", "dist", ".venv", "test-output", "staticfiles", "__pycache__", "coverage"]);

/** Paths a guide names that are not in the repo on purpose. */
const ALLOWED = new Set([
  // On the server, written by the install steps.
  "/etc/pededit/pededit.json",
  // Build output and scratch directories, not checked in.
  "dist/", ".worktrees/", ".claude/worktrees/",
  // URL routes, not files.
  "api/health/", "api/auth/token/refresh/", "auth/token/refresh/", "djstatic/",
  // Named as absent: "There is no `api/admin.py`".
  "api/admin.py",
  // In the private repo SACGF/pededit_private.
  "user_research/github_issues.md",
  // An npm package, and kinship2's example family (in the R package, not here).
  "rollbar.js", "sample.ped",
  // Written by worktree.mjs in a worktree, in .gitignore.
  "frontend/vite.worktree.config.ts",
]);

const EXT = /\.(ts|tsx|mjs|js|cjs|json|md|py|sh|yml|yaml|html|css|txt|svg|ped|toml|cfg|conf|service|R)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const basenames = new Set(files.map(f => basename(f)));
const dirs = new Set(files.flatMap(f => {
  const parts = relative(ROOT, dirname(f)).split("/");
  return parts.map((_, i) => parts.slice(i).join("/"));
}));

const guides = [
  ...files.filter(f => basename(f) === "AGENTS.md"),
  join(ROOT, "frontend/scripts/browser/README.md"),
  ...["features.md", "glossary.md", "issue_workflow.md"].map(f => join(ROOT, "claude", f)).filter(existsSync),
];

const BASES = ["", "frontend", "frontend/src", "frontend/scripts", "frontend/scripts/browser", "layout-engine", "layout-engine/src", "backend", "deploy", "claude"];

/** The backticked spans of a guide that look like a file or directory path. */
function candidates(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      let s = m[1].trim().replace(/:\d+(-\d+)?$/, "").replace(/#.*$/, "");
      if (!s || /[\s<>*{}$=()'",|]|\.\.\.|…/.test(s)) continue;
      if (/^(https?:|\/api\/|\/p\/|\/example\/|\/guides\/|\/docs\/|\/your-data|@|~)/.test(s)) continue;
      // A bare extension (`.ped`, `.dev.ts`), a host name, a placeholder (`FILE.ped`).
      if (/^\.[\w.]+$/.test(s) || /^[\w-]+(\.[\w-]+)*\.(com|org|net|io)(\/|$)/.test(s) || /^[A-Z]+\.\w+$/.test(s)) continue;
      if (s.startsWith("/") && !s.startsWith("/src/") && !s.startsWith("/etc/")) continue;
      const looksLikePath = s.includes("/") ? (EXT.test(s) || s.endsWith("/")) : EXT.test(s);
      if (!looksLikePath) continue;
      if (/^[a-z]+\.[a-z]+$/i.test(s) && !EXT.test(s)) continue;
      out.push({ path: s, line: i + 1 });
    }
  });
  return out;
}

function exists(path, guide) {
  if (ALLOWED.has(path)) return true;
  if (path.startsWith("/src/")) return existsSync(join(ROOT, "frontend", path));
  const clean = path.replace(/\/$/, "");
  if (!clean.includes("/")) return basenames.has(clean) || dirs.has(clean);
  const from = [dirname(guide), ...BASES.map(b => join(ROOT, b))];
  if (from.some(b => existsSync(join(b, clean)))) return true;
  // A path written from a directory the guide does not say (`chart/symbols.tsx`).
  if (files.some(f => f.endsWith("/" + clean)) || dirs.has(clean)) return true;
  // Build output and scratch folders are in .gitignore and absent from a fresh
  // checkout or worktree.
  return from.some(b => gitIgnored(relative(ROOT, join(b, clean))));
}

function gitIgnored(rel) {
  if (rel.startsWith("..")) return false;
  return spawnSync("git", ["check-ignore", "-q", "--no-index", rel], { cwd: ROOT }).status === 0;
}

let missing = 0;
for (const guide of guides) {
  const text = readFileSync(guide, "utf8");
  for (const { path, line } of candidates(text)) {
    if (exists(path, guide)) continue;
    missing++;
    console.error(`${relative(ROOT, guide)}:${line}: \`${path}\` does not exist`);
  }
}
if (missing > 0) {
  console.error(`\n${missing} path(s) in the guides do not exist. Fix the guide, or list a path that is absent on purpose in ALLOWED in scripts/check-doc-paths.mjs.`);
  process.exit(1);
}
console.log(`doc paths: every path in ${guides.length} guides exists`);
