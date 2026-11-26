/**
 * The dashed arc between two copies of someone: its path, and keeping it
 * off other people: what an arc passes through (shared with the render
 * lint), and the choice of a route round it when the usual curve passes
 * through a symbol or the text under one.
 */
import type { TextBlock } from "./geometryTypes";
import { pathPoints } from "./couplePath";

/** Corner radius (px) of a dashed arc routed between two rows. */
const ARC_CORNER = 10;
/** How far (px) before the lower copy a routed arc starts to turn down into its top. */
const ARC_LANDING = 36;

/**
 * SVG path for the dashed line joining two copies of one person, given the
 * symbol centres and half the symbol size.
 *
 * On one row it is an arc over the symbol tops whose highest point is `bulge`
 * px above them, as in R's plot.pedigree (arcconnect). Across rows R uses the
 * same arc, which rises into the upper row's sibship bar and falls through
 * labels; here it leaves the upper copy's side facing the lower copy and bends
 * down into the lower copy's top instead.
 *
 * That curve runs along the upper row, so with anyone between the copies it
 * passes through their symbols. `legDx` routes it round them: out of the
 * upper copy's side to `legDx` px from its centre (the gap beside it), down
 * between the two rows, along `bulge` px above the lower row's symbol tops,
 * where an arc on that row runs, and down into the lower copy's top.
 * `chooseArcRoute` decides when.
 */
export function duplicateArcD(
  x1: number, y1: number, x2: number, y2: number,
  bulge: number, half: number, legDx?: number,
): string {
  // Within a symbol's height counts as one row (a pin nudged off its row).
  if (Math.abs(y1 - y2) < 2 * half) {
    const ay = y1 - half, by = y2 - half;
    // A quadratic Bezier peaks halfway to its control point.
    const cy = 2 * (Math.min(ay, by) - bulge) - (ay + by) / 2;
    return `M ${x1} ${ay} Q ${(x1 + x2) / 2} ${cy} ${x2} ${by}`;
  }
  const [ux, uy, lx, ly] = y1 < y2 ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  if (legDx) {
    const side = Math.sign(legDx);
    const sx = ux + side * half, legX = ux + legDx, runY = ly - half - bulge, endY = ly - half;
    // Out of the side and round the first corner, down the leg.
    const r1 = Math.max(0, Math.min(ARC_CORNER, Math.abs(legX - sx), (runY - uy) / 2));
    const start = `M ${sx} ${uy} L ${legX - side * r1} ${uy} Q ${legX} ${uy} ${legX} ${uy + r1}`;
    const along = Math.sign(lx - legX), reach = Math.abs(lx - legX);
    const r2 = Math.min(ARC_CORNER, (runY - uy) / 2, reach / 2);
    // The lower copy is under the leg: straight down into its top.
    if (reach < 1) return `${start} L ${legX} ${endY}`;
    // Along the run, then slanting down into the top as an arc on one row does.
    const landing = Math.min(ARC_LANDING, reach - r2);
    return `${start} L ${legX} ${runY - r2} Q ${legX} ${runY} ${legX + along * r2} ${runY}`
      + ` L ${lx - along * landing} ${runY} Q ${lx - along * landing / 4} ${runY} ${lx} ${endY}`;
  }
  const dir = lx >= ux ? 1 : -1;
  const sx = ux + dir * half;
  const cx = dir > 0 ? Math.max(lx, sx + half) : Math.min(lx, sx - half);
  return `M ${sx} ${uy} Q ${cx} ${uy} ${lx} ${ly - half}`;
}

/** Points along `duplicateArcD`'s line, for keeping text off it. */
export function duplicateArcPoints(
  x1: number, y1: number, x2: number, y2: number,
  bulge: number, half: number, steps = 12, legDx?: number,
): [number, number][] {
  return pathPoints(duplicateArcD(x1, y1, x2, y2, bulge, half, legDx), steps);
}

/**
 * The highest point any dashed arc between two copies reaches, or Infinity
 * when there is none. An arc on one row rises `bulge` above the symbols, so
 * in the top row it is the highest thing drawn.
 */
export function highestDuplicateArc(scene: {
  people: { id: string; position: { x: number; y: number } }[];
  duplicates: { source: string; target: string; data: { bulge: number; legDx?: number } }[];
}, half: number): number {
  const pos = new Map(scene.people.map(n => [n.id, n.position]));
  let top = Infinity;
  for (const e of scene.duplicates) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (!a || !b) continue;
    for (const [, y] of duplicateArcPoints(a.x, a.y, b.x, b.y, e.data.bulge, half, 12, e.data.legDx)) top = Math.min(top, y);
  }
  return top;
}

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
