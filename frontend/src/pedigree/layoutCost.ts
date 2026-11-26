import type { Scene } from "./scene";

/**
 * Cheap measures of how readable a drawn layout is: people drawn more
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

export function layoutCost(scene: Scene): LayoutCost {
  const pos = new Map(scene.people.map(n => [n.id, n.position]));
  let arcLength = 0;
  for (const e of scene.duplicates) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (a && b) arcLength += Math.hypot(a.x - b.x, a.y - b.y);
  }
  const xs = scene.people.map(n => n.position.x);
  return {
    duplicates: scene.people.filter(n => (n.glyph.copy !== undefined)).length,
    hops: scene.couples.filter(e => (e.data?.hopHeight ?? 0) > 0).length,
    arcLength: Math.round(arcLength),
    width: xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : 0,
  };
}
