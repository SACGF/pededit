// SPIKE for #141, not for merging: string export vs React-rendered export through SVG, PNG and PDF.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { launchBrowser, newContext, closeBrowser, inApp, DEFAULT_BASE } from "./browser/harness.mjs";

const OUT = process.argv[2] ?? "/tmp/spike141";
mkdirSync(OUT, { recursive: true });
const SLUGS = ["status", "status-2008", "fills-mono", "text", "couples", "reproduction", "collapsed"];
const browser = await launchBrowser();
const context = await newContext(browser, {});
const tool = await context.newPage();

const shot = async svg => {
  await tool.setContent(`<!doctype html><style>html,body{margin:0;background:#fff}svg{display:block}</style>${svg}`);
  return tool.locator("svg").first().screenshot();
};
const diff = async (a, b) => {
  await tool.setContent("<!doctype html>");
  return tool.evaluate(async ({ a, b }) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const d = img => { const c = new OffscreenCanvas(w, h), g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const da = d(ia), db = d(ib); let n = 0, big = 0;
    for (let i = 0; i < da.length; i += 4) {
      const delta = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (delta) n++; if (delta > 64) big++;
    }
    return { size: `${ia.width}x${ia.height}/${ib.width}x${ib.height}`, changed: n, changedOver64: big };
  }, { a: a.toString("base64"), b: b.toString("base64") });
};

for (const slug of SLUGS) {
  const r = await inApp(context, DEFAULT_BASE, async ({ slug }) => {
    const RefreshRuntime = (await import("/@react-refresh")).default; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t; window.__vite_plugin_react_preamble_installed__ = true;
    const { FEATURE_FIXTURES } = await import("/src/fixtures/features.ts");
    const { exportSvg, exportPng, exportPdf } = await import("/src/io/svg/index.ts");
    const { exportSvgReact } = await import("/src/spike/reactExport.tsx");
    const fx = FEATURE_FIXTURES.find(f => f.slug === slug);
    const b64 = async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
    const out = {};
    for (const [name, fn] of [["string", exportSvg], ["react", exportSvgReact]]) {
      const svg = fn(fx.data, { title: fx.label });
      out[name] = { svg, png: await b64(await exportPng(svg, 150)), pdf: await b64(await exportPdf(svg, fx.label)) };
    }
    return out;
  }, { slug });
  const line = { slug };
  for (const name of ["string", "react"]) {
    writeFileSync(path.join(OUT, `${slug}.${name}.svg`), r[name].svg);
    writeFileSync(path.join(OUT, `${slug}.${name}.png`), Buffer.from(r[name].png, "base64"));
    writeFileSync(path.join(OUT, `${slug}.${name}.pdf`), Buffer.from(r[name].pdf, "base64"));
    execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m", "-r150", `-sOutputFile=${path.join(OUT, `${slug}.${name}.pdf.png`)}`, path.join(OUT, `${slug}.${name}.pdf`)]);
  }
  const { readFileSync } = await import("node:fs");
  line.svg = await diff(await shot(r.string.svg), await shot(r.react.svg));
  line.png = await diff(Buffer.from(r.string.png, "base64"), Buffer.from(r.react.png, "base64"));
  line.pdf = await diff(readFileSync(path.join(OUT, `${slug}.string.pdf.png`)), readFileSync(path.join(OUT, `${slug}.react.pdf.png`)));
  line.bytes = { string: r.string.svg.length, react: r.react.svg.length };
  console.log(JSON.stringify(line));
}

// Speed: a large synthetic family, string vs React, in the browser.
const speed = await inApp(context, DEFAULT_BASE, async () => {
  const RefreshRuntime = (await import("/@react-refresh")).default; RefreshRuntime.injectIntoGlobalHook(window);
  window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t; window.__vite_plugin_react_preamble_installed__ = true;
  const { makeSyntheticFamily } = await import("/src/fixtures/syntheticFamily.ts");
  const { exportSvg } = await import("/src/io/svg/index.ts");
  const { exportSvgReact } = await import("/src/spike/reactExport.tsx");
  const out = [];
  for (const generations of [5, 6, 7]) {
    const p = makeSyntheticFamily({ seed: 3, generations, minChildren: 2, maxChildren: 4, partnerRate: 0.7 });
    const t = fn => { const t0 = performance.now(); fn(); return Math.round(performance.now() - t0); };
    exportSvg(p);
    const s = t(() => exportSvg(p)), r = t(() => exportSvgReact(p));
    out.push({ people: p.individuals.length, stringMs: s, reactTotalMs: r, reactExtraMs: r - s });
  }
  return { out };
});
console.log(JSON.stringify(speed));
await closeBrowser(browser);
