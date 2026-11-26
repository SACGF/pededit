#!/usr/bin/env node
// Measure how fast the editor is on pedigrees of different sizes (#180, for
// #42): the layout computation alone, opening a pedigree, and one select,
// edit, hover, zoom step and drag, each repeated, with and without CPU
// throttling. Prints markdown tables. Measures only; run by hand, not in CI.
import os from "node:os";
import path from "node:path";
import { writeFileSync } from "node:fs";
import {
  COMMON_HELP, DEFAULT_BASE, REPO_ROOT, FIXTURE_ID, UsageError, closeBrowser, main, parseArgs, launchBrowser,
  newContext, contextOptions, resolveTarget, assertServerUp, loadFixture, routeFixture, servedInfo, servedLines, SourceMapper,
} from "./harness.mjs";

const SIZE_DIR = path.join(REPO_ROOT, "test-data", "pedigrees", "size");
const DEFAULT_FIXTURES = [
  "example:House Targaryen",
  path.join(SIZE_DIR, "family-100.json"),
  path.join(SIZE_DIR, "family-200.json"),
  path.join(SIZE_DIR, "family-500.json"),
];

const HELP = `usage: node frontend/scripts/browser/perf.mjs [options]

Times the editor on each pedigree, several times over, at each CPU throttling
rate, and prints markdown tables of the median with the lowest and highest run.

  --fixture SPEC      A pedigree to measure (repeatable). Default: House
                      Targaryen (96 people) and the generated families in
                      test-data/pedigrees/size/ (101, 238 and 513 people).
  --throttle LIST     CPU throttling rates, comma separated (default 1,4,6).
                      1 is this machine as it is; 4 and 6 are Chrome's
                      "4x slowdown" and "6x slowdown".
  --reps N            Page loads per pedigree and rate (default 5).
  --profile           Also say where the time goes (not throttled): main thread
                      time by kind of work, and JavaScript time by package,
                      source file and function, for opening, the edit, the
                      drag, the drop, the hover and the zoom. A production
                      build needs --sourcemap to be told apart by source file,
                      and its functions are named by source line.
  --top N             Functions listed per profile (default 12).
  --app URL           Measure the page served here, for a production build
                      (vite build, then vite preview). Fixtures are still read
                      through the dev server at ${DEFAULT_BASE}.
  --out FILE          Also write every number as JSON, rewritten after each
                      row and each profile, so a run that is stopped keeps
                      what it had measured ("complete": false until the end).

Each row is also written to stderr as a markdown table row as soon as its
runs are done, with every column of the first table.

What is timed, each from the input event until the page is quiet again (the
end of the last frame that took longer than 25 ms, or of the first frame when
none did), with the time to the first frame alone in a second table:
  open     the pedigree's data arriving, to the first frame with every symbol
  select   a click on a person near the middle of the canvas
  edit     the A key (toggle affected), which redraws everyone but reuses
           the layout, since no structure changed (#189)
  hover    moving the mouse onto another person
  zoom     one wheel notch
  drag     dragging that person through 60 mouse moves sent as fast as the
           page takes them: the time per redraw of the person somewhere new
           (17 ms is the full 60 frames a second)
  drop     releasing them, which pins them (the layout is reused too)
and, in the dev build, three computations run on their own in the page: the
layout engine, buildScene (engine included) and the editor's problems.
The pedigree is drawn fitted to a 1440x900 window with nodes unlocked
(canvasSettings.nodesMoveable), so that a drag needs no hover pill.
${COMMON_HELP}`;

// ── In the page ──────────────────────────────────────────────────────────────

/**
 * Installed before the page's own scripts. `follow` reports, from a start
 * time, when the next frame had been drawn ("paint": requestAnimationFrame
 * plus a message, which runs after that frame's style, layout and paint) and
 * when the page went quiet ("settled": the end of the last frame that took
 * longer than LONG ms). Raster and compositing run on other threads and are
 * not in either number.
 */
function installPerf({ expected, fixtureUrl }) {
  const LONG = 25, QUIET = 6, MAX = 300_000;
  try { performance.setResourceTimingBufferSize(5000); } catch { /* not there */ }
  const afterPaint = cb => requestAnimationFrame(() => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => cb(performance.now());
    ch.port2.postMessage(0);
  });
  const follow = (t0, ready) => new Promise(resolve => {
    let last = t0, first = null, settled = null, calm = 0, longFrames = 0;
    const step = now => {
      const gap = now - last;
      last = now;
      if (first === null) {
        if (!ready || ready()) first = settled = now;
      } else if (gap > LONG) { settled = now; calm = 0; longFrames++; } else calm++;
      if (calm >= QUIET || now - t0 > MAX) {
        resolve({ paint: first === null ? null : first - t0, settled: settled === null ? null : settled - t0, longFrames, timedOut: calm < QUIET });
      } else afterPaint(step);
    };
    afterPaint(step);
  });
  const drawn = () => {
    const people = document.querySelectorAll(".react-flow__node [data-individual-id]");
    if (people.length < expected) return false;
    const node = people[people.length - 1].closest(".react-flow__node");
    return !!node && node.style.visibility !== "hidden";
  };
  let dataAt = null;
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) if (dataAt === null && e.name.includes(fixtureUrl)) dataAt = e.responseEnd;
    }).observe({ type: "resource", buffered: true });
  } catch { /* no observer */ }
  window.__perf = {
    pending: null,
    // Only the editor page: a blank page would wait for symbols until MAX.
    load: location.pathname.startsWith("/p/") ? follow(0, drawn).then(r => ({ ...r, dataAt })) : null,
    /**
     * Watch a person's node move, frame by frame, from now until it has been
     * still for 12 frames after `moved()` is called: { ms, updates, longest },
     * the time to the last move drawn, how many frames drew it somewhere new,
     * and the longest wait between two of them. Frames alone would not do:
     * the page can keep drawing frames in which the node has not caught up.
     */
    watchNode(id) {
      const el = document.querySelector(`.react-flow__node [data-individual-id="${CSS.escape(id)}"]`)?.closest(".react-flow__node");
      const t0 = performance.now();
      let seen = el?.style.transform, updates = 0, lastChange = t0, longest = 0, still = 0, done = null;
      const step = now => {
        const at = el?.isConnected ? el.style.transform : seen;
        if (at !== seen) {
          seen = at;
          updates++;
          longest = Math.max(longest, now - lastChange);
          lastChange = now;
          still = 0;
        } else still++;
        if (done && still >= 12) done({ ms: lastChange - t0, updates, longest });
        else afterPaint(step);
      };
      afterPaint(step);
      this.moved = () => new Promise(resolve => { still = 0; done = resolve; });
    },
    /** Time the next event of this type, from the moment it is dispatched (before the app's own handlers). */
    arm(type) {
      this.pending = new Promise(resolve => {
        const on = () => {
          window.removeEventListener(type, on, true);
          follow(performance.now()).then(resolve);
        };
        window.addEventListener(type, on, true);
      });
    },
  };
}

/** The layout engine, buildScene and the problems, each run `n` times on the editor's pedigree. Dev build only. */
async function computeTimes({ n }) {
  const hooks = window.__pededit;
  if (!hooks) return null;
  const pedigree = hooks.pedigree();
  // The engine as the canvas calls it; the module the page already loaded.
  const url = performance.getEntriesByType("resource").map(e => e.name).find(u => /layout-engine\/src\/index\.ts/.test(u));
  const engine = url ? await import(/* @vite-ignore */ url) : null;
  const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  const time = fn => {
    const runs = [];
    for (let i = 0; i < n; i++) { const t = performance.now(); fn(); runs.push(performance.now() - t); }
    return median(runs);
  };
  return {
    engine: engine?.alignPedigreeByFamily ? time(() => engine.alignPedigreeByFamily(pedigree, { improve: true })) : null,
    buildScene: time(() => hooks.buildScene(pedigree, { compact: false })),
    // The problems are cached per pedigree object, so give it a new one.
    problems: time(() => hooks.problems({ ...pedigree })),
  };
}

// ── One page load and its interactions ───────────────────────────────────────

async function timed(page, type, act) {
  await page.evaluate(t => window.__perf.arm(t), type);
  await act();
  return page.evaluate(() => window.__perf.pending);
}

/** The person drawn nearest the middle of the canvas (optionally not `notId`), with the centre of their symbol. */
function nearestPerson(page, notId = null) {
  return page.evaluate(notId => {
    const pane = document.querySelector(".react-flow").getBoundingClientRect();
    const cx = pane.left + pane.width / 2, cy = pane.top + pane.height / 2;
    let best = null;
    for (const el of document.querySelectorAll(".react-flow__node [data-individual-id]")) {
      const id = el.getAttribute("data-individual-id");
      if (id === notId) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (!el.contains(document.elementFromPoint(x, y))) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (!best || d < best.d) best = { d, x, y, id };
    }
    return best;
  }, notId);
}

const DRAG_MOVES = 60;

/**
 * Open the fixture in a new page and return the page with its load timing.
 * `beforeGoto` runs on a blank page of the same origin, so a profiler started
 * there stays with the renderer that then loads the editor.
 */
async function openEditor(context, fixture, appBase, rate, beforeGoto = null) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message).split("\n")[0]));
  await routeFixture(page, fixture);
  const blank = new URL("/__pededit_perf_blank__", appBase).toString();
  await page.route(blank, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>blank</title>" }));
  // The dev server's hot-reload socket is answered here and never connected: when a throttled page is busy
  // for a minute the real one drops, and Vite's client reloads the page when it comes back.
  await page.routeWebSocket(() => true, () => {});
  await page.addInitScript(installPerf, { expected: fixture.pedigree.individuals.length, fixtureUrl: `/api/pedigrees/${FIXTURE_ID}` });
  const cdp = await context.newCDPSession(page);
  await page.goto(blank);
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  if (beforeGoto) await beforeGoto(page, cdp);
  await page.goto(new URL(`/p/${FIXTURE_ID}`, appBase).toString(), { waitUntil: "load", timeout: 180_000 });
  const load = await page.evaluate(() => window.__perf.load);
  if (!load || load.paint === null) throw new Error(`${fixture.label}: the pedigree was never drawn${errors.length ? ` (${errors[0]})` : ""}`);
  return { page, cdp, load, errors };
}

/** The interactions, in order, each handed to `around(name, fn)` so a profile can wrap it. */
async function interact(page, around) {
  const out = {};
  const run = async (name, fn) => { out[name] = await around(name, fn); };
  const who = await nearestPerson(page);
  if (!who) throw new Error("no person to click on the canvas");
  const other = await nearestPerson(page, who.id);
  const isDev = await page.evaluate(() => !!window.__pededit);
  // The A key marks a condition instead when the pedigree has one, so check the undo stack, not the flag.
  const undoSteps = () => page.evaluate(() => window.__pededit.usePedigreeStore.getState().past.length);
  const stepsBefore = isDev ? await undoSteps() : null;

  await page.mouse.move(who.x, who.y);
  await page.waitForTimeout(300);
  await run("select", () => timed(page, "click", () => page.mouse.click(who.x, who.y)));
  if (await page.locator(".react-flow__node.selected").count() === 0) throw new Error("the click selected nobody");
  await run("edit", () => timed(page, "keydown", () => page.keyboard.press("a")));
  if (isDev && await undoSteps() !== stepsBefore + 1) throw new Error("the A key did not edit the pedigree");
  if (other) {
    await run("hover", () => timed(page, "pointermove", () => page.mouse.move(other.x, other.y)));
    await page.mouse.move(who.x, who.y);
    await page.waitForTimeout(300);
  }
  await run("zoom", () => timed(page, "wheel", () => page.mouse.wheel(0, -120)));
  await page.waitForTimeout(300);

  // Drag: the wheel zoomed about the mouse, so the person is still under it.
  await page.mouse.down();
  // A drag is a stream of mouse moves, here faster than frames; what the user sees is how often the person is redrawn somewhere new.
  await run("drag", async () => {
    await page.evaluate(id => window.__perf.watchNode(id), who.id);
    for (let i = 1; i <= DRAG_MOVES; i++) {
      // Up and to the right, away from the hover pill below the person, so the drop lands on the canvas.
      await page.mouse.move(who.x + i * 2, who.y - i);
    }
    const f = await page.evaluate(() => window.__perf.moved());
    if (!f.updates) throw new Error("the drag moved nobody");
    return { update: f.ms / f.updates, longest: f.longest };
  });
  await run("drop", () => timed(page, "pointerup", () => page.mouse.up()));
  // The toolbar shows "Reset layout" only while someone is pinned (a production build has no store to ask).
  if (await page.locator('[data-testid="toolbar"] button:has-text("Reset layout")').count() === 0) throw new Error("the drag did not pin the person");
  return out;
}

const median = xs => {
  const s = xs.filter(x => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function oneRep(context, fixture, appBase, rate) {
  const { page, load, errors } = await openEditor(context, fixture, appBase, rate);
  try {
    const m = {
      open: load.dataAt === null ? null : load.settled - load.dataAt,
      openFrame: load.dataAt === null ? null : load.paint - load.dataAt,
      navigation: load.settled,
    };
    const compute = await page.evaluate(computeTimes, { n: 3 });
    if (compute) Object.assign(m, compute);
    const acts = await interact(page, (_name, fn) => fn());
    for (const [name, r] of Object.entries(acts)) {
      if (name === "drag") {
        m.drag = r.update;
        m.dragWorst = r.longest;
      } else {
        m[name] = r.settled;
        m[`${name}Frame`] = r.paint;
      }
    }
    if (errors.length) throw new Error(`${fixture.label}: uncaught error in the page: ${errors[0]}`);
    return m;
  } finally {
    await page.close();
  }
}

// ── Where the time goes (--profile) ──────────────────────────────────────────

/** Which npm package each line of a Vite pre-bundled file came from, from the "// ../node_modules/..." comments esbuild leaves. */
const packageMaps = new Map();
async function packageAt(url, line) {
  if (!packageMaps.has(url)) {
    const marks = [];
    try {
      const text = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).text();
      text.split("\n").forEach((l, i) => {
        const m = /^\/\/ .*node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(l);
        if (m) marks.push([i, m[1]]);
      });
    } catch { /* leave it unnamed */ }
    packageMaps.set(url, marks);
  }
  let name = null;
  for (const [at, pkg] of packageMaps.get(url)) { if (at > line) break; name = pkg; }
  return name;
}

const mapper = new SourceMapper();
const PACKAGE = /node_modules\/((?:@[^/]+\/)?[^/]+)\//;

/** A package name, or a source file of this repository, from a path that holds one. */
function nameOfPath(p) {
  const pkg = PACKAGE.exec(p);
  if (pkg) return pkg[1];
  const engine = p.indexOf("layout-engine/src/");
  if (engine >= 0) return p.slice(engine);
  const src = p.indexOf("src/");
  return src >= 0 ? `frontend/${p.slice(src)}` : null;
}

/**
 * Where a function lives, as { source, line }: an npm package or a source
 * file of this repository. `line` is set only for a production bundle read
 * through its source map, where the function's own name is minified.
 */
async function sourceOf(callFrame) {
  const { url, functionName, lineNumber, columnNumber } = callFrame;
  if (!url) return { source: functionName.startsWith("(") ? functionName : "(browser)" };
  if (!/^https?:/.test(url)) return { source: "(browser)" };
  const p = decodeURIComponent(new URL(url).pathname);
  if (p.includes("/.vite/deps/")) return { source: PACKAGE.exec(p)?.[1] ?? await packageAt(url, lineNumber) ?? path.basename(p) };
  if (p.startsWith("/assets/")) {
    const at = await mapper.locate(url, lineNumber + 1, columnNumber + 1);
    const source = at.mapped ? nameOfPath(at.file) : null;
    return source ? { source, line: at.line } : { source: path.basename(p) };
  }
  return { source: nameOfPath(p) ?? p };
}

/** Self time by source and by function, and inclusive time by function for this repository's code, from a CDP profile. */
async function summariseProfile(profile) {
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000));
  const info = new Map();
  for (const n of profile.nodes) {
    const { source, line } = await sourceOf(n.callFrame);
    const name = (n.callFrame.functionName || "(anonymous)") + (line ? ` (line ${line})` : "");
    info.set(n.id, { source, name, key: `${name}\t${source}`, own: !source.startsWith("(") && (source.startsWith("frontend/") || source.startsWith("layout-engine/")) });
  }
  const sources = new Map(), functions = new Map(), inclusive = new Map();
  let total = 0, program = 0;
  for (const [id, ms] of self) {
    const me = info.get(id);
    if (me.name === "(idle)" || me.name === "(root)") continue;
    // Not JavaScript: the browser's own work on this thread (style, layout, paint) and the profiler's.
    if (me.name === "(program)") { program += ms; continue; }
    total += ms;
    sources.set(me.source, (sources.get(me.source) ?? 0) + ms);
    functions.set(me.key, (functions.get(me.key) ?? 0) + ms);
    const seen = new Set();
    for (let at = id; at !== undefined; at = parent.get(at)) {
      const a = info.get(at);
      if (a.own && !seen.has(a.key)) { seen.add(a.key); inclusive.set(a.key, (inclusive.get(a.key) ?? 0) + ms); }
    }
  }
  const top = m => [...m].sort((a, b) => b[1] - a[1]);
  return { total, program, sources: top(sources), functions: top(functions), inclusive: top(inclusive) };
}

const TRACE_KIND = name => {
  if (/GC|GarbageCollect/i.test(name)) return "gc";
  if (name === "UpdateLayoutTree" || /Style/.test(name)) return "style";
  if (name === "Layout") return "layout";
  if (/Paint|Layerize|UpdateLayer|Commit|Composite/.test(name)) return "paint";
  if (/^(FunctionCall|EvaluateScript|EventDispatch|TimerFire|FireAnimationFrame|RunMicrotasks|FireIdleCallback|XHR|v8\.|V8\.)/.test(name)) return "script";
  return "other";
};

/** Main thread time by kind of work (self time of the devtools.timeline events), from a chromium trace. */
function summariseTrace(buffer) {
  const events = JSON.parse(buffer.toString("utf8")).traceEvents ?? [];
  const mains = new Set(events.filter(e => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain").map(e => `${e.pid}:${e.tid}`));
  const perThread = new Map();
  for (const e of events) {
    if (e.ph !== "X" || !mains.has(`${e.pid}:${e.tid}`)) continue;
    let list = perThread.get(`${e.pid}:${e.tid}`);
    if (!list) perThread.set(`${e.pid}:${e.tid}`, list = []);
    list.push(e);
  }
  // The busiest renderer is the page being measured (others are blank or closed).
  let best = null;
  for (const list of perThread.values()) {
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const kinds = { script: 0, style: 0, layout: 0, paint: 0, gc: 0, other: 0 };
    const stack = [];
    const close = e => { kinds[TRACE_KIND(e.name)] += (e.dur - e.children) / 1000; };
    for (const e of list) {
      e.children = 0;
      while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) close(stack.pop());
      if (stack.length) stack[stack.length - 1].children += e.dur ?? 0;
      stack.push(e);
    }
    while (stack.length) close(stack.pop());
    const total = Object.values(kinds).reduce((a, b) => a + b, 0);
    if (!best || total > best.total) best = { total, kinds };
  }
  return best;
}

async function profileFixture(browser, context, fixture, appBase) {
  const results = [];
  let cdpNow = null;
  const start = async cdp => {
    cdpNow = cdp;
    await browser.startTracing(null, { categories: ["devtools.timeline"] });
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  };
  const stop = async name => {
    const { profile } = await cdpNow.send("Profiler.stop");
    const trace = summariseTrace(await browser.stopTracing());
    results.push({ name, trace, ...(await summariseProfile(profile)) });
  };
  const { page, cdp } = await openEditor(context, fixture, appBase, 1, (_page, cdp) => start(cdp));
  try {
    await stop("open");
    await interact(page, async (name, fn) => {
      if (name === "select") return fn();
      await start(cdp);
      const r = await fn();
      await stop(name);
      return r;
    });
  } finally {
    await page.close();
  }
  return results;
}

// ── Report ───────────────────────────────────────────────────────────────────

const fmt = x => (x === null || x === undefined ? "n/a" : x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(0) : x.toFixed(1));
const cell = xs => {
  const s = xs.filter(x => x !== null && x !== undefined);
  if (!s.length) return "n/a";
  return `${fmt(median(s))} (${fmt(Math.min(...s))} to ${fmt(Math.max(...s))})`;
};

const COLUMNS = [
  ["engine", "layout engine"], ["buildScene", "buildScene"], ["problems", "problems"], ["open", "open"], ["select", "select"],
  ["edit", "edit"], ["hover", "hover"], ["zoom", "zoom"], ["drag", "drag update"], ["drop", "drop"],
];
const FIRST_FRAME = [["openFrame", "open"], ["selectFrame", "select"], ["editFrame", "edit"], ["hoverFrame", "hover"], ["zoomFrame", "zoom"], ["dragWorst", "longest wait in the drag"], ["dropFrame", "drop"]];

function table(rows, columns) {
  const lines = [
    `| pedigree | people | CPU | ${columns.map(c => c[1]).join(" | ")} |`,
    `|---|---:|---:|${columns.map(() => "---:").join("|")}|`,
  ];
  for (const r of rows) {
    lines.push(`| ${r.title} | ${r.people} | ${r.rate === 1 ? "1x" : `${r.rate}x slower`} | ${columns.map(([k]) => cell(r.reps.map(m => m[k]))).join(" | ")} |`);
  }
  return lines.join("\n");
}

function profileReport(title, people, results, top) {
  const lines = [];
  const pct = (ms, total) => `${total ? Math.round(100 * ms / total) : 0}%`;
  for (const r of results) {
    lines.push("", `#### ${title} (${people} people): ${r.name}`, "");
    if (r.trace) {
      const k = r.trace.kinds;
      lines.push(`Main thread ${fmt(r.trace.total)} ms: script ${fmt(k.script)}, style ${fmt(k.style)}, layout ${fmt(k.layout)}, paint ${fmt(k.paint)}, garbage collection ${fmt(k.gc)}, other ${fmt(k.other)}.`, "");
    }
    lines.push(`JavaScript ${fmt(r.total)} ms sampled (the profiler slows it down), by package or source file:`, "", "| source | ms | share |", "|---|---:|---:|");
    for (const [source, ms] of r.sources.slice(0, top)) lines.push(`| ${source} | ${fmt(ms)} | ${pct(ms, r.total)} |`);
    lines.push("", "Functions by self time:", "", "| function | source | ms | share |", "|---|---|---:|---:|");
    for (const [key, ms] of r.functions.slice(0, top)) {
      const [name, source] = key.split("\t");
      lines.push(`| ${name} | ${source} | ${fmt(ms)} | ${pct(ms, r.total)} |`);
    }
    lines.push("", "This repository's functions by time including what they call:", "", "| function | source | ms | share |", "|---|---|---:|---:|");
    for (const [key, ms] of r.inclusive.slice(0, top)) {
      const [name, source] = key.split("\t");
      lines.push(`| ${name} | ${source} | ${fmt(ms)} | ${pct(ms, r.total)} |`);
    }
  }
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

await main(async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2), {
    throttle: "string", reps: "number", profile: "bool", top: "number", app: "string", out: "string",
  });
  if (flags.help) { console.log(HELP); return 0; }
  if (positional.length) throw new UsageError("usage: perf.mjs takes no URL; give pedigrees with --fixture");
  const rates = (flags.throttle ?? "1,4,6").split(",").map(Number);
  if (rates.some(r => !Number.isFinite(r) || r < 1)) throw new UsageError("--throttle wants rates of 1 or more, comma separated");
  const reps = flags.reps ?? 5;
  const top = flags.top ?? 12;
  const devBase = resolveTarget("/", { allowRemote: flags["allow-remote"] });
  const appBase = flags.app ? resolveTarget(flags.app, { allowRemote: flags["allow-remote"] }) : devBase;
  await assertServerUp(devBase);
  await assertServerUp(appBase);
  const served = await servedInfo(devBase);
  const specs = flags.fixture ?? DEFAULT_FIXTURES;

  const browser = await launchBrowser();
  const chromium = browser.version();
  const rows = [], profiles = [];
  let build;
  const cpus = os.cpus();
  const headerLines = () => [
    ...(flags.app ? [`app: ${appBase} (${build}); fixtures read through the dev server`] : [`app: ${build}`]),
    ...servedLines(served),
    `machine: ${cpus.length} x ${cpus[0]?.model ?? "unknown CPU"}, load average ${os.loadavg().map(x => x.toFixed(2)).join(" ")} when this was written`,
    `chromium ${chromium}, headless, ${flags.viewport ?? "1440x900"}; ${reps} page loads per row; ${new Date().toISOString()}`,
  ];
  const writeOut = complete => {
    if (flags.out) writeFileSync(path.resolve(flags.out), JSON.stringify({ complete, header: headerLines(), rows, profiles }, null, 2) + "\n");
  };
  try {
    const context = await newContext(browser, contextOptions(flags));
    const fixtures = [];
    for (const spec of specs) {
      const f = await loadFixture(spec, context, devBase);
      // Unlocked, so a drag needs no hover pill (which a production build could not be asked about).
      f.pedigree = { ...f.pedigree, canvasSettings: { ...f.pedigree.canvasSettings, nodesMoveable: true } };
      fixtures.push(f);
    }
    for (const fixture of fixtures) {
      for (const rate of rates) {
        const row = { title: fixture.title, people: fixture.pedigree.individuals.length, rate, reps: [] };
        rows.push(row);
        for (let i = 0; i < reps; i++) {
          row.reps.push(await oneRep(context, fixture, appBase, rate));
          process.stderr.write(`${fixture.title} ${rate}x ${i + 1}/${reps}: open ${fmt(row.reps[i].open)} ms, edit ${fmt(row.reps[i].edit)} ms\n`);
        }
        build ??= row.reps[0].buildScene === undefined ? "production build" : "development build (unminified React in StrictMode, slower than production)";
        const lines = table([row], COLUMNS).split("\n");
        process.stderr.write(`${(rows.length === 1 ? lines : lines.slice(-1)).join("\n")}\n`);
        writeOut(false);
      }
      if (flags.profile) {
        profiles.push({ title: fixture.title, people: fixture.pedigree.individuals.length, results: await profileFixture(browser, context, fixture, appBase) });
        process.stderr.write(`${fixture.title}: profiled\n`);
        writeOut(false);
      }
    }
  } finally {
    await closeBrowser(browser);
  }

  const header = headerLines();
  if (flags.json) {
    console.log(JSON.stringify({ header, rows, profiles }, null, 2));
  } else {
    console.log(header.join("\n"));
    console.log("\nMilliseconds, median of the runs (lowest to highest). Open and the interactions run until the page is quiet again.\n");
    console.log(table(rows, COLUMNS.filter(([k]) => rows.some(r => r.reps.some(m => m[k] !== undefined && m[k] !== null)))));
    console.log("\nTo the end of the first frame only (the page may still be working after it; for the drag, the longest wait between two redraws):\n");
    console.log(table(rows, FIRST_FRAME));
    for (const p of profiles) console.log(profileReport(p.title, p.people, p.results, top));
  }
  writeOut(true);
  return 0;
}, HELP);
