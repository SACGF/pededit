/**
 * Keeping the dashed arc between two copies of someone off other people:
 * what an arc passes through (shared with the render lint), and the choice
 * of a route round it when the usual curve passes through a symbol or the
 * text under one.
 */
import type { TextBlock } from "./consanguinityLabel";
import { duplicateArcPoints } from "./couplePath";

/** Someone the arc does not belong to: their symbol's centre and the text under it. */
export interface ArcObstacle { id: string; x: number; y: number; text: TextBlock | null }

/** A drawn line, as [x1, y1, x2, y2]. */
export type ArcLine = [number, number, number, number];

/** Does the segment from (x1, y1) to (x2, y2) pass inside the box? (Liang-Barsky clip.) */
function segmentInBox(x1: number, y1: number, x2: number, y2: number, left: number, top: number, right: number, bottom: number): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, x1 - left) && clip(dx, right - x1) && clip(-dy, y1 - top) && clip(dy, bottom - y1) && t1 - t0 > 1e-6;
}

/** Lowest a routed arc runs above the lower row's symbol tops (px), and the step between two heights. */
const ARC_RUN_MIN = 8, ARC_RUN_STEP = 7;

/**
 * Whose symbol and whose text a dashed arc (as points along it) passes
 * through. A symbol counts from 1px inside its box, text from its box as the
 * export writes it (`textBlockUnder`), so an arc may run along either.
 * Text that hangs to within ARC_RUN_MIN of the symbol tops the arc ends at
 * is not counted: no arc could pass under it (compact rows with four lines
 * of text).
 */
export function arcCollisions(pts: [number, number][], others: ArcObstacle[], half: number): { symbols: string[]; labels: string[] } {
  const through = (l: number, t: number, r: number, b: number) =>
    pts.slice(1).some(([x, y], i) => segmentInBox(pts[i]![0], pts[i]![1], x, y, l, t, r, b));
  // Both kinds of arc end at a symbol top; across rows the lower end is the lower copy's.
  const tops = pts.length ? Math.max(pts[0]![1], pts[pts.length - 1]![1]) : Infinity;
  const symbols = new Set<string>(), labels = new Set<string>();
  for (const o of others) {
    if (through(o.x - half + 1, o.y - half + 1, o.x + half - 1, o.y + half - 1)) symbols.add(o.id);
    if (o.text && o.text.top < tops && o.text.bottom > tops - ARC_RUN_MIN) continue;
    if (o.text && through(o.text.x - o.text.halfWidth, o.text.top, o.text.x + o.text.halfWidth, o.text.bottom)) labels.add(o.id);
  }
  return { symbols: [...symbols], labels: [...labels] };
}

/** How many px of the line through `pts` run along a drawn line, within 4px of it. Crossing one counts nothing. */
function lengthAlongLines(pts: [number, number][], lines: ArcLine[]): number {
  let on = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const n = Math.max(1, Math.ceil(len / 2));
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * (k + 0.5)) / n, y = ay + ((by - ay) * (k + 0.5)) / n;
      const along = lines.some(([x1, y1, x2, y2]) => {
        const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
        if (len2 === 0 || Math.abs((bx - ax) * dy - (by - ay) * dx) > 0.3 * len * Math.sqrt(len2)) return false;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
        return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) <= 4;
      });
      if (along) on += len / n;
    }
  }
  return on;
}

/** What going round the far side of the upper copy costs, in px of running along a line. */
const FAR_SIDE_COST = 8;

/**
 * The route for the arc between copies at `a` and `b` when its usual line
 * passes through someone's symbol or text and another does better; undefined
 * to keep the usual one. Symbols count most, then text, then running along a
 * line (a sibship bar is about where a route runs).
 *
 * On one row the only choice is a flatter arc (a smaller `bulge`), which can
 * pass under text hanging from the row above. Across rows it is the `legDx`
 * and `bulge` of `duplicateArcD`: down the gap on one side of the upper copy
 * and along above the lower row. `taken` are the heights other routed arcs
 * ending on this row run at, so that two never run along each other.
 */
export function chooseArcRoute(
  a: { x: number; y: number }, b: { x: number; y: number },
  bulge: number, half: number, slotWidth: number,
  others: ArcObstacle[], lines: ArcLine[], taken: number[] = [],
): { legDx?: number; bulge: number } | undefined {
  const cost = (rise: number, legDx?: number) => {
    const pts = duplicateArcPoints(a.x, a.y, b.x, b.y, rise, half, 24, legDx);
    const hit = arcCollisions(pts, others, half);
    return { hits: hit.symbols.length + hit.labels.length, cost: 1000 * hit.symbols.length + 100 * hit.labels.length + lengthAlongLines(pts, lines) };
  };
  const usual = cost(bulge);
  if (usual.hits === 0) return undefined;
  const heights: number[] = [];
  for (let h = bulge; h >= Math.min(bulge, ARC_RUN_MIN); h -= ARC_RUN_STEP) heights.push(h);
  let best: { legDx?: number; bulge: number } | undefined, bestCost = usual.cost;
  const consider = (h: number, legDx: number | undefined, extra = 0) => {
    const c = cost(h, legDx).cost + extra;
    if (c < bestCost - 1e-6) { best = legDx === undefined ? { bulge: h } : { legDx, bulge: h }; bestCost = c; }
  };
  if (Math.abs(a.y - b.y) < 2 * half) {
    for (const h of heights.slice(1)) consider(h, undefined);
    return best;
  }
  const [upper, lower] = a.y < b.y ? [a, b] : [b, a];
  const facing = lower.x >= upper.x ? 1 : -1;
  const free = heights.filter(h => !taken.some(t => Math.abs(t - h) < 1));
  for (const legDx of [facing * slotWidth / 2, -facing * slotWidth / 2]) {
    for (const h of free.length ? free : heights) consider(h, legDx, Math.sign(legDx) === facing ? 0 : FAR_SIDE_COST);
  }
  return best;
}
