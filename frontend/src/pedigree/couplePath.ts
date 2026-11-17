import { COUPLE_HOP, COUPLE_HOP_STEP, COUPLE_HOP_INSET, COUPLE_HOP_INSET_STEP, COUPLE_HOP_INSET_MIN } from "./constants";

/**
 * Rise and inset of a couple line whose partners are `span` slots apart
 * (1 = adjacent, no hop). Wider hops rise higher and turn up closer to the
 * symbols (see COUPLE_HOP_INSET_STEP), so nested hops never share a riser.
 */
export function hopGeometry(span: number): { hopHeight: number; hopInset: number } {
  if (span <= 1) return { hopHeight: 0, hopInset: COUPLE_HOP_INSET };
  return {
    hopHeight: COUPLE_HOP + (span - 2) * COUPLE_HOP_STEP,
    hopInset:  Math.max(COUPLE_HOP_INSET_MIN, COUPLE_HOP_INSET - (span - 2) * COUPLE_HOP_INSET_STEP),
  };
}

/**
 * SVG path for a couple line from the right edge of the left partner (x1, y1)
 * to the left edge of the right partner (x2, y2).
 *
 * hopHeight = 0 draws a straight line. Otherwise the line runs a short way
 * out, rises by hopHeight, passes over whatever sits between the partners and
 * drops back down just before the right partner. Used when someone has three
 * or more partners and the line to the far partner must clear the near one.
 */
export function couplePathD(
  x1: number, y1: number, x2: number, y2: number,
  hopHeight = 0,
  inset = COUPLE_HOP_INSET,
): string {
  if (hopHeight <= 0) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const ax = x1 + inset;
  const bx = x2 - inset;
  return `M ${x1} ${y1} L ${ax} ${y1} L ${ax} ${y1 - hopHeight} L ${bx} ${y2 - hopHeight} L ${bx} ${y2} L ${x2} ${y2}`;
}

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
 * `chooseArcRoute` (duplicateArc.ts) decides when.
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

/** Points along a path of M, L and Q commands with absolute coordinates, `steps` to each curve. */
export function pathPoints(d: string, steps = 12): [number, number][] {
  const out: [number, number][] = [];
  let x = 0, y = 0;
  for (const m of d.matchAll(/([MLQ])([^MLQ]*)/g)) {
    const n = (m[2]!.match(/-?[\d.]+(?:e[-+]?\d+)?/g) ?? []).map(Number);
    if (m[1] === "Q") {
      const [cx, cy, ex, ey] = n as [number, number, number, number];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        out.push([u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey]);
      }
      [x, y] = [ex, ey];
    } else {
      [x, y] = n as [number, number];
      out.push([x, y]);
    }
  }
  return out;
}

/** Points along `duplicateArcD`'s line, for keeping text off it. */
export function duplicateArcPoints(
  x1: number, y1: number, x2: number, y2: number,
  bulge: number, half: number, steps = 12, legDx?: number,
): [number, number][] {
  return pathPoints(duplicateArcD(x1, y1, x2, y2, bulge, half, legDx), steps);
}

/**
 * The two paths of a consanguineous (double) couple line, drawn GAP px apart.
 * For a hopping line the two paths are concentric so they stay parallel around
 * the corners.
 */
export function consanguineousPathsD(
  x1: number, y1: number, x2: number, y2: number,
  hopHeight = 0,
  gap = 4,
  inset = COUPLE_HOP_INSET,
): [string, string] {
  const h = gap / 2;
  if (hopHeight <= 0) {
    return [`M ${x1} ${y1 - h} L ${x2} ${y2 - h}`, `M ${x1} ${y1 + h} L ${x2} ${y2 + h}`];
  }
  return [
    couplePathD(x1, y1 - h, x2, y2 - h, hopHeight, inset - h),
    couplePathD(x1, y1 + h, x2, y2 + h, hopHeight - gap, inset + h),
  ];
}

/**
 * The highest point any dashed arc between two copies reaches, or Infinity
 * when there is none. An arc on one row rises `bulge` above the symbols, so
 * in the top row it is the highest thing drawn.
 */
export function highestDuplicateArc(flow: {
  nodes: { id: string; position: { x: number; y: number } }[];
  duplicateEdges: { source: string; target: string; data?: { bulge?: number; legDx?: number } }[];
}, half: number): number {
  const pos = new Map(flow.nodes.map(n => [n.id, n.position]));
  let top = Infinity;
  for (const e of flow.duplicateEdges) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (!a || !b) continue;
    for (const [, y] of duplicateArcPoints(a.x, a.y, b.x, b.y, e.data?.bulge ?? 28, half, 12, e.data?.legDx)) top = Math.min(top, y);
  }
  return top;
}
