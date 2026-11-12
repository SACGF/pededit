import { endedBreakX, endedMarkSegments } from "../ended";
import { segmentsPathD } from "../sibshipPath";
import type { CoupleEdgeData } from "../layoutToFlow";

/**
 * Ended relationship break (#98) across a couple line from (sx, y) to
 * (tx, y): `y` is the middle of the line's horizontal run (raised by the hop,
 * between the two lines of a double line). Shared by CoupleEdge and
 * ConsanguineousEdge; the SVG exporter draws the same geometry.
 */
export function EndedMark({ sx, tx, y, data }: { sx: number; tx: number; y: number; data: CoupleEdgeData }) {
  const cx = endedBreakX(sx, tx, data.hopHeight ?? 0, data.hopInset, !!data.middleTaken);
  return (
    <path data-ended d={segmentsPathD(endedMarkSegments(cx, y))} stroke="black" strokeWidth={2} fill="none" />
  );
}
