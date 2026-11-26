import type { Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import type { Segment } from "./sibshipPath";
import { activeChildless } from "./childless";
import { childrenOf } from "./graph";

/**
 * Ended relationship (NSGC 2008 Fig. 2.2a): two short parallel
 * diagonal strokes across the couple line mean the relationship no longer
 * exists (separated, divorced). The geometry is shared by the canvas edges,
 * `svgExporter` and the legend. Framework-free.
 */

/** Legend and export key row. */
export const ENDED_LABEL = "Relationship ended";
/** The tooltip of every control that sets it. */
export const ENDED_TITLE = "Separated or divorced: two short strokes across the couple line";

/** Half the horizontal run (px) of one stroke. */
export const ENDED_STROKE_DX = 3;
/** Half the height (px) of one stroke: enough to cross both lines of a double line. */
export const ENDED_STROKE_DY = 6;
/** Horizontal distance (px) between the two strokes. */
export const ENDED_STROKE_GAP = 5;

/**
 * Where the break sits on a straight couple line from x1 (the left partner's
 * edge) to x2 (the right partner's). In the middle when nothing hangs from
 * there; when the line of descent or a childless mark does (`middleTaken`),
 * halfway between the left end and the middle, so the strokes do not cross
 * it.
 */
export function endedBreakX(x1: number, x2: number, middleTaken: boolean): number {
  const mid = (x1 + x2) / 2;
  return middleTaken ? (x1 + mid) / 2 : mid;
}

/** The two strokes centred on (cx, cy), each rising to the right. */
export function endedMarkSegments(cx: number, cy: number, scale = 1): Segment[] {
  const dx = ENDED_STROKE_DX * scale, dy = ENDED_STROKE_DY * scale, h = (ENDED_STROKE_GAP * scale) / 2;
  return [-h, h].map(o => [cx + o - dx, cy + dy, cx + o + dx, cy - dy] as Segment);
}

/** Whether something hangs from the middle of the couple's line: their children's line of descent or a childless mark. */
export function middleTaken(partnership: Partnership, pedigree: Pedigree): boolean {
  return childrenOf(pedigree, partnership.id).length > 0 || activeChildless(partnership, pedigree) !== undefined;
}

/** Whether any drawn partnership is marked ended, for the legend and export key. */
export function hasEndedPartnership(pedigree: Pedigree): boolean {
  return pedigree.partnerships.some(p => p.ended);
}
