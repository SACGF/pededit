// Serve another commit of this repository beside the working tree: a git
// worktree under .worktrees/<sha> with its own Vite on a free port (#70, #142).
// Used by `servers.mjs up --worktree REF` (a frozen copy to test against) and
// by compare.mjs (the "before" side of a before/after comparison).
//
// The worktree sits inside the repository so node resolution finds this
// checkout's node_modules; nothing is installed. That means the other commit
// runs with the dependencies installed here, which is right for comparing
// drawing code and wrong for testing a dependency upgrade.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(HERE, "../..");
const REPO_ROOT = path.resolve(FRONTEND_DIR, "..");
const CACHE_DIR = path.join(REPO_ROOT, "node_modules", ".cache", "pededit-browser");
export const WORKTREES_DIR = path.join(REPO_ROOT, ".worktrees");
const CONFIG_NAME = "vite.worktree.config.ts";

const git = (args, cwd = REPO_ROOT) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The full sha of a ref, or a thrown Error naming the ref. */
export function resolveCommit(ref) {
  try { return git(["rev-parse", "--verify", `${ref}^{commit}`]); }
  catch { throw new Error(`"${ref}" is not a commit in this repository`); }
}

function freePort(from) {
  return new Promise((resolve, reject) => {
    const tryPort = port => {
      if (port > from + 200) { reject(new Error(`no free port from ${from}`)); return; }
      const server = net.createServer();
      server.once("error", () => tryPort(port + 1));
      // Vite listens on localhost, which may be IPv6; test the same name.
      server.listen(port, "localhost", () => server.close(() => resolve(port)));
    };
    tryPort(from);
  });
}

async function answering(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; }
}

/** Check out `ref` under .worktrees/ (reusing a checkout of the same commit) and return its directory. */
export function ensureWorktree(ref, { own = false } = {}) {
  const sha = resolveCommit(ref);
  // `own`: a directory no other run shares, so that removing it afterwards
  // cannot take the checkout from under a second run of the same commit.
  const dir = path.join(WORKTREES_DIR, sha.slice(0, 12) + (own ? `-${process.pid}` : ""));
  if (!existsSync(path.join(dir, "frontend", "package.json"))) {
    mkdirSync(WORKTREES_DIR, { recursive: true });
    git(["worktree", "prune"]);
    git(["worktree", "add", "--detach", dir, sha]);
  }
  // The other commit's own vite.config.ts, plus what a checkout without its
  // own node_modules needs: its own layout engine (the workspace link in
  // node_modules points at the working tree's), its own dependency cache, and
  // leave to serve files from this checkout's node_modules.
  writeFileSync(path.join(dir, "frontend", CONFIG_NAME), `// Written by frontend/scripts/browser/worktree.mjs.
import { mergeConfig } from "vite";
import base from "./vite.config";
export default mergeConfig(base, {
  cacheDir: ${JSON.stringify(path.join(dir, ".vite"))},
  resolve: { alias: { "@pedigree-editor/layout-engine": ${JSON.stringify(path.join(dir, "layout-engine", "src", "index.ts"))} } },
  server: { fs: { allow: [${JSON.stringify(REPO_ROOT)}] } },
});
`);
  return { sha, dir };
}

/**
 * Start Vite for `ref` on a free port and wait until it answers.
 * Returns { url, sha, dir, pid, log, stop }.
 */
export async function startWorktree(ref, { port, own = false } = {}) {
  const { sha, dir } = ensureWorktree(ref, { own });
  const chosen = port ?? await freePort(5180);
  const url = `http://localhost:${chosen}`;
  mkdirSync(CACHE_DIR, { recursive: true });
  const log = path.join(CACHE_DIR, `worktree-${path.basename(dir)}.log`);
  const vite = path.join(path.dirname(createRequire(path.join(FRONTEND_DIR, "package.json")).resolve("vite/package.json")), "bin", "vite.js");
  const fd = openSync(log, "a");
  const child = spawn(process.execPath, [vite, "--config", CONFIG_NAME, "--port", String(chosen), "--strictPort"], {
    cwd: path.join(dir, "frontend"), detached: true, stdio: ["ignore", fd, fd],
  });
  child.unref();
  const stop = () => { try { process.kill(-child.pid, "SIGTERM"); } catch { try { process.kill(child.pid, "SIGTERM"); } catch { /* gone */ } } };
  const deadline = Date.now() + 90_000;
  while (!(await answering(`${url}/`))) {
    let alive = true;
    try { process.kill(child.pid, 0); } catch { alive = false; }
    if (!alive || Date.now() > deadline) {
      stop();
      throw new Error(`Vite for ${sha.slice(0, 7)} did not come up; last lines of ${log}:\n` +
        readFileSync(log, "utf8").split("\n").slice(-15).join("\n"));
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return { url, sha, dir, pid: child.pid, log, stop };
}

/** Remove a worktree directory made by ensureWorktree. */
export function removeWorktree(dir) {
  if (!path.resolve(dir).startsWith(WORKTREES_DIR + path.sep)) throw new Error(`${dir} is not under ${WORKTREES_DIR}`);
  try { git(["worktree", "remove", "--force", dir]); } catch { /* already gone */ }
  try { git(["worktree", "prune"]); } catch { /* nothing to prune */ }
}
