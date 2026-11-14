import type { Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import type { Segment } from "./sibshipPath";
import { activeChildless } from "./childless";

/**
 * Ended relationship (#98, NSGC 2008 Fig. 2.2a): two short parallel
 * diagonal strokes across the couple line mean the relationship no longer
 * exists (separated, divorced). The geometry is shared by the canvas edges,
 * `svgExporter` and the legend. Framework-free.
 */

/** Legend and export key row. */
export const ENDED_LABEL = "Relationship ended";

/** Half the horizontal run (px) of one stroke. */
export const ENDED_STROKE_DX = 3;
/** Half the height (px) of one stroke: enough to cross both lines of a double line. */
export const ENDED_STROKE_DY = 6;
/** Horizontal distance (px) between the two strokes. */
export const ENDED_STROKE_GAP = 5;

/**
 * Where the break sits on a couple line from x1 (the left partner's edge) to
 * x2 (the right partner's). In the middle when nothing hangs from there;
 * when the line of descent or a childless mark does (`middleTaken`), halfway
 * between the left end of the line's horizontal run and the middle, so the
 * strokes do not cross it. A hopping line's run starts `inset` px in.
 */
export function endedBreakX(x1: number, x2: number, hop: number, inset: number, middleTaken: boolean): number {
  const mid = (x1 + x2) / 2;
  if (!middleTaken) return mid;
  const lo = hop > 0 ? x1 + inset : x1;
  return (lo + mid) / 2;
}

/** The two strokes centred on (cx, cy), each rising to the right. */
export function endedMarkSegments(cx: number, cy: number, scale = 1): Segment[] {
  const dx = ENDED_STROKE_DX * scale, dy = ENDED_STROKE_DY * scale, h = (ENDED_STROKE_GAP * scale) / 2;
  return [-h, h].map(o => [cx + o - dx, cy + dy, cx + o + dx, cy - dy] as Segment);
}

/** Whether something hangs from the middle of the couple's line: their children's line of descent or a childless mark. */
export function middleTaken(partnership: Partnership, pedigree: Pedigree): boolean {
  return (pedigree.parentOf[partnership.id] ?? []).length > 0 || activeChildless(partnership, pedigree) !== undefined;
}

/** Whether any drawn partnership is marked ended, for the legend and export key. */
export function hasEndedPartnership(pedigree: Pedigree): boolean {
  return pedigree.partnerships.some(p => p.ended);
}
