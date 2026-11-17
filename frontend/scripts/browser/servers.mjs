#!/usr/bin/env node
// Start, stop or check the local dev servers the page checks talk to:
// Vite on 5173 (proxying /api) and Django runserver on 8000. Servers that are
// already running are left alone; `down` only stops the ones `up` started.
// From a git worktree, `up --here` serves that worktree on ports of its own.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startWorktree, removeWorktree, writeViteConfig, freePort, CONFIG_NAME } from "./worktree.mjs";
import { BACKEND_DIR, IN_WORKTREE, MAIN_ROOT, REPO_ROOT, backendEnv, backendPython } from "./checkout.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(HERE, "../..");
const CACHE_DIR = path.join(REPO_ROOT, "node_modules", ".cache", "pededit-browser");
const STATE = path.join(CACHE_DIR, "servers.json");

const HELP = `usage: node frontend/scripts/browser/servers.mjs up|down|status [--frontend-only] [--here | --worktree REF]

  up               Start whichever of Vite (:5173) and Django (:8000) is not
                   already answering, and wait until both are. Logs go to
                   ${path.relative(REPO_ROOT, CACHE_DIR)}/{vite,django}.log
  up --frontend-only
                   Vite only; enough for --fixture checks.
  up --worktree REF
                   Also (or only: Vite and Django are left as they are) check
                   REF out under .worktrees/ and serve it with its own Vite on
                   a free port, so a testing run is not disturbed by edits to
                   the working tree. Prints the URL to pass as PEDEDIT_BASE.
                   It uses this checkout's node_modules and the Django on 8000.
  up --here        Run from a git worktree you are editing: serve it with its
                   own Vite (from :5180) and its own Django (from :8001), each
                   on a free port, so the worktree's frontend and backend code
                   is what is tested. Django runs with the main checkout's
                   backend/.venv and secret key (so --as-agent tokens work)
                   and the shared site config. Prints the PEDEDIT_BASE to use.
                   With --frontend-only, Vite only, proxying /api to :8000.
  down             Stop the servers that \`up\` started from this checkout,
                   and remove the worktrees it made.
  status           Say what is answering.`;

function viteBin() {
  try {
    return path.join(path.dirname(createRequire(path.join(FRONTEND_DIR, "package.json")).resolve("vite/package.json")), "bin", "vite.js");
  } catch {
    throw new Error("vite is not installed: run `npm install` at the top of the main checkout. A git worktree outside "
      + "the main checkout finds no node_modules and needs its own `npm ci` (README, \"Working in a git worktree\").");
  }
}

/** The manage.py command line, after making the rate limit counters' table. */
function runserver(port) {
  const [python, ...pre] = backendPython();
  // The rate limit counters' table (#47): without it every request is let through and
  // logged, so the rate-limited flow (#184) would test nothing. Idempotent and quick.
  spawnSync(python, [...pre, "manage.py", "createcachetable"], { cwd: BACKEND_DIR, env: backendEnv(), stdio: "ignore" });
  return [python, [...pre, "manage.py", "runserver", `127.0.0.1:${port}`], BACKEND_DIR, backendEnv()];
}

const SERVERS = {
  vite: {
    url: "http://localhost:5173/",
    command: () => [process.execPath, [viteBin(), "--port", "5173", "--strictPort"], FRONTEND_DIR],
  },
  django: {
    url: "http://localhost:8000/api/",
    command: () => runserver(8000),
  },
};

async function answering(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

function readState() {
  try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return {}; }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Start one server detached, record it in the state file and wait until `url` answers. */
async function start(name, url, [cmd, args, cwd, env], state) {
  const log = path.join(CACHE_DIR, `${name.replace(/:/g, "-")}.log`);
  const fd = openSync(log, "a");
  const child = spawn(cmd, args, { cwd, env: env ?? process.env, detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  state[name] = { pid: child.pid, log, url };
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  const deadline = Date.now() + 90_000;
  while (!(await answering(url))) {
    if (!alive(child.pid) || Date.now() > deadline) {
      console.error(`${name}: did not come up; see ${path.relative(REPO_ROOT, log)}`);
      console.error(readFileSync(log, "utf8").split("\n").slice(-15).join("\n"));
      return false;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`${name}: started (pid ${child.pid}) at ${url}, log ${path.relative(REPO_ROOT, log)}`);
  return true;
}

/** Warn when package-lock.json changed after the last `npm install` (a pull that added a dependency, such as knip). */
function warnStaleInstall() {
  const installed = path.join(MAIN_ROOT, "node_modules", ".package-lock.json");
  try {
    if (statSync(path.join(MAIN_ROOT, "package-lock.json")).mtimeMs > statSync(installed).mtimeMs + 1000) {
      console.log(`note: package-lock.json is newer than the install in ${path.join(MAIN_ROOT, "node_modules")}; run \`npm install\` there.`);
    }
  } catch { /* no install yet: viteBin() says so */ }
}

async function up(names) {
  mkdirSync(CACHE_DIR, { recursive: true });
  warnStaleInstall();
  if (IN_WORKTREE) {
    console.log(`note: this is a git worktree; servers already on :5173 and :8000 may serve another checkout (${MAIN_ROOT}).`
      + " Use `up --here` to serve this one.");
  }
  const state = readState();
  for (const name of names) {
    const s = SERVERS[name];
    if (await answering(s.url)) { console.log(`${name}: already answering at ${s.url}`); continue; }
    if (!(await start(name, s.url, s.command(), state))) return 1;
  }
  return 0;
}

/** Serve the worktree this script runs from, on free ports (#194). */
async function upHere(frontendOnly) {
  if (!IN_WORKTREE) throw new Error("--here is for a git worktree; this is the main checkout, so use plain `up`");
  mkdirSync(CACHE_DIR, { recursive: true });
  warnStaleInstall();
  const state = readState();
  const running = ["here:vite", "here:django"].filter(n => state[n] && alive(state[n].pid));
  if (running.length) {
    console.log(`already serving this worktree: ${running.map(n => `${n} at ${state[n].url}`).join(", ")}; \`down\` first to restart`);
    if (state["here:vite"]) console.log(`  PEDEDIT_BASE=${state["here:vite"].url.replace(/\/$/, "")}`);
    return 0;
  }
  let apiTarget = "http://localhost:8000";
  if (!frontendOnly) {
    const port = await freePort(8001, "127.0.0.1");
    apiTarget = `http://127.0.0.1:${port}`;
    if (!(await start("here:django", `${apiTarget}/api/`, runserver(port), state))) return 1;
  }
  writeViteConfig(REPO_ROOT, MAIN_ROOT);
  const port = await freePort(5180);
  const url = `http://localhost:${port}`;
  const vite = [process.execPath, [viteBin(), "--config", CONFIG_NAME, "--port", String(port), "--strictPort"], FRONTEND_DIR,
    { ...process.env, PEDEDIT_API_TARGET: apiTarget }];
  if (!(await start("here:vite", `${url}/`, vite, state))) return 1;
  console.log(`this worktree is served at ${url}/ with /api from ${apiTarget}`);
  console.log(`  PEDEDIT_BASE=${url} node frontend/scripts/browser/console.mjs --fixture example:2`);
  return 0;
}

async function upWorktree(ref) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const state = readState();
  const w = await startWorktree(ref);
  state[`worktree:${w.sha.slice(0, 12)}:${w.pid}`] = { pid: w.pid, log: w.log, dir: w.dir, url: w.url };
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`worktree: ${w.sha.slice(0, 7)} served (pid ${w.pid}) at ${w.url}/ from ${path.relative(REPO_ROOT, w.dir)}`);
  console.log(`  PEDEDIT_BASE=${w.url} node frontend/scripts/browser/console.mjs --fixture example:2`);
  return 0;
}

function down() {
  const state = readState();
  for (const [name, { pid, dir }] of Object.entries(state)) {
    if (!alive(pid)) console.log(`${name}: pid ${pid} already gone`);
    else {
      // detached children lead their own process group; this also stops runserver's reloader child.
      try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
      console.log(`${name}: stopped pid ${pid}`);
    }
    // Another worktree server may still serve the same checkout.
    if (dir && !Object.entries(state).some(([n, o]) => n !== name && o.dir === dir && alive(o.pid))) removeWorktree(dir);
  }
  rmSync(STATE, { force: true });
  return 0;
}

async function status() {
  const state = readState();
  for (const [name, s] of Object.entries(SERVERS)) {
    const ours = state[name] && alive(state[name].pid) ? ` (started by servers.mjs, pid ${state[name].pid})` : "";
    console.log(`${name}: ${(await answering(s.url)) ? "answering" : "not answering"} at ${s.url}${ours}`);
  }
  for (const [name, w] of Object.entries(state)) {
    if (name.startsWith("here:")) console.log(`${name}: ${alive(w.pid) ? "answering" : "not answering"} at ${w.url} (pid ${w.pid})`);
    if (w.dir) console.log(`${name.split(":").slice(0, 2).join(" ")}: ${alive(w.pid) ? "answering" : "not answering"} at ${w.url}/ (pid ${w.pid})`);
  }
  // Which checkout and commit each Vite serves (vite.config.ts /__pededit/commit).
  const vites = [["vite", "http://localhost:5173"], ...(state["here:vite"] && alive(state["here:vite"].pid) ? [["here:vite", state["here:vite"].url.replace(/\/$/, "")]] : [])];
  for (const [name, base] of vites) {
    try {
      const res = await fetch(`${base}/__pededit/commit`, { signal: AbortSignal.timeout(2000) });
      const info = res.ok && /json/.test(res.headers.get("content-type") ?? "") ? await res.json() : null;
      if (!info) console.log(`${name} serves: unknown (restart Vite to get the /__pededit/commit endpoint)`);
      else {
        console.log(`${name} serves: ${info.root} at ${info.commit.slice(0, 7)} (${info.branch})` +
          `${info.dirty ? `, ${info.dirty} uncommitted file(s)` : ""}` +
          (info.behindOriginMain ? `, ${info.behindOriginMain} commit(s) BEHIND origin/main` : info.originMain ? ", level with origin/main" : ""));
        if (path.resolve(info.root) !== REPO_ROOT) console.log(`  not this checkout (${REPO_ROOT})`);
      }
    } catch { /* Vite not up */ }
  }
  return 0;
}

const [cmd, ...rest] = process.argv.slice(2);
const frontendOnly = rest.includes("--frontend-only");
const worktreeAt = rest.indexOf("--worktree");
const worktreeRef = worktreeAt >= 0 ? rest[worktreeAt + 1] : null;
let code;
try {
  if (cmd === "up" && rest.includes("--here")) {
    if (worktreeAt >= 0) throw new Error("--here and --worktree do not go together");
    code = await upHere(frontendOnly);
  } else if (cmd === "up" && worktreeAt >= 0) {
    if (!worktreeRef) throw new Error("--worktree needs a commit, branch or tag");
    code = await upWorktree(worktreeRef);
  } else if (cmd === "up") code = await up(frontendOnly ? ["vite"] : ["vite", "django"]);
  else if (cmd === "down") code = down();
  else if (cmd === "status") code = await status();
  else { console.log(HELP); code = cmd ? 2 : 0; }
} catch (e) {
  console.error(e.message);
  code = 2;
}
process.exitCode = code;
