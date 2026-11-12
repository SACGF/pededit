// Shared plumbing for the agent page checks: argument parsing, the localhost
// guard, launching chromium, the agent login, fixture routing, collecting
// what the page complained about, and mapping frames back to source files.
// See README.md in this directory.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`page check: Node ${process.versions.node} is too old, playwright needs Node 20+.`);
  process.exit(2);
}

const { chromium } = await import("playwright");

export const BROWSER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_DIR = path.resolve(BROWSER_DIR, "../..");
export const REPO_ROOT = path.resolve(FRONTEND_DIR, "..");
export const BACKEND_DIR = path.join(REPO_ROOT, "backend");
export const CACHE_DIR = path.join(REPO_ROOT, "node_modules", ".cache", "pededit-browser");
export const DEFAULT_BASE = process.env.PEDEDIT_BASE ?? "http://localhost:5173";
export const FIXTURE_ID = "fixture";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// ── Arguments ────────────────────────────────────────────────────────────────

/** Flags that become ordered interaction steps, run after the page settles. */
const STEP_FLAGS = new Set([
  "click", "dblclick", "hover", "press", "fill", "wait-for",
  "drag", "reload", "upload", "download", "sleep", "mouse-away", "select", "choose",
]);
/** Steps that take no value. */
const BARE_STEPS = new Set(["reload", "mouse-away"]);

/** Flags shared by every tool: name -> kind ("bool" | "string" | "number" | "multi"). */
const COMMON_FLAGS = {
  json: "bool",
  wait: "number",
  timeout: "number",
  "step-wait": "number",
  fixture: "multi",
  "fixture-via-api": "bool",
  "no-persist-check": "bool",
  cleanup: "bool",
  keep: "bool",
  "local-storage": "multi",
  first: "bool",
  "out-dir": "string",
  "as-agent": "bool",
  "allow-remote": "bool",
  viewport: "string",
  verbose: "bool",
  help: "bool",
};

/**
 * Parse argv into { positional, flags, steps }. Step flags keep their order
 * relative to each other so `--click A --press Delete --click B` runs in that order.
 */
export function parseArgs(argv, extraFlags = {}) {
  const kinds = { ...COMMON_FLAGS, ...extraFlags };
  const positional = [];
  const flags = {};
  const steps = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h") { flags.help = true; continue; }
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    let name = arg.slice(2);
    let value;
    const eq = name.indexOf("=");
    if (eq >= 0 && !STEP_FLAGS.has(name.slice(0, eq)) && kinds[name.slice(0, eq)]) {
      value = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
    const takeValue = () => {
      if (value !== undefined) return value;
      if (i + 1 >= argv.length) throw new UsageError(`--${name} needs a value`);
      return argv[++i];
    };
    if (STEP_FLAGS.has(name)) {
      steps.push({ kind: name, arg: BARE_STEPS.has(name) ? null : takeValue() });
      continue;
    }
    const kind = kinds[name];
    if (!kind) throw new UsageError(`unknown flag --${name}`);
    if (kind === "bool") flags[name] = true;
    else if (kind === "number") {
      const n = Number(takeValue());
      if (!Number.isFinite(n)) throw new UsageError(`--${name} needs a number`);
      flags[name] = n;
    } else if (kind === "multi") (flags[name] ??= []).push(takeValue());
    else flags[name] = takeValue();
  }
  return { positional, flags, steps };
}

export class UsageError extends Error {}

export const COMMON_HELP = `
Common options:
  --fixture SPEC      Serve a pedigree at /p/fixture without the backend. SPEC is
                      a .json Pedigree or Download JSON file, a .ped file
                      (optionally FILE.ped#FAMID), or example:N / example:LABEL
                      from src/data/examples.ts. The URL defaults to /p/fixture.
  --fixture-via-api   POST each fixture through the real API (Django running)
                      and open /p/<id> instead. Afterwards the harness checks
                      persistence: what was POSTed against what loaded, and the
                      editor's pedigree before and after a reload. Turn the
                      reload check off with --no-persist-check.
                      A clean run then deletes the pedigrees it POSTed; one
                      with findings keeps them and prints /p/<id> to open.
  --cleanup           With --fixture-via-api: delete them even with findings.
  --keep              With --fixture-via-api: never delete them.
                      Pedigrees owned by claude_agent (--as-agent) are kept.
  --local-storage K=V Seed localStorage before the first load (repeatable),
                      e.g. compactLayout=true. Reloads keep the app's own writes.
  --as-agent          Sign in as the claude_agent user (needs Django running).
Steps, run in order after load (a step whose element never appears, is
disabled, or matches several visible elements is reported, not skipped):
  --click SEL  --dblclick SEL  --hover SEL  --wait-for SEL
  --press KEY         A key or chord, e.g. Delete, Control+z.
  --fill 'SEL=>TEXT'  Type into an input (replaces its value).
  --select 'SEL=>V'   Choose an option of a native <select> by value or label.
  --choose 'SEL=>TEXT' Click SEL (a Radix popover or menu trigger, such as the
                      more menu "···" or Export PED), then the item in the
                      popover, menu or listbox it opened whose text (or first
                      line, or title) is TEXT; a unique substring also works.
  --drag 'SEL=>DX,DY' Drag an element by DX,DY screen pixels.
  --upload 'SEL=>FILE' Set a file input, or click SEL and answer the file chooser.
  --download 'SEL[=>PATH]' Click SEL and save the download (default
                      <--out-dir or frontend/test-output/browser/downloads>/<name>).
  --reload            Wait for auto-save to finish, then reload the page.
  --sleep MS          Wait MS milliseconds.
  --mouse-away        Move the mouse to the page corner (hides hover toolbars).
  --first             Let a step selector match several visible elements and
                      use the first, instead of failing the step.
Timing and output:
  --out-dir DIR       Where downloads (and shot.mjs PNGs) go.
  --wait MS           Extra wait after network idle (default 1500).
  --step-wait MS      Wait after each step (default 300).
  --timeout MS        How long a step waits for its element (default 5000).
  --viewport WxH      Browser size (default 1440x900).
  --json              Machine-readable output.
  --verbose           Full stacks and messages in the text report.
  --allow-remote      Allow a non-localhost URL. Never point this at pededit.com.
URLs may be paths (/p/fixture) and are resolved against ${DEFAULT_BASE}
(override with PEDEDIT_BASE).`;

// ── URL guard ────────────────────────────────────────────────────────────────

export function resolveTarget(target, { allowRemote = false } = {}) {
  const url = new URL(target, DEFAULT_BASE);
  if (!LOCAL_HOSTS.has(url.hostname) && !allowRemote) {
    throw new UsageError(
      `refusing to drive ${url.origin}: page checks run against a local dev server only ` +
      `(pass --allow-remote if you really mean it, never for pededit.com)`,
    );
  }
  return url.toString();
}

export async function assertServerUp(url) {
  const origin = new URL(url).origin;
  try {
    await fetch(origin, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new UsageError(
      `nothing is listening on ${origin}. Start the dev servers with ` +
      `\`node frontend/scripts/browser/servers.mjs up\` (add --frontend-only when using --fixture).`,
    );
  }
}

// ── Browser ──────────────────────────────────────────────────────────────────

export function parseViewport(spec) {
  const m = /^(\d+)x(\d+)$/.exec(spec ?? "1440x900");
  if (!m) throw new UsageError(`--viewport wants WIDTHxHEIGHT, got ${spec}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (e) {
    throw new UsageError(
      `chromium did not start (${String(e.message).split("\n")[0]}). ` +
      "Install it with `npx -w frontend playwright install chromium-headless-shell`.",
    );
  }
}

/** A fresh context; with asAgent, localStorage carries a JWT pair for claude_agent. */
export async function newContext(browser, { asAgent = false, viewport, deviceScaleFactor = 1, localStorage: seed = [] } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, acceptDownloads: true });
  if (seed.length) {
    const pairs = seed.map(kv => {
      const eq = kv.indexOf("=");
      if (eq < 1) throw new UsageError(`--local-storage wants KEY=VALUE, got ${kv}`);
      return [kv.slice(0, eq), kv.slice(eq + 1)];
    });
    // Once per tab (sessionStorage survives reloads), so a value the app
    // writes during the run is not put back by a --reload.
    await context.addInitScript(pairs => {
      if (sessionStorage.getItem("__pededit_seeded")) return;
      for (const [k, v] of pairs) localStorage.setItem(k, v);
      sessionStorage.setItem("__pededit_seeded", "1");
    }, pairs);
  }
  if (asAgent) {
    const tokens = mintAgentTokens();
    context.agentTokens = tokens;
    // Only seed when absent so a token the app refreshes mid-run survives reloads.
    await context.addInitScript(({ access, refresh }) => {
      if (!localStorage.getItem("access_token")) {
        localStorage.setItem("access_token", access);
        localStorage.setItem("refresh_token", refresh);
      }
    }, tokens);
  }
  return context;
}

function backendPython() {
  if (process.env.PEDEDIT_PYTHON) return [process.env.PEDEDIT_PYTHON];
  const venv = path.join(BACKEND_DIR, ".venv", "bin", "python");
  if (existsSync(venv)) return [venv];
  return ["uv", "run", "python"];
}

export function mintAgentTokens() {
  const [cmd, ...pre] = backendPython();
  const out = spawnSync(cmd, [...pre, "manage.py", "agent_token"], { cwd: BACKEND_DIR, encoding: "utf8" });
  if (out.status !== 0) {
    throw new UsageError(`manage.py agent_token failed: ${(out.stderr || out.error?.message || "").trim()}`);
  }
  return JSON.parse(out.stdout.trim().split("\n").pop());
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Load a fixture spec into { label, title, pedigree }. PED files and examples go
 * through the app's own code (served by Vite) in a throwaway page, so the
 * conversion is exactly what an import in the editor would produce.
 */
export async function loadFixture(spec, context, base) {
  if (spec.startsWith("example:")) {
    const key = spec.slice("example:".length);
    const { examples } = await inApp(context, base, async () => {
      const { EXAMPLES } = await import("/src/data/examples.ts");
      return { examples: EXAMPLES.map(e => ({ label: e.label, data: e.data })) };
    });
    const ex = /^\d+$/.test(key)
      ? examples[Number(key)]
      : examples.find(e => e.label.toLowerCase() === key.toLowerCase()) ??
        examples.find(e => e.label.toLowerCase().includes(key.toLowerCase()));
    if (!ex) {
      throw new UsageError(`no example matches "${key}". Examples: ${examples.map((e, i) => `${i}:${e.label}`).join(", ")}`);
    }
    return { label: spec, title: ex.label, pedigree: ex.data, warnings: [] };
  }

  const [file, famId] = spec.split("#");
  const abs = path.resolve(process.cwd(), file);
  if (!existsSync(abs)) throw new UsageError(`fixture ${file} does not exist`);
  const text = readFileSync(abs, "utf8");
  const title = path.basename(file) + (famId ? `#${famId}` : "");

  if (/\.ped$/i.test(file) || /\.txt$/i.test(file)) {
    const result = await inApp(context, base, async ({ text }) => {
      const { importPed } = await import("/src/io/ped/index.ts");
      return importPed(text);
    }, { text });
    if (result.hasErrors || result.pedigrees.length === 0) {
      const issues = result.issues.filter(i => i.severity === "error").map(i => i.message).slice(0, 5);
      throw new UsageError(`${file} did not import: ${issues.join("; ") || "no families"}`);
    }
    const fam = famId ? result.pedigrees.find(p => p.familyId === famId) : result.pedigrees[0];
    if (!fam) {
      throw new UsageError(`${file} has no family ${famId}. Families: ${result.pedigrees.map(p => p.familyId).join(", ")}`);
    }
    // Warnings do not stop an import in the app either; report them so a
    // nonsense import does not look clean.
    const warnings = result.issues.filter(i => i.severity === "warning").map(i => i.message);
    return { label: spec, title, pedigree: fam.pedigree, warnings };
  }

  // JSON: a bare Pedigree, the app's Download JSON envelope ({format, pedigree}),
  // or an API payload ({title, data}). The first two go through the app's importJson.
  let json;
  try { json = JSON.parse(text); } catch (e) { throw new UsageError(`${file} is not JSON: ${e.message}`); }
  if (json && typeof json === "object" && json.data?.individuals && !json.individuals) {
    return { label: spec, title: json.title ?? title, pedigree: json.data, warnings: [] };
  }
  const result = await inApp(context, base, async ({ text }) => {
    const { importJson } = await import("/src/io/json/index.ts");
    return importJson(text);
  }, { text });
  if (result.hasErrors || !result.pedigree) {
    const issues = result.issues.filter(i => i.severity === "error").map(i => `${i.path}: ${i.message}`).slice(0, 5);
    throw new UsageError(`${file} did not import as pedigree JSON: ${issues.join("; ")}`);
  }
  const warnings = result.issues.filter(i => i.severity === "warning")
    .map(i => (i.path && !i.message.startsWith(i.path) ? `${i.path}: ${i.message}` : i.message));
  return { label: spec, title: result.title ?? title, pedigree: result.pedigree, warnings };
}

/** Run fn inside a blank same-origin page so it can import app modules from Vite. */
export async function inApp(context, base, fn, arg) {
  const page = await context.newPage();
  try {
    const blank = new URL("/__pededit_fixture_loader__", base).toString();
    await page.route(blank, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>loader</title>" }));
    await page.goto(blank);
    return await page.evaluate(fn, arg);
  } finally {
    await page.close();
  }
}

/**
 * Answer /api/pedigrees/fixture/ from memory: GET returns the fixture, PATCH
 * (auto-save) merges into it, so the editor runs without Django.
 */
export async function routeFixture(page, fixture) {
  const now = new Date().toISOString();
  const record = { id: FIXTURE_ID, title: fixture.title, data: fixture.pedigree, created: now, updated: now };
  await page.route(new RegExp(`/api/pedigrees/${FIXTURE_ID}/?(\\?.*)?$`), async route => {
    const method = route.request().method();
    if (method === "PATCH" || method === "PUT") {
      Object.assign(record, route.request().postDataJSON() ?? {}, { updated: new Date().toISOString() });
    }
    if (method === "DELETE") return route.fulfill({ status: 204 });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(record) });
  });
  return record;
}

/**
 * POST a fixture through the real API (via Vite's /api proxy) and return the
 * record, so the editor loads it from Django at /p/<id>. Anonymous unless
 * tokens are given.
 */
export async function postFixture(fixture, base, tokens = null) {
  const headers = { "Content-Type": "application/json" };
  if (tokens) headers.Authorization = `Bearer ${tokens.access}`;
  let res;
  try {
    res = await fetch(new URL("/api/pedigrees/", base), {
      method: "POST", headers, body: JSON.stringify({ title: fixture.title, data: fixture.pedigree }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new UsageError(`--fixture-via-api: POST /api/pedigrees/ failed (${e.message}); is Django up? \`servers.mjs up\``);
  }
  if (!res.ok) throw new UsageError(`--fixture-via-api: POST /api/pedigrees/ -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ── Collecting what the page complained about ────────────────────────────────

const IGNORED_REQUEST = /\/favicon\.ico(\?|$)/;
// Chromium logs every 4xx/5xx as a console error too; those are reported as requests.
const DUPLICATE_CONSOLE = /^Failed to load resource: /;
// Console messages that appear on every page and say nothing about the change
// being checked. They are counted in the summary, never silently dropped.
const KNOWN_NOISE = [
  // PedigreeCanvas sets proOptions.hideAttribution; React Flow warns about it on every load.
  /^\[React Flow\]: It seems like you are hiding the attribution/,
  /^React Flow: It seems like you are hiding the attribution/,
];

export function collect(page) {
  const findings = {
    pageErrors: [], console: [], requests: [], steps: [], writes: [], ignored: 0,
    fixtureWarnings: [], render: [], persist: [], persistDefaults: [],
  };
  page.on("request", req => {
    const u = new URL(req.url());
    if (req.method() === "GET" || req.method() === "HEAD" || req.method() === "OPTIONS") return;
    if (!u.pathname.startsWith("/api/") || u.pathname.startsWith(`/api/pedigrees/${FIXTURE_ID}`)) return;
    findings.writes.push(`${req.method()} ${u.pathname}`);
  });
  page.on("pageerror", err => {
    // React 18 dev reports an event-handler error twice; count repeats instead.
    const stack = err.stack ?? String(err);
    const prev = findings.pageErrors.find(e => e.stack === stack);
    if (prev) { prev.count++; return; }
    findings.pageErrors.push({ message: err.message, stack, count: 1 });
  });
  page.on("console", msg => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;
    const text = msg.text();
    if (DUPLICATE_CONSOLE.test(text)) return;
    if (KNOWN_NOISE.some(re => re.test(text))) { findings.ignored++; return; }
    const loc = msg.location();
    const prev = findings.console.find(c => c.type === type && c.text === text);
    if (prev) { prev.count++; return; }
    findings.console.push({
      type,
      text,
      // Console locations are 0-based; stack frames are 1-based. Store 1-based.
      location: loc?.url ? { url: loc.url, line: loc.lineNumber + 1, column: loc.columnNumber + 1 } : null,
      count: 1,
    });
  });
  page.on("requestfailed", req => {
    if (IGNORED_REQUEST.test(req.url())) return;
    findings.requests.push({ method: req.method(), url: req.url(), status: null, error: req.failure()?.errorText ?? "failed" });
  });
  page.on("response", res => {
    if (res.status() < 400 || IGNORED_REQUEST.test(res.url())) return;
    findings.requests.push({ method: res.request().method(), url: res.url(), status: res.status(), error: null });
  });
  return findings;
}

/** networkidle is not "rendered": React Flow lays out on animation frames after idle. */
export async function settle(page, ms) {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  if (ms > 0) await page.waitForTimeout(ms);
}

export async function gotoAndSettle(page, url, waitMs) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch(async e => {
    // networkidle can time out on a busy page; fall back to load.
    if (/Timeout/.test(e.message)) return page.goto(url, { waitUntil: "load" });
    throw e;
  });
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  return response;
}

/** Split 'SEL=>VALUE'; the value is optional when allowMissing. */
function splitArrow(step, { allowMissing = false } = {}) {
  const sep = step.arg.lastIndexOf("=>");
  if (sep < 0) {
    if (allowMissing) return [step.arg, null];
    throw new UsageError(`--${step.kind} wants 'SELECTOR=>VALUE', got ${step.arg}`);
  }
  return [step.arg.slice(0, sep), step.arg.slice(sep + 2)];
}

class StepError extends Error {}

/**
 * The one visible element a step acts on. Fails the step, instead of acting
 * on a hidden or stale copy, when nothing visible appears, when several
 * visible elements match (unless --first), or when the element is disabled.
 */
async function target(page, selector, { timeout, first, mayBeHidden = false }) {
  const all = page.locator(selector);
  if (mayBeHidden) {
    await all.first().waitFor({ state: "attached", timeout }).catch(() => {
      throw new StepError(`never found within ${timeout} ms, so its JS never ran`);
    });
    return all.first();
  }
  const visible = all.filter({ visible: true });
  try {
    await visible.first().waitFor({ timeout });
  } catch {
    const hidden = await all.count();
    throw new StepError(hidden
      ? `found ${hidden} element(s) but none visible within ${timeout} ms, so its JS never ran`
      : `never found within ${timeout} ms, so its JS never ran`);
  }
  const n = await visible.count();
  if (n > 1 && !first) {
    throw new StepError(`matched ${n} visible elements; make the selector specific (or pass --first to take the first)`);
  }
  const el = visible.first();
  if (await el.isDisabled().catch(() => false)) throw new StepError("found but disabled");
  return el;
}

/** Containers Radix renders in a portal: popovers, menus, select listboxes. */
const POPUP = '[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"]';
const POPUP_ITEM = 'button, a[href], label, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/**
 * After a trigger was clicked: click the item whose text matches in the
 * popover, menu or listbox that opened. Exact text, first line or title wins
 * over a substring; several matches fail unless --first, and so does a
 * disabled item. Returns the text of what was clicked.
 */
async function chooseItem(page, text, { timeout, first }) {
  const popup = page.locator(POPUP).filter({ visible: true });
  try {
    await popup.first().waitFor({ timeout });
  } catch {
    throw new StepError(`opened no popover, menu or listbox within ${timeout} ms`);
  }
  const items = popup.locator(POPUP_ITEM).filter({ visible: true });
  const infos = await items.evaluateAll(els => els.map(e => ({
    text: (e.innerText ?? "").trim().replace(/\s+\n/g, "\n"),
    title: e.getAttribute("title") ?? "",
    disabled: !!e.disabled || e.getAttribute("aria-disabled") === "true" || e.hasAttribute("data-disabled"),
  })));
  const want = text.trim().toLowerCase();
  const norm = s => s.trim().toLowerCase();
  const exact = infos.flatMap((it, i) =>
    [it.text, it.text.split("\n")[0], it.title].some(s => norm(s) === want) ? [i] : []);
  const loose = exact.length ? exact : infos.flatMap((it, i) => (norm(it.text).includes(want) ? [i] : []));
  if (!loose.length) {
    const shown = infos.map(it => JSON.stringify(it.text.split("\n")[0] || it.title)).filter(s => s !== '""');
    throw new StepError(`opened a popup with no item ${JSON.stringify(text)}; items: ${shown.slice(0, 25).join(", ") || "(none)"}`);
  }
  if (loose.length > 1 && !first) {
    throw new StepError(`matched ${loose.length} items (${loose.map(i => JSON.stringify(infos[i].text.split("\n")[0])).join(", ")}); make TEXT specific or pass --first`);
  }
  const i = loose[0];
  if (infos[i].disabled) throw new StepError(`item ${JSON.stringify(infos[i].text.split("\n")[0])} is disabled${infos[i].title ? ` (${infos[i].title})` : ""}`);
  await items.nth(i).click({ timeout });
  return infos[i].text.split("\n")[0] || infos[i].title;
}

/** Auto-save is a 2 s debounce; wait for the editor to report a clean store. */
export async function waitForSaved(page, timeout = 8000) {
  return page.waitForFunction(
    () => !window.__pededit || !window.__pededit.usePedigreeStore.getState().isDirty,
    null, { timeout },
  ).then(() => true, () => false);
}

export async function runSteps(page, steps, findings, { timeout = 5000, stepWait = 300, first = false, wait = 1500, downloadDir = null } = {}) {
  const opts = { timeout, first };
  for (const step of steps) {
    const record = { ...step, ok: true };
    try {
      switch (step.kind) {
        case "click": await (await target(page, step.arg, opts)).click({ timeout }); break;
        case "dblclick": await (await target(page, step.arg, opts)).dblclick({ timeout }); break;
        case "hover": await (await target(page, step.arg, opts)).hover({ timeout }); break;
        case "wait-for": await target(page, step.arg, { ...opts, first: true }); break;
        case "press": await page.keyboard.press(step.arg); break;
        case "sleep": {
          const ms = Number(step.arg);
          if (!Number.isFinite(ms)) throw new UsageError(`--sleep wants milliseconds, got ${step.arg}`);
          await page.waitForTimeout(ms);
          break;
        }
        case "mouse-away": await page.mouse.move(1, 1); break;
        case "reload": {
          if (!(await waitForSaved(page))) record.note = "auto-save had not finished after 8 s; reloaded anyway";
          await page.reload({ waitUntil: "networkidle" }).catch(() => page.reload({ waitUntil: "load" }));
          await page.waitForTimeout(wait);
          break;
        }
        case "fill": {
          const [sel, text] = splitArrow(step);
          await (await target(page, sel, opts)).fill(text, { timeout });
          break;
        }
        case "select": {
          const [sel, value] = splitArrow(step);
          const el = await target(page, sel, opts);
          const options = await el.evaluate(e => [...(e.options ?? [])].map(o => [o.value, o.label]), null, { timeout }).catch(() => null);
          if (!options) throw new StepError("is not a native <select>; open it with --click and click the option instead");
          const hit = options.find(([v, l]) => v === value || l === value);
          if (!hit) throw new StepError(`has no option ${JSON.stringify(value)}; options: ${options.map(([v, l]) => (v === l ? v : `${v} (${l})`)).join(", ")}`);
          await el.selectOption(hit[0], { timeout });
          break;
        }
        case "choose": {
          const [sel, text] = splitArrow(step);
          const trigger = await target(page, sel, opts);
          if (await trigger.evaluate(e => e instanceof HTMLSelectElement).catch(() => false)) {
            throw new StepError("is a native <select>; use --select instead");
          }
          await trigger.click({ timeout });
          record.chose = await chooseItem(page, text, opts);
          break;
        }
        case "drag": {
          const [sel, delta] = splitArrow(step);
          const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(delta.replace(/\s/g, ""));
          if (!m) throw new UsageError(`--drag wants 'SELECTOR=>DX,DY', got ${step.arg}`);
          const box = await (await target(page, sel, opts)).boundingBox();
          if (!box) throw new StepError("has no bounding box");
          const x = box.x + box.width / 2, y = box.y + box.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + Number(m[1]), y + Number(m[2]), { steps: 12 });
          await page.mouse.up();
          record.from = { x, y };
          break;
        }
        case "upload": {
          const [sel, file] = splitArrow(step);
          const abs = path.resolve(process.cwd(), file);
          if (!existsSync(abs)) throw new UsageError(`--upload: ${file} does not exist`);
          const isInput = await page.locator(sel).first()
            .evaluate(el => el instanceof HTMLInputElement && el.type === "file", null, { timeout }).catch(() => false);
          if (isInput) {
            await (await target(page, sel, { ...opts, mayBeHidden: true })).setInputFiles(abs);
          } else {
            const el = await target(page, sel, opts);
            const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout }), el.click({ timeout })]);
            await chooser.setFiles(abs);
          }
          break;
        }
        case "download": {
          const [sel, out] = splitArrow(step, { allowMissing: true });
          const el = await target(page, sel, opts);
          const [dl] = await Promise.all([page.waitForEvent("download", { timeout }), el.click({ timeout })]);
          const dir = downloadDir ?? path.join(FRONTEND_DIR, "test-output", "browser", "downloads");
          const file = path.resolve(out ?? path.join(dir, dl.suggestedFilename()));
          mkdirSync(path.dirname(file), { recursive: true });
          await dl.saveAs(file);
          record.saved = displayPath(file);
          break;
        }
      }
    } catch (e) {
      if (e instanceof UsageError) throw e;
      record.ok = false;
      record.error = e instanceof StepError ? e.message
        : /Timeout/.test(e.message) ? `timed out after ${timeout} ms: ${String(e.message).split("\n")[0]}`
        : String(e.message).split("\n")[0];
    }
    findings.steps.push(record);
    await settle(page, stepWait);
  }
}

// ── Render lint and persistence ──────────────────────────────────────────────

/**
 * Run __pededit.check() (src/pedigree/renderLint.ts) and checkExport()
 * (src/io/svg/exportLint.ts, codes prefixed "export ") on the editor's
 * pedigree, if this is an editor page.
 */
export async function renderLint(page) {
  return page.evaluate(() => {
    const h = window.__pededit;
    if (!h || !h.pedigree().individuals.length) return null;
    const exported = h.checkExport ? h.checkExport().map(f => ({ ...f, code: `export ${f.code}` })) : [];
    return [...h.check(), ...exported];
  }).catch(() => null);
}

/** Paths where b differs from a: dropped (in a, not b), added, changed. */
export function diffJson(a, b, at = "") {
  const out = [];
  const isObj = v => v && typeof v === "object";
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const p = Array.isArray(a) ? `${at}[${k}]` : at ? `${at}.${k}` : k;
      // A key holding undefined is absent once it goes through JSON.
      const inA = k in a && a[k] !== undefined, inB = k in b && b[k] !== undefined;
      if (!inA && !inB) continue;
      if (!inB) out.push({ path: p, kind: "dropped", before: a[k] });
      else if (!inA) out.push({ path: p, kind: "added", after: b[k] });
      else out.push(...diffJson(a[k], b[k], p));
    }
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: at, kind: "changed", before: a, after: b });
  return out;
}

const isEmptyDefault = v => v === false || v === null || v === 0 || v === "" || (Array.isArray(v) && v.length === 0);

/** Sort diffs into findings, and fields a save only added with an empty default (a note, not a finding). */
function recordDiff(findings, stage, diffs) {
  for (const d of diffs) {
    if (d.kind === "added" && isEmptyDefault(d.after)) findings.persistDefaults.push({ stage, ...d });
    else findings.persist.push({ stage, ...d });
  }
}

/**
 * For --fixture-via-api, after the steps: wait for auto-save, reload, and
 * compare the editor's pedigree before and after. (openPage already compared
 * the POSTed pedigree with what loaded.)
 * Run it last: the reload resets menus and selection.
 */
export async function persistCheck(page, findings, { reload = true, wait = 1500 }) {
  if (!reload || !(await page.evaluate(() => !!window.__pededit))) return;
  if (!(await waitForSaved(page))) findings.persist.push({ stage: "save", kind: "changed", path: "", before: "dirty", after: "auto-save had not finished after 8 s" });
  const before = await page.evaluate(() => window.__pededit.pedigree());
  await page.reload({ waitUntil: "networkidle" }).catch(() => page.reload({ waitUntil: "load" }));
  await page.waitForTimeout(wait);
  const after = await page.evaluate(() => window.__pededit?.pedigree() ?? null);
  recordDiff(findings, "save then reload", diffJson(before, after ?? {}));
}

// ── Mapping frames back to source ────────────────────────────────────────────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeVlq(segment) {
  const out = [];
  let value = 0, shift = 0;
  for (const ch of segment) {
    let digit = B64.indexOf(ch);
    const more = digit & 32;
    digit &= 31;
    value += digit << shift;
    if (more) { shift += 5; continue; }
    out.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return out;
}

function decodeMappings(mappings) {
  const lines = [];
  let src = 0, oline = 0, ocol = 0;
  for (const line of mappings.split(";")) {
    const segs = [];
    let gcol = 0;
    if (line) {
      for (const seg of line.split(",")) {
        const v = decodeVlq(seg);
        gcol += v[0];
        if (v.length >= 4) {
          src += v[1]; oline += v[2]; ocol += v[3];
          segs.push([gcol, src, oline, ocol]);
        }
      }
    }
    lines.push(segs);
  }
  return lines;
}

/** Served URL path -> repo-relative file path (Vite's root is frontend/). */
function urlPathToFile(urlPath) {
  const clean = decodeURIComponent(urlPath);
  if (clean.startsWith("/@fs/")) return path.relative(REPO_ROOT, clean.slice(4));
  const inFrontend = path.join(FRONTEND_DIR, clean);
  if (existsSync(inFrontend) || !clean.startsWith("/node_modules/")) return path.relative(REPO_ROOT, inFrontend);
  return path.relative(REPO_ROOT, path.join(REPO_ROOT, clean));
}

export class SourceMapper {
  constructor() { this.maps = new Map(); }

  async mapFor(url) {
    if (!this.maps.has(url)) this.maps.set(url, this.#load(url).catch(() => null));
    return this.maps.get(url);
  }

  async #load(url) {
    const code = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).text();
    const m = /\/\/[#@] sourceMappingURL=(\S+)\s*$/.exec(code);
    if (!m) return null;
    let map, mapUrl = url;
    if (m[1].startsWith("data:")) {
      const comma = m[1].indexOf(",");
      const body = m[1].slice(comma + 1);
      map = JSON.parse(m[1].slice(0, comma).includes("base64") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body));
    } else {
      mapUrl = new URL(m[1], url).toString();
      map = await (await fetch(mapUrl, { signal: AbortSignal.timeout(5000) })).json();
    }
    return { map, mapUrl, lines: decodeMappings(map.mappings) };
  }

  /** Map a served url + 1-based line/column to { file, line, column } (repo-relative). */
  async locate(url, line, column) {
    const u = new URL(url);
    const fallback = { file: urlPathToFile(u.pathname), line, column, mapped: false };
    if (!LOCAL_HOSTS.has(u.hostname)) return { file: url, line, column, mapped: false };
    const sm = await this.mapFor(url);
    const segs = sm?.lines[line - 1];
    if (!segs?.length) return fallback;
    let hit = segs[0];
    for (const s of segs) { if (s[0] <= column - 1) hit = s; else break; }
    const source = (sm.map.sourceRoot ?? "") + sm.map.sources[hit[1]];
    let file;
    if (path.isAbsolute(source) && existsSync(source)) file = path.relative(REPO_ROOT, source);
    else file = urlPathToFile(new URL(source, sm.mapUrl).pathname);
    return { file, line: hit[2] + 1, column: hit[3] + 1, mapped: true };
  }

  /** Rewrite every http(s)://host/path:line:col in text to file:line:col. */
  async rewrite(text) {
    const re = /(https?:\/\/[^\s()'"]+?):(\d+):(\d+)/g;
    const found = [...text.matchAll(re)];
    const frames = [];
    let out = text;
    for (const m of found) {
      const loc = await this.locate(m[1], Number(m[2]), Number(m[3]));
      frames.push(loc);
      out = out.replace(m[0], `${loc.file}:${loc.line}:${loc.column}`);
    }
    return { text: out, frames };
  }
}

const isAppFile = f => /^(frontend\/src|layout-engine\/src)\//.test(f);

function pickFrame(frames) {
  return frames.find(f => isAppFile(f.file)) ?? frames[0] ?? null;
}

/** Fill in file:line for every finding and drop the noise; mutates and returns findings. */
export async function resolveFindings(findings, mapper = new SourceMapper()) {
  for (const e of findings.pageErrors) {
    const { text, frames } = await mapper.rewrite(e.stack);
    e.stack = text;
    e.where = pickFrame(frames);
  }
  for (const c of findings.console) {
    const { text, frames } = await mapper.rewrite(c.text);
    c.text = text;
    const loc = c.location ? await mapper.locate(c.location.url, c.location.line, c.location.column) : null;
    c.where = pickFrame([...frames.filter(f => isAppFile(f.file)), ...(loc ? [loc] : []), ...frames]);
  }
  return findings;
}

// ── Reporting ────────────────────────────────────────────────────────────────

const where = w => (w ? `${w.file}:${w.line}` : "?");
const firstLine = (s, verbose) => (verbose ? s : s.split("\n")[0].slice(0, 220));

function shortUrl(url) {
  const u = new URL(url);
  return LOCAL_HOSTS.has(u.hostname) ? u.pathname + u.search : url;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summaryLine(f) {
  const consoleCount = f.console.reduce((n, c) => n + c.count, 0);
  const stepFailures = f.steps.filter(s => !s.ok).length;
  const errorCount = f.pageErrors.reduce((n, e) => n + e.count, 0);
  const parts = [
    plural(errorCount, "uncaught error"),
    plural(consoleCount, "console error/warning", "console errors/warnings"),
    plural(f.requests.length, "failed request"),
  ];
  if (f.steps.length) parts.push(plural(stepFailures, "step failure"));
  if (f.fixtureWarnings?.length) parts.push(plural(f.fixtureWarnings.length, "import warning"));
  if (f.render) parts.push(f.render.length ? plural(f.render.length, "render lint finding") : "render lint clean");
  if (f.persistChecked) parts.push(f.persist.length ? plural(f.persist.length, "persistence difference") : "persists");
  return `js: ${parts.join(", ")}` + (f.ignored ? ` [${plural(f.ignored, "known warning")} ignored]` : "");
}

const short = v => { const s = JSON.stringify(v); return s === undefined ? "(missing)" : s.length > 60 ? s.slice(0, 57) + "..." : s; };

export function findingLines(f, { verbose = false } = {}) {
  const lines = [];
  for (const e of f.pageErrors) {
    lines.push(`  uncaught  ${where(e.where)}  ${firstLine(e.message, verbose)}${e.count > 1 ? ` (x${e.count})` : ""}`);
    if (verbose) lines.push(...e.stack.split("\n").slice(1).map(l => `            ${l.trim()}`));
  }
  for (const c of f.console) {
    const times = c.count > 1 ? ` (x${c.count})` : "";
    lines.push(`  ${c.type === "error" ? "console.error" : "console.warn"}  ${where(c.where)}  ${firstLine(c.text, verbose)}${times}`);
  }
  for (const r of f.requests) {
    lines.push(`  request  ${r.method} ${shortUrl(r.url)} -> ${r.status ?? r.error}`);
  }
  for (const s of f.steps) {
    const shown = s.arg === null ? `--${s.kind}` : `--${s.kind} ${JSON.stringify(s.arg)}`;
    if (!s.ok) lines.push(`  step  ${shown} ${s.error}`);
    else if (s.note) lines.push(`  step  ${shown} ${s.note}`);
    else if (s.saved) lines.push(`  saved  ${s.saved}  (${shown})`);
  }
  for (const w of f.fixtureWarnings ?? []) lines.push(`  import warning  ${w}`);
  for (const r of f.render ?? []) lines.push(`  render  ${r.code}  ${r.message}`);
  for (const d of f.persist ?? []) {
    lines.push(`  persist  ${d.stage}: ${d.path || "(root)"} ${d.kind}` +
      (d.kind === "dropped" ? ` (was ${short(d.before)})` : d.kind === "added" ? ` ${short(d.after)}` : ` ${short(d.before)} -> ${short(d.after)}`));
  }
  if (f.persistDefaults?.length) {
    const paths = [...new Set(f.persistDefaults.map(d => d.path.replace(/\[\d+\]/g, "[]")))];
    lines.push(`  note  the backend added ${plural(f.persistDefaults.length, "empty default")} that were absent: ${paths.slice(0, 6).join(", ")}${paths.length > 6 ? ", ..." : ""}`);
  }
  return lines;
}

/** The real backend cannot roll back what the page wrote, so say so. */
export function writesLine(f) {
  const lines = [];
  let writes = f.writes;
  if (f.created) {
    lines.push(`note: /p/${f.created.id} ${f.created.note ?? "kept"}`);
    // Writes to a deleted pedigree went with it.
    if (f.created.deleted) writes = writes.filter(w => !w.includes(`/api/pedigrees/${f.created.id}`));
  }
  if (writes.length) {
    const uniq = [...new Set(writes)];
    lines.push(`note: ${writes.length} write(s) reached the local backend and were not rolled back: ${uniq.slice(0, 5).join(", ")}${uniq.length > 5 ? ", ..." : ""}`);
  }
  return lines.length ? lines.join("\n") : null;
}

/** Repo-relative when inside the repo, absolute otherwise. */
export function displayPath(file) {
  const rel = path.relative(REPO_ROOT, file);
  return rel.startsWith("..") || path.isAbsolute(rel) ? file : rel;
}

export function hasFindings(f) {
  return f.pageErrors.length > 0 || f.console.length > 0 || f.requests.length > 0 || f.steps.some(s => !s.ok) ||
    (f.fixtureWarnings?.length ?? 0) > 0 || (f.render?.length ?? 0) > 0 || (f.persist?.length ?? 0) > 0;
}

// ── What is being served ─────────────────────────────────────────────────────

/** Ask the dev server (vite.config.ts) which checkout and commit it serves. */
export async function servedInfo(base) {
  try {
    const res = await fetch(new URL("/__pededit/commit", base), { signal: AbortSignal.timeout(3000) });
    if (!res.ok || !/json/.test(res.headers.get("content-type") ?? "")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** One line (plus warnings) saying what code the page ran. */
export function servedLines(info) {
  if (!info) return ["served: unknown (this Vite predates the /__pededit/commit endpoint; restart it with servers.mjs)"];
  const lines = [];
  const where = path.resolve(info.root) === REPO_ROOT ? "" : ` from ${info.root}`;
  lines.push(`served: ${info.commit.slice(0, 7)} ${info.branch}${info.dirty ? ` +${plural(info.dirty, "uncommitted file")}` : ""}${where}` +
    (info.originMain ? `, origin/main ${info.originMain.slice(0, 7)}` : ""));
  if (info.behindOriginMain) {
    lines.push(`WARNING: the served checkout is ${plural(info.behindOriginMain, "commit")} behind origin/main (as of its last fetch); ` +
      "`git pull` there, or you are testing old code");
  }
  if (where) lines.push(`WARNING: Vite serves ${info.root}, not this checkout (${REPO_ROOT})`);
  return lines;
}

/** Close the browser, but never let a stuck chromium hang the caller's shell. */
export async function closeBrowser(browser) {
  await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 5000).unref())]);
}

/**
 * Wrap a tool's main: usage errors print one line and exit 2, and the process
 * exits once output is flushed even if a socket or the browser lingers.
 */
export async function main(fn, help) {
  let code;
  try {
    code = await fn();
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`page check: ${e.message}`);
      if (/unknown flag|needs a value|usage/.test(e.message)) console.error(help);
      code = 2;
    } else {
      console.error(e);
      code = 2;
    }
  }
  process.stdout.write("", () => process.stderr.write("", () => process.exit(code ?? 0)));
}

// ── One page, start to finish ────────────────────────────────────────────────

/**
 * Open url (or /p/fixture) in a new page of context, with an optional fixture
 * routed in (or POSTed, with --fixture-via-api), then run the steps.
 * Returns { page, findings, status, url, fixture, sent, ms }.
 */
export async function openPage(context, { url, fixture, steps = [], flags = {} }) {
  const page = await context.newPage();
  const findings = collect(page);
  let sent = null;
  if (fixture) {
    findings.fixtureWarnings.push(...(fixture.warnings ?? []));
    if (flags["fixture-via-api"]) {
      const created = await postFixture(fixture, url, context.agentTokens ?? null);
      findings.created = { id: created.id, owned: !!context.agentTokens, deleted: false, note: null };
      url = new URL(`/p/${created.id}`, url).toString();
      sent = fixture.pedigree;
    } else {
      await routeFixture(page, fixture);
    }
  }
  const started = Date.now();
  const response = await gotoAndSettle(page, url, flags.wait ?? 1500);
  if (sent) {
    // What the backend kept of the POST, before any step edits the pedigree.
    const loaded = await page.evaluate(() => window.__pededit?.pedigree() ?? null);
    if (loaded) recordDiff(findings, "POST then load", diffJson(sent, loaded));
  }
  await runSteps(page, steps, findings, {
    timeout: flags.timeout ?? 5000, stepWait: flags["step-wait"] ?? 300, first: !!flags.first, wait: flags.wait ?? 1500,
    downloadDir: flags["out-dir"] ? path.resolve(flags["out-dir"]) : null,
  });
  return { page, findings, status: response?.status() ?? null, url, fixture, sent, ms: Date.now() - started };
}

/**
 * The checks every tool runs after its own capture: render lint on editor
 * pages, then (with --fixture-via-api) the persistence check, which reloads.
 */
export async function finishPage(run, flags) {
  run.findings.render = await renderLint(run.page);
  if (flags["fixture-via-api"] && run.fixture) {
    run.findings.persistChecked = true;
    await persistCheck(run.page, run.findings, { reload: !flags["no-persist-check"], wait: flags.wait ?? 1500 });
  }
  await cleanupFixture(run, flags);
}

/**
 * Delete the pedigree --fixture-via-api POSTed, so the local database does
 * not fill with anonymous copies: always with --cleanup, never with --keep,
 * otherwise only when the run is clean (a failing run keeps it to open).
 * Run last: the page is moved off the pedigree first, so a late auto-save
 * cannot recreate or 404 on it.
 */
export async function cleanupFixture(run, flags) {
  const c = run.findings.created;
  if (!c) return;
  if (c.owned) { c.note = "kept: owned by claude_agent (only anonymous pedigrees are deleted)"; return; }
  if (flags.keep) { c.note = "kept (--keep)"; return; }
  if (!flags.cleanup && hasFindings(run.findings)) { c.note = "kept so the findings can be looked at (--cleanup deletes it anyway)"; return; }
  await run.page.goto("about:blank").catch(() => {});
  try {
    const res = await fetch(new URL(`/api/pedigrees/${c.id}/`, run.url), { method: "DELETE", signal: AbortSignal.timeout(10_000) });
    if (res.ok || res.status === 404) { c.deleted = true; c.note = "deleted from the local backend"; }
    else c.note = `could not delete: DELETE -> ${res.status}`;
  } catch (e) {
    c.note = `could not delete: ${e.message}`;
  }
}

/** Shared context options from the common flags. */
export function contextOptions(flags, extra = {}) {
  return {
    asAgent: flags["as-agent"], viewport: parseViewport(flags.viewport), localStorage: flags["local-storage"] ?? [], ...extra,
  };
}

/** Work out the list of { url, fixtureSpec } targets from positional args and --fixture. */
export function targetsFrom(positionalUrl, flags) {
  const fixtures = flags.fixture ?? [];
  if (flags["fixture-via-api"] && !fixtures.length) throw new UsageError("--fixture-via-api needs --fixture SPEC");
  const url = resolveTarget(positionalUrl ?? (fixtures.length ? `/p/${FIXTURE_ID}` : "/"), { allowRemote: flags["allow-remote"] });
  if (fixtures.length && !new URL(url).pathname.startsWith(`/p/${FIXTURE_ID}`)) {
    throw new UsageError(`--fixture serves /p/${FIXTURE_ID}; drop the URL or point it there`);
  }
  return fixtures.length ? fixtures.map(spec => ({ url, spec })) : [{ url, spec: null }];
}
