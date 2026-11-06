import { NODE_SIZE } from "./constants";

/** A straight line segment [x1, y1, x2, y2]. */
export type Segment = [number, number, number, number];

/**
 * Lines joining a couple to their children, shared by `SibshipEdge`, the
 * minimap and `svgExporter`. Framework-free.
 *
 * The sibship bar sits halfway between the couple line and the highest child
 * row. Each child gets its own drop to its own symbol, so a child pinned
 * above or below its siblings' row is still reached. The bar spans from the
 * couple drop to the outermost child so the two always meet.
 */
export function sibshipSegments(
  coupleX: number,
  coupleY: number,
  hopHeight: number,
  children: { x: number; y: number }[],
): Segment[] {
  if (children.length === 0) return [];
  const half = NODE_SIZE / 2;
  const childRowY = Math.min(...children.map(c => c.y));
  const sibBarY = (coupleY + childRowY) / 2;
  const xs = children.map(c => c.x);
  const segs: Segment[] = [
    // Drop from the couple line (raised when it hops) to the bar.
    [coupleX, coupleY - hopHeight, coupleX, sibBarY],
    [Math.min(coupleX, ...xs), sibBarY, Math.max(coupleX, ...xs), sibBarY],
  ];
  for (const c of children) {
    // To the top of the symbol, or its bottom if it was dragged above the bar.
    const end = c.y - half >= sibBarY ? c.y - half : c.y + half;
    segs.push([c.x, sibBarY, c.x, end]);
  }
  return segs;
}

/** SVG path data for a list of segments. */
export function segmentsPathD(segs: Segment[], map: (x: number, y: number) => [number, number] = (x, y) => [x, y]): string {
  return segs.map(([x1, y1, x2, y2]) => {
    const [a, b] = map(x1, y1);
    const [c, d] = map(x2, y2);
    return `M ${a} ${b} L ${c} ${d}`;
  }).join(" ");
}
