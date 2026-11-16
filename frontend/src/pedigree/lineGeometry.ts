/**
 * What is drawn for a couple line and for a sibship, from the edge data
 * `layoutToFlow` made and the positions of the symbols at its ends (#143).
 *
 * One function per kind of line, used by the canvas edge components (with
 * live node positions, so a line follows a drag) and by the SVG export (with
 * the laid out positions). Neither works the geometry out for itself, so a
 * line cannot be drawn one way on the canvas and another in a file.
 * Framework-free.
 */
import type { ChildlessStatus } from "@pedigree-editor/layout-engine";
import type { CoupleEdgeData, RFNodeData, SibshipEdgeData } from "./layoutToFlow";
import { NODE_SIZE } from "./constants";
import { couplePathD, consanguineousPathsD } from "./couplePath";
import { childlessMarkSegments, childlessReasonBaselineY } from "./childless";
import { endedBreakX, endedMarkSegments } from "./ended";
import { symbolTopInset } from "./lifeStatus";
import { sibshipPaths, twinForkMarks, type Segment, type SibshipChild } from "./sibshipPath";

export interface LinePosition { x: number; y: number }

/** Gap (px) between the two lines of a consanguineous couple. */
export const CONSANGUINEOUS_GAP = 4;

export interface CoupleLineGeometry {
  /** The line: one path, or the outer and inner path of a double line. */
  paths: string[];
  /** The line's course as a single path, for a hit area. */
  course: string;
  /** Middle of the line, where a consanguinity label is centred and marks hang. */
  cx: number;
  cy: number;
  /** Rise (px) of the line over the people between the partners; 0 when adjacent. */
  hop: number;
  /** Childless couple mark (#15) hung from the middle of the line. */
  childless?: { cx: number; topY: number; status: ChildlessStatus; segments: Segment[]; reason?: string; reasonY: number };
  /** Ended relationship (#98): the two strokes across the line. */
  ended?: Segment[];
}

/**
 * A couple line between the symbols centred on `left` and `right`. It runs
 * from the facing edge of one symbol box to the facing edge of the other; a
 * hopping line (`data.hopHeight`) turns up `data.hopInset` px out from each.
 */
export function coupleLineGeometry(data: CoupleEdgeData | undefined, double: boolean, left: LinePosition, right: LinePosition): CoupleLineGeometry {
  const half = NODE_SIZE / 2;
  const sx = left.x + half, sy = left.y, tx = right.x - half, ty = right.y;
  const hop = data?.hopHeight ?? 0;
  const course = couplePathD(sx, sy, tx, ty, hop, data?.hopInset);
  const cx = (sx + tx) / 2, cy = (sy + ty) / 2;
  const out: CoupleLineGeometry = {
    paths: double ? consanguineousPathsD(sx, sy, tx, ty, hop, CONSANGUINEOUS_GAP, data?.hopInset) : [course],
    course, cx, cy, hop,
  };
  if (data?.childless) {
    // From the lower line of a double line.
    const topY = cy - hop + (double ? CONSANGUINEOUS_GAP / 2 : 0);
    out.childless = {
      cx, topY, status: data.childless, segments: childlessMarkSegments(cx, topY, data.childless),
      reason: data.childlessReason, reasonY: childlessReasonBaselineY(topY),
    };
  }
  if (data?.ended) {
    // Across the horizontal run: between the two lines of a double line that hops.
    const y = cy - hop + (double && hop > 0 ? CONSANGUINEOUS_GAP / 2 : 0);
    out.ended = endedMarkSegments(endedBreakX(sx, tx, hop, data.hopInset, !!data.middleTaken), y);
  }
  return out;
}

/** A symbol at one end of a sibship's lines: where it is and what `layoutToFlow` put on its node. */
export interface SibshipEnd {
  position: LinePosition;
  data?: Pick<RFNodeData, "individual" | "shape" | "twinSet" | "zygosity">;
}

export interface SibshipLineGeometry {
  solid: Segment[];
  /** Drops to adopted-in children (#12). */
  dashed: Segment[];
  /** Twin forks (#11): a bar across monozygotic drops, "?" between drops of unknown zygosity. */
  marks: ReturnType<typeof twinForkMarks>;
}

/**
 * The lines from a couple to their children: `nodeAt` gives each end by its
 * node id, or undefined when it is not drawn. Null when there is nothing to
 * draw (a parent or every child missing).
 */
export function sibshipLineGeometry(data: SibshipEdgeData, nodeAt: (id: string) => SibshipEnd | undefined): SibshipLineGeometry | null {
  const leftParent = nodeAt(data.leftParentId), rightParent = nodeAt(data.rightParentId);
  const children = (data.childIds ?? []).map(nodeAt).filter((n): n is SibshipEnd => !!n);
  if (!leftParent || !rightParent || children.length === 0) return null;

  // Couple midpoint: horizontal centre of the couple line.
  const coupleX = (leftParent.position.x + rightParent.position.x) / 2;
  const coupleY = (leftParent.position.y + rightParent.position.y) / 2;
  // Drops end at the top of each child symbol, or at a loss triangle's apex.
  const kids: SibshipChild[] = children.map(c => ({
    ...c.position,
    topInset: symbolTopInset(c.data?.individual?.lifeStatus, NODE_SIZE),
    dashed: c.data?.individual?.adopted === "in",
    twinSet: c.data?.twinSet,
    zygosity: c.data?.zygosity,
  }));
  // The bar's offset (#80) comes from the layout, so it is as of the last
  // layout while a node is being dragged.
  const barOffset = data.barOffset ?? 0;
  // Parents who are not a couple (gamete donation, #45): a line from each.
  const sexOf = (n: SibshipEnd) => n.data?.shape ?? n.data?.individual?.sex;
  const apart = data.apart
    ? [{ ...leftParent.position, sex: sexOf(leftParent) }, { ...rightParent.position, sex: sexOf(rightParent) }]
    : undefined;
  return {
    ...sibshipPaths(coupleX, coupleY, data.hopHeight ?? 0, kids, barOffset, apart, data.converge),
    marks: twinForkMarks(coupleY, kids, barOffset),
  };
}
