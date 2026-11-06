import type { Pedigree } from "@pedigree-editor/layout-engine";
import { shareAncestor } from "../utils/pedigreeRelationship";

/**
 * Whether the couple line between two partners is drawn double.
 *
 * kinship2's spouse code (2 = consanguineous) is worked out for the two slots
 * a marker sits between. When the line hops over a partner in between (three
 * or more partners) those are not the couple, so the code can be wrong both
 * ways; and it ignores the `consanguineous` flag a user can set. Here a line
 * is double when the partnership is flagged, or when the two partners are
 * related by blood in the pedigree (share an ancestor, or one descends from
 * the other). Shared by the canvas and the SVG exporter.
 */
export function consanguinityTest(pedigree: Pedigree): (id1: string, id2: string) => boolean {
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const flagged = new Set(
    pedigree.partnerships.filter(p => p.consanguineous).map(p => key(p.individual1, p.individual2)),
  );
  const memo = new Map<string, boolean>();
  return (id1, id2) => {
    const k = key(id1, id2);
    if (flagged.has(k)) return true;
    let v = memo.get(k);
    if (v === undefined) { v = shareAncestor(pedigree, id1, id2); memo.set(k, v); }
    return v;
  };
}
