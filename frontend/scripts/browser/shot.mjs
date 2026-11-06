#!/usr/bin/env node
// Render a page (or several fixtures) to PNG, measure elements, and report
// the same JS findings as console.mjs. Read the PNG back to see the result.
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  COMMON_HELP, FRONTEND_DIR, REPO_ROOT, closeBrowser, main, parseArgs, parseViewport, launchBrowser, newContext,
  targetsFrom, assertServerUp, loadFixture, openPage, resolveFindings, SourceMapper,
  summaryLine, findingLines, writesLine, hasFindings, UsageError,
} from "./harness.mjs";

const HELP = `usage: node frontend/scripts/browser/shot.mjs [URL] [options]

  --out FILE          PNG path (single target only). Default
                      frontend/test-output/browser/<name>.png
  --out-dir DIR       Directory for PNGs when rendering several fixtures.
  --measure SEL       Print the bounding box of every element matching SEL
                      (repeatable). Individuals: '[data-individual-id]'.
  --clip SEL          Screenshot only the region around the first match of SEL.
  --pad PX            Margin around --clip (default 16).
  --full-page         Capture the whole scrollable page, not just the viewport.
  --scale N           Device scale factor (default 1; 2 for crisp detail).
${COMMON_HELP}`;

const SHOT_FLAGS = {
  out: "string", "out-dir": "string", measure: "multi", clip: "string",
  pad: "number", "full-page": "bool", scale: "number",
};

function slug(s) {
  return s.replace(/^.*[\\/]/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "page";
}

async function measure(page, selector) {
  return page.evaluate(sel => {
    const r1 = n => Math.round(n * 10) / 10;
    return [...document.querySelectorAll(sel)].map(el => {
      const b = el.getBoundingClientRect();
      const label = el.getAttribute("data-individual-id") ?? el.getAttribute("data-id") ?? el.id ??
        el.getAttribute("aria-label") ?? "";
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return { label: label || text, x: r1(b.x), y: r1(b.y), width: r1(b.width), height: r1(b.height) };
    });
  }, selector);
}

await main(async () => {
  const { positional, flags, steps } = parseArgs(process.argv.slice(2), SHOT_FLAGS);
  if (flags.help) { console.log(HELP); return 0; }
  if (positional.length > 1) throw new UsageError("usage: one URL at most (use --fixture several times for several pedigrees)");
  const targets = targetsFrom(positional[0], flags);
  if (flags.out && targets.length > 1) throw new UsageError("--out takes one target; use --out-dir for several fixtures");
  await assertServerUp(targets[0].url);

  const outDir = path.resolve(flags["out-dir"] ?? path.join(FRONTEND_DIR, "test-output", "browser"));
  const viewport = parseViewport(flags.viewport);
  const browser = await launchBrowser();
  const mapper = new SourceMapper();
  const reports = [];
  try {
    const context = await newContext(browser, {
      asAgent: flags["as-agent"], viewport, deviceScaleFactor: flags.scale ?? 1,
    });
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
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

      await resolveFindings(run.findings, mapper);
      reports.push({
        url: run.url, fixture: t.spec, status: run.status, png: path.relative(REPO_ROOT, file),
        viewport, pageHeight, clip: clip ?? null, measures, ...run.findings,
      });
      await page.close();
    }
  } finally {
    await closeBrowser(browser);
  }

  if (flags.json) {
    console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  } else {
    for (const r of reports) {
      console.log(`shot: ${r.png}  (${r.url}${r.fixture ? `, fixture ${r.fixture}` : ""})  ` +
        `status ${r.status}, viewport ${r.viewport.width}x${r.viewport.height}, page height ${r.pageHeight}`);
      console.log(summaryLine(r));
      for (const line of findingLines(r, { verbose: flags.verbose })) console.log(line);
      const writes = writesLine(r);
      if (writes) console.log(writes);
      for (const m of r.measures) {
        console.log(`measure ${m.selector}: ${m.boxes.length} element(s)`);
        const shown = flags.verbose ? m.boxes : m.boxes.slice(0, 40);
        for (const b of shown) console.log(`  ${b.label || "-"}  x=${b.x} y=${b.y} ${b.width}x${b.height}`);
        if (shown.length < m.boxes.length) console.log(`  ... ${m.boxes.length - shown.length} more (--verbose or --json for all)`);
      }
    }
  }
  return reports.some(hasFindings) ? 1 : 0;
}, HELP);
