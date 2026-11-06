import type { Pedigree, LayoutResult } from "./types.js";
import { alignPedigree, type AlignOptions } from "./alignPedigree.js";

/**
 * Horizontal distance, in layout units, between the right edge of one family
 * and the left edge of the next. Neighbours within a family are 1 apart, so
 * 2.5 leaves a visibly empty slot and a half between families (#64).
 */
export const FAMILY_GAP = 2.5;

/**
 * Split a pedigree into its families: sets of individuals joined by
 * partnerships or parent-child links. Families are ordered by the position of
 * their first member in `pedigree.individuals`, and members keep that order.
 * Individuals with no partner and no parent or child links are returned
 * separately as `isolated`.
 */
export function splitFamilies(pedigree: Pedigree): { families: string[][]; isolated: string[] } {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let y = x;
    while (parent.get(y) !== r) { const next = parent.get(y)!; parent.set(y, r); y = next; }
    return r;
  };
  const linked = new Set<string>();
  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    linked.add(a); linked.add(b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const ind of pedigree.individuals) parent.set(ind.id, ind.id);
  for (const p of pedigree.partnerships) {
    union(p.individual1, p.individual2);
    for (const child of pedigree.parentOf[p.id] ?? []) union(p.individual1, child);
  }

  const byRoot = new Map<string, string[]>();
  const isolated: string[] = [];
  for (const ind of pedigree.individuals) {
    if (!linked.has(ind.id)) { isolated.push(ind.id); continue; }
    const root = find(ind.id);
    const list = byRoot.get(root);
    if (list) list.push(ind.id); else byRoot.set(root, [ind.id]);
  }
  return { families: [...byRoot.values()], isolated };
}

/** The part of a pedigree made of the given individuals, in their original order. */
function subPedigree(pedigree: Pedigree, ids: Set<string>): Pedigree {
  const partnerships = pedigree.partnerships.filter(p => ids.has(p.individual1) && ids.has(p.individual2));
  const parentOf: Pedigree["parentOf"] = {};
  for (const p of partnerships) {
    if (pedigree.parentOf[p.id]) parentOf[p.id] = pedigree.parentOf[p.id]!.filter(c => ids.has(c));
  }
  return {
    ...pedigree,
    individuals: pedigree.individuals.filter(i => ids.has(i.id)),
    partnerships,
    parentOf,
  };
}

/**
 * Lay out each family on its own and place them side by side, separated by
 * `FAMILY_GAP` (#64).
 *
 * `alignPedigree` follows R's `align.pedigree`, which packs disconnected
 * families into shared rows with ordinary spacing, so separate families read
 * as one. This wrapper keeps every family's layout exactly as
 * `alignPedigree` would draw it alone, then offsets it horizontally. The
 * result is an ordinary `LayoutResult` over the whole pedigree: individual
 * indices refer to `pedigree.individuals`, and `fam` columns are re-based on
 * the merged rows. Isolated individuals (no partner, parents or children) go
 * last, as one group laid out together.
 *
 * A pedigree with at most one family is passed straight to `alignPedigree`,
 * so single-family layouts, and the R oracle comparisons, are unchanged.
 */
export function alignPedigreeByFamily(pedigree: Pedigree, options: AlignOptions = {}): LayoutResult {
  const { families, isolated } = splitFamilies(pedigree);
  if (families.length <= 1) return alignPedigree(pedigree, options);

  const groups = isolated.length > 0 ? [...families, isolated] : families;
  const globalIndex = new Map(pedigree.individuals.map((ind, i) => [ind.id, i + 1]));

  const merged: LayoutResult = { n: [], nid: [], pos: [], fam: [], spouse: [] };
  let offset = 0;

  for (const ids of groups) {
    const sub = subPedigree(pedigree, new Set(ids));
    const r = alignPedigree(sub, options);
    const toGlobal = sub.individuals.map(ind => globalIndex.get(ind.id)!);

    let min = Infinity, max = -Infinity;
    for (const row of r.pos) for (const x of row) { min = Math.min(min, x); max = Math.max(max, x); }
    if (!Number.isFinite(min)) continue;
    const shift = offset - min;

    for (let lev = 0; lev < r.n.length; lev++) {
      while (merged.n.length <= lev) {
        merged.n.push(0); merged.nid.push([]); merged.pos.push([]); merged.fam.push([]); merged.spouse.push([]);
      }
      // fam is a 1-based column in the row above, so it moves by the number
      // of slots earlier families already put in that row.
      const famBase = lev > 0 ? merged.n[lev - 1]! : 0;
      for (let c = 0; c < r.n[lev]!; c++) {
        merged.nid[lev]!.push(toGlobal[r.nid[lev]![c]! - 1]!);
        merged.pos[lev]!.push(r.pos[lev]![c]! + shift);
        const f = r.fam[lev]![c]!;
        merged.fam[lev]!.push(f > 0 ? f + famBase : 0);
        merged.spouse[lev]!.push(r.spouse[lev]![c]!);
      }
    }
    // Rows are extended level by level, so update the counts afterwards:
    // famBase above must see the counts from before this family.
    for (let lev = 0; lev < r.n.length; lev++) merged.n[lev] = merged.nid[lev]!.length;

    offset = max + shift + FAMILY_GAP;
  }
  return merged;
}
