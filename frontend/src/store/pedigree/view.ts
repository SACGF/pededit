import { removeWithDescendantsSet } from "../../pedigree/removal";
import { setParentsProblem } from "../../pedigree/parents";
import { collapseInfo } from "../../pedigree/collapse";
import { isSameSexCouple } from "../../pedigree/sameSex";
import { U_SHAPE_REFUSALS } from "../../pedigree/uShapeView";
import type { EditTools, Notice, PedigreeState, Picking, ViewSlice } from "./state";

/**
 * What is selected, hovered, being picked or shown as a notice: how the
 * editor is being looked at and used, none of it saved with the pedigree
 * or undoable.
 */

/**
 * Selection fields for selecting exactly `id` (or nothing). Every store write
 * of the selection goes through here or `selectionOf`, so `selectedId` is
 * always the primary member of `selectedIds`.
 */
export function selectOnly(id: string | null): { selectedId: string | null; selectedIds: string[] } {
  return { selectedId: id, selectedIds: id ? [id] : [] };
}

/** Selection fields for `ids` (deduplicated), with `primary` (default the last id) as selectedId. */
export function selectionOf(ids: string[], primary?: string | null): { selectedId: string | null; selectedIds: string[] } {
  const selectedIds = [...new Set(ids)];
  const selectedId = primary && selectedIds.includes(primary) ? primary : (selectedIds[selectedIds.length - 1] ?? null);
  return { selectedId, selectedIds };
}

/**
 * The two selected individuals when exactly two are selected, else null:
 * the primary (last clicked) second. For pairwise views such as how two people are related.
 */
export function selectedPair(state: { selectedId: string | null; selectedIds: string[] }): [string, string] | null {
  if (state.selectedIds.length !== 2 || !state.selectedId) return null;
  const other = state.selectedIds.find(id => id !== state.selectedId)!;
  return [other, state.selectedId];
}

export function viewSlice(tools: EditTools): ViewSlice {
  const { set, get } = tools;
  const nextNotice = (s: PedigreeState, notice: Omit<Notice, "id">) => ({ ...notice, id: (s.notice?.id ?? 0) + 1 });
  // Picking is a click on the standard chart, so starting it (from the
  // Person tab's More options) leaves the U-shape view and says why.
  const startPicking = (picking: Picking, select?: ReturnType<typeof selectOnly>) =>
    set(s => ({
      picking, ...select,
      ...(s.uShapeView && { uShapeView: false, notice: nextNotice(s, { kind: "info", text: U_SHAPE_REFUSALS.picking }) }),
    }));

  return {
    selectedId: null,

    selectedIds: [],

    problemHighlightId: null,

    revealRequest: null,

    notice: null,

    setNotice: (notice) => set(s => ({ notice: notice ? nextNotice(s, notice) : null })),

    uShapeView: false,

    setUShapeView: (on) => set(on ? { uShapeView: true, picking: null } : { uShapeView: false }),

    picking: null,

    startPickingParents: (childId) => startPicking({ kind: "parents", childId, picked: [] }, selectOnly(childId)),

    startPickingChild: (partnershipId, geneticParentId) => startPicking({ kind: "child", partnershipId, geneticParentId }),

    startPickingPartner: (individualId) => startPicking({ kind: "partner", individualId }, selectOnly(individualId)),

    startPickingRelatedness: (individualId) => startPicking({ kind: "relatedness", individualId }, selectOnly(individualId)),

    startPickingDonor: (childId, gamete) => startPicking({ kind: "donor", childId, gamete }, selectOnly(childId)),

    startPickingSurrogate: (childId) => startPicking({ kind: "surrogate", childId }, selectOnly(childId)),

    cancelPicking: () => set({ picking: null }),

    pickIndividual: (id) => {
      const { picking, pedigree } = get();
      if (!picking) return false;
      if (picking.kind === "child") {
        const p = pedigree.partnerships.find(x => x.id === picking.partnershipId);
        if (!p) { set({ picking: null }); return true; }
        const problem = isSameSexCouple(pedigree, p)
          ? get().setSameSexChild(id, p.id, picking.geneticParentId ?? p.individual1)
          : get().setParents(id, [p.individual1, p.individual2]);
        if (problem) get().setNotice({ kind: "error", text: problem });
        else set({ picking: null });
        return true;
      }
      if (picking.kind === "relatedness") {
        if (id === picking.individualId) return true;
        set({ picking: null, ...selectionOf([picking.individualId, id], id) });
        return true;
      }
      if (picking.kind === "donor" || picking.kind === "surrogate") {
        const problem = picking.kind === "donor" ? get().addDonor(picking.childId, picking.gamete, id) : get().addSurrogate(picking.childId, id);
        if (problem) get().setNotice({ kind: "error", text: problem });
        else set({ picking: null, ...selectOnly(picking.childId) });
        return true;
      }
      if (picking.kind === "partner") {
        const problem = get().linkPartner(picking.individualId, id);
        if (problem) get().setNotice({ kind: "error", text: problem });
        else set({ picking: null, ...selectOnly(picking.individualId) });
        return true;
      }
      if (id === picking.childId) {
        get().setNotice({ kind: "error", text: "Someone cannot be their own parent." });
        return true;
      }
      const picked = picking.picked.includes(id)
        ? picking.picked.filter(x => x !== id)
        : [...picking.picked, id];
      if (picked.length > picking.picked.length) {
        const problem = setParentsProblem(pedigree, picking.childId, picked);
        if (problem) { get().setNotice({ kind: "error", text: problem }); return true; }
      }
      set({ picking: { ...picking, picked } });
      if (picked.length === 2) get().applyPicking();
      return true;
    },

    applyPicking: () => {
      const { picking } = get();
      if (!picking || picking.kind !== "parents" || picking.picked.length === 0) return;
      const problem = get().setParents(picking.childId, picking.picked);
      if (problem) get().setNotice({ kind: "error", text: problem });
      else set({ picking: null, ...selectOnly(picking.childId) });
    },

    setSelectedId: (id) => set(selectOnly(id)),

    selectAndReveal: (id) => set(s => ({ ...selectOnly(id), revealRequest: { id, n: (s.revealRequest?.n ?? 0) + 1 } })),

    toggleSelected: (id) => {
      const { selectedIds, selectedId } = get();
      if (selectedIds.includes(id)) set(selectionOf(selectedIds.filter(x => x !== id), selectedId));
      else set(selectionOf([...selectedIds, id], id));
    },

    setSelection: (ids, primary) => set(selectionOf(ids, primary)),

    selectDescendants: (id) => {
      const { pedigree } = get();
      if (!pedigree.individuals.some(i => i.id === id)) return 0;
      // Only people who are drawn: someone hidden in a collapsed branch
      // or by a view filter would otherwise be moved, deleted or edited
      // without being seen.
      const hidden = collapseInfo(pedigree).hidden;
      const ids = [...removeWithDescendantsSet(pedigree, [id])].filter(x => !hidden.has(x));
      set(selectionOf(ids, id));
      return ids.length;
    },

    setProblemHighlightId: (id) => set({ problemHighlightId: id }),
  };
}
