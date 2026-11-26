/**
 * The lines of assisted reproduction (NSGC 2008 Fig. 3, see `assisted.ts`)
 * as geometry: from a carrier, social or genetic parent to the child, and
 * the lines of descent from parents who are not a couple. Shared by the
 * canvas, the SVG export and the scene.
 */
import type { AssistedLink } from "./assisted";
import type { PersonGlyph } from "./personGlyph";
import type { LinePoint, Segment } from "./geometryTypes";
import { NODE_SIZE } from "./constants";
import { symbolTopInset } from "./lifeStatus";

/**
 * Where a line of descent leaves a parent's symbol on its way down to
 * (tx, ty): the bottom middle when the target is roughly below, otherwise
 * the lower corner on the target's side (a point on the circle at 45
 * degrees, the side vertex of a diamond), so the line clears the name
 * written under the symbol.
 */
export function symbolExitPoint(p: LinePoint, tx: number, size = NODE_SIZE): [number, number] {
  const half = size / 2;
  const dx = tx - p.x;
  if (Math.abs(dx) < half || !p.sex) return [p.x, p.y + half];
  const s = Math.sign(dx);
  if (p.sex === "female") { const r = (half - 1) * Math.SQRT1_2; return [p.x + s * r, p.y + r]; }
  if (p.sex === "unknown") return [p.x + s * (half - 1), p.y];
  return [p.x + s * half, p.y + half];
}

/**
 * The line from a carrier or social parent to the child: from their symbol
 * (see `symbolExitPoint`) to the top of the child's (the apex of a loss
 * triangle, via `childTopInset`), where it meets the child's own line of
 * descent, as the lines converge on the pregnancy in NSGC's figure.
 * Positions are symbol centres.
 */
export function assistedLinkSegment(
  from: LinePoint,
  child: { x: number; y: number },
  childTopInset = 0,
  size = NODE_SIZE,
): Segment {
  const half = size / 2;
  if (child.y <= from.y) return [from.x, from.y - half, child.x, child.y + half];
  const [x1, y1] = symbolExitPoint(from, child.x, size);
  return [x1, y1, child.x, child.y - half + childTopInset];
}

/**
 * Lines of descent from parents who are not a couple (`donorConception`):
 * from each parent's symbol (see `symbolExitPoint`) to the point on the
 * sibship bar under the middle of the two, in place of the couple line and
 * its drop.
 */
export function donorDescentSegments(
  parents: LinePoint[],
  joinX: number,
  barY: number,
  size = NODE_SIZE,
): Segment[] {
  return parents.map(p => [...symbolExitPoint(p, joinX, size), joinX, barY] as Segment);
}

/**
 * Where a sibship's line of descent meets its bar: under the middle of the
 * parents, half way down to the highest child, lowered by the bar's offset
 * (as `sibshipSegments` draws it).
 */
export function sibshipJoinPoint(
  left: { x: number; y: number },
  right: { x: number; y: number },
  childYs: number[],
  barOffset = 0,
): { x: number; y: number } {
  const coupleY = (left.y + right.y) / 2;
  return { x: (left.x + right.x) / 2, y: (coupleY + Math.min(...childYs)) / 2 + barOffset };
}

/** What `assistedEdgeSegment` needs of an AssistedEdge (scene.ts). */
export interface AssistedEdgeLike {
  source: string;
  target: string;
  data: { kind: AssistedLink["kind"]; bar?: { leftParentId: string; rightParentId: string; childIds: string[]; barOffset: number } };
}

/**
 * The segment an assisted edge draws, from the nodes' current positions: to
 * the top of the child, or to the sibship's join point when it stands for
 * the whole sibship. Null when a node it needs is not drawn. Shared by the
 * canvas edge and the SVG export.
 */
export function assistedEdgeSegment(
  edge: AssistedEdgeLike,
  nodeAt: (id: string) => { position: { x: number; y: number }; glyph?: Pick<PersonGlyph, "shape" | "lifeStatus"> } | undefined,
): Segment | null {
  const a = nodeAt(edge.source), b = nodeAt(edge.target);
  if (!a || !b) return null;
  // The shape drawn (gender identity), which the line leaves from.
  const from: LinePoint = { ...a.position, sex: a.glyph?.shape };
  const bar = edge.data.bar;
  if (bar) {
    const l = nodeAt(bar.leftParentId), r = nodeAt(bar.rightParentId);
    const kids = bar.childIds.map(nodeAt).filter((n): n is NonNullable<typeof n> => !!n);
    if (!l || !r || kids.length === 0) return null;
    const j = sibshipJoinPoint(l.position, r.position, kids.map(k => k.position.y), bar.barOffset);
    const [x1, y1] = symbolExitPoint(from, j.x);
    return [x1, y1, j.x, j.y];
  }
  return assistedLinkSegment(from, b.position, symbolTopInset(b.glyph?.lifeStatus, NODE_SIZE));
}
