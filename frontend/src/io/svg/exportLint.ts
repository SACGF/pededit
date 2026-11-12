/**
 * Render lint for the standard SVG export (#72). The canvas lint
 * (`pedigree/renderLint.ts`) checks layoutToFlow's output, but `exportSvg`
 * draws its couple and sibship lines itself from the kinship2 layout, so a
 * mistake there would pass that lint. This one parses the exported SVG and
 * checks what it actually draws against the pedigree:
 *
 *   missing-individual     someone in the pedigree has no symbol in the export
 *   symbol-not-on-canvas   the export draws a symbol where the canvas has none
 *   missing-node           a couple or sibship line ends where nothing is drawn
 *   couple-not-partners    a couple line joins two people who are not partners
 *   partnership-not-drawn  a partnership has no couple line
 *   couple-through-symbol  a couple line passes through another symbol
 *   couple-lines-overlap   two couple lines share a stretch of the same row
 *   line-through-symbol    a sibship line passes through a symbol it does not end at
 *   child-without-parents  someone with parents has no line from those parents
 *   child-wrong-parents    the line above someone leads to a couple who are not the parents
 *   labels-overlap         two label lines on one row run into each other
 *   consanguinity-label-collides  the degree of relationship over a double line (#97)
 *                          runs into a symbol, a line or other text
 *
 * PNG and PDF are rasterised from this SVG, so the lint covers them too. The
 * U-shape export has its own geometry and is not checked here.
 *
 * Symbols are matched to people by position, against the canvas layout:
 * the export carries no ids (they could be names after a PED import, which
 * de-identification must not leak). It relies on the group classes
 * `exportSvg` writes (couple-lines, sibship-lines, symbols, labels) and the
 * `class="mark"` on childless and twin marks, which are not connecting lines.
 */
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "../../pedigree/constants";
import { layoutToFlow } from "../../pedigree/layoutToFlow";
import type { FlowData } from "../../pedigree/layoutToFlow";
import { textWidth } from "../../pedigree/labels";
import { consanguinityLabelWidth } from "../../pedigree/consanguinityLabel";
import { exportSvg } from "./svgExporter";
import { deidentify } from "./deidentify";
import { drawnPedigree } from "../../pedigree/collapse";
import type { SvgExportOptions } from "./types";

export type ExportLintCode =
  | "missing-individual"
  | "symbol-not-on-canvas"
  | "missing-node"
  | "couple-not-partners"
  | "partnership-not-drawn"
  | "couple-through-symbol"
  | "couple-lines-overlap"
  | "line-through-symbol"
  | "child-without-parents"
  | "child-wrong-parents"
  | "labels-overlap"
  | "consanguinity-label-collides";

export interface ExportLintFinding {
  code: ExportLintCode;
  message: string;
  individuals: string[];
}

type Pt = [number, number];
type Seg = [number, number, number, number];

/** Two drawn things closer than this (px) touch. */
const TOUCH = 1.5;
/** A sibship drop meets a double (consanguineous) couple line between its two lines, 2px from each. */
const COUPLE_TOUCH = 3;

interface Parsed {
  symbols: Pt[];
  couples: Pt[][];
  sibs: Seg[];
  texts: { x: number; y: number; text: string }[];
  /** Lines of the consanguinity labels (#97), group `consanguinity-labels`. */
  coupleTexts: { x: number; y: number; text: string }[];
  /** Baselines of the "?" marks over symbols (#100). */
  questionMarks: Pt[];
  /** False when the SVG has none of the groups exportSvg writes. */
  structured: boolean;
  /** Offset of the pedigree group: canvas coordinates plus this give SVG coordinates. */
  origin: Pt;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Points of an "M x y L x y ..." path; null for anything with curves. */
function polyline(d: string): Pt[] | null {
  if (/[^MLml\d\s.,eE+-]/.test(d)) return null;
  const nums = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i]!, nums[i + 1]!]);
  return pts.length >= 2 ? pts : null;
}

/** Pull the drawn geometry out of an exportSvg string, in absolute SVG coordinates. */
export function parseExportSvg(svg: string): Parsed {
  const out: Parsed = { symbols: [], couples: [], sibs: [], texts: [], coupleTexts: [], questionMarks: [], structured: false, origin: [0, 0] };
  type Frame = { name: string; dx: number; dy: number; group?: string; symbol?: boolean };
  const stack: Frame[] = [];
  const offset = () => stack.reduce<Pt>((a, f) => [a[0] + f.dx, a[1] + f.dy], [0, 0]);
  const group = () => [...stack].reverse().find(f => f.group)?.group;
  const inSymbol = () => stack.some(f => f.symbol);
  const skipped = () => stack.some(f => f.name === "defs" || f.name === "clipPath" || f.name === "marker" || f.group === "pedigree-key");
  const TAG = /<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let textStart = -1, textAt: Pt | null = null, textInto = out.texts;
  for (let m: RegExpExecArray | null; (m = TAG.exec(svg)); ) {
    const [, closing, name, attrText, selfClosing] = m;
    if (closing) {
      if (name === "text" && textAt && textStart >= 0) {
        const inner = svg.slice(textStart, m.index).replace(/<title>[^]*?<\/title>/g, "").replace(/<[^>]*>/g, "");
        textInto.push({ x: textAt[0], y: textAt[1], text: unescapeXml(inner) });
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
    if (name === "g") {
      const frame: Frame = { name, dx: t ? Number(t[1]) : 0, dy: t ? Number(t[2]) : 0 };
      if (attrs.class) {
        frame.group = attrs.class;
        if (attrs.class !== "pedigree-key" && !out.structured) { out.structured = true; out.origin = [ox, oy]; }
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
    if (name === "text" && attrs.class === "family-history-unknown" && !skipped()) {
      out.questionMarks.push([Number(attrs.x) + ox, Number(attrs.y) + oy]);
    }
    if (skipped() || inSymbol()) continue;
    if (attrs.class === "mark") continue;
    if (name === "path" && g === "couple-lines" && !attrs["stroke-dasharray"]) {
      const pts = polyline(attrs.d ?? "");
      if (pts) out.couples.push(pts.map(([x, y]) => [x + ox, y + oy] as Pt));
    } else if (name === "line" && g === "sibship-lines") {
      const n = (k: string) => Number(attrs[k]);
      out.sibs.push([n("x1") + ox, n("y1") + oy, n("x2") + ox, n("y2") + oy]);
    } else if (name === "text" && (g === "labels" || g === "consanguinity-labels")) {
      textStart = m.index + m[0].length;
      textAt = [Number(attrs.x) + ox, Number(attrs.y) + oy];
      textInto = g === "labels" ? out.texts : out.coupleTexts;
    }
  }
  return out;
}

/** Distance from point p to segment s. */
function distToSeg([px, py]: Pt, [x1, y1, x2, y2]: Seg): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Does segment s cross the open box centred on c with half-size h? (Liang-Barsky clip.) */
function segCrossesBox([x1, y1, x2, y2]: Seg, [cx, cy]: Pt, h: number): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, x1 - (cx - h)) && clip(dx, cx + h - x1) && clip(-dy, y1 - (cy - h)) && clip(dy, cy + h - y1) && t1 - t0 > 1e-6;
}

const segsOf = (pts: Pt[]): Seg[] => pts.slice(1).map((p, i) => [pts[i]![0], pts[i]![1], p[0], p[1]]);

/**
 * Lint an exported SVG. `pedigree` is what was drawn (already de-identified if
 * the export was) and `flow` the canvas layout of it, used to name symbols.
 */
export function lintExportSvg(pedigree: Pedigree, flow: FlowData, svg: string): ExportLintFinding[] {
  const out: ExportLintFinding[] = [];
  const parsed = parseExportSvg(svg);
  if (!parsed.structured) {
    if (pedigree.individuals.length) {
      out.push({ code: "missing-individual", message: "the export draws no pedigree groups at all", individuals: pedigree.individuals.map(i => i.id) });
    }
    return out;
  }
  const half = NODE_SIZE / 2;
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    return ind?.name ? `${ind.name} (${id})` : id;
  };
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const at = ([x, y]: Pt) => `(${Math.round(x)}, ${Math.round(y)})`;

  // exportSvg draws in canvas coordinates inside one translated group.
  const nodes = flow.nodes;
  const shift = parsed.origin;
  const toCanvas = ([x, y]: Pt): Pt => [x - shift[0], y - shift[1]];

  // 1. Symbols, named by the canvas node at the same place.
  const symbols: { pos: Pt; id: string }[] = [];
  for (const s of parsed.symbols) {
    const [x, y] = toCanvas(s);
    const node = nodes.find(n => Math.abs(n.position.x - x) < 0.5 && Math.abs(n.position.y - y) < 0.5);
    if (!node) {
      out.push({ code: "symbol-not-on-canvas", message: `the export draws a symbol at ${at([x, y])}, where the canvas has none`, individuals: [] });
      continue;
    }
    symbols.push({ pos: [x, y], id: node.data.individual.id });
  }
  const drawn = new Set(symbols.map(s => s.id));
  for (const ind of pedigree.individuals) {
    if (!drawn.has(ind.id)) out.push({ code: "missing-individual", message: `${label(ind.id)} has no symbol in the export`, individuals: [ind.id] });
  }
  /** Symbols whose box (grown by pad) contains p. */
  const symbolsAt = ([px, py]: Pt, pad = TOUCH) =>
    symbols.filter(s => Math.abs(s.pos[0] - px) <= half + pad && Math.abs(s.pos[1] - py) <= half + pad);
  /** The symbol a couple line ends in: its centre, or 2px off it for a double line. */
  const endSymbol = ([px, py]: Pt) =>
    symbols.find(s => Math.abs(s.pos[0] - px) < 0.5 && Math.abs(s.pos[1] - py) <= COUPLE_TOUCH);

  // 2. Couple lines.
  const partnerPairs = new Set(pedigree.partnerships.map(p => pairKey(p.individual1, p.individual2)));
  const couples: { pts: Pt[]; segs: Seg[]; key: string | null; ids: string[] }[] = [];
  const drawnPairs = new Set<string>();
  const reported = new Set<string>();
  const once = (key: string, f: ExportLintFinding) => { if (!reported.has(key)) { reported.add(key); out.push(f); } };
  for (const raw of parsed.couples) {
    const pts = raw.map(toCanvas);
    const a = endSymbol(pts[0]!), b = endSymbol(pts[pts.length - 1]!);
    const segs = segsOf(pts);
    if (!a || !b) {
      const end = !a ? pts[0]! : pts[pts.length - 1]!;
      const ids = [a, b].filter((s): s is { pos: Pt; id: string } => !!s).map(s => s.id);
      once(`missing-couple-${at(end)}`, { code: "missing-node", message: `a couple line ends at ${at(end)}, where no symbol is drawn${ids.length ? ` (its other end is ${label(ids[0]!)})` : ""}`, individuals: ids });
      couples.push({ pts, segs, key: null, ids });
      continue;
    }
    const key = pairKey(a.id, b.id);
    drawnPairs.add(key);
    couples.push({ pts, segs, key, ids: [a.id, b.id] });
    if (!partnerPairs.has(key)) {
      once(`np-${key}`, { code: "couple-not-partners", message: `a couple line joins ${label(a.id)} and ${label(b.id)}, who are not partners`, individuals: [a.id, b.id] });
    }
    for (const s of symbols) {
      if (s === a || s === b) continue;
      if (segs.some(sg => segCrossesBox(sg, s.pos, half - 1))) {
        once(`thru-${key}-${s.id}-${at(s.pos)}`, { code: "couple-through-symbol", message: `the couple line ${label(a.id)} = ${label(b.id)} runs through ${label(s.id)}`, individuals: [a.id, b.id, s.id] });
      }
    }
  }
  for (const p of pedigree.partnerships) {
    if (!drawn.has(p.individual1) || !drawn.has(p.individual2)) continue;
    if (!drawnPairs.has(pairKey(p.individual1, p.individual2))) {
      out.push({ code: "partnership-not-drawn", message: `partnership ${label(p.individual1)} = ${label(p.individual2)} has no couple line in the export`, individuals: [p.individual1, p.individual2] });
    }
  }
  const rise = (pts: Pt[]) => Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
  const flats = couples.flatMap(c => c.segs.filter(s => Math.abs(s[1] - s[3]) < 0.01 && c.key).map(s => ({ s, c })));
  for (let i = 0; i < flats.length; i++) {
    for (let j = i + 1; j < flats.length; j++) {
      const A = flats[i]!, B = flats[j]!;
      // A hop leaves its partner along the same stub as a flat line from them; the canvas lint allows that too.
      if (A.c.key === B.c.key || Math.abs(A.s[1] - B.s[1]) >= 1 || Math.abs(rise(A.c.pts) - rise(B.c.pts)) >= 1) continue;
      const overlap = Math.min(Math.max(A.s[0], A.s[2]), Math.max(B.s[0], B.s[2])) - Math.max(Math.min(A.s[0], A.s[2]), Math.min(B.s[0], B.s[2]));
      if (overlap > 1) {
        once(`ov-${[A.c.key, B.c.key].sort().join("/")}`, {
          code: "couple-lines-overlap",
          message: `couple lines ${A.c.ids.map(label).join(" = ")} and ${B.c.ids.map(label).join(" = ")} overlap in the export`,
          individuals: [...A.c.ids, ...B.c.ids],
        });
      }
    }
  }
  const onCouple = (p: Pt) => couples.filter(c => c.segs.some(s => distToSeg(p, s) <= COUPLE_TOUCH));

  // 3. Sibship lines: where they end, what they cross, and which couple each child hangs from.
  const sibs = parsed.sibs.map(([x1, y1, x2, y2]): Seg => {
    const [a, b] = [toCanvas([x1, y1]), toCanvas([x2, y2])];
    return [a[0], a[1], b[0], b[1]];
  });
  const ends = (s: Seg): Pt[] => [[s[0], s[1]], [s[2], s[3]]];
  sibs.forEach((s, i) => {
    for (const e of ends(s)) {
      if (symbolsAt(e).length) continue;
      if (sibs.some((t, j) => j !== i && distToSeg(e, t) <= TOUCH)) continue;
      if (onCouple(e).length) continue;
      once(`dangle-${at(e)}`, { code: "missing-node", message: `a sibship line ends at ${at(e)}, where nothing is drawn`, individuals: [] });
    }
    for (const sym of symbols) {
      if (ends(s).some(e => symbolsAt(e).includes(sym))) continue;
      if (segCrossesBox(s, sym.pos, half - 1)) {
        once(`lts-${sym.id}-${at(sym.pos)}`, { code: "line-through-symbol", message: `a sibship line runs through ${label(sym.id)} in the export`, individuals: [sym.id] });
      }
    }
  });
  const touches = (s: Seg, t: Seg) => ends(t).some(e => distToSeg(e, s) <= TOUCH) || ends(s).some(e => distToSeg(e, t) <= TOUCH);
  const parentsOf = new Map<string, string>();
  for (const [pid, kids] of Object.entries(pedigree.parentOf)) for (const k of kids) parentsOf.set(k, pid);
  const partnershipById = new Map(pedigree.partnerships.map(p => [p.id, p]));
  for (const [child, pid] of parentsOf) {
    const p = partnershipById.get(pid);
    if (!p || !drawn.has(child)) continue;
    const want = pairKey(p.individual1, p.individual2);
    // Every line connected to a line ending at any copy of the child, then the couples those reach.
    const mine = symbols.filter(s => s.id === child);
    const seen = new Set<number>(sibs.flatMap((s, i) => (ends(s).some(e => symbolsAt(e).some(x => mine.includes(x))) ? [i] : [])));
    const queue = [...seen];
    while (queue.length) {
      const i = queue.pop()!;
      sibs.forEach((t, j) => { if (!seen.has(j) && touches(sibs[i]!, t)) { seen.add(j); queue.push(j); } });
    }
    const got = new Set<string>();
    for (const i of seen) for (const e of ends(sibs[i]!)) for (const c of onCouple(e)) if (c.key) got.add(c.key);
    if (got.has(want)) continue;
    if (got.size) {
      const [from] = [...got];
      out.push({
        code: "child-wrong-parents",
        message: `in the export ${label(child)} hangs from ${from!.split("|").map(label).join(" = ")}, not from their parents ${label(p.individual1)} = ${label(p.individual2)}`,
        individuals: [child, p.individual1, p.individual2],
      });
    } else {
      out.push({
        code: "child-without-parents",
        message: `in the export ${label(child)} has no line from their parents ${label(p.individual1)} = ${label(p.individual2)}`,
        individuals: [child, p.individual1, p.individual2],
      });
    }
  }

  // 4. Label lines on one baseline running into each other.
  const texts = parsed.texts.map(t => ({ ...t, w: textWidth(t.text) }));
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const A = texts[i]!, B = texts[j]!;
      if (Math.abs(A.y - B.y) >= 1 || !A.w || !B.w) continue;
      if (Math.abs(A.x - B.x) - (A.w + B.w) / 2 < 2) {
        out.push({ code: "labels-overlap", message: `the export labels "${A.text}" and "${B.text}" overlap`, individuals: [] });
      }
    }
  }

  // 5. Consanguinity labels (#97): the text box, from cap height to just
  // below the baseline, must touch no symbol (slash included), line or
  // other text.
  type Box = [number, number, number, number];
  const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const textBox = (t: { x: number; y: number }, w: number, cap: number): Box => [t.x - w / 2 - 1, t.y - cap - 1, t.x + w / 2 + 1, t.y + 3];
  const segBox = ([x1, y1, x2, y2]: Seg): Box => [Math.min(x1, x2) - 1, Math.min(y1, y2) - 1, Math.max(x1, x2) + 1, Math.max(y1, y2) + 1];
  const lineSegs: Seg[] = [...parsed.sibs, ...parsed.couples.flatMap(segsOf)];
  const coupleBoxes = parsed.coupleTexts.map(t => ({ t, box: textBox(t, consanguinityLabelWidth(t.text), 7) }));
  coupleBoxes.forEach(({ t, box }, i) => {
    const hit = (what: string) => out.push({
      code: "consanguinity-label-collides",
      message: `the label "${t.text}" above a double line runs into ${what}`,
      individuals: [],
    });
    const sym = parsed.symbols.find(([x, y]) => overlaps(box, [x - half - 4, y - half - 4, x + half + 4, y + half]));
    if (sym) { hit(`the symbol at ${at(toCanvas(sym))}`); return; }
    const q = parsed.questionMarks.find(([x, y]) => overlaps(box, [x - 4, y - 10, x + 4, y + 1]));
    if (q) { hit(`the "?" at ${at(toCanvas(q))}`); return; }
    if (lineSegs.some(s => overlaps(box, segBox(s)))) { hit("a line"); return; }
    const other = texts.find(o => o.w && overlaps(box, textBox(o, o.w, 8)));
    if (other) { hit(`the label "${other.text}"`); return; }
    const twin = coupleBoxes.find((o, j) => j !== i && overlaps(box, o.box));
    if (twin) hit(`the label "${twin.t.text}"`);
  });
  return out;
}

/** Export a pedigree as SVG (standard layout) and lint what it draws. */
export function lintExport(pedigree: Pedigree, options: SvgExportOptions = {}): ExportLintFinding[] {
  const working = options.deidentify ? deidentify(pedigree, options) : drawnPedigree(pedigree);
  return lintExportSvg(working, layoutToFlow(working, { compact: options.compact }), exportSvg(pedigree, { ...options, uShape: false }));
}
