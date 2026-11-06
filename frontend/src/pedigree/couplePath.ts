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

/**
 * SVG path for the dashed line joining two copies of one person, given the
 * symbol centres and half the symbol size.
 *
 * On one row it is an arc over the symbol tops whose highest point is `bulge`
 * px above them, as in R's plot.pedigree (arcconnect). Across rows R uses the
 * same arc, which rises into the upper row's sibship bar and falls through
 * labels; here it leaves the upper copy's side facing the lower copy and bends
 * down into the lower copy's top instead.
 */
export function duplicateArcD(
  x1: number, y1: number, x2: number, y2: number,
  bulge: number, half: number,
): string {
  // Within a symbol's height counts as one row (a pin nudged off its row).
  if (Math.abs(y1 - y2) < 2 * half) {
    const ay = y1 - half, by = y2 - half;
    // A quadratic Bezier peaks halfway to its control point.
    const cy = 2 * (Math.min(ay, by) - bulge) - (ay + by) / 2;
    return `M ${x1} ${ay} Q ${(x1 + x2) / 2} ${cy} ${x2} ${by}`;
  }
  const [ux, uy, lx, ly] = y1 < y2 ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  const dir = lx >= ux ? 1 : -1;
  const sx = ux + dir * half;
  const cx = dir > 0 ? Math.max(lx, sx + half) : Math.min(lx, sx - half);
  return `M ${sx} ${uy} Q ${cx} ${uy} ${lx} ${ly - half}`;
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
