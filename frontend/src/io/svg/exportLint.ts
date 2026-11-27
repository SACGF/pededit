/**
 * The file-level lint for the standard SVG export. What is drawn is checked
 * on the scene by the render lint (`pedigree/renderLint.ts`, through
 * `sceneDrawing`, the geometry the chart components draw with), so this one
 * parses the exported file only for what the scene cannot show: that the
 * file holds the drawing, and how the export composed it.
 *
 *   missing-from-file      something the scene draws (a symbol, a couple, sibship
 *                          or assisted line, a dashed arc, a line of text under a
 *                          symbol or over a double line) is not in the file, or the
 *                          file has none of the drawing's groups
 *   symbol-not-in-scene    the file draws a symbol where the scene has none
 *   title-collides         the chart title, which the export places in its own
 *                          band, is drawn through a symbol, a dashed arc between two
 *                          copies or a consanguinity label
 *   key-collides           the key, in its corner, overlaps something drawn or
 *                          reaches outside the figure (`keyPlacementProblems`)
 *   outside-figure         something drawn lies outside the figure's width and height
 *
 * `lintExport` runs both: the render lint on the scene the export draws
 * (which is not the canvas's when de-identified) and this. PNG and PDF are
 * rasterised from this SVG, so it covers them too. The U-shape export has
 * its own geometry and its own lint (`uShapeLint.ts`).
 *
 * Symbols are matched to people by position: the export carries no ids
 * (they could be names after a PED import, which de-identification must not
 * leak). It relies on the group classes `Chart` writes (couple-lines,
 * sibship-lines, assisted-lines, duplicate-arcs, symbols, labels,
 * consanguinity-labels), the exporter's chart-title and pedigree-key, and the
 * `data-childless`, `data-ended` and `data-twin-mark` on marks, which are
 * not connecting lines.
 */
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "../../pedigree/constants";
import { buildScene } from "../../pedigree/scene";
import type { Scene } from "../../pedigree/scene";
import { NAME_CHAR_WIDTH, textWidth, titleWidth } from "../../pedigree/labels";
import { keyPlacementProblems } from "./keyPlacement";
import { consanguinityLabelWidth } from "../../pedigree/consanguinityLabel";
import { pathPoints } from "../../pedigree/couplePath";
import { sceneDrawing, segmentsOf } from "../../pedigree/sceneDrawing";
import { lintScene, type LintFinding } from "../../pedigree/renderLint";
import { exportSvg } from "./svgExporter";
import { deidentify } from "./deidentify";
import { drawnPedigree } from "../../pedigree/collapse";
import type { SvgExportOptions } from "./types";

export type ExportLintCode =
  | "missing-from-file"
  | "symbol-not-in-scene"
  | "title-collides"
  | "key-collides"
  | "outside-figure";

export interface ExportLintFinding {
  code: ExportLintCode;
  message: string;
  individuals: string[];
}

type Pt = [number, number];
type Seg = [number, number, number, number];

interface Parsed {
  symbols: Pt[];
  couples: Pt[][];
  sibs: Seg[];
  /** Lines of assisted reproduction, group `assisted-lines`. */
  assisted: Seg[];
  /** Lines under symbols; `bold` for a name in bold, which is wider. */
  texts: { x: number; y: number; text: string; bold?: boolean }[];
  /** Lines of the consanguinity labels, group `consanguinity-labels`. */
  coupleTexts: { x: number; y: number; text: string }[];
  /** The dashed arcs between two copies of someone, as polylines (group `duplicate-arcs`). */
  duplicateArcs: Pt[][];
  /** The chart title (`class="chart-title"`): its centre on the baseline, and the text. */
  titles: { x: number; y: number; text: string }[];
  /** The figure's width and height, from the root element. */
  size: Pt;
  /** False when the SVG has none of the drawing's groups. */
  structured: boolean;
  /** Offset of the pedigree group: canvas coordinates plus this give SVG coordinates. */
  origin: Pt;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([\da-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** Points of an "M x y L x y ..." path; null for anything with curves. */
function polyline(d: string): Pt[] | null {
  if (/[^MLml\d\s.,eE+-]/.test(d)) return null;
  const nums = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i]!, nums[i + 1]!]);
  return pts.length >= 2 ? pts : null;
}

/** The straight segments of a path of "M x y L x y" runs, such as `segmentsPathD` writes. */
function pathSegments(d: string): Seg[] {
  const out: Seg[] = [];
  let at: Pt | null = null;
  for (const m of d.matchAll(/([ML])\s*(-?[\d.]+(?:e[-+]?\d+)?)[\s,]+(-?[\d.]+(?:e[-+]?\d+)?)/gi)) {
    const p: Pt = [Number(m[2]), Number(m[3])];
    if (m[1]!.toUpperCase() === "L" && at) out.push([at[0], at[1], p[0], p[1]]);
    at = p;
  }
  return out;
}

/** Pull the drawn geometry out of an exportSvg string, in absolute SVG coordinates. */
export function parseExportSvg(svg: string): Parsed {
  const out: Parsed = { symbols: [], couples: [], sibs: [], assisted: [], texts: [], coupleTexts: [], duplicateArcs: [], titles: [], size: [0, 0], structured: false, origin: [0, 0] };
  type Frame = { name: string; dx: number; dy: number; group?: string; symbol?: boolean; mark?: boolean };
  const stack: Frame[] = [];
  const offset = () => stack.reduce<Pt>((a, f) => [a[0] + f.dx, a[1] + f.dy], [0, 0]);
  const group = () => [...stack].reverse().find(f => f.group)?.group;
  const inSymbol = () => stack.some(f => f.symbol);
  // Childless, ended and twin marks join nobody (`data-childless`, `data-ended`, `data-twin-mark`).
  const inMark = () => stack.some(f => f.mark);
  const skipped = () => stack.some(f => f.name === "defs" || f.name === "clipPath" || f.name === "marker" || f.group === "pedigree-key");
  const TAG = /<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let textStart = -1, textAt: Pt | null = null, textInto = out.texts, textBold = false;
  for (let m: RegExpExecArray | null; (m = TAG.exec(svg)); ) {
    const [, closing, name, attrText, selfClosing] = m;
    if (closing) {
      if (name === "text" && textAt && textStart >= 0) {
        const inner = svg.slice(textStart, m.index).replace(/<title>[^]*?<\/title>/g, "").replace(/<[^>]*>/g, "");
        textInto.push({ x: textAt[0], y: textAt[1], text: unescapeXml(inner), ...(textBold ? { bold: true } : {}) });
        textAt = null;
      }
      // Pop to the matching element (the exporter's markup is well formed).
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.name === name) { stack.length = i; break; }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of attrText!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    const t = /translate\(\s*(-?[\d.e+-]+)[\s,]+(-?[\d.e+-]+)\s*\)/.exec(attrs.transform ?? "");
    const [ox, oy] = offset();
    const g = group();
    const mark = "data-childless" in attrs || "data-ended" in attrs || "data-twin-mark" in attrs;
    if (name === "svg" && !stack.length) out.size = [Number(attrs.width), Number(attrs.height)];
    if (name === "g") {
      const frame: Frame = { name, dx: t ? Number(t[1]) : 0, dy: t ? Number(t[2]) : 0, mark };
      if (attrs.class) {
        frame.group = attrs.class;
        // The key is checked by keyPlacementProblems.
        if (attrs.class !== "pedigree-key" && attrs.class !== "chart-title" && !out.structured) { out.structured = true; out.origin = [ox, oy]; }
      }
      if (g === "symbols" && !inSymbol() && t) {
        frame.symbol = true;
        out.symbols.push([ox + frame.dx, oy + frame.dy]);
      }
      if (!selfClosing) stack.push(frame);
      continue;
    }
    if (!selfClosing && name !== "line" && name !== "path" && name !== "rect" && name !== "circle" && name !== "polygon") {
      stack.push({ name, dx: 0, dy: 0 });
    }
    // The chart title is in a group of its own, on purpose: it is not a label.
    if (name === "text" && g === "chart-title") {
      textStart = m.index + m[0].length;
      textAt = [Number(attrs.x) + ox, Number(attrs.y) + oy];
      textInto = out.titles;
      textBold = false;
    }
    if (name === "path" && g === "duplicate-arcs" && !skipped()) {
      const pts = pathPoints(attrs.d ?? "");
      if (pts.length > 1) out.duplicateArcs.push(pts.map(([x, y]) => [x + ox, y + oy] as Pt));
    }
    if (skipped() || inSymbol() || inMark() || mark) continue;
    if (name === "path" && g === "couple-lines" && !attrs["stroke-dasharray"]) {
      const pts = polyline(attrs.d ?? "");
      if (pts) out.couples.push(pts.map(([x, y]) => [x + ox, y + oy] as Pt));
    } else if (name === "path" && g === "sibship-lines") {
      for (const [x1, y1, x2, y2] of pathSegments(attrs.d ?? "")) out.sibs.push([x1 + ox, y1 + oy, x2 + ox, y2 + oy]);
    } else if (name === "line" && (g === "sibship-lines" || g === "assisted-lines")) {
      const n = (k: string) => Number(attrs[k]);
      (g === "sibship-lines" ? out.sibs : out.assisted).push([n("x1") + ox, n("y1") + oy, n("x2") + ox, n("y2") + oy]);
    } else if (name === "text" && (g === "labels" || g === "consanguinity-labels")) {
      textStart = m.index + m[0].length;
      textAt = [Number(attrs.x) + ox, Number(attrs.y) + oy];
      textInto = g === "labels" ? out.texts : out.coupleTexts;
      textBold = attrs["font-weight"] === "bold";
    }
  }
  return out;
}

/**
 * Lint an exported SVG as a file. `pedigree` is what was drawn (already
 * de-identified if the export was) and `scene` the scene of it, which the
 * file must hold, translated.
 */
export function lintExportSvg(pedigree: Pedigree, scene: Scene, svg: string): ExportLintFinding[] {
  const out: ExportLintFinding[] = [];
  const parsed = parseExportSvg(svg);
  if (!parsed.structured) {
    if (pedigree.individuals.length) {
      out.push({ code: "missing-from-file", message: "the export draws none of the drawing's groups", individuals: pedigree.individuals.map(i => i.id) });
    }
    return out;
  }
  const half = NODE_SIZE / 2;
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    return ind?.name ? `${ind.name} (${id})` : id;
  };
  const at = ([x, y]: Pt) => `(${Math.round(x)}, ${Math.round(y)})`;
  const [ox, oy] = parsed.origin;
  const toCanvas = ([x, y]: Pt): Pt => [x - ox, y - oy];
  const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
  const missing = (what: string, individuals: string[] = []) => out.push({ code: "missing-from-file", message: `${what} is not in the file`, individuals });
  const drawing = sceneDrawing(scene);

  // Symbols, both ways.
  const symbols = parsed.symbols.map(toCanvas);
  for (const n of scene.people) {
    if (!symbols.some(s => near(s, [n.position.x, n.position.y]))) missing(`the symbol of ${label(n.individual.id)}`, [n.individual.id]);
  }
  for (const s of symbols) {
    if (!scene.people.some(n => near(s, [n.position.x, n.position.y]))) {
      out.push({ code: "symbol-not-in-scene", message: `the file draws a symbol at ${at(s)}, where the scene has none`, individuals: [] });
    }
  }

  // Lines: each path, segment and arc the scene draws, at its place.
  const couples = parsed.couples.map(pts => pts.map(toCanvas));
  for (const c of drawing.couples) {
    const ids = [c.left.individual.id, c.right.individual.id];
    if (c.paths.some(pts => !couples.some(q => near(q[0]!, pts[0]!) && near(q[q.length - 1]!, pts[pts.length - 1]!)))) {
      missing(`the couple line ${ids.map(label).join(" = ")}`, ids);
    }
  }
  const sameSeg = (a: Seg, b: Seg) => (near([a[0], a[1]], [b[0], b[1]]) && near([a[2], a[3]], [b[2], b[3]]))
    || (near([a[0], a[1]], [b[2], b[3]]) && near([a[2], a[3]], [b[0], b[1]]));
  const shift = (segs: Seg[]) => segs.map(([x1, y1, x2, y2]): Seg => [x1 - ox, y1 - oy, x2 - ox, y2 - oy]);
  const sibs = shift(parsed.sibs), assisted = shift(parsed.assisted);
  const kidsOf = (childIds: string[]) => scene.people.filter(n => childIds.includes(n.id)).map(n => n.individual.id);
  for (const d of drawing.sibships) {
    if (d.segments.some(s => !sibs.some(t => sameSeg(s, t)))) missing(`a line of descent to ${kidsOf(d.edge.data.childIds).map(label).join(", ")}`, kidsOf(d.edge.data.childIds));
  }
  for (const d of drawing.assisted) {
    if (!assisted.some(t => sameSeg(d.segment, t))) missing(`a line of assisted reproduction to ${d.edge.data.children.map(label).join(", ")}`, d.edge.data.children);
  }
  const arcs = parsed.duplicateArcs.map(pts => pts.map(toCanvas));
  for (const a of drawing.arcs) {
    const first = a.points[0]!, last = a.points[a.points.length - 1]!;
    if (!arcs.some(q => near(q[0]!, first) && near(q[q.length - 1]!, last))) missing(`the dashed arc between the copies of ${label(a.from.individual.id)}`, [a.from.individual.id]);
  }

  // Text, line by line.
  const has = (list: Parsed["texts"], t: { x: number; y: number; text: string }) =>
    list.some(p => p.text === t.text && near(toCanvas([p.x, p.y]), [t.x, t.y]));
  for (const t of drawing.texts) {
    if (!has(parsed.texts, t)) missing(`the line "${t.text}" under ${label(t.person.individual.id)}`, [t.person.individual.id]);
  }
  for (const t of drawing.coupleTexts) {
    if (!has(parsed.coupleTexts, t)) missing(`the line "${t.text}" above a double line`);
  }

  // How the export composed the figure.
  type Box = [number, number, number, number];
  const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const textBox = (t: { x: number; y: number }, w: number, cap: number): Box => [t.x - w / 2 - 1, t.y - cap - 1, t.x + w / 2 + 1, t.y + 3];
  const segBox = ([x1, y1, x2, y2]: Seg): Box => [Math.min(x1, x2) - 1, Math.min(y1, y2) - 1, Math.max(x1, x2) + 1, Math.max(y1, y2) + 1];
  const symbolBox = ([x, y]: Pt): Box => [x - half - 4, y - half - 4, x + half + 4, y + half];
  const arcSegs = parsed.duplicateArcs.flatMap(segmentsOf);
  const coupleBoxes = parsed.coupleTexts.map(t => ({ t, box: textBox(t, consanguinityLabelWidth(t.text), 7) }));
  const drawn: Box[] = [
    ...parsed.symbols.map(symbolBox),
    ...parsed.texts.map(t => textBox(t, textWidth(t.text, t.bold ? NAME_CHAR_WIDTH : undefined), 8)),
    ...coupleBoxes.map(b => b.box),
    ...[...parsed.sibs, ...parsed.assisted, ...parsed.couples.flatMap(segmentsOf), ...arcSegs].map(segBox),
  ];

  // The chart title: nothing drawn over the top row may reach it.
  for (const t of parsed.titles) {
    const box = textBox(t, titleWidth(t.text), 10);
    const hit = (what: string) => out.push({ code: "title-collides", message: `the chart title "${t.text}" is drawn through ${what}`, individuals: [] });
    const sym = parsed.symbols.find(p => overlaps(box, symbolBox(p)));
    if (sym) hit(`the symbol at ${at(toCanvas(sym))}`);
    else if (arcSegs.some(s => overlaps(box, segBox(s)))) hit("a dashed arc between two copies");
    else {
      const label = coupleBoxes.find(o => overlaps(box, o.box));
      if (label) hit(`the label "${label.t.text}" above a double line`);
    }
  }

  // The key, in its corner, clear of everything drawn (#241).
  for (const message of keyPlacementProblems(svg)) out.push({ code: "key-collides", message, individuals: [] });
  // Everything inside the figure.
  const [w, h] = parsed.size;
  const outside = drawn.find(b => b[0] < 0 || b[1] < 0 || b[2] > w || b[3] > h);
  if (outside) out.push({ code: "outside-figure", message: `something is drawn at ${at([outside[0], outside[1]])}, outside the ${w} x ${h} figure`, individuals: [] });
  return out;
}

/**
 * Export a pedigree as SVG (standard layout) and lint it: the render lint on
 * the scene the export draws, then the file. `drawing: false` leaves out the
 * render lint, for a caller that has already run it on the same scene.
 */
export function lintExport(pedigree: Pedigree, options: SvgExportOptions = {}, { drawing = true } = {}): (ExportLintFinding | LintFinding)[] {
  const working = options.deidentify ? deidentify(pedigree, options) : drawnPedigree(pedigree);
  const scene = buildScene(working, { compact: options.compact, nameWeight: options.deidentify ? "regular" : undefined });
  return [
    ...(drawing ? lintScene(working, scene) : []),
    ...lintExportSvg(working, scene, exportSvg(pedigree, { ...options, uShape: false })),
  ];
}
