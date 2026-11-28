/**
 * Where the key goes in an exported figure (#241): in a corner, in the
 * chart's free space when there is room, the figure growing at that edge
 * only by what is missing. One rule for the standard and the U-shape
 * figure: each draws itself without the key, this reads back what it drew
 * (`drawnBoxes`), and `placeKey` puts the key in.
 *
 * In a corner the key keeps its left or right edge on the figure's padding.
 * Over the key's width (and half the padding either side), the drawn thing
 * nearest the chosen edge decides: the key sits against that edge when the
 * gap holds the key plus half the padding, the clearance the band under the
 * chart had; otherwise the figure grows at that edge by the shortfall.
 * Only a clear run to the edge counts, so the key never goes into a pocket
 * enclosed by lines.
 */
import { LABEL_CHAR_WIDTH, NAME_CHAR_WIDTH, textWidth } from "../../pedigree/labels";
import { IDENTITY, apply, attrsOf, circlePolyline, mul, num, parseTransform, pathPolylines, type M, type P } from "./svgGeometry";
import type { KeyPosition } from "./types";

/** The corners, in the order the best one is chosen on a tie: bottom left first, where the key was before corners. */
export const KEY_POSITIONS: readonly KeyPosition[] = ["bottom-left", "bottom-right", "top-left", "top-right"];

/** An axis-aligned box in figure coordinates. */
export interface Box { x1: number; y1: number; x2: number; y2: number }

/**
 * The box of everything a figure draws, outside the key: lines, symbols,
 * marks and text (estimated as the layout estimates it, bold names wider),
 * with every transform applied, so the U-shape's turned symbols and text
 * are boxed where they land. White fills with no stroke (the background
 * and text backings) draw nothing of their own and are left out; so is
 * what is inside a clipped group (a symbol's sections stay inside its
 * outline, which is boxed itself).
 */
export function drawnBoxes(svg: string): Box[] {
  const out: Box[] = [];
  const stack: { m: M; skip: boolean }[] = [{ m: IDENTITY, skip: false }];
  const top = () => stack[stack.length - 1]!;
  const re = /<text\b([^>]*)>([^]*?)<\/text>|<(\/?)(g|line|path|rect|circle|ellipse|polygon|polyline|clipPath|defs|marker)\b([^>]*?)(\/?)>/g;
  const push = (pts: P[], pad: number) => {
    if (pts.length === 0) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    out.push({ x1: Math.min(...xs) - pad, y1: Math.min(...ys) - pad, x2: Math.max(...xs) + pad, y2: Math.max(...ys) + pad });
  };
  for (const match of svg.matchAll(re)) {
    if (match[1] !== undefined) {
      if (top().skip) continue;
      const a = attrsOf(match[1]);
      const text = match[2]!.replace(/<title>[^]*?<\/title>/g, "").replace(/<[^>]*>/g, "").replace(/&#?[a-z0-9]+;/gi, "x");
      if (!text.trim()) continue;
      const size = num(a, "font-size") || 10;
      const bold = a["font-weight"] === "bold" ? NAME_CHAR_WIDTH / LABEL_CHAR_WIDTH : 1;
      const w = textWidth(text) * size / 10 * bold;
      const x = num(a, "x"), y = num(a, "y");
      const left = a["text-anchor"] === "end" ? x - w : a["text-anchor"] === "middle" ? x - w / 2 : x;
      const m = mul(top().m, parseTransform(a.transform));
      push([[left, y - 0.8 * size], [left + w, y - 0.8 * size], [left + w, y + 0.3 * size], [left, y + 0.3 * size]].map(p => apply(m, p as P)), 0);
      continue;
    }
    const [closing, tag, rawAttrs, selfClosing] = [match[3], match[4]!, match[5]!, match[6]];
    const group = tag === "g" || tag === "clipPath" || tag === "defs" || tag === "marker";
    if (group && closing) { if (stack.length > 1) stack.pop(); continue; }
    if (closing) continue;
    const a = attrsOf(rawAttrs);
    if (group) {
      if (selfClosing) continue;
      const parent = top();
      const skip = parent.skip || tag !== "g" || a.class === "pedigree-key" || !!a["clip-path"];
      stack.push({ m: mul(parent.m, parseTransform(a.transform)), skip });
      continue;
    }
    if (top().skip || a["clip-path"]) continue;
    const stroke = a.stroke && a.stroke !== "none" ? num(a, "stroke-width") || 1 : 0;
    const filled = !!a.fill && a.fill !== "none" && a.fill !== "white" && a.fill !== "transparent";
    if (!stroke && !filled) continue;
    // An arrowhead (`marker-end`) reaches past the line's end by its length.
    const pad = stroke / 2 + (a["marker-end"] ? 6 * Math.max(1, stroke) : 0);
    const m = mul(top().m, parseTransform(a.transform));
    const at = (pts: P[]) => pts.map(p => apply(m, p));
    if (tag === "line") push(at([[num(a, "x1"), num(a, "y1")], [num(a, "x2"), num(a, "y2")]]), pad);
    else if (tag === "rect") {
      const x = num(a, "x"), y = num(a, "y"), w = num(a, "width"), h = num(a, "height");
      push(at([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), pad);
    } else if (tag === "circle") push(at(circlePolyline(num(a, "cx"), num(a, "cy"), num(a, "r"))), pad);
    else if (tag === "ellipse") {
      const cx = num(a, "cx"), cy = num(a, "cy"), rx = num(a, "rx"), ry = num(a, "ry");
      push(at([[cx - rx, cy - ry], [cx + rx, cy - ry], [cx + rx, cy + ry], [cx - rx, cy + ry]]), pad);
    } else if (tag === "polygon" || tag === "polyline") {
      const v = (a.points ?? "").trim().split(/[\s,]+/).map(Number);
      const pts: P[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i]!, v[i + 1]!]);
      push(at(pts), pad);
    } else if (tag === "path") for (const pl of pathPolylines(a.d ?? "")) push(at(pl), pad);
  }
  return out;
}

/** Where the key goes and how much the figure grows at its top and bottom edges. */
export interface KeyPlace {
  position: KeyPosition;
  /** The key's top left corner, in the grown figure. */
  x: number;
  y: number;
  /** Added at the top: everything else moves down by this much. */
  growTop: number;
  /** Added at the bottom. */
  growBottom: number;
}

/**
 * The key, `key` wide and high, in the `position` corner of a figure
 * `figure` in size that draws `boxes`, `padding` from its edges.
 */
export function placeKey(
  boxes: Box[], figure: { width: number; height: number }, key: { width: number; height: number },
  padding: number, position: KeyPosition,
): KeyPlace {
  const x = position.endsWith("left") ? padding : figure.width - padding - key.width;
  const clear = padding / 2;
  const over = boxes.filter(b => b.x2 > x - clear && b.x1 < x + key.width + clear);
  if (position.startsWith("bottom")) {
    const lowest = Math.max(-Infinity, ...over.map(b => b.y2));
    const free = figure.height - padding - (over.length ? lowest + clear : padding);
    const grow = Math.max(0, Math.ceil(key.height - free));
    return { position, x, y: figure.height + grow - padding - key.height, growTop: 0, growBottom: grow };
  }
  const highest = Math.min(Infinity, ...over.map(b => b.y1));
  const free = (over.length ? highest - clear : figure.height - padding) - padding;
  const grow = Math.max(0, Math.ceil(key.height - free));
  return { position, x, y: padding, growTop: grow, growBottom: 0 };
}

/**
 * The corner that grows the figure least, or `position` when one is asked
 * for. A top corner that grows the figure puts the key above everything,
 * the title too, so it counts half the padding (the key's clearance) worse
 * than it is: it wins only on a real saving, not on where text boxes start.
 * `KEY_POSITIONS` order on a tie.
 */
export function chooseKeyPlace(
  boxes: Box[], figure: { width: number; height: number }, key: { width: number; height: number },
  padding: number, position?: KeyPosition,
): KeyPlace {
  if (position) return placeKey(boxes, figure, key, padding, position);
  let best: KeyPlace | null = null;
  for (const p of KEY_POSITIONS) {
    const place = placeKey(boxes, figure, key, padding, p);
    const cost = (k: KeyPlace) => k.growBottom + (k.growTop > 0 ? k.growTop + padding / 2 : 0);
    if (!best || cost(place) < cost(best)) best = place;
  }
  return best!;
}

/**
 * A figure's SVG with the key put in: `body` is everything inside the
 * `<svg>` but the background, drawn for a figure `figure` in size, and
 * `keyMarkup` the key drawn with its left edge at x = `padding`, top at 0
 * (`exportKeyMarkup(pedigree, padding, 0)`). The key's group says its
 * corner (`data-key-position`) for the export dialog, and its box
 * (`data-box`: x, y, width, height) for the lint.
 */
export function withKey(
  body: string[], figure: { width: number; height: number }, defs: string,
  key: { markup: string[]; width: number; height: number }, padding: number, position?: KeyPosition,
): { svg: string; position?: KeyPosition } {
  const doc = (width: number, height: number, inner: string[]) => [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    defs,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    ...inner,
    `</svg>`,
  ].join("\n");
  const boxes = drawnBoxes(doc(figure.width, figure.height, body));
  figure = trimBottom(boxes, figure, padding);
  if (key.height <= 0) return { svg: doc(figure.width, figure.height, body) };
  const place = chooseKeyPlace(boxes, figure, key, padding, position);
  const height = figure.height + place.growTop + place.growBottom;
  const moved = place.growTop > 0 ? [`<g transform="translate(0 ${place.growTop})">`, ...body, `</g>`] : body;
  const keyGroup = [
    `<g class="pedigree-key" data-key-position="${place.position}" data-box="${round(place.x)} ${round(place.y)} ${round(key.width)} ${round(key.height)}" transform="translate(${round(place.x - padding)} ${round(place.y)})">`,
    ...key.markup,
    `</g>`,
  ];
  return { svg: doc(figure.width, height, [...moved, ...keyGroup]), position: place.position };
}

/**
 * The figure ending `padding` under the lowest thing drawn. The exporters
 * size a figure from the scene's bounds, which allow under the lowest row
 * for the most lines of text anyone has; when the lowest row has fewer,
 * that room would be blank, under the chart or under a bottom corner's key.
 */
function trimBottom(boxes: Box[], figure: { width: number; height: number }, padding: number): { width: number; height: number } {
  if (boxes.length === 0) return figure;
  const lowest = Math.max(...boxes.map(b => b.y2));
  return { width: figure.width, height: Math.min(figure.height, Math.ceil(lowest + padding)) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The corner a figure put its key in, read from the file; undefined when it has none. */
export function keyPositionOf(svg: string): KeyPosition | undefined {
  return /data-key-position="([a-z-]+)"/.exec(svg)?.[1] as KeyPosition | undefined;
}

/**
 * The key of a figure against everything else it draws: a finding when the
 * key overlaps something or reaches outside the figure.
 */
export function keyPlacementProblems(svg: string): string[] {
  const box = /<g class="pedigree-key"[^>]*data-box="([^"]*)"/.exec(svg)?.[1];
  if (!box) return [];
  const [x, y, w, h] = box.split(" ").map(Number) as [number, number, number, number];
  const size = /<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg);
  const out: string[] = [];
  if (size && (x < 0 || y < 0 || x + w > Number(size[1]) + 0.5 || y + h > Number(size[2]) + 0.5)) out.push("the key reaches outside the figure");
  const hit = drawnBoxes(svg).find(b => b.x2 > x && b.x1 < x + w && b.y2 > y && b.y1 < y + h);
  if (hit) out.push(`the key overlaps something drawn at (${Math.round(hit.x1)}, ${Math.round(hit.y1)})`);
  return out;
}
