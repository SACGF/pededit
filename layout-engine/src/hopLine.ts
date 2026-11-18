import type { Sex } from "./types.js";

/**
 * Geometry of a couple line that hops over a partner (someone with three or
 * more partners), shared by `pedigreeToGeometry` and the PedEdit editor so
 * the two draw it the same way:
 *
 * - A couple line leaves the side of a symbol, never its top.
 * - On a side shared with a nearer partner's line, a hopping line leaves a
 *   little higher (`couplePortHeights`), so the two share nothing.
 * - It turns up a fraction of the gap before the first person it passes and
 *   comes down the same distance after the last (`hopTurn`), then runs level
 *   into the further partner's side.
 * - The line to the couple's children hangs from that level stretch.
 */
export interface HopLineConstants {
  /** Width and height of each node symbol, in pixels. */
  nodeSize: number;
  /** Height (px) a hop over one slot rises above the row. */
  coupleHop: number;
  /** Extra rise (px) for each additional slot a hop passes over. */
  coupleHopStep: number;
  /** Fraction of the gap beside a partner that a hop stays clear of the person it passes. */
  coupleHopClearance: number;
  /** Distance (px) a hop's riser moves out for each additional slot it passes. */
  coupleHopNestStep: number;
  /** Height (px) between neighbouring couple lines on one side of a symbol. */
  couplePortStep: number;
  /** Greatest height (px) above a symbol's centre at which a couple line leaves its side. */
  couplePortMax: number;
  /** Added to couplePortStep and couplePortMax when a line on that side is a double line. */
  couplePortDoubleExtra: number;
}

/**
 * Rise (px) of a couple line whose partners are `span` slots apart: 0 when
 * they are side by side. Wider hops rise higher, so nested hops never run
 * along each other.
 */
export function hopHeight(span: number, c: Pick<HopLineConstants, "coupleHop" | "coupleHopStep">): number {
  return span <= 1 ? 0 : c.coupleHop + (span - 2) * c.coupleHopStep;
}

/**
 * Heights (px above the symbol's centre) at which the `count` couple lines on
 * one side of a symbol leave it, nearest partner first: the line to the
 * partner beside the person at the centre, each further one higher up.
 * `double`: one of the lines is a double line, which needs more room.
 */
export function couplePortHeights(
  count: number,
  double: boolean,
  c: Pick<HopLineConstants, "couplePortStep" | "couplePortMax" | "couplePortDoubleExtra">,
): number[] {
  const extra = double ? c.couplePortDoubleExtra : 0;
  const step = Math.min(c.couplePortStep + extra, (c.couplePortMax + extra) / Math.max(1, count - 1));
  return Array.from({ length: count }, (_, i) => i * step);
}

/**
 * Where a hopping line turns between the row and its raised part beside one
 * of its partners, whose centre is `distance` px from the centre of the
 * person next to them (the first the line passes from that end): `turn` px
 * from the partner's centre. The same at both ends, so the line is
 * symmetrical about the people it passes. A hop over more slots (`span`)
 * turns a little further from them, so two hops from one side never share a
 * riser; pass span 2 for the further partner's end.
 *
 * `drop`: beside the further partner the line runs level from the turn into
 * their side, and the line to the couple's children hangs from that stretch
 * `drop` px from their centre, in the middle of the gap.
 */
export function hopTurn(
  distance: number,
  span: number,
  c: Pick<HopLineConstants, "nodeSize" | "coupleHopClearance" | "coupleHopNestStep">,
): { turn: number; drop: number } {
  const half = c.nodeSize / 2;
  const gap = Math.max(8, distance - c.nodeSize);
  const turn = half + gap * (1 - c.coupleHopClearance) - Math.max(0, span - 2) * c.coupleHopNestStep;
  return { turn: Math.max(half + 3, turn), drop: half + gap / 2 };
}

/**
 * Distance (px) from a symbol's centre to its outline `dy` px above or below
 * the centre: where a line leaving the side of a circle (female) or a diamond
 * (unknown) off its centre starts. `inset`: how far inside the nodeSize box
 * the outline is drawn (half a stroke, say).
 */
export function symbolSideDx(shape: Sex | undefined, dy: number, nodeSize: number, inset = 0): number {
  const r = nodeSize / 2 - inset;
  const a = Math.min(Math.abs(dy), r);
  if (shape === "female")  return Math.sqrt(r * r - a * a);
  if (shape === "unknown") return r - a;
  return r;
}
