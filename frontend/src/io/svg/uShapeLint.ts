/**
 * Render lint for the consanguinity labels of the U-shape export (#109).
 * The standard export's lint (`exportLint.ts`) reads rows and columns; the
 * U-shape draws everything rotated with its track, so this one works on the
 * drawing itself: every line, arc, shape and piece of text in the SVG,
 * through the transforms of the groups they are in, is checked against the
 * box of each label (from cap height to below the descenders), in the
 * label's own rotated frame.
 *
 *   consanguinity-label-collides  a label runs into a line, a symbol or text
 *
 * The one exception: a label the exporter wrote on a white backing (a
 * `<rect fill="white">` in its group) may have the thin dashed link between
 * two copies of someone pass behind it.
 *
 * It relies on the exporter writing the labels in a
 * `<g class="consanguinity-labels">`, one `<g transform>` per label with its
 * `<text>` lines, and the key in a `<g class="pedigree-key">` (skipped).
 * Text width is the estimate the layout uses (`textWidth`), so it is a
 * check of the layout's arithmetic, as the other lints are.
 */
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { textWidth } from "../../pedigree/labels";
import type { ExportLintFinding } from "./exportLint";
import { exportUShapeSvg } from "./uShapeExporter";
import type { SvgExportOptions } from "./types";

type M = [number, number, number, number, number, number]; // a b c d e f
type P = [number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];

const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, [x, y]: P): P => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const invert = (m: M): M => {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
};

function parseTransform(t: string | undefined): M {
  let m = IDENTITY;
  if (!t) return m;
  for (const [, op, args] of t.matchAll(/(translate|rotate)\(([^)]*)\)/g)) {
    const v = args!.trim().split(/[\s,]+/).map(Number);
    if (op === "translate") m = mul(m, [1, 0, 0, 1, v[0]!, v[1] ?? 0]);
    else {
      const a = (v[0]! * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      const rot: M = [cos, sin, -sin, cos, 0, 0];
      if (v.length >= 3) m = mul(mul(mul(m, [1, 0, 0, 1, v[1]!, v[2]!]), rot), [1, 0, 0, 1, -v[1]!, -v[2]!]);
      else m = mul(m, rot);
    }
  }
  return m;
}

const attrsOf = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k!, v!]));
const num = (a: Record<string, string>, k: string) => Number(a[k] ?? 0);

/** Points along an SVG arc (rx = ry, no x-rotation) from p0 to p1. */
function arcPoints(p0: P, r: number, large: boolean, sweep: boolean, p1: P): P[] {
  const [x1, y1] = p0, [x2, y2] = p1;
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const d2 = dx * dx + dy * dy;
  const rr = Math.max(r, Math.sqrt(d2));
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rr * rr - d2) / d2));
  const cx = k * dy + (x1 + x2) / 2, cy = -k * dx + (y1 + y2) / 2;
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let da = Math.atan2(y2 - cy, x2 - cx) - a1;
  if (sweep && da < 0) da += 2 * Math.PI;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  const steps = Math.max(2, Math.ceil((Math.abs(da) * rr) / 4));
  return Array.from({ length: steps + 1 }, (_, i) => [cx + rr * Math.cos(a1 + (da * i) / steps), cy + rr * Math.sin(a1 + (da * i) / steps)] as P);
}

/** Polylines of a path's d (absolute M, L, Q, A, Z only, as the exporters write). */
function pathPolylines(d: string): P[][] {
  const out: P[][] = [];
  const tokens = d.match(/[MLQAZ]|-?[\d.]+(?:e-?\d+)?/gi) ?? [];
  let i = 0, cur: P = [0, 0], start: P = [0, 0], line: P[] = [];
  const n = () => Number(tokens[i++]);
  let cmd = "";
  while (i < tokens.length) {
    if (/[MLQAZ]/i.test(tokens[i]!)) cmd = tokens[i++]!.toUpperCase();
    if (cmd === "M") { if (line.length > 1) out.push(line); cur = [n(), n()]; start = cur; line = [cur]; cmd = "L"; }
    else if (cmd === "L") { cur = [n(), n()]; line.push(cur); }
    else if (cmd === "Q") {
      const c: P = [n(), n()], end: P = [n(), n()], from = cur;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12, u = 1 - t;
        line.push([u * u * from[0] + 2 * u * t * c[0] + t * t * end[0], u * u * from[1] + 2 * u * t * c[1] + t * t * end[1]]);
      }
      cur = end;
    }
    else if (cmd === "A") {
      const r = n(); n(); n(); const large = n() === 1, sweep = n() === 1; const end: P = [n(), n()];
      line.push(...arcPoints(cur, r, large, sweep, end).slice(1)); cur = end;
    } else if (cmd === "Z") { line.push(start); cur = start; cmd = ""; }
    else i++;
  }
  if (line.length > 1) out.push(line);
  return out;
}

const circlePolyline = (cx: number, cy: number, r: number): P[] =>
  Array.from({ length: 25 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 12), cy + r * Math.sin((i * Math.PI) / 12)] as P);

interface Label { m: M; lines: { text: string; y: number; size: number }[]; backed: boolean; x?: number }

/** Does the segment a-b come within `pad` of the box [x1, y1, x2, y2]? */
function segHitsBox(a: P, b: P, box: [number, number, number, number], pad: number): boolean {
  const [x1, y1, x2, y2] = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x1], [dx, x2 - a[0]], [-dy, a[1] - y1], [dy, y2 - a[1]]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/** Lint the consanguinity labels in a U-shape export SVG. */
export function lintUShapeSvg(svg: string): ExportLintFinding[] {
  const shapes: { what: string; pts: P[]; pad: number; dupLink?: boolean }[] = [];
  const labels: Label[] = [];
  const stack: { m: M; kind: string }[] = [{ m: IDENTITY, kind: "" }];
  const top = () => stack[stack.length - 1]!;
  const skipping = () => stack.some(s => s.kind === "skip");
  // A <text> with everything in it up to </text>, or any other tag.
  const re = /<text\b([^>]*)>([^]*?)<\/text>|<(\/?)(g|line|path|rect|circle|polygon|polyline|clipPath|defs|marker)\b([^>]*?)(\/?)>/g;
  for (const match of svg.matchAll(re)) {
    const isText = match[1] !== undefined;
    const [closing, tag, rawAttrs, selfClosing, textContent] = isText
      ? ["", "text", match[1], "", match[2]]
      : [match[3], match[4], match[5], match[6], undefined];
    if (["g", "clipPath", "defs", "marker"].includes(tag!) && closing) { stack.pop(); continue; }
    const a = attrsOf(rawAttrs!);
    if (tag === "g" || tag === "clipPath" || tag === "defs" || tag === "marker") {
      if (selfClosing) continue;
      const parent = top();
      const kind = tag !== "g" || a.class === "pedigree-key" ? "skip"
        : a.class === "consanguinity-labels" ? "labels"
        : parent.kind === "labels" ? "label" : parent.kind === "label" ? "label" : parent.kind;
      stack.push({ m: mul(parent.m, parseTransform(a.transform)), kind });
      if (kind === "label" && parent.kind === "labels") labels.push({ m: top().m, lines: [], backed: false });
      continue;
    }
    if (skipping() || a["clip-path"]) continue;
    const m = mul(top().m, parseTransform(a.transform));
    const inLabel = top().kind === "label";
    const at = (pts: P[]) => pts.map(p => apply(m, p));
    if (tag === "text") {
      const size = num(a, "font-size") || 10;
      const text = (textContent ?? "").replace(/<title>[^]*?<\/title>/g, "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, "x");
      // The standard export writes each line straight into the group (#97).
      if (top().kind === "labels") { labels.push({ m, lines: [{ text, y: num(a, "y"), size }], backed: false, x: num(a, "x") }); continue; }
      if (inLabel) { labels[labels.length - 1]!.lines.push({ text, y: num(a, "y"), size }); continue; }
      const w = textWidth(text) * size / 10;
      const x = num(a, "x"), y = num(a, "y");
      const left = a["text-anchor"] === "end" ? x - w : a["text-anchor"] === "middle" ? x - w / 2 : x;
      const box: P[] = [[left, y - 0.8 * size], [left + w, y - 0.8 * size], [left + w, y + 0.3 * size], [left, y + 0.3 * size], [left, y - 0.8 * size]];
      shapes.push({ what: `the text "${text}"`, pts: at(box), pad: 0 });
      continue;
    }
    if (inLabel) { if (tag === "rect" && a.fill === "white") labels[labels.length - 1]!.backed = true; continue; }
    const stroke = a.stroke && a.stroke !== "none" ? num(a, "stroke-width") || 1 : 0;
    const filled = a.fill && a.fill !== "none" && a.fill !== "white";
    if (!stroke && !filled) continue; // white backings and the background
    const pad = stroke / 2;
    const what = a["stroke-dasharray"] ? "a dashed line" : "a line or symbol";
    // The thin dashed link between two copies of someone (uShapeExporter's DUP_ATTRS).
    const dupLink = a["stroke-dasharray"] === "4 3" && stroke === 1;
    if (tag === "line") shapes.push({ what, pts: at([[num(a, "x1"), num(a, "y1")], [num(a, "x2"), num(a, "y2")]]), pad, dupLink });
    else if (tag === "rect") {
      const x = num(a, "x"), y = num(a, "y"), w = num(a, "width"), h = num(a, "height");
      shapes.push({ what, pts: at([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]), pad });
    } else if (tag === "circle") shapes.push({ what, pts: at(circlePolyline(num(a, "cx"), num(a, "cy"), num(a, "r"))), pad });
    else if (tag === "polygon" || tag === "polyline") {
      const v = (a.points ?? "").trim().split(/[\s,]+/).map(Number);
      const pts: P[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i]!, v[i + 1]!]);
      if (tag === "polygon" && pts.length) pts.push(pts[0]!);
      shapes.push({ what, pts: at(pts), pad });
    } else if (tag === "path") for (const pl of pathPolylines(a.d ?? "")) shapes.push({ what, pts: at(pl), pad });
  }

  const out: ExportLintFinding[] = [];
  for (const l of labels) {
    if (!l.lines.length) continue;
    const inv = invert(l.m);
    const w = Math.max(...l.lines.map(t => textWidth(t.text) * t.size / 10));
    const size = l.lines[0]!.size;
    const x = l.x ?? 0;
    const box: [number, number, number, number] = [
      x - w / 2 - 1, Math.min(...l.lines.map(t => t.y)) - 0.78 * size - 1,
      x + w / 2 + 1, Math.max(...l.lines.map(t => t.y)) + 0.25 * size,
    ];
    const text = l.lines.map(t => t.text).join(" ");
    // A label on a white backing may have a dashed link pass behind it.
    const hit = shapes.find(s => !(l.backed && s.dupLink) && s.pts.some((p, i) => i > 0 && segHitsBox(apply(inv, s.pts[i - 1]!), apply(inv, p), box, s.pad)));
    if (hit) out.push({ code: "consanguinity-label-collides", message: `in the U-shape export the label "${text}" runs into ${hit.what}`, individuals: [] });
  }
  return out;
}

/** Export a pedigree in the U shape and lint its consanguinity labels. */
export function lintUShape(pedigree: Pedigree, options: SvgExportOptions = {}): ExportLintFinding[] {
  return lintUShapeSvg(exportUShapeSvg(pedigree, { ...options, uShape: true }));
}
