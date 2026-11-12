import type { KinshipCoefficients, Pedigree } from "@pedigree-editor/layout-engine";
import { kinshipOf } from "./relatedness";

/**
 * Whether the couple line between two partners is drawn double (#85).
 *
 * A line is double when the two partners are related by blood in the
 * pedigree, which is to say their kinship coefficient is above 0 (#32). That
 * follows blood, not the drawing: someone adopted in is not related to the
 * family they hang from. A partnership's stored `consanguineous` flag is an
 * override on top, for a couple known to be related whose common ancestors
 * are not drawn. The editor only writes it from the edit panel's checkbox.
 *
 * kinship2's own spouse code (2 = consanguineous) is not used: it is worked
 * out for the two slots a marker sits between, which are not the couple when
 * the line hops over a partner in between, and it knows nothing of adoption
 * or the flag. Shared by the canvas, the legend and the SVG exporters.
 */
export function consanguinityTest(pedigree: Pedigree): (id1: string, id2: string) => boolean {
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const flagged = new Set(
    pedigree.partnerships.filter(p => p.consanguineous).map(p => key(p.individual1, p.individual2)),
  );
  // Most callers ask about a handful of couples, and a pedigree with no
  // couples never needs the matrix.
  let coefficients: KinshipCoefficients | undefined;
  return (id1, id2) =>
    flagged.has(key(id1, id2)) || (coefficients ??= kinshipOf(pedigree)).kinship(id1, id2) > 0;
}
