import type { Pedigree } from "@pedigree-editor/layout-engine";
import { layoutToFlow } from "./layoutToFlow";

const cache = new WeakMap<Pedigree, boolean>();

/**
 * Whether the canvas draws anyone twice, joined by the dashed arc (#124),
 * for the in-app legend. Exporters know from their own layout instead: the
 * U-shape draws different copies from the canvas. Compact mode and pins move
 * symbols, never which people are drawn twice, so the default layout answers.
 */
export function drawsDuplicates(pedigree: Pedigree): boolean {
  let out = cache.get(pedigree);
  if (out === undefined) {
    out = layoutToFlow(pedigree).duplicateEdges.length > 0;
    cache.set(pedigree, out);
  }
  return out;
}
