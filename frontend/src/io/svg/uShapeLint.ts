/**
 * Render lint for the consanguinity labels of the U-shape export.
 * The standard export's drawing is checked on its scene (`renderLint.ts`); the
 * U-shape draws everything rotated with its track, so this one works on the
 * drawing itself: every line, arc, shape and piece of text in the SVG,
 * through the transforms of the groups they are in, is checked against the
 * box of each label (from cap height to below the descenders), in the
 * label's own rotated frame.
 *
 *   consanguinity-label-collides  a label runs into a line, a symbol or text
 *   title-collides                the chart title runs into anything drawn:
 *                                 a line or dashed arc, a symbol, a label
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
import { LABEL_CHAR_WIDTH, NAME_CHAR_WIDTH, textWidth, titleWidth, TITLE_FONT_SIZE } from "../../pedigree/labels";
import { exportUShapeSvg } from "./uShapeExporter";
import type { SvgExportOptions } from "./types";
import { keyPlacementProblems } from "./keyPlacement";
import { IDENTITY, apply, attrsOf, circlePolyline, invert, mul, num, parseTransform, pathPolylines, type M, type P } from "./svgGeometry";

export interface UShapeLintFinding {
  code: "consanguinity-label-collides" | "title-collides" | "key-collides";
  message: string;
  individuals: string[];
}

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
export function lintUShapeSvg(svg: string): UShapeLintFinding[] {
  const shapes: { what: string; pts: P[]; pad: number; dupLink?: boolean }[] = [];
  const labels: Label[] = [];
  const titles: { text: string; box: [number, number, number, number] }[] = [];
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
      // A clipped group (a symbol's sections) stays inside the outline, which is checked itself.
      const kind = tag !== "g" || a.class === "pedigree-key" || a["clip-path"] ? "skip"
        : a.class === "chart-title" ? "title"
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
      // Bold (a name) is wider than the regular estimate.
      const boldScale = a["font-weight"] === "bold" ? NAME_CHAR_WIDTH / LABEL_CHAR_WIDTH : 1;
      const text = (textContent ?? "").replace(/<title>[^]*?<\/title>/g, "").replace(/<[^>]*>/g, "").replace(/&#?[a-z0-9]+;/gi, "x");
      // The chart title, in a group of its own, upright: checked against everything below.
      if (top().kind === "title") {
        const w = titleWidth(text), [x, y] = apply(m, [num(a, "x"), num(a, "y")]);
        const fs = num(a, "font-size") || TITLE_FONT_SIZE;
        titles.push({ text, box: [x - w / 2, y - 0.8 * fs, x + w / 2, y + 0.3 * fs] });
        continue;
      }
      // The standard export writes each line straight into the group.
      if (top().kind === "labels") { labels.push({ m, lines: [{ text, y: num(a, "y"), size }], backed: false, x: num(a, "x") }); continue; }
      if (inLabel) { labels[labels.length - 1]!.lines.push({ text, y: num(a, "y"), size }); continue; }
      const w = textWidth(text) * size / 10 * boldScale;
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

  const out: UShapeLintFinding[] = [];
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
    const c: P[] = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]], [box[0], box[1]]];
    shapes.push({ what: `the label "${text}"`, pts: c.map(p => apply(l.m, p)), pad: 0 });
  }
  // The chart title: nothing drawn may reach it, the dashed links between copies included.
  for (const t of titles) {
    const [x1, y1, x2, y2] = t.box;
    const hit = shapes.find(s => s.pts.some((p, i) => (i > 0 && segHitsBox(s.pts[i - 1]!, p, t.box, s.pad))
      || (s.pts.length === 1 && p[0] >= x1 && p[0] <= x2 && p[1] >= y1 && p[1] <= y2)));
    if (hit) out.push({ code: "title-collides", message: `in the U-shape export the chart title "${t.text}" runs into ${hit.what}`, individuals: [] });
  }
  return out;
}

/** Export a pedigree in the U shape and lint its consanguinity labels. */
export function lintUShape(pedigree: Pedigree, options: SvgExportOptions = {}): UShapeLintFinding[] {
  const svg = exportUShapeSvg(pedigree, { ...options, uShape: true });
  return [
    ...lintUShapeSvg(svg),
    // The key, in its corner, clear of everything drawn (#241).
    ...keyPlacementProblems(svg).map(message => ({ code: "key-collides" as const, message, individuals: [] })),
  ];
}
