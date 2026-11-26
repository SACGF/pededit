import type { Partnership, Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Questions about the family graph: whose child someone is, a person's
 * couples, a couple's children, ancestors and descendants, who is the
 * father. Every file under `pedigree/`, `io/`, `components/` and the store
 * asks here rather than walking `partnerships` and `parentOf` itself. The
 * layout engine keeps its own, since it is published on its own.
 *
 * A frozen pedigree (every one the store holds, as immer freezes what it
 * produces) is indexed once, in a `WeakMap` as `kinshipOf` is: it can never
 * change, so the index is never stale. Any other pedigree (an immer draft,
 * one being built, a derived drawing) is read directly on every call, so a
 * change made in place is always seen.
 */

interface GraphIndex {
  /** Each child's couple: the first partnership whose `parentOf` lists them. */
  parentCouple: Map<string, Partnership>;
  /** Each person's couples, in pedigree order, donor pairs included. */
  couples: Map<string, Partnership[]>;
  /** Everyone listed as a child in `parentOf`. */
  children: Set<string>;
}

const cache = new WeakMap<Pedigree, GraphIndex>();

function indexOf(pedigree: Pedigree): GraphIndex | undefined {
  if (!Object.isFrozen(pedigree)) return undefined;
  let index = cache.get(pedigree);
  if (index) return index;
  index = { parentCouple: new Map(), couples: new Map(), children: new Set() };
  for (const p of pedigree.partnerships) {
    for (const c of pedigree.parentOf[p.id] ?? []) if (!index.parentCouple.has(c)) index.parentCouple.set(c, p);
    for (const id of new Set([p.individual1, p.individual2])) {
      const list = index.couples.get(id);
      if (list) list.push(p); else index.couples.set(id, [p]);
    }
  }
  for (const kids of Object.values(pedigree.parentOf)) for (const k of kids) index.children.add(k);
  cache.set(pedigree, index);
  return index;
}

/** The couple `id` is a child of (their genetic parents), or undefined. A child listed under two keeps the first. */
export function parentCoupleOf(pedigree: Pedigree, id: string): Partnership | undefined {
  const index = indexOf(pedigree);
  if (index) return index.parentCouple.get(id);
  return pedigree.partnerships.find(p => (pedigree.parentOf[p.id] ?? []).includes(id));
}

/**
 * The couples `id` is a partner in, in pedigree order. `donorPairs` says
 * whether a `donorConception` partnership counts: it makes the partners
 * genetic parents of its children but is not a relationship.
 */
export function couplesOf(pedigree: Pedigree, id: string, { donorPairs }: { donorPairs: boolean }): readonly Partnership[] {
  const index = indexOf(pedigree);
  const all = index
    ? index.couples.get(id) ?? []
    : pedigree.partnerships.filter(p => p.individual1 === id || p.individual2 === id);
  return donorPairs ? all : all.filter(p => !p.donorConception);
}

/** The other partner of the couple `id` is in. */
export function partnerIn(couple: Partnership, id: string): string {
  return couple.individual1 === id ? couple.individual2 : couple.individual1;
}

/** The children of the couple: those `parentOf` lists for it, its genetic children. */
export function childrenOf(pedigree: Pedigree, partnershipId: string): string[] {
  return pedigree.parentOf[partnershipId] ?? [];
}

/**
 * The children the couple raises: its own (`childrenOf`) and, for a couple
 * whose children are donor-conceived (a same-sex couple), the children of
 * one partner's `donorConception` pair who have the other partner as a
 * social parent. The childless mark, its menu and Remove partnership go by
 * this, so a same-sex couple with children is not offered them.
 */
export function raisedChildrenOf(pedigree: Pedigree, partnershipId: string): string[] {
  const own = childrenOf(pedigree, partnershipId);
  const couple = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!couple || couple.donorConception) return own;
  const raised = new Set(own);
  for (const [genetic, social] of [[couple.individual1, couple.individual2], [couple.individual2, couple.individual1]] as const) {
    for (const p of couplesOf(pedigree, genetic, { donorPairs: true })) {
      if (!p.donorConception) continue;
      for (const c of childrenOf(pedigree, p.id)) {
        if (pedigree.individuals.find(i => i.id === c)?.socialParents?.includes(social)) raised.add(c);
      }
    }
  }
  return [...raised];
}

/** Whether `parentOf` lists `id` as anyone's child. */
export function hasParents(pedigree: Pedigree, id: string): boolean {
  const index = indexOf(pedigree);
  if (index) return index.children.has(id);
  return Object.values(pedigree.parentOf).some(kids => kids.includes(id));
}

/** Everyone below any of `ids` through their couples (donor pairs included), not including `ids` themselves. */
export function descendantsOf(pedigree: Pedigree, ids: string[]): Set<string> {
  const out = new Set<string>();
  const queue = [...ids];
  while (queue.length) {
    const id = queue.shift()!;
    for (const p of couplesOf(pedigree, id, { donorPairs: true })) {
      for (const child of childrenOf(pedigree, p.id)) {
        if (!out.has(child) && !ids.includes(child)) { out.add(child); queue.push(child); }
      }
    }
  }
  return out;
}

/** Everyone above any of `ids` (genetic parents, their parents, ...), not including `ids` themselves. */
export function ancestorsOf(pedigree: Pedigree, ids: string[]): Set<string> {
  const out = new Set<string>();
  const queue = [...ids];
  while (queue.length) {
    const id = queue.shift()!;
    const p = parentCoupleOf(pedigree, id);
    if (!p) continue;
    for (const parent of [p.individual1, p.individual2]) {
      if (!out.has(parent) && !ids.includes(parent)) { out.add(parent); queue.push(parent); }
    }
  }
  return out;
}

/**
 * Which partner of a couple is the father and which the mother. The man
 * is the father and the woman the mother, whichever way round the couple
 * was recorded; when the sexes do not say (both unknown, or both the same),
 * `individual1` is the father.
 */
export function parentRoles(pedigree: Pedigree, couple: Partnership): { father: string; mother: string } {
  const sexOf = (id: string) => pedigree.individuals.find(i => i.id === id)?.sex;
  const [a, b] = [sexOf(couple.individual1), sexOf(couple.individual2)];
  const swap = (b === "male" && a !== "male") || (a === "female" && b !== "female");
  return swap
    ? { father: couple.individual2, mother: couple.individual1 }
    : { father: couple.individual1, mother: couple.individual2 };
}

/** One key for two people, the same whichever comes first. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
