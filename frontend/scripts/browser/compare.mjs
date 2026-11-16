#!/usr/bin/env node
// Draw the same pedigrees from two commits and report what differs, image by
// image (#142): the canvas at a fixed zoom, the standard SVG export and the
// U-shape export. A refactoring should move nothing; this shows that it did
// not, or exactly where it did.
//
// The "before" side is a commit checked out in a git worktree with its own
// Vite (worktree.mjs); the "after" side is the working tree on the usual dev
// server. Both draw the pedigree data of the working tree.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  COMMON_HELP, SET_FLAGS, SET_HELP, FRONTEND_DIR, DEFAULT_BASE, FIXTURE_ID, closeBrowser, main, parseArgs,
  launchBrowser, newContext, contextOptions, expandSetFlags, resolveTarget, assertServerUp, loadFixture,
  routeFixture, gotoAndSettle, servedInfo, displayPath, UsageError,
} from "./harness.mjs";
import { startWorktree, removeWorktree, resolveCommit } from "./worktree.mjs";

const HELP = `usage: node frontend/scripts/browser/compare.mjs [--base REF] --all-examples|--all-fixtures|--fixture SPEC ... [options]

  --base REF          The commit to compare the working tree with (default
                      HEAD, i.e. "what did my uncommitted changes move?").
                      It is checked out under .worktrees/ and served by its
                      own Vite for the run.
  --base-url URL      Use a server that is already running as the base
                      instead (servers.mjs up --worktree REF prints one).
${SET_HELP}
  --compact           Compact layout, canvas and standard export.
  --deidentify        De-identified exports (the canvas is not affected).
  --nsgc2008          Draw every pedigree in NSGC 2008 notation.
  --monochrome        Draw conditions and tags in black and white patterns.
  --no-canvas, --no-export, --no-u-shape
                      Leave one of the three drawings out.
  --out-dir DIR       Where the images of differences go (default
                      frontend/test-output/browser/compare/, emptied first).
  --keep-base         Leave the base worktree in place afterwards.

For every pedigree and drawing that differs, one line with the number of
changed pixels and the box they fall in, and an image: before, after, and the
after drawing greyed with the changed pixels in red. Comparison is exact, with
no tolerance. Exits 0 when nothing differs, 1 otherwise.
${COMMON_HELP}`;

const FLAGS = {
  ...SET_FLAGS, base: "string", "base-url": "string", compact: "bool", deidentify: "bool", nsgc2008: "bool",
  monochrome: "bool", "no-canvas": "bool", "no-export": "bool", "no-u-shape": "bool", "out-dir": "string", "keep-base": "bool",
};

/** Space round the drawing in a canvas picture, flow units (= pixels at zoom 1). */
const PAD = 24;

/** Editor-only marks, hidden so the picture is of the chart alone. */
const CHART_ONLY_CSS = `
  .react-flow__minimap, .react-flow__controls, .react-flow__panel, .react-flow__background,
  .react-flow__attribution, .react-flow__handle, .react-flow__node-toolbar { display: none !important; }
  [data-problem-marker] { display: none !important; }
  /* the dev-only id under each symbol */
  [data-individual-id] > div[style*="monospace"] { display: none !important; }
  * { caret-color: transparent !important; transition: none !important; animation: none !important; }
`;

const slug = s => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Bounds of everything drawn on the canvas, in flow units. */
function flowBounds(page) {
  return page.evaluate(() => {
    const vp = document.querySelector(".react-flow__viewport");
    if (!vp) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(vp).transform);
    const origin = vp.parentElement.getBoundingClientRect();
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const d of vp.querySelectorAll("*")) {
      if (d.childElementCount > 0) continue;
      if (!(d instanceof SVGElement) && !d.textContent?.trim()) continue;
      const r = d.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      x1 = Math.min(x1, (r.left - origin.x - m.e) / m.a); y1 = Math.min(y1, (r.top - origin.y - m.f) / m.d);
      x2 = Math.max(x2, (r.right - origin.x - m.e) / m.a); y2 = Math.max(y2, (r.bottom - origin.y - m.f) / m.d);
    }
    return x1 < x2 ? { x1, y1, x2, y2 } : null;
  });
}

/** A picture of the canvas at zoom 1 with flow point (b.x1, b.y1) at the same pixel on both sides. */
async function canvasShot(page, b) {
  const width = Math.ceil(b.x2 - b.x1) + PAD * 2, height = Math.ceil(b.y2 - b.y1) + PAD * 2;
  // Room for the side panels round the pane; the pane then holds the whole drawing.
  await page.setViewportSize({ width: width + 700, height: height + 200 });
  const clip = await page.evaluate(({ tx, ty, width, height }) => {
    const vp = document.querySelector(".react-flow__viewport");
    // React Flow writes this style only when its own pan or zoom changes.
    vp.style.transform = `translate(${tx}px, ${ty}px) scale(1)`;
    const pane = vp.parentElement.getBoundingClientRect();
    return { x: Math.ceil(pane.x), y: Math.ceil(pane.y), width, height, paneWidth: pane.width, paneHeight: pane.height };
  }, { tx: PAD - Math.floor(b.x1), ty: PAD - Math.floor(b.y1), width, height });
  if (clip.paneWidth < width || clip.paneHeight < height) throw new Error(`canvas pane ${clip.paneWidth}x${clip.paneHeight} is smaller than the drawing ${width}x${height}`);
  await page.waitForTimeout(150);
  return page.screenshot({ clip: { x: clip.x, y: clip.y, width, height } });
}

/** Rasterise an SVG string in chromium. */
async function svgShot(tool, svg) {
  await tool.setContent(`<!doctype html><style>html,body{margin:0;background:#fff}svg{display:block}</style>${svg}`);
  return tool.locator("svg").first().screenshot();
}

/** Compare two PNGs pixel for pixel in the browser. Returns { pixels, box, image } (image: before | after | marked). */
async function diffPngs(tool, before, after) {
  await tool.setContent("<!doctype html><title>diff</title>");
  return tool.evaluate(async ({ a, b }) => {
    const load = src => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img); img.onerror = () => reject(new Error("image did not load"));
      img.src = `data:image/png;base64,${src}`;
    });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const data = img => {
      const c = new OffscreenCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, w, h);
    };
    const da = data(ia), db = data(ib);
    const out = new ImageData(w, h);
    let pixels = 0, x1 = w, y1 = h, x2 = -1, y2 = -1;
    for (let i = 0, p = 0; i < da.data.length; i += 4, p++) {
      const same = da.data[i] === db.data[i] && da.data[i + 1] === db.data[i + 1] && da.data[i + 2] === db.data[i + 2];
      if (same) {
        // the unchanged drawing, faded
        const grey = 255 - (255 - (db.data[i] * 0.3 + db.data[i + 1] * 0.59 + db.data[i + 2] * 0.11)) * 0.25;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = grey;
      } else {
        pixels++;
        const x = p % w, y = (p - x) / w;
        if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
        out.data[i] = 220; out.data[i + 1] = 0; out.data[i + 2] = 0;
      }
      out.data[i + 3] = 255;
    }
    if (!pixels) return { pixels: 0, sizes: [ia.width, ia.height, ib.width, ib.height] };
    const GAP = 12, LABEL = 18;
    const sheet = new OffscreenCanvas(w * 3 + GAP * 2, h + LABEL), g = sheet.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, sheet.width, sheet.height);
    g.fillStyle = "#000"; g.font = "12px sans-serif";
    ["before", "after", `changed: ${pixels} px`].forEach((t, k) => g.fillText(t, k * (w + GAP) + 2, 13));
    g.drawImage(ia, 0, LABEL); g.drawImage(ib, w + GAP, LABEL);
    const marked = new OffscreenCanvas(w, h); marked.getContext("2d").putImageData(out, 0, 0);
    g.drawImage(marked, (w + GAP) * 2, LABEL);
    g.strokeStyle = "#d00"; g.lineWidth = 1;
    g.strokeRect((w + GAP) * 2 + x1 - 3.5, LABEL + y1 - 3.5, x2 - x1 + 8, y2 - y1 + 8);
    const blob = await sheet.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { pixels, box: { x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 }, image: btoa(bin), sizes: [ia.width, ia.height, ib.width, ib.height] };
  }, { a: before.toString("base64"), b: after.toString("base64") });
}

await main(async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2), FLAGS);
  if (flags.help) { console.log(HELP); return 0; }
  if (positional.length) throw new UsageError("usage: compare.mjs takes no URL; give --fixture, --all-examples or --all-fixtures");
  await expandSetFlags(flags);
  const specs = flags.fixture ?? [];
  if (!specs.length) throw new UsageError("usage: give --all-examples, --all-fixtures or --fixture SPEC");
  const after = resolveTarget("/", { allowRemote: flags["allow-remote"] }).replace(/\/$/, "");
  await assertServerUp(after);

  const outDir = path.resolve(flags["out-dir"] ?? path.join(FRONTEND_DIR, "test-output", "browser", "compare"));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  let worktree = null, before;
  if (flags["base-url"]) {
    before = resolveTarget(flags["base-url"], { allowRemote: flags["allow-remote"] }).replace(/\/$/, "");
    await assertServerUp(before);
  } else {
    const ref = flags.base ?? "HEAD";
    try { resolveCommit(ref); } catch (e) { throw new UsageError(e.message); }
    worktree = await startWorktree(ref);
    before = worktree.url;
  }

  const settings = {
    ...(flags.nsgc2008 ? { notation: "nsgc2008" } : {}),
    ...(flags.monochrome ? { tagFills: "monochrome" } : {}),
  };
  const exportOptions = { compact: !!flags.compact, deidentify: !!flags.deidentify };
  const sides = [{ name: "before", url: before }, { name: "after", url: after }];
  const drawings = [
    ...(flags["no-canvas"] ? [] : ["canvas"]),
    ...(flags["no-export"] ? [] : ["export"]),
    ...(flags["no-u-shape"] ? [] : ["u-shape"]),
  ];
  const results = [];
  let served;
  const browser = await launchBrowser();
  try {
    served = await Promise.all(sides.map(s => servedInfo(s.url)));
    const context = await newContext(browser, contextOptions(flags, {
      localStorage: [...(flags["local-storage"] ?? []), ...(flags.compact ? ["compactLayout=true"] : [])],
    }));
    const tool = await context.newPage();
    for (const spec of specs) {
      // The working tree's data on both sides: this compares drawing code, not fixtures.
      const fixture = await loadFixture(spec, context, after);
      if (Object.keys(settings).length) {
        fixture.pedigree = { ...fixture.pedigree, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 5, ...fixture.pedigree.canvasSettings, ...settings } };
      }
      const opened = await Promise.all(sides.map(async side => {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", e => errors.push(e.message));
        await routeFixture(page, fixture);
        await gotoAndSettle(page, `${side.url}/p/${FIXTURE_ID}`, flags.wait ?? 1500);
        await page.addStyleTag({ content: CHART_ONLY_CSS });
        await page.mouse.move(2, 2);
        const svgs = await page.evaluate(({ o, title, drawings }) => (window.__pededit ? {
          export: drawings.includes("export") ? window.__pededit.exportSvg({ ...o, title: o.deidentify ? undefined : title }) : null,
          "u-shape": drawings.includes("u-shape") ? window.__pededit.exportSvg({ deidentify: o.deidentify, uShape: true, title: o.deidentify ? undefined : title }) : null,
        } : null), { o: exportOptions, title: fixture.title, drawings });
        if (!svgs) throw new UsageError(`${side.url} did not load the editor (${errors[0] ?? "no window.__pededit"})`);
        return { ...side, page, svgs, errors, bounds: drawings.includes("canvas") ? await flowBounds(page) : null };
      }));
      const [a, b] = opened;
      const item = { spec, differences: [], errors: opened.flatMap(s => s.errors.map(e => `${s.name}: ${e}`)) };
      const record = async (drawing, pngA, pngB, note) => {
        const d = await diffPngs(tool, pngA, pngB);
        if (!d.pixels && !note) return;
        const entry = { drawing, pixels: d.pixels, box: d.box ?? null, note: note ?? null, image: null };
        if (d.pixels) {
          const file = path.join(outDir, `${slug(spec)}.${drawing}.png`);
          writeFileSync(file, Buffer.from(d.image, "base64"));
          entry.image = displayPath(file);
          if (d.sizes[0] !== d.sizes[2] || d.sizes[1] !== d.sizes[3]) entry.note = `size ${d.sizes[0]}x${d.sizes[1]} -> ${d.sizes[2]}x${d.sizes[3]}`;
        }
        item.differences.push(entry);
      };
      if (drawings.includes("canvas")) {
        if (!a.bounds || !b.bounds) item.errors.push("canvas: nothing drawn on one side");
        else {
          const u = { x1: Math.min(a.bounds.x1, b.bounds.x1), y1: Math.min(a.bounds.y1, b.bounds.y1), x2: Math.max(a.bounds.x2, b.bounds.x2), y2: Math.max(a.bounds.y2, b.bounds.y2) };
          const [pa, pb] = await Promise.all([canvasShot(a.page, u), canvasShot(b.page, u)]);
          if (!pa.equals(pb)) await record("canvas", pa, pb);
        }
      }
      for (const drawing of ["export", "u-shape"]) {
        if (!drawings.includes(drawing) || a.svgs[drawing] === b.svgs[drawing]) continue;
        const pa = await svgShot(tool, a.svgs[drawing]), pb = await svgShot(tool, b.svgs[drawing]);
        // The SVG text changed. It may still draw the same picture.
        await record(drawing, pa, pb, pa.equals(pb) ? "SVG text differs, drawn the same" : null);
        if (!pa.equals(pb)) {
          writeFileSync(path.join(outDir, `${slug(spec)}.${drawing}.before.svg`), a.svgs[drawing]);
          writeFileSync(path.join(outDir, `${slug(spec)}.${drawing}.after.svg`), b.svgs[drawing]);
        }
      }
      await Promise.all(opened.map(s => s.page.close()));
      results.push(item);
    }
  } finally {
    await closeBrowser(browser);
    if (worktree) {
      worktree.stop();
      if (!flags["keep-base"]) removeWorktree(worktree.dir);
    }
  }

  const pictured = r => r.differences.filter(d => d.pixels > 0);
  const bad = results.filter(r => pictured(r).length || r.errors.length);
  if (flags.json) {
    console.log(JSON.stringify({ before: served[0], after: served[1], drawings, results }, null, 2));
  } else {
    const say = s => (s ? `${s.commit.slice(0, 7)}${s.dirty ? ` +${s.dirty} uncommitted` : ""}` : "unknown commit");
    console.log(`before: ${say(served[0])}  (${before})`);
    console.log(`after:  ${say(served[1])}  (${after === DEFAULT_BASE ? "working tree" : after})`);
    const options = [flags.compact && "compact", flags.deidentify && "de-identified", flags.nsgc2008 && "NSGC 2008", flags.monochrome && "black and white"].filter(Boolean);
    console.log(`drawings: ${drawings.join(", ")}${options.length ? `  (${options.join(", ")})` : ""}`);
    for (const r of results) {
      const n = pictured(r).length + r.errors.length;
      console.log(`${n ? "DIFF" : "same"}  ${r.spec}`);
      for (const e of r.errors) console.log(`        error  ${e}`);
      for (const d of r.differences) {
        if (!d.pixels) { console.log(`        ${d.drawing}  ${d.note}`); continue; }
        console.log(`        ${d.drawing}  ${d.pixels} px changed in ${d.box.width}x${d.box.height} at ${d.box.x},${d.box.y}${d.note ? `  (${d.note})` : ""}  ${d.image}`);
      }
    }
    console.log(`compare: ${bad.length} of ${results.length} pedigree(s) differ`);
  }
  return bad.length ? 1 : 0;
}, HELP);
