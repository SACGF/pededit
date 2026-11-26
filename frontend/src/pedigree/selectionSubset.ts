import type { Pedigree } from "@pedigree-editor/layout-engine";
import { drawnPedigree, drawnSubset, isBranchPlaceholderId } from "./collapse";
import { childrenOf, couplesOf, parentCoupleOf, partnerIn } from "./graph";

/**
 * "Only the selected people" in the export dialog (#215): a figure of part of
 * a pedigree. Nothing is stored; the dialog asks for the subset of what is
 * drawn now (hidden descendants and view filters already applied) and hands
 * it to the figure exporters as a drawn pedigree (`drawnSubset`).
 *
 * The figure is the selected people plus the fewest others that join them
 * into one chart:
 *  - a child hangs from a couple, so a selected child is joined to a selected
 *    parent, or to a selected brother or sister, only with both parents drawn;
 *  - a couple line needs both partners;
 *  - people further apart are joined along the shortest way through the
 *    family, counted in people added (cousins through their parents and the
 *    grandparents they share), and through shared ancestors rather than a
 *    marriage where both add as many.
 * Nobody else is drawn: a selected couple's children who are not selected are
 * left out, with no group symbol for them, so the figure is the selection and
 * the count of people added says everything else that is in it.
 */
export interface SelectionSubset {
  /** The selected people who are drawn, group symbols aside: the number in the label. */
  selected: string[];
  /** The people added to join them, in pedigree order. */
  added: string[];
  /** Everyone in the figure: `selected`, `added` and any selected group symbol. */
  keep: Set<string>;
  /** False when the selected people are in pieces of the family with no way between them. */
  joined: boolean;
}

type Step = { cost: number; from: string | null };

/** Far less than one person: only ever settles a tie. */
const MARRIAGE_STEP = 0.001;

const person = (id: string) => `i:${id}`;
const couple = (id: string) => `p:${id}`;

/**
 * The pieces `keep` falls into when only those people are drawn: partners
 * are joined by their couple line, children to their parents when both
 * parents are there.
 */
function pieces(pedigree: Pedigree, keep: Set<string>): Map<string, string> {
  const root = new Map<string, string>([...keep].map(id => [id, id]));
  const find = (id: string): string => {
    let r = id;
    while (root.get(r) !== r) r = root.get(r)!;
    root.set(id, r);
    return r;
  };
  for (const p of pedigree.partnerships) {
    if (!keep.has(p.individual1) || !keep.has(p.individual2)) continue;
    const r = find(p.individual1);
    root.set(find(p.individual2), r);
    for (const c of childrenOf(pedigree, p.id)) if (keep.has(c)) root.set(find(c), r);
  }
  return new Map([...keep].map(id => [id, find(id)]));
}

/**
 * The cheapest way from the piece holding `start` to a kept person outside
 * it, as the people to add; null when there is none. A step onto a couple
 * costs the partners not yet kept, a step onto a person costs one unless
 * they are kept.
 */
function cheapestJoin(pedigree: Pedigree, keep: Set<string>, piece: Map<string, string>, start: string): string[] | null {
  const byId = new Map(pedigree.partnerships.map(p => [p.id, p]));
  const home = piece.get(start);
  const best = new Map<string, Step>();
  const done = new Set<string>();
  for (const id of keep) if (piece.get(id) === home) best.set(person(id), { cost: 0, from: null });

  const offer = (node: string, cost: number, from: string) => {
    const known = best.get(node);
    if (!known || cost < known.cost) best.set(node, { cost, from });
  };
  const owed = (id: string) => (keep.has(id) ? 0 : 1);

  for (;;) {
    let at: string | null = null;
    for (const [node, step] of best) {
      if (!done.has(node) && (at === null || step.cost < best.get(at)!.cost)) at = node;
    }
    if (at === null) return null;
    done.add(at);
    const { cost } = best.get(at)!;
    const id = at.slice(2);
    if (at.startsWith("i:")) {
      if (keep.has(id) && piece.get(id) !== home) {
        // Walk back: every person on the way, and both partners of every couple.
        const add = new Set<string>();
        for (let node: string | null = at; node; node = best.get(node)!.from) {
          const nid = node.slice(2);
          if (node.startsWith("i:")) add.add(nid);
          else { add.add(byId.get(nid)!.individual1); add.add(byId.get(nid)!.individual2); }
        }
        return [...add].filter(a => !keep.has(a));
      }
      for (const p of couplesOf(pedigree, id, { donorPairs: true })) offer(couple(p.id), cost + owed(partnerIn(p, id)), at);
      const parents = parentCoupleOf(pedigree, id);
      if (parents) offer(couple(parents.id), cost + owed(parents.individual1) + owed(parents.individual2), at);
    } else {
      const p = byId.get(id)!;
      // The partners were paid for on the way in. Crossing from one partner
      // to the other costs a little, so of two ways that add as many people
      // the one through shared ancestors wins over the one through a marriage.
      const cameFrom = best.get(at)!.from;
      for (const partner of [p.individual1, p.individual2]) {
        const across = cameFrom !== null && cameFrom !== person(partner) && (cameFrom === person(p.individual1) || cameFrom === person(p.individual2));
        offer(person(partner), cost + (across ? MARRIAGE_STEP : 0), at);
      }
      for (const c of childrenOf(pedigree, p.id)) offer(person(c), cost + owed(c), at);
    }
  }
}

/** Who a figure of the selected people draws (see the module comment). */
export function selectionSubset(pedigree: Pedigree, selectedIds: readonly string[]): SelectionSubset {
  const drawn = drawnPedigree(pedigree);
  const present = new Set(drawn.individuals.map(i => i.id));
  const chosen = [...new Set(selectedIds)].filter(id => present.has(id));
  const keep = new Set(chosen);
  let joined = true;
  while (keep.size > 0) {
    const piece = pieces(drawn, keep);
    if (new Set(piece.values()).size <= 1) break;
    const add = cheapestJoin(drawn, keep, piece, chosen[0]!);
    if (!add) { joined = false; break; }
    for (const id of add) keep.add(id);
  }
  const picked = new Set(chosen);
  return {
    selected: chosen.filter(id => !isBranchPlaceholderId(id)),
    added: drawn.individuals.map(i => i.id).filter(id => keep.has(id) && !picked.has(id)),
    keep,
    joined,
  };
}

/** The pedigree a figure of the selected people is drawn from; pass it to the figure exporters. */
export function selectionPedigree(pedigree: Pedigree, subset: SelectionSubset): Pedigree {
  return drawnSubset(pedigree, subset.keep);
}

/** The export dialog's tickbox text: "Only the 23 selected people (+4 to connect them)". */
export function selectionLabel(subset: SelectionSubset): string {
  const extra = subset.added.length > 0 ? ` (+${subset.added.length} to connect them)` : "";
  return `Only the ${subset.selected.length} selected people${extra}`;
}
