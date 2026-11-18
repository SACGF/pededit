/**
 * What is drawn for a couple line and for a sibship, from the edge data
 * `layoutToFlow` made and the positions of the symbols at its ends.
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
import { couplePathD, consanguineousPathsD, hopRisers } from "./couplePath";
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
  /** Childless couple mark hung from the middle of the line. */
  childless?: { cx: number; topY: number; status: ChildlessStatus; segments: Segment[]; reason?: string; reasonY: number };
  /** Ended relationship: the two strokes across the line. */
  ended?: Segment[];
}

/**
 * A couple line between the symbols centred on `left` and `right`. It runs
 * from the facing side of one symbol to the facing side of the other; a
 * hopping line (`data.hopHeight`) leaves each side at the height in
 * `data.hopEnds`, turns up before the people it passes over and comes down
 * the same distance after them, beside the further partner, where it runs
 * level into their side.
 * A childless mark hangs from that level stretch, as the line to the couple's
 * children does (`sibshipLineGeometry`); the ended mark and a consanguinity
 * label stay on the raised part.
 */
export function coupleLineGeometry(data: CoupleEdgeData | undefined, double: boolean, left: LinePosition, right: LinePosition): CoupleLineGeometry {
  const half = NODE_SIZE / 2;
  const sx = left.x + half, tx = right.x - half;
  const hop = data?.hopHeight ?? 0;
  const from = { x: left.x, y: left.y, ...data?.hopEnds?.source }, to = { x: right.x, y: right.y, ...data?.hopEnds?.target };
  const course = couplePathD(from, to, hop);
  const cx = (sx + tx) / 2, cy = (left.y + right.y) / 2;
  const out: CoupleLineGeometry = {
    paths: double ? consanguineousPathsD(from, to, hop, CONSANGUINEOUS_GAP) : [course],
    course, cx, cy, hop,
  };
  if (data?.childless) {
    // From the middle of the line, or the level end of a hopping one.
    const level = hop <= 0 ? undefined
      : from.drop !== undefined ? { x: from.x + from.drop, y: from.y }
      : to.drop !== undefined ? { x: to.x - to.drop, y: to.y }
      : undefined;
    const markX = level?.x ?? cx;
    // From the lower line of a double line.
    const topY = (level?.y ?? cy) + (double ? CONSANGUINEOUS_GAP / 2 : 0);
    out.childless = {
      cx: markX, topY, status: data.childless, segments: childlessMarkSegments(markX, topY, data.childless),
      reason: data.childlessReason, reasonY: childlessReasonBaselineY(topY),
    };
  }
  if (data?.ended) {
    // Across the horizontal run, between the two lines of a double line:
    // the middle of the raised part of a hopping line, which nothing hangs from.
    const [ax, bx] = hopRisers(from, to);
    const x = hop > 0 ? (ax + bx) / 2 : endedBreakX(sx, tx, !!data.middleTaken);
    out.ended = endedMarkSegments(x, hop > 0 ? Math.min(left.y, right.y) - hop : cy);
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
  /** Drops to adopted-in children. */
  dashed: Segment[];
  /** Twin forks: a bar across monozygotic drops, "?" between drops of unknown zygosity. */
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

  // Where the drop hangs from the couple line: its middle, or, when the line
  // hops over a partner, its level end beside the further partner. That is
  // measured from the further partner, as the line's turn there is, so the two
  // stay together while either parent slot is dragged.
  const far = data.hopDrop && nodeAt(data.hopDrop.parentId);
  const coupleX = far ? far.position.x + data.hopDrop!.dx : (leftParent.position.x + rightParent.position.x) / 2;
  const coupleY = far ? far.position.y : (leftParent.position.y + rightParent.position.y) / 2;
  // Drops end at the top of each child symbol, or at a loss triangle's apex.
  const kids: SibshipChild[] = children.map(c => ({
    ...c.position,
    topInset: symbolTopInset(c.data?.individual?.lifeStatus, NODE_SIZE),
    dashed: c.data?.individual?.adopted === "in",
    twinSet: c.data?.twinSet,
    zygosity: c.data?.zygosity,
  }));
  // The bar's offset comes from the layout, so it is as of the last
  // layout while a node is being dragged.
  const barOffset = data.barOffset ?? 0;
  // Parents who are not a couple (gamete donation): a line from each.
  const sexOf = (n: SibshipEnd) => n.data?.shape ?? n.data?.individual?.sex;
  const apart = data.apart
    ? [{ ...leftParent.position, sex: sexOf(leftParent) }, { ...rightParent.position, sex: sexOf(rightParent) }]
    : undefined;
  return {
    ...sibshipPaths(coupleX, coupleY, kids, barOffset, apart, data.converge, data.maxDrop),
    marks: twinForkMarks(coupleY, kids, barOffset, data.maxDrop),
  };
}
