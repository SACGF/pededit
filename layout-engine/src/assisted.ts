import type { Pedigree, Partnership } from "./types.js";

/**
 * Where a child of assisted reproduction (#45) is drawn, as opposed to who
 * its genetic parents are. NSGC 2008 Fig. 3: "the pregnancy symbol and its
 * line of descent are positioned below the woman who is carrying the
 * pregnancy". `parentOf` keeps the genetic parents (kinship, PED); the
 * layout and the drawing hang the child from these placement parents.
 */

/**
 * `parentOf` for drawing. A child carried by a woman who is not its genetic
 * mother but is the partner of one of its genetic parents (scenario 2, a
 * donor egg carried by the father's partner) hangs from that couple: the
 * couple's line of descent runs to it, and the donor's own line joins it.
 * Every other child stays with its genetic parents. A child in a twin set
 * stays too, since the twins are recorded on the genetic partnership.
 * Returns `pedigree.parentOf` itself when nothing moves.
 */
export function placementParentOf(pedigree: Pedigree): Pedigree["parentOf"] {
  let out: Pedigree["parentOf"] | undefined;
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  for (const g of pedigree.partnerships) {
    for (const childId of pedigree.parentOf[g.id] ?? []) {
      const carrier = byId.get(childId)?.carriedBy;
      if (!carrier || !byId.has(carrier) || carrier === g.individual1 || carrier === g.individual2) continue;
      if (g.twins?.some(t => t.members.includes(childId))) continue;
      const q = carrierCouple(pedigree, g, carrier);
      if (!q) continue;
      out ??= Object.fromEntries(Object.entries(pedigree.parentOf).map(([k, v]) => [k, [...v]]));
      out[g.id] = out[g.id]!.filter(c => c !== childId);
      out[q.id] = [...(out[q.id] ?? []), childId];
    }
  }
  return out ?? pedigree.parentOf;
}

/** A couple (not a donor pair) of the carrier and one of the genetic parents. */
function carrierCouple(pedigree: Pedigree, g: Partnership, carrier: string): Partnership | undefined {
  return pedigree.partnerships.find(q => q !== g && !q.donorConception
    && ((q.individual1 === carrier && (q.individual2 === g.individual1 || q.individual2 === g.individual2))
      || (q.individual2 === carrier && (q.individual1 === g.individual1 || q.individual1 === g.individual2))));
}

/**
 * The person whose line of descent the child sits under, when that is not
 * simply the middle of its (placement) parents: the woman carrying it when
 * the parents are a donor pair (scenarios 1 and 4: under her, not between
 * her and the donor), or a carrier who is neither parent (scenario 3: under
 * the surrogate). Undefined for an ordinary child, and when the carrier's
 * line is the couple's own line of descent (scenario 2 after
 * `placementParentOf`).
 */
export function carrierAbove(pedigree: Pedigree, parentOf: Pedigree["parentOf"], childId: string): string | undefined {
  const p = pedigree.partnerships.find(x => (parentOf[x.id] ?? []).includes(childId));
  if (!p) return undefined;
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const child = byId.get(childId);
  const carried = child?.carriedBy && byId.has(child.carriedBy) ? child.carriedBy : undefined;
  const pair = [p.individual1, p.individual2];
  if (carried && !pair.includes(carried)) return carried;
  if (!p.donorConception) return undefined;
  if (carried) return carried;
  // The genetic mother carried it unless someone else is recorded.
  const females = pair.filter(id => byId.get(id)?.sex === "female");
  return females.length === 1 ? females[0] : undefined;
}
