import type { Pedigree, Individual, Partnership } from "@pedigree-editor/layout-engine";
import { removeWithDescendantsSet, removeWithAncestorsSet, removeIndividuals } from "../../pedigree/removal";
import { setParentsProblem } from "../../pedigree/parents";
import { dropLeftoverPlaceholders, partnersIn } from "../../pedigree/placeholders";
import { linkPartnerProblem } from "../../pedigree/partners";
import { kinshipOf } from "../../pedigree/relatedness";
import { addDonorProblem, applyAddDonor, addSurrogateProblem, applyAddSurrogate } from "../../pedigree/assistedEdits";
import { applySameSexChildren, isSameSexCouple, sameSexChildProblem } from "../../pedigree/sameSex";
import { newId, fatherFirst, nextSibOrderInFamily, nextRootSibOrder, makeIndividual, makePlaceholder, oppositeSex, addCouple, addPlaceholderFor, ensureChildPartnershipId, leaveParents, tidyCoupleLeft, clearChildless } from "./draft";
import type { EditTools, StructureSlice } from "./state";
import { childrenOf, couplesOf, parentCoupleOf, partnerIn, raisedChildrenOf } from "../../pedigree/graph";

/**
 * Edits to who is in the pedigree and how they are joined: adding and
 * removing people, couples, parents and children, donors and surrogates.
 */

/** Clamp the batch size accepted by addChildren. */
export const MAX_ADD_CHILDREN = 10;

export function structureSlice(tools: EditTools): StructureSlice {
  const { get, mutate, nameOr } = tools;

  /**
   * Say what adding a child to a same-sex couple did: the donor is
   * new on the canvas, so the user should know where it came from.
   */
  function noticeDonorChildren(geneticParentId: string, pairId: string, n: number) {
    const ped = get().pedigree;
    const pair = ped.partnerships.find(p => p.id === pairId);
    const donor = ped.individuals.find(i => i.id === (pair && partnerIn(pair, geneticParentId)));
    const name = nameOr(geneticParentId, "this person");
    const kind = donor?.sex === "male" ? "sperm donor" : "egg donor";
    get().setNotice({
      kind: "info",
      text: `Added ${n === 1 ? "a child" : `${n} children`} of ${name} and ${donor?.name?.trim() || `a ${kind}`}: partners of the same sex have no genetic children together, so the partner is recorded as a parent who is not genetic.`,
      undoable: true,
    });
  }

  /** Swap a person with the sibling `direction` places along (-1 left, 1 right) in their sibship. */
  function moveSib(individualId: string, direction: -1 | 1) {
    mutate(draft => {
      const parentPId = parentCoupleOf(draft, individualId)?.id;
      if (!parentPId) return;
      const siblings = childrenOf(draft, parentPId)
        .map(id => draft.individuals.find(i => i.id === id))
        .filter((i): i is Individual => !!i)
        .sort((a, b) => a.sibOrder - b.sibOrder);
      const idx = siblings.findIndex(s => s.id === individualId);
      const current = siblings[idx];
      const neighbour = siblings[idx + direction];
      if (!current || !neighbour) return; // already at that end
      [current.sibOrder, neighbour.sibOrder] = [neighbour.sibOrder, current.sibOrder];
      // Manual mode, so the swap takes effect whatever the sort mode was.
      draft.siblingOrder.mode = "manual";
    });
  }

  /** Shared body of removeWithDescendants / removeWithAncestors. */
  function removeBranch(
    individualIds: string[],
    chooser: (pedigree: Pedigree, ids: string[]) => Set<string>,
    what: "descendants" | "ancestors" | null,
  ): number {
    const { pedigree } = get();
    const ids = individualIds.filter(id => pedigree.individuals.some(i => i.id === id));
    if (ids.length === 0) return 0;
    const gone = chooser(pedigree, ids);
    if (gone.size >= pedigree.individuals.length) {
      get().setNotice({ kind: "error", text: `Not removed: removing ${ids.length === 1 ? "this person" : "these people"}${what ? ` with their ${what}` : ""} would leave an empty pedigree. Delete individuals one at a time, or start a new pedigree.` });
      return 0;
    }
    // Couples losing a child here may leave a placeholder partner with none.
    // and partners of removed people may be left alone.
    const candidates = partnersIn(pedigree, pedigree.partnerships
      .filter(p => gone.has(p.individual1) || gone.has(p.individual2) || childrenOf(pedigree, p.id).some(c => gone.has(c)))
      .map(p => p.id)).filter(id => !gone.has(id));
    let removed = gone.size;
    mutate(draft => {
      removeIndividuals(draft, gone);
      removed += dropLeftoverPlaceholders(draft, candidates);
    });
    get().setNotice({ kind: "info", text: `Removed ${removed} ${removed === 1 ? "individual" : "individuals"}.`, undoable: true });
    return removed;
  }

  return {
    /** Selects the new person and asks the canvas to show them: the layout puts them at the end of the top generation. */
    addIndividual: (sex) => {
      let id = "";
      mutate(draft => {
        const ind = makeIndividual(sex, nextRootSibOrder(draft));
        id = ind.id;
        draft.individuals.push(ind);
      });
      get().selectAndReveal(id);
    },

    /**
     * Add a parent of the given sex to individualId.
     *
     * Logic:
     * - If individual already has parents in a partnership:
     *   - If that partnership has an unknown-sex placeholder for that sex slot → set its sex
     *   - If that sex is already filled → no-op
     * - If individual has no parents at all:
     *   - Create a new parent of `sex` + an unknown-sex placeholder partner
     *   - Create partnership between them
     *   - Add individualId as their child
     */
    addParent: (individualId, sex) => {
      mutate(draft => {
        const parentPId = parentCoupleOf(draft, individualId)?.id;

        if (parentPId) {
          // Partnership exists — find the correct slot
          const p = draft.partnerships.find(p => p.id === parentPId)!;
          const ind1 = draft.individuals.find(i => i.id === p.individual1)!;
          const ind2 = draft.individuals.find(i => i.id === p.individual2)!;

          // If there's an unknown-sex placeholder, convert it
          // The user has now asked for this parent, so it is no longer a placeholder.
          if (ind1.sex === "unknown" && sex !== "unknown") {
            ind1.sex = sex;
            delete ind1.placeholder;
          } else if (ind2.sex === "unknown" && sex !== "unknown") {
            ind2.sex = sex;
            delete ind2.placeholder;
          }
          // If both are already filled, no-op
          return;
        }

        // No parents yet: a couple of the new parent and a placeholder.
        const newParent = makeIndividual(sex, 0);
        const placeholder = makePlaceholder(oppositeSex(sex));
        draft.individuals.push(newParent, placeholder);
        // The asked-for parent is second unless male, whatever the placeholder's sex.
        const partnership: Partnership = {
          id: newId(),
          individual1: sex === "male" ? newParent.id : placeholder.id,
          individual2: sex === "male" ? placeholder.id : newParent.id,
        };
        draft.partnerships.push(partnership);
        draft.parentOf[partnership.id] = [individualId];
      });
    },

    addChild: (individualId, sex) => get().addChildren(individualId, 1, sex),

    /**
     * Add `count` children of the given sex to individualId in one undo step,
     * to their first partnership, or a new one with a placeholder partner.
     * Children get consecutive sibOrder values after the existing siblings.
     * count is clamped to 1..MAX_ADD_CHILDREN. `partnershipId` picks one of
     * the individual's partnerships (the more menu offers a partner choice
     * when there are several); an id that is not one of theirs falls back
     * to the first.
     */
    addChildren: (individualId, count, sex, partnershipId) => {
      const n = Math.min(MAX_ADD_CHILDREN, Math.max(1, Math.floor(count)));
      if (!Number.isFinite(n)) return;
      if (get().pedigree.individuals.find(i => i.id === individualId)?.lifeStatus) {
        console.warn("Cannot add a child to a pregnancy or pregnancy loss");
        return;
      }
      let viaDonor: string | undefined;
      mutate(draft => {
        if (!draft.individuals.some(i => i.id === individualId)) return;
        const pid = ensureChildPartnershipId(draft, individualId, partnershipId);
        // A same-sex couple's children are this person's and a donor's.
        if (isSameSexCouple(draft, draft.partnerships.find(p => p.id === pid))) {
          const kids = Array.from({ length: n }, () => makeIndividual(sex, 0));
          draft.individuals.push(...kids);
          viaDonor = applySameSexChildren(draft, pid, individualId, kids.map(k => k.id), { donor: newId(), pair: newId() }) ?? undefined;
          return;
        }
        let sibOrder = nextSibOrderInFamily(draft, pid);
        for (let k = 0; k < n; k++) {
          const child = makeIndividual(sex, sibOrder++);
          draft.individuals.push(child);
          draft.parentOf[pid] = [...childrenOf(draft, pid), child.id];
        }
        clearChildless(draft, pid);
      });
      if (viaDonor) noticeDonorChildren(individualId, viaDonor, n);
    },

    /**
     * Add a sibling to individualId.
     *
     * Finds the partnership that is individualId's parent, then adds a new
     * unknown-sex child to that same partnership. No-op if individual has no parents.
     */
    addSibling: (individualId) => {
      mutate(draft => {
        const parentPId = parentCoupleOf(draft, individualId)?.id;
        if (!parentPId) return; // no parents — can't add sibling

        const sibling = makeIndividual("unknown", nextSibOrderInFamily(draft, parentPId));
        // A donor-conceived child's sibling by the same donor is raised by
        // the same social parents (the other partner of a same-sex couple).
        const source = draft.individuals.find(i => i.id === individualId);
        if (draft.partnerships.find(p => p.id === parentPId)?.donorConception && source?.socialParents?.length) {
          sibling.socialParents = [...source.socialParents];
        }
        draft.individuals.push(sibling);
        draft.parentOf[parentPId] = [...draft.parentOf[parentPId], sibling.id];
      });
    },

    /**
     * Add a partner to individualId.
     *
     * Creates a new individual of the opposite sex (unknown stays unknown,
     * #119) and a new Partnership, father role first as linkPartner does.
     * If individual already has a partnership, this creates a second one
     * (multiple partnerships are valid, e.g. second marriage).
     */
    addPartner: (individualId) => {
      const ind = get().pedigree.individuals.find(i => i.id === individualId);
      if (ind?.lifeStatus) {
        console.warn("Cannot add a partner to a pregnancy or pregnancy loss");
        return;
      }
      if (!ind) return;
      mutate(draft => {
        const partner = makeIndividual(oppositeSex(ind.sex), 0);
        draft.individuals.push(partner);
        addCouple(draft, ...fatherFirst(draft, individualId, partner.id));
      });
    },

    linkPartner: (individualId, partnerId) => {
      const problem = linkPartnerProblem(get().pedigree, individualId, partnerId);
      if (problem) { console.warn(`Cannot link partners: ${problem}`); return problem; }
      // Related couples are found at draw time from kinship (#85); nothing is stored.
      const related = kinshipOf(get().pedigree).kinship(individualId, partnerId) > 0;
      mutate(draft => { addCouple(draft, ...fatherFirst(draft, individualId, partnerId)); });
      const name = (id: string) => nameOr(id, "an individual");
      get().setNotice({
        kind: "info",
        text: `${name(individualId)} and ${name(partnerId)} are now partners${related ? " (related, so drawn with a double line)" : ""}.`,
        undoable: true,
      });
      return null;
    },

    /**
     * Delete one person, with no notice and no check that someone is left
     * (`deleteIndividuals` has both). Their partnerships go and the children
     * of those become founders, as `removeIndividuals` describes.
     */
    deleteIndividual: (individualId) => {
      // Placeholder partners of the couples this person is a child or partner of.
      const ped0 = get().pedigree;
      const candidates = partnersIn(ped0, [
        ...Object.keys(ped0.parentOf).filter(pid => ped0.parentOf[pid]!.includes(individualId)),
        ...couplesOf(ped0, individualId, { donorPairs: true }).map(p => p.id),
      ]);
      mutate(draft => {
        removeIndividuals(draft, new Set([individualId]));
        // A placeholder left with no children, or alone, goes too.
        dropLeftoverPlaceholders(draft, candidates);
      });
    },

    deleteIndividuals: (individualIds) => removeBranch(individualIds, (_p, ids) => new Set(ids), null),

    removeWithDescendants: (individualIds) => removeBranch(individualIds, removeWithDescendantsSet, "descendants"),

    removeWithAncestors: (individualIds) => removeBranch(individualIds, removeWithAncestorsSet, "ancestors"),

    setParents: (childId, parentIds) => {
      const unique = [...new Set(parentIds)];
      const problem = setParentsProblem(get().pedigree, childId, unique);
      if (problem) { console.warn(`Cannot set parents: ${problem}`); return problem; }
      const before = parentCoupleOf(get().pedigree, childId);
      mutate(draft => {
        if (before) leaveParents(draft, before, childId);
        // The partnership to attach to: existing, or new (with a placeholder for a single parent).
        const [a, b] = unique as [string, string | undefined];
        const partnership = (b && draft.partnerships.find(p =>
          (p.individual1 === a && p.individual2 === b) || (p.individual1 === b && p.individual2 === a)))
          || addCouple(draft, ...fatherFirst(draft, a, b ?? addPlaceholderFor(draft, a).id));
        const child = draft.individuals.find(i => i.id === childId)!;
        child.sibOrder = nextSibOrderInFamily(draft, partnership.id);
        draft.parentOf[partnership.id] = [...childrenOf(draft, partnership.id), childId];
        clearChildless(draft, partnership.id);
        if (before) tidyCoupleLeft(draft, before);
      });
      const after = parentCoupleOf(get().pedigree, childId)!;
      const name = (id: string) => nameOr(id, "an individual");
      get().setNotice({
        kind: "info",
        text: `${name(childId)} is now a child of ${name(after.individual1)} and ${name(after.individual2)}${before ? " (moved from the previous parents)" : ""}.`,
        undoable: true,
      });
      return null;
    },

    setSameSexChild: (childId, partnershipId, geneticParentId) => {
      const ped = get().pedigree;
      const couple = ped.partnerships.find(p => p.id === partnershipId);
      const partner = couple && partnerIn(couple, geneticParentId);
      const problem = sameSexChildProblem(ped, partnershipId, geneticParentId)
        ?? setParentsProblem(ped, childId, [geneticParentId])
        ?? setParentsProblem(ped, childId, [partner!]);
      if (problem) { console.warn(`Cannot set parents: ${problem}`); return problem; }
      const before = parentCoupleOf(ped, childId);
      mutate(draft => {
        if (before) leaveParents(draft, before, childId);
        applySameSexChildren(draft, partnershipId, geneticParentId, [childId], { donor: newId(), pair: newId() });
        if (before) tidyCoupleLeft(draft, before);
      });
      const name = (id: string) => nameOr(id, "an individual");
      get().setNotice({
        kind: "info",
        text: `${name(childId)} is now a child of ${name(geneticParentId)} and a donor, with ${name(partner!)} as a parent who is not genetic.`,
        undoable: true,
      });
      return null;
    },

    detachFromParents: (childId) => {
      const before = parentCoupleOf(get().pedigree, childId);
      if (!before) return;
      mutate(draft => {
        leaveParents(draft, before, childId);
        tidyCoupleLeft(draft, before);
        const child = draft.individuals.find(i => i.id === childId);
        if (child) child.sibOrder = nextRootSibOrder(draft);
      });
      get().setNotice({ kind: "info", text: `${nameOr(childId, "This person")} no longer has parents drawn.`, undoable: true });
    },

    removePartnership: (partnershipId) => {
      const { pedigree } = get();
      const p = pedigree.partnerships.find(x => x.id === partnershipId);
      if (!p) return "Unknown partnership.";
      const kids = raisedChildrenOf(pedigree, partnershipId);
      if (kids.length > 0) {
        return `Not removed: this couple has ${kids.length === 1 ? "a child" : `${kids.length} children`}. Use Replace parents or Detach from parents on ${kids.length === 1 ? "the child" : "each child"} first.`;
      }
      // An untouched placeholder partner would be left alone on the canvas, so it goes too.
      mutate(draft => {
        draft.partnerships = draft.partnerships.filter(x => x.id !== partnershipId);
        delete draft.parentOf[partnershipId];
        dropLeftoverPlaceholders(draft, [p.individual1, p.individual2]);
      });
      get().setNotice({ kind: "info", text: "Partnership removed; both people stay.", undoable: true });
      return null;
    },

    /**
     * Move a sibling one position left within its sibling group.
     * Swaps sibOrder with the sibling immediately to the left (lower sibOrder).
     */
    moveSibLeft: (individualId) => moveSib(individualId, -1),

    moveSibRight: (individualId) => moveSib(individualId, 1),

    addDonor: (childId, gamete, existingId) => {
      const problem = addDonorProblem(get().pedigree, childId, gamete, existingId);
      if (problem) { console.warn(`Cannot add a donor: ${problem}`); return problem; }
      mutate(draft => { applyAddDonor(draft, childId, gamete, existingId ?? newId(), newId()); });
      return null;
    },

    addSurrogate: (childId, existingId) => {
      const problem = addSurrogateProblem(get().pedigree, childId, existingId);
      if (problem) { console.warn(`Cannot add a surrogate: ${problem}`); return problem; }
      mutate(draft => { applyAddSurrogate(draft, childId, existingId ?? newId()); });
      return null;
    },
  };
}
