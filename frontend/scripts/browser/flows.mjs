#!/usr/bin/env node
// End-to-end flows (#167): scripted journeys through the real editor, against
// Vite and Django, each with assertions on the stores, the page and any file
// it produces. The page checks sweep pedigrees for errors; these check that
// clicking, typing, dragging, saving and exporting still do what they did.
//
// A flow is a file in flows/: `export default { name, about, run(t) }`.
// `t` (below) drives the page with the same steps as the other tools and
// collects JavaScript errors, so an uncaught exception fails the flow.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  BROWSER_DIR, FRONTEND_DIR, REPO_ROOT, UsageError, closeBrowser, main, parseArgs, launchBrowser, newContext,
  assertServerUp, loadFixture, postFixture, collect, gotoAndSettle, runSteps, waitForSaved, resolveFindings, SourceMapper,
  servedInfo, servedLines, displayPath, baseUrl, errorLines, STEP_KINDS,
} from "./harness.mjs";

const HELP = `usage: node frontend/scripts/browser/flows.mjs [NAME ...] [--list] [--verbose]

Runs every flow in frontend/scripts/browser/flows/ (or the ones named) in
headless chromium against the local Vite and Django (\`servers.mjs up\`, or
PEDEDIT_BASE, which must be on this machine).
Each flow gets a fresh browser profile. Prints one line per flow, then what
failed. Exits 0 when all pass.

  --list              List the flows and what each covers.
  --verbose           Print every check as it passes.
  --out-dir DIR       Where downloads and failure screenshots go
                      (default frontend/test-output/browser/flows/).
  --wait MS           Settle time after a load (default 1200).
  --timeout MS        Per-step timeout (default 5000).
  --step-wait MS      Pause after each step (default 250).`;

class CheckFailed extends Error {}

const show = v => {
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 300 ? `${s.slice(0, 300)}...` : s;
};
/**
 * JSON with every object's keys in order, so two values holding the same
 * data compare equal however their keys are ordered: a pedigree read back
 * from PostgreSQL (jsonb) has its keys reordered, one from SQLite has not.
 */
const canonical = v => JSON.stringify(v, (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]]))
    : value);
const same = (a, b) => canonical(a) === canonical(b);

/** The object a flow drives the page with. */
function makeT({ context, base, flags, outDir, name }) {
  const mapper = new SourceMapper();
  const t = {
    base, page: null, findings: null, checks: 0, log: [],
    /** Files of the test data set and the PED corpus, by path from the repo root. */
    file: rel => path.join(REPO_ROOT, rel),
    downloads: path.join(outDir, name),

    async _newPage() {
      if (t.page) await t.page.close().catch(() => {});
      t.page = await context.newPage();
      const fresh = collect(t.page);
      // Keep what earlier pages of this flow complained about.
      if (t.findings) { fresh.pageErrors.push(...t.findings.pageErrors); fresh.console.push(...t.findings.console); }
      t.findings = fresh;
    },
    /** Open a path of the app. */
    async open(target = "/") {
      if (!t.page) await t._newPage();
      await gotoAndSettle(t.page, new URL(target, base).toString(), flags.wait ?? 1200);
    },
    /** Save a fixture through the API (anonymously, or as the agent) and open it in the editor. Returns its id. */
    async openFixture(spec) {
      if (!t.page) await t._newPage();
      const fixture = await loadFixture(spec, context, base);
      const created = await postFixture(fixture, base, context.agentTokens ?? null);
      t.created.push(created.id);
      await t.open(`/p/${created.id}`);
      return created.id;
    },
    created: [],
    /** The id of the pedigree the page is on (/p/<id>), remembered so it is deleted afterwards. */
    currentId() {
      const id = new URL(t.page.url()).pathname.match(/^\/p\/([0-9a-f-]{36})$/)?.[1];
      if (!id) throw new CheckFailed(`not on a pedigree page: ${t.page.url()}`);
      if (!t.created.includes(id)) t.created.push(id);
      return id;
    },
    /** A second tab in the same browser profile (same localStorage). */
    newTab: () => t._newPage(),

    /** Run harness steps ({ kind, arg }); a step that cannot run fails the flow. */
    async steps(...steps) {
      const before = t.findings.steps.length;
      await runSteps(t.page, steps, t.findings, {
        timeout: flags.timeout ?? 5000, stepWait: flags["step-wait"] ?? 250, wait: flags.wait ?? 1200, downloadDir: t.downloads,
      });
      const failed = t.findings.steps.slice(before).find(s => !s.ok);
      if (failed) throw new CheckFailed(`step --${failed.kind} ${failed.arg ?? ""} could not run: ${failed.error}`);
      return t.findings.steps.slice(before);
    },
    /** Click and save the download; returns the file's path. */
    async download(sel) {
      const [step] = await t.steps(stepOf("download", [sel]));
      return path.resolve(REPO_ROOT, step.saved);
    },
    /** Shift+click, Control+click: hold a key over some actions. */
    async holding(key, fn) {
      await t.keyDown(key);
      try { await fn(); } finally { await t.keyUp(key); }
    },
    /** Open the landing page, create a blank pedigree and wait for the editor. Returns its id. */
    async createBlank() {
      await t.open("/");
      await t.click('button:has-text("Create blank pedigree")');
      await t.waitFor('button[title="Add male"]');
      return t.currentId();
    },
    /** The selector of a person's symbol on the canvas. */
    person: id => `[data-individual-id="${id}"]`,
    /** Hover a person and click a button of their hover pill, by its title. */
    async pill(individualId, title) {
      await t.hover(t.person(individualId));
      await t.click(`button[title="${title}"]`);
      await t.mouseAway();
    },
    /** Open the toolbar's Export menu; returns the selector of its item with this title, to click or download. */
    async exportMenu(title) {
      await t.click('[data-testid="export-menu"]');
      return `[data-testid="export-menu-items"] button[title^="${title}"]`;
    },
    /** Right-click a person (or any selector) and click an item of the menu that opens. */
    async menu(sel, item) {
      await t.rightClick(sel.startsWith("[") || sel.startsWith(".") ? sel : t.person(sel));
      await t.click(`[data-context-menu] >> text=${item}`);
    },

    /** Evaluate in the page. */
    eval: (fn, arg) => t.page.evaluate(fn, arg),
    pedigree: () => t.page.evaluate(() => window.__pededit.pedigree()),
    /** A person of the editor's pedigree, or of `pedigree` when given (such as t.stored(id).data). */
    async individual(id, pedigree) {
      return ((pedigree ?? await t.pedigree()).individuals ?? []).find(i => i.id === id);
    },
    people: () => t.page.evaluate(() => window.__pededit.pedigree().individuals.length),
    /** People drawn on the canvas (not hidden, not filtered out), by id. */
    drawn: () => t.page.evaluate(() => [...new Set([...document.querySelectorAll("[data-individual-id]")].map(e => e.getAttribute("data-individual-id")))]),
    undoDepth: () => t.page.evaluate(() => window.__pededit.usePedigreeStore.getState().past.length),
    async saved() {
      if (!(await waitForSaved(t.page))) throw new CheckFailed("auto-save had not finished after 8 s");
    },
    /**
     * A request to the API through Vite, as a script would make it: `token`
     * signs it in, `json` is sent as the body. It asks for JSON, so a Django
     * 500 answers with a plain text traceback that t.status can show.
     */
    api(apiPath, { token, json, headers = {}, ...init } = {}) {
      const all = { Accept: "application/json", ...headers };
      if (token) all.Authorization = `Bearer ${token}`;
      if (json !== undefined) all["Content-Type"] = "application/json";
      return fetch(new URL(apiPath, base), { ...init, headers: all, ...(json !== undefined ? { body: JSON.stringify(json) } : {}) });
    },
    /** What the server holds for a pedigree. */
    async stored(id) {
      const res = await t.api(`/api/pedigrees/${id}/`);
      return res.ok ? (await res.json()) : { status: res.status };
    },
    text: sel => t.page.locator(sel).first().innerText(),
    count: sel => t.page.locator(sel).count(),
    visible: async sel => (await t.page.locator(sel).count()) > 0 && t.page.locator(sel).first().isVisible(),

    // Checks. Each names what it is checking, so a failure reads as a sentence.
    _pass(what) { t.checks++; t.log.push(what); if (flags.verbose) console.log(`        ok  ${what}`); },
    equal(actual, expected, what) {
      if (!same(actual, expected)) throw new CheckFailed(`${what}: expected ${show(expected)}, got ${show(actual)}`);
      t._pass(what);
    },
    /** A response's status; when it is not the one expected, the failure shows the body. */
    async status(res, expected, what) {
      if (res.status !== expected) {
        const body = await res.text().catch(e => `(could not read the body: ${e.message})`);
        const shown = body.length > 3000 ? `${body.slice(0, 3000)}...` : body;
        throw new CheckFailed(`${what}: expected status ${expected}, got ${res.status} from ${res.url}; body:\n${shown.replace(/^/gm, "            ")}`);
      }
      t._pass(what);
    },
    ok(condition, what) {
      if (!condition) throw new CheckFailed(`${what}: not so`);
      t._pass(what);
    },
    match(text, pattern, what) {
      if (!pattern.test(String(text))) throw new CheckFailed(`${what}: ${show(String(text).slice(0, 200))} does not match ${pattern}`);
      t._pass(what);
    },
    notMatch(text, pattern, what) {
      if (pattern.test(String(text))) throw new CheckFailed(`${what}: found ${pattern}`);
      t._pass(what);
    },

    async _finish() {
      await resolveFindings(t.findings, mapper);
      return errorLines(t.findings);
    },
  };
  // One method per step of the harness, named by its flag in camelCase
  // (t.click, t.rightClick, t.waitFor, t.mouseAway), unless defined above.
  for (const kind of STEP_KINDS) t[kind.replace(/-(\w)/g, (_, c) => c.toUpperCase())] ??= (...args) => t.steps(stepOf(kind, args));
  return t;
}

/**
 * A step from a flow's arguments: t.click(sel), t.sleep(ms), t.reload().
 * With a value, t.fill(sel, text) or t.drag(sel, dx, dy), the value is kept
 * apart from the selector (runSteps), so it may hold "=>"; `arg` is how a
 * failure shows it.
 */
function stepOf(kind, [sel, ...rest]) {
  if (!rest.length) return { kind, arg: sel === undefined ? null : String(sel) };
  const value = rest.join(",");
  return { kind, sel, value, arg: `${sel}=>${value}` };
}

await main(async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2), {
    list: "bool", verbose: "bool", "out-dir": "string", wait: "number", timeout: "number", "step-wait": "number",
  }, { common: false });
  if (flags.help) { console.log(HELP); return 0; }
  const dir = path.join(BROWSER_DIR, "flows");
  const files = readdirSync(dir).filter(f => f.endsWith(".mjs")).sort();
  const flows = [];
  for (const f of files) flows.push({ file: f, ...(await import(pathToFileURL(path.join(dir, f)).href)).default });
  if (flags.list) {
    for (const f of flows) console.log(`${f.name}\n    ${f.about}`);
    return 0;
  }
  const chosen = positional.length ? positional.map(n => {
    const f = flows.find(x => x.name === n || x.file === n || x.file.replace(/^\d+-|\.mjs$/g, "") === n);
    if (!f) throw new UsageError(`no flow "${n}". Flows: ${flows.map(x => x.name).join(", ")}`);
    return f;
  }) : flows;

  // The flows create and delete pedigrees, so they never run against another machine.
  const base = baseUrl();
  await assertServerUp(base);
  try { await fetch(new URL("/api/health/", base), { signal: AbortSignal.timeout(5000) }); }
  catch { throw new UsageError("the flows need Django as well as Vite: node frontend/scripts/browser/servers.mjs up"); }
  const served = await servedInfo(base);
  const outDir = path.resolve(flags["out-dir"] ?? path.join(FRONTEND_DIR, "test-output", "browser", "flows"));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const line of servedLines(served)) console.log(line);
  const results = [];
  const browser = await launchBrowser();
  try {
    for (const flow of chosen) {
      const started = Date.now();
      const context = await newContext(browser, { asAgent: flow.asAgent ?? false, viewport: flow.viewport ?? { width: 1440, height: 900 }, device: flow.device });
      const t = makeT({ context, base, flags, outDir, name: flow.name });
      let failure = null;
      try {
        await t._newPage();
        await flow.run(t);
        const errors = await t._finish();
        if (errors.length) failure = `JavaScript errors:\n          ${errors.join("\n          ")}`;
      } catch (e) {
        if (e instanceof UsageError) throw e;
        failure = e instanceof CheckFailed ? e.message : `${e.message.split("\n")[0]}`;
        const lastOk = t.log[t.log.length - 1];
        failure += lastOk ? `\n          (after: ${lastOk})` : "";
        const shot = path.join(outDir, `${flow.name}.failed.png`);
        await t.page?.screenshot({ path: shot }).then(() => { failure += `\n          screenshot: ${displayPath(shot)}`; }).catch(() => {});
      }
      // Every pedigree a flow saved is deleted without a token, so the server
      // deletes the anonymous ones and refuses those an account owns (the
      // agent's are kept, as the other tools do).
      for (const id of t.created) await t.api(`/api/pedigrees/${id}/`, { method: "DELETE" }).catch(() => {});
      await context.close();
      const r = { name: flow.name, ok: !failure, checks: t.checks, ms: Date.now() - started, failure };
      results.push(r);
      console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name}  (${r.checks} check${r.checks === 1 ? "" : "s"}, ${(r.ms / 1000).toFixed(1)} s)`);
      if (failure) console.log(`        ${failure}`);
    }
  } finally {
    await closeBrowser(browser);
  }
  const bad = results.filter(r => !r.ok).length;
  console.log(`flows: ${bad} of ${results.length} failed`);
  return bad ? 1 : 0;
}, HELP);
