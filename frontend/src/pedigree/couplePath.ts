import { COUPLE_HOP_INSET } from "./constants";

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
