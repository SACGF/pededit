import type { Partnership, Pedigree, Sex } from "@pedigree-editor/layout-engine";

/**
 * Same-sex couples (#105, NSGC 2022 Fig. 5, which draws them as ordinary
 * couples). Sex is biological sex, so two partners of the same known sex
 * have no genetic children together: their children are donor-conceived,
 * in the #45 model (`assisted.ts`). The child's partnership in `parentOf` is
 * one partner (the genetic parent) and a donor of the other sex, a
 * `donorConception` pair; the other partner is a social parent, who gets no
 * line of their own because their partner has one (NSGC 2022 Fig. 5,
 * example 1b). Framework-free, shared by the store and the menus.
 */

/** Two partners of the same known sex, not a gamete donation pair. */
export function isSameSexCouple(pedigree: Pedigree, p: Partnership | undefined): boolean {
  if (!p || p.donorConception) return false;
  const a = pedigree.individuals.find(i => i.id === p.individual1)?.sex;
  const b = pedigree.individuals.find(i => i.id === p.individual2)?.sex;
  return !!a && a !== "unknown" && a === b;
}

export function sameSexCouple(pedigree: Pedigree, partnershipId: string | undefined): Partnership | undefined {
  const p = pedigree.partnerships.find(x => x.id === partnershipId);
  return p && isSameSexCouple(pedigree, p) ? p : undefined;
}

/**
 * The donor pair a same-sex couple's next child by `geneticParentId` joins,
 * so that the children by one partner share a donor and are full siblings:
 * the newest `donorConception` partnership of that parent with a donor
 * (reproductive role "donor") with a child who has `partnerId` as a social
 * parent. A different donor is a change the user makes on the child.
 */
export function donorPairFor(pedigree: Pedigree, geneticParentId: string, partnerId: string): Partnership | undefined {
  const isDonor = (id: string) => pedigree.individuals.find(i => i.id === id)?.reproductiveRole === "donor";
  const raisedBy = (pid: string) => (pedigree.parentOf[pid] ?? []).some(c =>
    pedigree.individuals.find(i => i.id === c)?.socialParents?.includes(partnerId));
  return [...pedigree.partnerships].reverse().find(p => {
    if (!p.donorConception) return false;
    const other = p.individual1 === geneticParentId ? p.individual2 : p.individual2 === geneticParentId ? p.individual1 : undefined;
    return !!other && isDonor(other) && raisedBy(p.id);
  });
}

/**
 * The couple's children: those in `parentOf` and, for a couple whose
 * children are donor-conceived (a same-sex couple, #105), the children of
 * one partner's `donorConception` pair who have the other partner as a
 * social parent. The childless mark, its menu and Remove partnership go by
 * this, so a same-sex couple with children is not offered them.
 */
export function coupleChildren(pedigree: Pedigree, partnershipId: string): string[] {
  const own = pedigree.parentOf[partnershipId] ?? [];
  const couple = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!couple || couple.donorConception) return own;
  const raised = new Set(own);
  for (const [genetic, social] of [[couple.individual1, couple.individual2], [couple.individual2, couple.individual1]]) {
    for (const p of pedigree.partnerships) {
      if (!p.donorConception || (p.individual1 !== genetic && p.individual2 !== genetic)) continue;
      for (const c of pedigree.parentOf[p.id] ?? []) {
        if (pedigree.individuals.find(i => i.id === c)?.socialParents?.includes(social)) raised.add(c);
      }
    }
  }
  return [...raised];
}

/** Why `geneticParentId` cannot have a child through this same-sex couple, or null. */
export function sameSexChildProblem(pedigree: Pedigree, partnershipId: string, geneticParentId: string): string | null {
  const p = sameSexCouple(pedigree, partnershipId);
  if (!p) return "Not a same-sex couple.";
  if (geneticParentId !== p.individual1 && geneticParentId !== p.individual2) return "The genetic parent must be one of the couple.";
  return null;
}

/**
 * Make `childIds` (individuals already in the draft, in no `parentOf` list)
 * children of the same-sex couple `partnershipId`, in place: their genetic
 * parents are `geneticParentId` and a donor of the other sex (the donor
 * pair `donorPairFor` finds, or a new donor `ids.donor` in a new pair
 * `ids.pair`), and the other partner is their social parent. Returns the
 * donor pair's id, or null when refused.
 */
export function applySameSexChildren(
  draft: Pedigree,
  partnershipId: string,
  geneticParentId: string,
  childIds: string[],
  ids: { donor: string; pair: string },
): string | null {
  if (sameSexChildProblem(draft, partnershipId, geneticParentId)) return null;
  const couple = draft.partnerships.find(x => x.id === partnershipId)!;
  const partner = couple.individual1 === geneticParentId ? couple.individual2 : couple.individual1;
  let pair = donorPairFor(draft, geneticParentId, partner);
  if (!pair) {
    const gp = draft.individuals.find(i => i.id === geneticParentId)!;
    const donorSex: Sex = gp.sex === "female" ? "male" : "female";
    draft.individuals.push({
      id: ids.donor, sex: donorSex, affected: false, sibOrder: 0,
      name: "", notes: "", reproductiveRole: "donor",
    });
    // Sperm donor first, as applyAddDonor orders a donor pair.
    const [i1, i2] = donorSex === "male" ? [ids.donor, geneticParentId] : [geneticParentId, ids.donor];
    pair = { id: ids.pair, individual1: i1, individual2: i2, donorConception: true };
    draft.partnerships.push(pair);
    draft.parentOf[pair.id] = [];
  }
  const kids = draft.parentOf[pair.id] ?? [];
  let sibOrder = Math.max(-1, ...kids.map(id => draft.individuals.find(i => i.id === id)?.sibOrder ?? 0)) + 1;
  for (const id of childIds) {
    const child = draft.individuals.find(i => i.id === id);
    if (!child) continue;
    child.sibOrder = sibOrder++;
    if (!child.socialParents?.includes(partner)) child.socialParents = [...(child.socialParents ?? []), partner];
    if (child.carriedBy === partner) delete child.carriedBy;
    kids.push(id);
  }
  draft.parentOf[pair.id] = kids;
  // The couple has a child now, so a childless mark no longer applies.
  delete couple.childless;
  delete couple.childlessReason;
  return pair.id;
}

/**
 * Why giving `targets` the sexes in `sexOf` would leave a child with two
 * genetic parents of the same known sex, or null. Partners may be any sex
 * (#105); the genetic parents of a child (its partnership in `parentOf`)
 * may not, since sex is biological sex. A couple with children together is
 * made a same-sex couple by giving their children a donor first.
 */
export function geneticParentsSexProblem(pedigree: Pedigree, targets: Set<string>, sexOf: (id: string) => Sex | undefined): string | null {
  for (const p of pedigree.partnerships) {
    if (!targets.has(p.individual1) && !targets.has(p.individual2)) continue;
    if ((pedigree.parentOf[p.id] ?? []).length === 0) continue;
    const a = sexOf(p.individual1), b = sexOf(p.individual2);
    if (!a || a === "unknown" || a !== b) continue;
    const n1 = pedigree.individuals.find(i => i.id === p.individual1)?.name?.trim();
    const n2 = pedigree.individuals.find(i => i.id === p.individual2)?.name?.trim();
    const who = n1 && n2 ? `${n1} and ${n2} are genetic parents of the same child` : "Two genetic parents of the same child";
    return `Not available: ${who} and would both be ${a}. Add a sperm or egg donor on the child first (more menu, Assisted reproduction).`;
  }
  return null;
}
