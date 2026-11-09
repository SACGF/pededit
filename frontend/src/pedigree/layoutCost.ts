import type { FlowData } from "./layoutToFlow";

/**
 * Cheap measures of how readable a drawn layout is (#76): people drawn more
 * than once, couple lines that hop over someone, the total length of the
 * dashed arcs joining copies, and the drawing's width. The regression guard
 * for layout passes beyond kinship2: no worse than the plain port on every
 * fixture, better on the ones a pass targets.
 */
export interface LayoutCost {
  duplicates: number;
  hops: number;
  arcLength: number;
  width: number;
}

export function layoutCost(flow: FlowData): LayoutCost {
  const pos = new Map(flow.nodes.map(n => [n.id, n.position]));
  let arcLength = 0;
  for (const e of flow.duplicateEdges) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (a && b) arcLength += Math.hypot(a.x - b.x, a.y - b.y);
  }
  const xs = flow.nodes.map(n => n.position.x);
  return {
    duplicates: flow.nodes.filter(n => n.data.isDuplicate).length,
    hops: flow.coupleEdges.filter(e => (e.data?.hopHeight ?? 0) > 0).length,
    arcLength: Math.round(arcLength),
    width: xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : 0,
  };
}
