#!/usr/bin/env node
// Render a page (or several fixtures) to PNG, measure elements, and report
// the same JS findings as console.mjs. Read the PNG back to see the result.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  COMMON_HELP, FRONTEND_DIR, REPO_ROOT, closeBrowser, main, parseArgs, parseViewport, launchBrowser, newContext,
  targetsFrom, assertServerUp, loadFixture, openPage, finishPage, contextOptions, resolveFindings, SourceMapper,
  summaryLine, findingLines, writesLine, hasFindings, displayPath, servedInfo, servedLines, UsageError,
} from "./harness.mjs";

const HELP = `usage: node frontend/scripts/browser/shot.mjs [URL] [options]
       node frontend/scripts/browser/shot.mjs FILE.svg [--out PNG] [--scale N]

  FILE.svg            Render a local SVG (an export saved with --download) on
                      white at its own size, in chromium, and write a PNG.

  --out FILE          PNG path (single target only). Default
                      frontend/test-output/browser/<name>.png
  --out-dir DIR       Directory for PNGs when rendering several fixtures.
  --measure SEL       Print the bounding box of every element matching SEL
                      (repeatable), in screen pixels. Individuals:
                      '[data-individual-id]'.
  --measure-flow SEL  Like --measure, but in canvas (flow) coordinates: the
                      centre and size before React Flow's fitView zoom, the
                      same units as __pededit.layout() positions.
  --clip SEL          Screenshot only the region around the first match of SEL.
                      Popovers outside that box are cut off; take a full shot
                      (no --clip) when a menu or dialog is open.
  --pad PX            Margin around --clip (default 16).
  --full-page         Capture the whole scrollable page, not just the viewport.
  --scale N           Device scale factor (default 1; 2 for crisp detail).
  --tile              With several fixtures, also write one contact sheet
                      (contact-sheet.png in the output directory) with every
                      shot labelled and its render lint count, to read in one go.
  --tile-cols N       Columns in the contact sheet (default 4).
${COMMON_HELP}`;

const SHOT_FLAGS = {
  out: "string", "out-dir": "string", measure: "multi", "measure-flow": "multi", clip: "string",
  pad: "number", "full-page": "bool", scale: "number", tile: "bool", "tile-cols": "number",
};

function slug(s) {
  return s.replace(/^.*[\\/]/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "page";
}

async function measure(page, selector) {
  return page.locator(selector).evaluateAll(els => {
    const r1 = n => Math.round(n * 10) / 10;
    return els.map(el => {
      const b = el.getBoundingClientRect();
      const label = el.getAttribute("data-individual-id") ?? el.getAttribute("data-id") ?? el.id ??
        el.getAttribute("aria-label") ?? "";
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return { label: label || text, x: r1(b.x), y: r1(b.y), width: r1(b.width), height: r1(b.height) };
    });
  });
}

/** Centre and size in React Flow canvas coordinates, undoing the viewport pan and zoom. */
async function measureFlow(page, selector) {
  return page.locator(selector).evaluateAll(els => {
    const r1 = n => Math.round(n * 10) / 10;
    const vp = document.querySelector(".react-flow__viewport");
    if (!vp) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(vp).transform);
    const origin = vp.parentElement.getBoundingClientRect();
    return els.map(el => {
      const b = el.getBoundingClientRect();
      const label = el.getAttribute("data-individual-id") ?? el.getAttribute("data-id") ?? el.id ?? "";
      const cx = (b.x + b.width / 2 - origin.x - m.e) / m.a, cy = (b.y + b.height / 2 - origin.y - m.f) / m.d;
      return { label, cx: r1(cx), cy: r1(cy), width: r1(b.width / m.a), height: r1(b.height / m.d), zoom: r1(m.a * 1000) / 1000 };
    });
  });
}

/** Lay several PNGs out in one labelled grid, rendered by chromium itself. */
async function contactSheet(browser, reports, file, cols) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const esc = t => t.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const cells = reports.map(r => {
    const img = readFileSync(path.resolve(REPO_ROOT, r.png)).toString("base64");
    const lint = r.render ? (r.render.length ? `${r.render.length} render lint` : "lint clean") : "";
    return `<figure><img src="data:image/png;base64,${img}"><figcaption>${esc((r.fixture ?? r.url).replace(/^.*[\\/]/, ""))}` +
      `${lint ? ` <b class="${r.render?.length ? "bad" : ""}">${lint}</b>` : ""}</figcaption></figure>`;
  }).join("");
  await page.setContent(`<!doctype html><style>
    body{margin:8px;font:13px sans-serif;background:#fff}
    main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px}
    figure{margin:0;border:1px solid #999}
    img{width:100%;display:block}
    figcaption{padding:3px 6px;border-top:1px solid #999}
    b{font-weight:normal;color:#555}.bad{color:#b00;font-weight:bold}
  </style><main>${cells}</main>`);
  await page.waitForLoadState("load");
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

/** Render a saved SVG file to PNG, so exports can be looked at like the canvas. */
async function renderSvgFile(file, flags) {
  const svg = readFileSync(file, "utf8");
  const out = path.resolve(flags.out ?? path.join(flags["out-dir"] ?? path.dirname(file), `${path.basename(file, path.extname(file))}.svg.png`));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: flags.scale ?? 1 });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:#fff}svg{display:block}</style>${svg}`);
    const el = page.locator("svg").first();
    const box = await el.boundingBox();
    if (!box) throw new UsageError(`${file} has no drawable <svg>`);
    mkdirSync(path.dirname(out), { recursive: true });
    await el.screenshot({ path: out });
    console.log(`shot: ${displayPath(out)}  (${displayPath(path.resolve(file))}, ${Math.round(box.width)}x${Math.round(box.height)})`);
  } finally {
    await closeBrowser(browser);
  }
  return 0;
}

await main(async () => {
  const { positional, flags, steps } = parseArgs(process.argv.slice(2), SHOT_FLAGS);
  if (flags.help) { console.log(HELP); return 0; }
  if (positional.length === 1 && /\.svg$/i.test(positional[0]) && existsSync(positional[0])) {
    return renderSvgFile(positional[0], flags);
  }
  if (positional.length > 1) throw new UsageError("usage: one URL at most (use --fixture several times for several pedigrees)");
  const targets = targetsFrom(positional[0], flags);
  if (flags.out && targets.length > 1) throw new UsageError("--out takes one target; use --out-dir for several fixtures");
  await assertServerUp(targets[0].url);
  const served = await servedInfo(targets[0].url);

  const outDir = path.resolve(flags["out-dir"] ?? path.join(FRONTEND_DIR, "test-output", "browser"));
  const viewport = parseViewport(flags.viewport);
  const browser = await launchBrowser();
  const mapper = new SourceMapper();
  const reports = [];
  try {
    const context = await newContext(browser, contextOptions(flags, { deviceScaleFactor: flags.scale ?? 1 }));
    for (const t of targets) {
      const fixture = t.spec ? await loadFixture(t.spec, context, t.url) : null;
      const run = await openPage(context, { url: t.url, fixture, steps, flags });
      const { page } = run;

      const file = path.resolve(flags.out ?? path.join(outDir, `${slug(t.spec ?? new URL(t.url).pathname)}.png`));
      mkdirSync(path.dirname(file), { recursive: true });
      let clip;
      if (flags.clip) {
        const box = await page.locator(flags.clip).first().boundingBox({ timeout: flags.timeout ?? 5000 }).catch(() => null);
        if (!box) throw new UsageError(`--clip ${flags.clip} matched nothing visible`);
        const pad = flags.pad ?? 16;
        const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
        clip = { x, y, width: box.width + pad * 2, height: box.height + pad * 2 };
      }
      await page.screenshot({ path: file, fullPage: !!flags["full-page"] && !clip, clip });

      const measures = [];
      for (const sel of flags.measure ?? []) measures.push({ selector: sel, boxes: await measure(page, sel) });
      for (const sel of flags["measure-flow"] ?? []) {
        const boxes = await measureFlow(page, sel);
        if (!boxes) throw new UsageError("--measure-flow: no React Flow canvas on this page");
        measures.push({ selector: sel, flow: true, boxes });
      }
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

      await finishPage(run, flags);
      await resolveFindings(run.findings, mapper);
      reports.push({
        url: run.url, fixture: t.spec, status: run.status, png: displayPath(file),
        viewport, pageHeight, clip: clip ?? null, measures, ...run.findings,
      });
      await page.close();
    }
    if (flags.tile && reports.length > 1) {
      const sheet = path.join(outDir, "contact-sheet.png");
      mkdirSync(outDir, { recursive: true });
      await contactSheet(browser, reports, sheet, flags["tile-cols"] ?? 4);
      reports.sheet = displayPath(sheet);
    }
  } finally {
    await closeBrowser(browser);
  }

  if (flags.json) {
    console.log(JSON.stringify({ served, sheet: reports.sheet ?? null, reports }, null, 2));
  } else {
    for (const line of servedLines(served)) console.log(line);
    for (const r of reports) {
      console.log(`shot: ${r.png}  (${r.url}${r.fixture ? `, fixture ${r.fixture}` : ""})  ` +
        `status ${r.status}, viewport ${r.viewport.width}x${r.viewport.height}, page height ${r.pageHeight}`);
      console.log(summaryLine(r));
      for (const line of findingLines(r, { verbose: flags.verbose })) console.log(line);
      const writes = writesLine(r);
      if (writes) console.log(writes);
      for (const m of r.measures) {
        console.log(`measure${m.flow ? "-flow" : ""} ${m.selector}: ${m.boxes.length} element(s)` +
          (m.flow && m.boxes[0] ? ` (canvas units, zoom ${m.boxes[0].zoom})` : ""));
        const shown = flags.verbose ? m.boxes : m.boxes.slice(0, 40);
        for (const b of shown) {
          console.log(m.flow ? `  ${b.label || "-"}  cx=${b.cx} cy=${b.cy} ${b.width}x${b.height}`
            : `  ${b.label || "-"}  x=${b.x} y=${b.y} ${b.width}x${b.height}`);
        }
        if (shown.length < m.boxes.length) console.log(`  ... ${m.boxes.length - shown.length} more (--verbose or --json for all)`);
      }
    }
  }
  if (!flags.json && reports.sheet) console.log(`contact sheet: ${reports.sheet}`);
  return reports.some(hasFindings) ? 1 : 0;
}, HELP);
