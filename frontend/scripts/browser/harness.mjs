// Shared plumbing for the agent page checks: argument parsing, the localhost
// guard, launching chromium, the agent login, fixture routing, collecting
// what the page complained about, and mapping frames back to source files.
// See README.md in this directory.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
const STEP_FLAGS = new Set(["click", "dblclick", "hover", "press", "fill", "wait-for"]);

/** Flags shared by every tool: name -> kind ("bool" | "string" | "number" | "multi"). */
const COMMON_FLAGS = {
  json: "bool",
  wait: "number",
  timeout: "number",
  "step-wait": "number",
  fixture: "multi",
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
      steps.push({ kind: name, arg: takeValue() });
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
                      a .json Pedigree, a .ped file (optionally FILE.ped#FAMID),
                      or example:N / example:LABEL from src/data/examples.ts.
                      The URL defaults to /p/fixture when this is given.
  --as-agent          Sign in as the claude_agent user (needs Django running).
  --click SEL         Steps, run in order after load: --click, --dblclick,
  --dblclick SEL      --hover take a playwright selector, --press a key
  --hover SEL         (e.g. Control+z), --fill 'SEL=>TEXT' types into an input,
  --press KEY         --wait-for SEL waits for an element to appear. A step
  --fill 'SEL=>TEXT'  whose element never appears is reported, not skipped.
  --wait-for SEL
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
export async function newContext(browser, { asAgent = false, viewport, deviceScaleFactor = 1 } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  if (asAgent) {
    const tokens = mintAgentTokens();
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
    return { label: spec, title: ex.label, pedigree: ex.data };
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
    return { label: spec, title, pedigree: fam.pedigree };
  }

  const json = JSON.parse(text);
  const pedigree = json.individuals ? json : json.data;
  if (!pedigree?.individuals) throw new UsageError(`${file} is neither a Pedigree nor a {data: Pedigree} payload`);
  return { label: spec, title: json.title ?? title, pedigree };
}

/** Run fn inside a blank same-origin page so it can import app modules from Vite. */
async function inApp(context, base, fn, arg) {
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
  const findings = { pageErrors: [], console: [], requests: [], steps: [], writes: [], ignored: 0 };
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

export async function runSteps(page, steps, findings, { timeout = 5000, stepWait = 300 } = {}) {
  for (const step of steps) {
    const record = { ...step, ok: true };
    try {
      switch (step.kind) {
        case "click": await page.locator(step.arg).first().click({ timeout }); break;
        case "dblclick": await page.locator(step.arg).first().dblclick({ timeout }); break;
        case "hover": await page.locator(step.arg).first().hover({ timeout }); break;
        case "wait-for": await page.locator(step.arg).first().waitFor({ timeout }); break;
        case "press": await page.keyboard.press(step.arg); break;
        case "fill": {
          const sep = step.arg.indexOf("=>");
          if (sep < 0) throw new UsageError(`--fill wants 'SELECTOR=>TEXT', got ${step.arg}`);
          await page.locator(step.arg.slice(0, sep)).first().fill(step.arg.slice(sep + 2), { timeout });
          break;
        }
      }
    } catch (e) {
      if (e instanceof UsageError) throw e;
      record.ok = false;
      record.error = /Timeout/.test(e.message)
        ? `never found within ${timeout} ms, so its JS never ran`
        : String(e.message).split("\n")[0];
    }
    findings.steps.push(record);
    await settle(page, stepWait);
  }
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

export function summaryLine(f) {
  const consoleCount = f.console.reduce((n, c) => n + c.count, 0);
  const stepFailures = f.steps.filter(s => !s.ok).length;
  const errorCount = f.pageErrors.reduce((n, e) => n + e.count, 0);
  return `js: ${errorCount} uncaught error(s), ${consoleCount} console error/warning(s), ` +
    `${f.requests.length} failed request(s)` + (f.steps.length ? `, ${stepFailures} step failure(s)` : "") +
    (f.ignored ? ` [${f.ignored} known warning(s) ignored]` : "");
}

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
  for (const s of f.steps.filter(s => !s.ok)) {
    lines.push(`  step  --${s.kind} ${JSON.stringify(s.arg)} ${s.error}`);
  }
  return lines;
}

/** The real backend cannot roll back what the page wrote, so say so. */
export function writesLine(f) {
  if (!f.writes.length) return null;
  const uniq = [...new Set(f.writes)];
  return `note: ${f.writes.length} write(s) reached the local backend and were not rolled back: ${uniq.slice(0, 5).join(", ")}${uniq.length > 5 ? ", ..." : ""}`;
}

export function hasFindings(f) {
  return f.pageErrors.length > 0 || f.console.length > 0 || f.requests.length > 0 || f.steps.some(s => !s.ok);
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
 * routed in, then run the steps. Returns { page, findings, status, url, fixture }.
 */
export async function openPage(context, { url, fixture, steps = [], flags = {} }) {
  const page = await context.newPage();
  const findings = collect(page);
  let record = null;
  if (fixture) record = await routeFixture(page, fixture);
  const started = Date.now();
  const response = await gotoAndSettle(page, url, flags.wait ?? 1500);
  await runSteps(page, steps, findings, { timeout: flags.timeout ?? 5000, stepWait: flags["step-wait"] ?? 300 });
  return { page, findings, status: response?.status() ?? null, url, fixture, record, ms: Date.now() - started };
}

/** Work out the list of { url, fixtureSpec } targets from positional args and --fixture. */
export function targetsFrom(positionalUrl, flags) {
  const fixtures = flags.fixture ?? [];
  const url = resolveTarget(positionalUrl ?? (fixtures.length ? `/p/${FIXTURE_ID}` : "/"), { allowRemote: flags["allow-remote"] });
  if (fixtures.length && !new URL(url).pathname.startsWith(`/p/${FIXTURE_ID}`)) {
    throw new UsageError(`--fixture serves /p/${FIXTURE_ID}; drop the URL or point it there`);
  }
  return fixtures.length ? fixtures.map(spec => ({ url, spec })) : [{ url, spec: null }];
}
