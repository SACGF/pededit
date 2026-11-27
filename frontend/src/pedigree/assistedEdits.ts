/**
 * Assisted reproduction edits (see `assisted.ts` for the model): adding a
 * donor or a surrogate, and why one cannot be added. The store applies the
 * `apply` functions to an Immer draft.
 */
import type { Individual, Partnership, Pedigree, ReproductiveRole } from "@pedigree-editor/layout-engine";
import { childrenOf, couplesOf, descendantsOf, hasParents, parentCoupleOf, partnerIn } from "./graph";
import { removeIndividuals } from "./removal";
import { isUntouchedAddedRole } from "./placeholders";
import { personLabel } from "./personLabel";
import { geneticParents } from "./assisted";

export type Gamete = "sperm" | "egg";


/**
 * The genetic parent a donor of this gamete replaces: for sperm the male
 * partner (or the one not female), for egg the female (or the one not male).
 */
function replacedParent(pedigree: Pedigree, p: Partnership, gamete: Gamete): string | undefined {
  const sexOf = (id: string) => pedigree.individuals.find(i => i.id === id)?.sex;
  const ids = [p.individual1, p.individual2];
  const want = gamete === "sperm" ? "male" : "female";
  const avoid = gamete === "sperm" ? "female" : "male";
  return ids.find(id => sexOf(id) === want) ?? ids.find(id => sexOf(id) !== avoid);
}

/**
 * Why a donor of this gamete cannot be added for the child, or null when one
 * can. With `donorId`, the donor is someone already on the tree, such
 * as the mother's sister giving an egg: then also why that person cannot be
 * the donor.
 */
export function addDonorProblem(pedigree: Pedigree, childId: string, gamete: Gamete, donorId?: string): string | null {
  const p = parentCoupleOf(pedigree, childId);
  if (!p) return "Add the parents first: the donor replaces one of them as the genetic parent.";
  const x = replacedParent(pedigree, p, gamete);
  if (!x) return `Neither parent could have given the ${gamete}.`;
  const xi = pedigree.individuals.find(i => i.id === x);
  if (xi?.reproductiveRole === "donor") return `${personLabel(pedigree, x, "this person", { start: true })} is already a donor.`;
  if (donorId === undefined) return null;
  const donor = pedigree.individuals.find(i => i.id === donorId);
  if (!donor) return "Unknown individual.";
  if (donorId === childId) return "Someone cannot be their own donor.";
  if (donorId === p.individual1 || donorId === p.individual2) return `${personLabel(pedigree, donorId, "this person", { start: true })} is already a genetic parent of ${personLabel(pedigree, childId, "this person")}.`;
  if (donor.lifeStatus) return `${personLabel(pedigree, donorId, "this person", { start: true })} is a pregnancy or pregnancy loss and cannot be a donor.`;
  if (donor.sex === (gamete === "sperm" ? "female" : "male")) return `${gamete === "egg" ? "An egg" : "A sperm"} donor cannot be ${donor.sex}.`;
  if (descendantsOf(pedigree, [childId]).has(donorId)) return `${personLabel(pedigree, donorId, "this person", { start: true })} is a descendant of ${personLabel(pedigree, childId, "this person")}, so cannot be their donor.`;
  return null;
}

/**
 * Add a sperm or egg donor for one child, in place. The donor becomes the
 * child's genetic parent with the other parent (a `donorConception`
 * partnership); the parent they replace stays linked to the child: as the
 * woman who carried it for an egg donor (unless someone else is recorded as
 * carrying it), otherwise as a social parent. A donor partnership left with
 * no children is removed, since it is not a couple. Returns the donor's id.
 * `donorId` is a new id, or the id of someone already on the tree,
 * who becomes the donor; an existing donor pair with the same other parent
 * is reused, so two children of one donor are full siblings.
 */
export function applyAddDonor(draft: Pedigree, childId: string, gamete: Gamete, donorId: string, partnershipId: string): string | null {
  const existing = draft.individuals.find(i => i.id === donorId);
  if (addDonorProblem(draft, childId, gamete, existing ? donorId : undefined)) return null;
  const p = parentCoupleOf(draft, childId)!;
  const replaced = replacedParent(draft, p, gamete)!;
  const other = partnerIn(p, replaced);
  const child = draft.individuals.find(i => i.id === childId)!;

  if (existing) {
    // Someone already on the tree: they become a donor, keeping everything else.
    existing.reproductiveRole = "donor";
    if (existing.sex === "unknown") existing.sex = gamete === "sperm" ? "male" : "female";
  } else {
    draft.individuals.push({
      id: donorId, sex: gamete === "sperm" ? "male" : "female", affected: false, sibOrder: 0,
      name: "", notes: "", reproductiveRole: "donor",
    });
  }
  // The same donor and parent for a second child share one donor pair, so the children are full siblings.
  const shared = existing && draft.partnerships.find(x => x.donorConception
    && ((x.individual1 === donorId && x.individual2 === other) || (x.individual1 === other && x.individual2 === donorId)));
  if (shared) {
    child.sibOrder = Math.max(-1, ...childrenOf(draft, shared.id).map(id => draft.individuals.find(i => i.id === id)?.sibOrder ?? 0)) + 1;
    draft.parentOf[shared.id] = [...childrenOf(draft, shared.id), childId];
  } else {
    const [i1, i2] = gamete === "sperm" ? [donorId, other] : [other, donorId];
    draft.partnerships.push({ id: partnershipId, individual1: i1, individual2: i2, donorConception: true });
    draft.parentOf[partnershipId] = [childId];
    child.sibOrder = 0;
  }

  // Leave the old parents, and their twin sets.
  draft.parentOf[p.id] = childrenOf(draft, p.id).filter(c => c !== childId);
  if (p.twins) {
    p.twins = p.twins.map(t => ({ ...t, members: t.members.filter(m => m !== childId) })).filter(t => t.members.length >= 2);
    if (p.twins.length === 0) delete p.twins;
  }
  if (p.donorConception && draft.parentOf[p.id]!.length === 0) {
    draft.partnerships = draft.partnerships.filter(x => x.id !== p.id);
    delete draft.parentOf[p.id];
  }

  // The replaced parent keeps a line to the child, unless they were a donor themselves.
  const replacedInd = draft.individuals.find(i => i.id === replaced)!;
  if (replacedInd.reproductiveRole !== "donor") {
    if (gamete === "egg" && replacedInd.sex === "female" && !child.carriedBy) child.carriedBy = replaced;
    else if (child.carriedBy !== replaced && !child.socialParents?.includes(replaced)) {
      child.socialParents = [...(child.socialParents ?? []), replaced];
    }
  }
  return donorId;
}

/**
 * The donor pair a child was conceived from: the pair, the donor in it and
 * the other genetic parent. Null when the child's parents are not a donor
 * pair with a donor in it.
 */
export function donorOf(pedigree: Pedigree, childId: string): { pair: Partnership; donorId: string; otherId: string } | null {
  const p = parentCoupleOf(pedigree, childId);
  if (!p?.donorConception) return null;
  const role = (id: string) => pedigree.individuals.find(i => i.id === id)?.reproductiveRole;
  const donorId = role(p.individual1) === "donor" ? p.individual1 : role(p.individual2) === "donor" ? p.individual2 : null;
  return donorId ? { pair: p, donorId, otherId: partnerIn(p, donorId) } : null;
}

/**
 * The parent a donor replaced, as `applyAddDonor` recorded them: the woman
 * who carried the child or a social parent, preferring one who is a partner
 * of the other genetic parent.
 */
function replacedByDonor(pedigree: Pedigree, childId: string, otherId: string): string | undefined {
  const child = pedigree.individuals.find(i => i.id === childId);
  const linked = [child?.carriedBy, ...(child?.socialParents ?? [])].filter((x): x is string => !!x);
  const role = (id: string) => pedigree.individuals.find(i => i.id === id)?.reproductiveRole;
  const candidates = linked.filter(id => role(id) !== "surrogate" && role(id) !== "donor");
  const partners = new Set(couplesOf(pedigree, otherId, { donorPairs: false }).map(c => partnerIn(c, otherId)));
  return candidates.find(id => partners.has(id)) ?? (candidates.length === 1 ? candidates[0] : undefined);
}

/** Why the donor cannot be removed for this child, or null when they can ("Remove donor", #243). */
export function removeDonorProblem(pedigree: Pedigree, childId: string): string | null {
  const d = donorOf(pedigree, childId);
  if (!d) return "No donor is recorded for this person.";
  if (!replacedByDonor(pedigree, childId, d.otherId)) {
    return "The parent the donor replaced is not recorded (no carrier or social parent to return to): use Replace parents instead.";
  }
  return null;
}

/**
 * Remove the donor of one child, in place: the inverse of `applyAddDonor`.
 * The parent the donor replaced is the genetic parent again, with the other
 * genetic parent (their couple, or a new one with `partnershipId`), and the
 * carrier or social parent link adding the donor made goes. A donor pair
 * left with no children goes, and so does a donor left in no couple who has
 * nothing recorded since being added; otherwise the person stays and is no
 * longer marked as a donor once they have no donor pair.
 */
export function applyRemoveDonor(draft: Pedigree, childId: string, partnershipId: string): void {
  if (removeDonorProblem(draft, childId)) return;
  const { pair, donorId, otherId } = donorOf(draft, childId)!;
  const replaced = replacedByDonor(draft, childId, otherId)!;
  const child = draft.individuals.find(i => i.id === childId)!;

  draft.parentOf[pair.id] = childrenOf(draft, pair.id).filter(c => c !== childId);
  if (pair.twins) {
    pair.twins = pair.twins.map(t => ({ ...t, members: t.members.filter(m => m !== childId) })).filter(t => t.members.length >= 2);
    if (pair.twins.length === 0) delete pair.twins;
  }
  let couple = draft.partnerships.find(x => !x.donorConception
    && ((x.individual1 === otherId && x.individual2 === replaced) || (x.individual1 === replaced && x.individual2 === otherId)));
  if (!couple) {
    const sexOf = (id: string) => draft.individuals.find(i => i.id === id)?.sex;
    const [i1, i2] = sexOf(otherId) === "female" || (sexOf(otherId) === "unknown" && sexOf(replaced) === "male") ? [replaced, otherId] : [otherId, replaced];
    couple = { id: partnershipId, individual1: i1, individual2: i2 };
    draft.partnerships.push(couple);
    draft.parentOf[couple.id] = [];
  }
  const siblings = childrenOf(draft, couple.id);
  child.sibOrder = siblings.length === 0 ? 0 : Math.max(...siblings.map(id => draft.individuals.find(i => i.id === id)?.sibOrder ?? 0)) + 1;
  draft.parentOf[couple.id] = [...siblings, childId];
  delete couple.childless;
  delete couple.childlessReason;

  if (child.carriedBy === replaced) delete child.carriedBy;
  if (child.socialParents) {
    child.socialParents = child.socialParents.filter(x => x !== replaced);
    if (child.socialParents.length === 0) delete child.socialParents;
  }

  if (childrenOf(draft, pair.id).length === 0) {
    draft.partnerships = draft.partnerships.filter(x => x.id !== pair.id);
    delete draft.parentOf[pair.id];
  }
  const donor = draft.individuals.find(i => i.id === donorId)!;
  if (couplesOf(draft, donorId, { donorPairs: true }).some(c => c.donorConception)) return;
  const linked = draft.individuals.some(i => i.carriedBy === donorId || i.socialParents?.includes(donorId));
  if (isUntouchedAddedRole(donor) && !hasParents(draft, donorId) && couplesOf(draft, donorId, { donorPairs: true }).length === 0 && !linked) {
    removeIndividuals(draft, new Set([donorId]));
  } else {
    delete donor.reproductiveRole;
  }
}

/** Why the surrogate cannot be removed for this child, or null when they can ("Remove surrogate", #243). */
export function removeSurrogateProblem(pedigree: Pedigree, childId: string): string | null {
  const child = pedigree.individuals.find(i => i.id === childId);
  const carrier = child?.carriedBy && pedigree.individuals.find(i => i.id === child.carriedBy);
  if (!carrier || carrier.reproductiveRole !== "surrogate") return "No surrogate is recorded for this person.";
  return null;
}

/**
 * Remove the surrogate of one child, in place: the inverse of
 * `applyAddSurrogate`. A woman who carried the child before (the mother of
 * a child from a donor egg, moved to the social parents) carries it again.
 * A surrogate who carries nobody else stops being marked as one, and goes
 * if she has nothing recorded since being added and no other link.
 */
export function applyRemoveSurrogate(draft: Pedigree, childId: string): void {
  if (removeSurrogateProblem(draft, childId)) return;
  const child = draft.individuals.find(i => i.id === childId)!;
  const surrogateId = child.carriedBy!;
  delete child.carriedBy;
  // The woman applyAddSurrogate moved from carrying to raising: a social
  // parent who partners a genetic parent, the mother of a donor-egg child.
  const d = donorOf(draft, childId);
  if (d && d.pair.individual2 === d.donorId) {
    const partners = new Set(couplesOf(draft, d.otherId, { donorPairs: false }).map(c => partnerIn(c, d.otherId)));
    const before = child.socialParents?.find(id => partners.has(id) && draft.individuals.find(i => i.id === id)?.sex === "female");
    if (before) {
      child.carriedBy = before;
      child.socialParents = child.socialParents!.filter(x => x !== before);
      if (child.socialParents.length === 0) delete child.socialParents;
    }
  }
  if (draft.individuals.some(i => i.carriedBy === surrogateId)) return;
  const surrogate = draft.individuals.find(i => i.id === surrogateId)!;
  const linked = draft.individuals.some(i => i.socialParents?.includes(surrogateId));
  if (isUntouchedAddedRole(surrogate) && !hasParents(draft, surrogateId) && couplesOf(draft, surrogateId, { donorPairs: true }).length === 0 && !linked) {
    removeIndividuals(draft, new Set([surrogateId]));
  } else if (surrogate.reproductiveRole === "surrogate") {
    delete surrogate.reproductiveRole;
  }
}

/**
 * Why a surrogate cannot be added for the child, or null when one can. With
 * `surrogateId`, the surrogate is someone already on the tree, such
 * as the mother's sister: then also why she cannot be.
 */
export function addSurrogateProblem(pedigree: Pedigree, childId: string, surrogateId?: string): string | null {
  const child = pedigree.individuals.find(i => i.id === childId);
  if (!child) return "Unknown individual.";
  const carrier = child.carriedBy && pedigree.individuals.find(i => i.id === child.carriedBy);
  if (carrier && carrier.reproductiveRole === "surrogate") return `${personLabel(pedigree, carrier.id, "this person", { start: true })} is already recorded as the surrogate.`;
  if (surrogateId === undefined) return null;
  const s = pedigree.individuals.find(i => i.id === surrogateId);
  if (!s) return "Unknown individual.";
  if (surrogateId === childId) return "Someone cannot carry themselves.";
  if (s.sex === "male") return `${personLabel(pedigree, surrogateId, "this person", { start: true })} is male and cannot carry a pregnancy.`;
  if (s.lifeStatus) return `${personLabel(pedigree, surrogateId, "this person", { start: true })} is a pregnancy or pregnancy loss.`;
  // An egg donor who also carried the child (NSGC Fig. 3, the sister as donor and carrier) is allowed:
  // she is drawn as the donor only, and the previous carrier becomes a social parent.
  if (geneticParents(pedigree, childId).includes(surrogateId) && s.reproductiveRole !== "donor") return `${personLabel(pedigree, surrogateId, "this person", { start: true })} is the genetic mother of ${personLabel(pedigree, childId, "this person")}, not a surrogate.`;
  if (descendantsOf(pedigree, [childId]).has(surrogateId)) return `${personLabel(pedigree, surrogateId, "this person", { start: true })} is a descendant of ${personLabel(pedigree, childId, "this person")}.`;
  return null;
}

/**
 * Add a surrogate who carried this child, in place. A woman recorded as
 * carrying it before (the mother of a child from a donor egg) becomes a
 * social parent. Returns the surrogate's id. `surrogateId` is a new id, or
 * the id of a woman already on the tree.
 */
export function applyAddSurrogate(draft: Pedigree, childId: string, surrogateId: string): string | null {
  const existing = draft.individuals.find(i => i.id === surrogateId);
  if (addSurrogateProblem(draft, childId, existing ? surrogateId : undefined)) return null;
  const child = draft.individuals.find(i => i.id === childId)!;
  if (existing) {
    // Someone already on the tree. A donor stays a donor (D wins over S).
    if (existing.reproductiveRole !== "donor") existing.reproductiveRole = "surrogate";
    if (existing.sex === "unknown") existing.sex = "female";
  } else {
    draft.individuals.push({
      id: surrogateId, sex: "female", affected: false, sibOrder: 0,
      name: "", notes: "", reproductiveRole: "surrogate",
    });
  }
  const before = child.carriedBy;
  child.carriedBy = surrogateId;
  if (child.socialParents?.includes(surrogateId)) {
    child.socialParents = child.socialParents.filter(x => x !== surrogateId);
    if (child.socialParents.length === 0) delete child.socialParents;
  }
  if (before && before !== surrogateId && !child.socialParents?.includes(before)) child.socialParents = [...(child.socialParents ?? []), before];
  return surrogateId;
}

/**
 * Who may be recorded as carrying this child or as a social parent: anyone
 * but the child, its genetic parents and its descendants' line (kept simple:
 * not the child's own children). Pregnancies cannot carry or raise anyone.
 */
export function assistedCandidates(pedigree: Pedigree, childId: string): Individual[] {
  const genetic = new Set(geneticParents(pedigree, childId));
  const own = new Set(couplesOf(pedigree, childId, { donorPairs: true }).flatMap(p => childrenOf(pedigree, p.id)));
  return pedigree.individuals.filter(i => i.id !== childId && !genetic.has(i.id) && !own.has(i.id) && !i.lifeStatus);
}

/**
 * Why `id` cannot be given this reproductive role, or null. A surrogate
 * carried a pregnancy, so cannot be male (biological sex); as with the Sex
 * control (`batchSexProblem`), a gender identity draws her as a man.
 */
export function reproductiveRoleProblem(pedigree: Pedigree, id: string, role: ReproductiveRole | undefined): string | null {
  const ind = pedigree.individuals.find(i => i.id === id);
  if (role !== "surrogate" || ind?.sex !== "male") return null;
  return `${ind.name?.trim() || "This person"} is male and cannot have carried a pregnancy. Sex here is biological sex; record a gender identity to draw someone as a man.`;
}
