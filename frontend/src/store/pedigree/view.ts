import { removeWithDescendantsSet } from "../../pedigree/removal";
import { setParentsProblem } from "../../pedigree/parents";
import { collapseInfo } from "../../pedigree/collapse";
import type { Gamete } from "../../pedigree/assisted";
import { isSameSexCouple } from "../../pedigree/sameSex";
import type { EditTools } from "./tools";

/**
 * What is selected, hovered, being picked or shown as a notice: how the
 * editor is being looked at and used, none of it saved with the pedigree
 * or undoable.
 */

/**
 * On-canvas picking: clicks choose existing individuals instead of
 * selecting. "parents" collects one or two parents for a child; "child"
 * takes one click, the individual who becomes a child of the partnership
 * (of `geneticParentId` and a donor, for a same-sex couple).
 * "partner" takes one click, the existing individual who becomes the
 * partner of individualId. "relatedness" takes one click and selects
 * that person with individualId, so the panel shows how the two are related.
 * "donor" and "surrogate" take one click, an existing person who
 * becomes the child's sperm or egg donor or the surrogate who carried them.
 */
export type Picking =
  | { kind: "parents"; childId: string; picked: string[] }
  | { kind: "child"; partnershipId: string; geneticParentId?: string }
  | { kind: "partner"; individualId: string }
  | { kind: "relatedness"; individualId: string }
  | { kind: "donor"; childId: string; gamete: Gamete }
  | { kind: "surrogate"; childId: string };

/** A short message for the canvas page to show (refusals, what an edit did). Not undoable. */
export interface Notice {
  id: number;
  kind: "info" | "error";
  text: string;
  /** Offer an Undo button. */
  undoable?: boolean;
}

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

export interface ViewSlice {
  /**
   * Selection. `selectedIds` holds every selected individual id;
   * `selectedId` is the primary one (the last clicked), which the edit
   * panel and single-person actions use. With nothing selected they are
   * [] and null; with one, [id] and id. Kept in step by the actions below,
   * never set directly. `selectedPair` reads exactly two.
   */
  selectedId: string | null;
  selectedIds: string[];
  /** The person outlined on the canvas while a problem is hovered in the problems list. Not undoable. */
  problemHighlightId: string | null;
  /**
   * A person the canvas should bring into view, panning but not zooming,
   * if their node is off-screen: set by a toolbar add and by going to
   * a problem. `n` changes on
   * every request so the same id can be asked for twice. Not undoable.
   */
  revealRequest: { id: string; n: number } | null;
  /** The latest notice for the page to show, or null. */
  notice: Notice | null;
  setNotice: (notice: Omit<Notice, "id"> | null) => void;
  /**
   * The canvas draws the pedigree bent round a U (#220), the U-shape
   * export's figure, instead of the editable chart. A way of looking, so not
   * saved with the pedigree and not undoable; opening a pedigree turns it
   * off. Turning it on cancels any picking, which needs the chart.
   */
  uShapeView: boolean;
  setUShapeView: (on: boolean) => void;
  /** Active on-canvas picking, or null. Not undoable. */
  picking: Picking | null;
  startPickingParents: (childId: string) => void;
  startPickingChild: (partnershipId: string, geneticParentId?: string) => void;
  startPickingPartner: (individualId: string) => void;
  startPickingRelatedness: (individualId: string) => void;
  /** Pick an existing person as the child's sperm or egg donor, or as the surrogate. */
  startPickingDonor: (childId: string, gamete: Gamete) => void;
  startPickingSurrogate: (childId: string) => void;
  cancelPicking: () => void;
  /**
   * Handle a click on an individual while picking. For parents: adds (or
   * removes) them from the picked list, refusing with a notice when the
   * rules say no, and applies as soon as two are picked. For a child or a
   * partner: applies at once. Returns true when the click was consumed.
   */
  pickIndividual: (id: string) => boolean;
  /** Apply the parents picked so far (one parent gets a placeholder partner). */
  applyPicking: () => void;
  /** Select only this individual, or clear the selection with null. */
  setSelectedId: (id: string | null) => void;
  /** Select one person and pan to them if their node is off-screen (`revealRequest`): going to a problem. */
  selectAndReveal: (id: string) => void;
  /** Shift / Ctrl / Cmd+click: add id to the selection (as primary) or take it out. */
  toggleSelected: (id: string) => void;
  /** Replace the selection (rubber band, select descendants). Primary defaults to the last id. */
  setSelection: (ids: string[], primary?: string | null) => void;
  /**
   * Select a person, their descendants and the partners who married into
   * that branch (the "remove with descendants" set), with the person
   * as primary. Returns how many are selected.
   */
  selectDescendants: (id: string) => number;
  setProblemHighlightId: (id: string | null) => void;
}

export function viewSlice(tools: EditTools): ViewSlice {
  const { set, get } = tools;

  return {
    selectedId: null,

    selectedIds: [],

    problemHighlightId: null,

    revealRequest: null,

    notice: null,

    setNotice: (notice) => set(s => ({ notice: notice ? { ...notice, id: (s.notice?.id ?? 0) + 1 } : null })),

    uShapeView: false,

    setUShapeView: (on) => set(on ? { uShapeView: true, picking: null } : { uShapeView: false }),

    picking: null,

    startPickingParents: (childId) => set({ picking: { kind: "parents", childId, picked: [] }, ...selectOnly(childId) }),

    startPickingChild: (partnershipId, geneticParentId) => set({ picking: { kind: "child", partnershipId, geneticParentId } }),

    startPickingPartner: (individualId) => set({ picking: { kind: "partner", individualId }, ...selectOnly(individualId) }),

    startPickingRelatedness: (individualId) => set({ picking: { kind: "relatedness", individualId }, ...selectOnly(individualId) }),

    startPickingDonor: (childId, gamete) => set({ picking: { kind: "donor", childId, gamete }, ...selectOnly(childId) }),

    startPickingSurrogate: (childId) => set({ picking: { kind: "surrogate", childId }, ...selectOnly(childId) }),

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
