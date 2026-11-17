// Which checkout these scripts run from, and what a git worktree borrows from
// the main checkout (#194): a worktree has no backend/.venv of its own, and
// Django would make it its own backend/secret_key.txt, so tokens minted there
// would be rejected by a Django signing with the main checkout's key and the
// other way round. Everything that runs manage.py goes through backendPython()
// and backendEnv(), so a worktree and the main checkout share one key.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../..");
export const BACKEND_DIR = path.join(REPO_ROOT, "backend");

/** The main checkout: the parent of the git directory every worktree shares. */
export const MAIN_ROOT = (() => {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return path.dirname(common);
  } catch {
    return REPO_ROOT;
  }
})();
export const IN_WORKTREE = path.resolve(MAIN_ROOT) !== path.resolve(REPO_ROOT);
const MAIN_BACKEND = path.join(MAIN_ROOT, "backend");

/** The command that runs Python for manage.py: PEDEDIT_PYTHON, this checkout's venv, the main checkout's, or uv. */
export function backendPython() {
  if (process.env.PEDEDIT_PYTHON) return [process.env.PEDEDIT_PYTHON];
  for (const backend of [BACKEND_DIR, MAIN_BACKEND]) {
    const venv = path.join(backend, ".venv", "bin", "python");
    if (existsSync(venv)) return [venv];
  }
  return ["uv", "run", "python"];
}

/** The key file Django signs tokens with: the main checkout's, also from a worktree. */
export const SECRET_KEY_FILE = path.join(MAIN_BACKEND, "secret_key.txt");

/**
 * The environment for manage.py. From a worktree, DJANGO_SECRET_KEY is the
 * main checkout's key (site_config.py reads it before the key file), unless
 * the caller set one. The site config (/etc/pededit/pededit.json) and so the
 * database are shared by every checkout already.
 */
export function backendEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (IN_WORKTREE && !env.DJANGO_SECRET_KEY && existsSync(SECRET_KEY_FILE)) {
    env.DJANGO_SECRET_KEY = readFileSync(SECRET_KEY_FILE, "utf8").trim();
  }
  return env;
}
