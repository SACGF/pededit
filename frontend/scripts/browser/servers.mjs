#!/usr/bin/env node
// Start, stop or check the local dev servers the page checks talk to:
// Vite on 5173 (proxying /api) and Django runserver on 8000. Servers that are
// already running are left alone; `down` only stops the ones `up` started.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(HERE, "../..");
const REPO_ROOT = path.resolve(FRONTEND_DIR, "..");
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const CACHE_DIR = path.join(REPO_ROOT, "node_modules", ".cache", "pededit-browser");
const STATE = path.join(CACHE_DIR, "servers.json");

const HELP = `usage: node frontend/scripts/browser/servers.mjs up|down|status [--frontend-only]

  up               Start whichever of Vite (:5173) and Django (:8000) is not
                   already answering, and wait until both are. Logs go to
                   ${path.relative(REPO_ROOT, CACHE_DIR)}/{vite,django}.log
  up --frontend-only
                   Vite only; enough for --fixture checks.
  down             Stop the servers that \`up\` started.
  status           Say what is answering.`;

const SERVERS = {
  vite: {
    url: "http://localhost:5173/",
    command: () => {
      const vite = path.join(path.dirname(createRequire(path.join(FRONTEND_DIR, "package.json")).resolve("vite/package.json")), "bin", "vite.js");
      return [process.execPath, [vite, "--port", "5173", "--strictPort"], FRONTEND_DIR];
    },
  },
  django: {
    url: "http://localhost:8000/api/",
    command: () => {
      const venv = path.join(BACKEND_DIR, ".venv", "bin", "python");
      const python = process.env.PEDEDIT_PYTHON ?? (existsSync(venv) ? venv : null);
      if (!python) {
        throw new Error("no backend/.venv; create it with `cd backend && uv venv && uv pip install -r requirements.txt` or set PEDEDIT_PYTHON");
      }
      return [python, ["manage.py", "runserver", "127.0.0.1:8000"], BACKEND_DIR];
    },
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

async function up(names) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const state = readState();
  for (const name of names) {
    const s = SERVERS[name];
    if (await answering(s.url)) { console.log(`${name}: already answering at ${s.url}`); continue; }
    const [cmd, args, cwd] = s.command();
    const log = path.join(CACHE_DIR, `${name}.log`);
    const fd = openSync(log, "a");
    const child = spawn(cmd, args, { cwd, detached: true, stdio: ["ignore", fd, fd] });
    child.unref();
    state[name] = { pid: child.pid, log };
    writeFileSync(STATE, JSON.stringify(state, null, 2));
    const deadline = Date.now() + 60_000;
    while (!(await answering(s.url))) {
      if (!alive(child.pid) || Date.now() > deadline) {
        console.error(`${name}: did not come up; see ${path.relative(REPO_ROOT, log)}`);
        console.error(readFileSync(log, "utf8").split("\n").slice(-15).join("\n"));
        return 1;
      }
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`${name}: started (pid ${child.pid}) at ${s.url}, log ${path.relative(REPO_ROOT, log)}`);
  }
  return 0;
}

function down() {
  const state = readState();
  for (const [name, { pid }] of Object.entries(state)) {
    if (!alive(pid)) { console.log(`${name}: pid ${pid} already gone`); continue; }
    // detached children lead their own process group; this also stops runserver's reloader child.
    try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
    console.log(`${name}: stopped pid ${pid}`);
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
  // Which checkout and commit Vite serves (vite.config.ts /__pededit/commit).
  try {
    const res = await fetch("http://localhost:5173/__pededit/commit", { signal: AbortSignal.timeout(2000) });
    const info = res.ok && /json/.test(res.headers.get("content-type") ?? "") ? await res.json() : null;
    if (!info) console.log("vite serves: unknown (restart Vite to get the /__pededit/commit endpoint)");
    else {
      console.log(`vite serves: ${info.root} at ${info.commit.slice(0, 7)} (${info.branch})` +
        `${info.dirty ? `, ${info.dirty} uncommitted file(s)` : ""}` +
        (info.behindOriginMain ? `, ${info.behindOriginMain} commit(s) BEHIND origin/main` : info.originMain ? ", level with origin/main" : ""));
      if (path.resolve(info.root) !== REPO_ROOT) console.log(`  not this checkout (${REPO_ROOT})`);
    }
  } catch { /* Vite not up */ }
  return 0;
}

const [cmd, ...rest] = process.argv.slice(2);
const frontendOnly = rest.includes("--frontend-only");
let code;
try {
  if (cmd === "up") code = await up(frontendOnly ? ["vite"] : ["vite", "django"]);
  else if (cmd === "down") code = down();
  else if (cmd === "status") code = await status();
  else { console.log(HELP); code = cmd ? 2 : 0; }
} catch (e) {
  console.error(e.message);
  code = 2;
}
process.exitCode = code;
