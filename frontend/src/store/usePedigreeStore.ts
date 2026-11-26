import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { produce } from "immer";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { applyFixEdit } from "../pedigree/validation";
import { filterHidingNew, rootsHidingNew } from "../pedigree/collapse";
import type { EditTools, PedigreeState } from "./pedigree/state";
import { selectOnly, selectionOf, viewSlice } from "./pedigree/view";
import { structureSlice } from "./pedigree/structure";
import { personSlice } from "./pedigree/person";
import { coupleSlice } from "./pedigree/couple";
import { chartSlice } from "./pedigree/chart";

/**
 * The pedigree being edited, its undo history, and how the editor is
 * looking at it. This file holds the pedigree, undo and redo, and the one
 * way an edit is made (`mutate`); the actions are in `pedigree/`, one file
 * per kind of edit, each with its types beside its code:
 *
 * - `view.ts`: selection, hover, picking, notices, the U-shape view
 * - `structure.ts`: adding and removing people, couples, parents, children
 * - `person.ts`: what is recorded about a person, singly or for several
 * - `couple.ts`: what is recorded about a couple, twins included
 * - `chart.ts`: title, settings, conditions and tags, filters, pins, locks
 * - `draft.ts`: edits to a pedigree in place that the actions share
 */

export { selectedPair } from "./pedigree/view";
export { MAX_ADD_CHILDREN } from "./pedigree/structure";
export { DEFAULT_SNAP_GRID_SIZE } from "./pedigree/chart";
export { hasPartnerOrChild } from "./pedigree/draft";

const EMPTY_PEDIGREE: Pedigree = {
  individuals: [],
  partnerships: [],
  parentOf: {},
  siblingOrder: { mode: "insertion", affectedFirst: false },
};

export const usePedigreeStore = create<PedigreeState>()((set, get) => {

  /** Drop selected ids that are no longer in the pedigree (after a removal, undo or redo). */
  function pruneSelection() {
    const { pedigree, selectedIds, selectedId } = get();
    if (selectedIds.length === 0) return;
    const present = new Set(pedigree.individuals.map(i => i.id));
    const kept = selectedIds.filter(id => present.has(id));
    if (kept.length !== selectedIds.length) set(selectionOf(kept, selectedId));
  }

  // Each is described on `EditTools`. Pedigrees in the store are never
  // changed in place, so the undo stack holds them as they are, sharing
  // whatever an edit left alone.
  const tools: EditTools = {
    set,
    get,

    mutate(recipe, hides = false) {
      const before = get().pedigree;
      let next = produce(before, recipe);
      if (next === before) return;
      const reveal = hides ? [] : rootsHidingNew(before, next);
      if (reveal.length) next = produce(next, d => { for (const i of d.individuals) if (reveal.includes(i.id)) delete i.descendantsHidden; });
      if (!hides && filterHidingNew(before, next)) next = produce(next, d => { delete d.filters; });
      set(s => ({ pedigree: next, past: [...s.past, before], future: [], isDirty: true }));
      pruneSelection();
    },

    editIndividual(id, edit) {
      tools.mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (ind) edit(ind, draft);
      });
    },

    editPartnership(id, edit) {
      tools.mutate(draft => {
        const p = draft.partnerships.find(x => x.id === id);
        if (p) edit(p, draft);
      });
    },

    mutateEach(ids, changes, apply, text) {
      const wanted = new Set(ids);
      const changing = get().pedigree.individuals.filter(i => wanted.has(i.id) && changes(i)).map(i => i.id);
      if (changing.length === 0) return;
      const targets = new Set(changing);
      tools.mutate(draft => { for (const ind of draft.individuals) if (targets.has(ind.id)) apply(ind); });
      get().setNotice({ kind: "info", text: text(changing.length), undoable: true });
    },

    nameOr(id, fallback) {
      return get().pedigree.individuals.find(i => i.id === id)?.name?.trim() || fallback;
    },
  };

  return {
    ...viewSlice(tools),
    ...structureSlice(tools),
    ...personSlice(tools),
    ...coupleSlice(tools),
    ...chartSlice(tools),

    pedigree: EMPTY_PEDIGREE,
    past: [],
    future: [],
    isDirty: false,
    layoutResetCount: 0,

    initialize: (p) => set(s => ({
      pedigree: p,
      layoutResetCount: s.layoutResetCount + 1,
      past: [],
      future: [],
      ...selectOnly(null),
      isDirty: false,
      picking: null,
      uShapeView: false,
    })),

    reset: () => set({
      pedigree: EMPTY_PEDIGREE,
      past: [],
      future: [],
      ...selectOnly(null),
      isDirty: false,
      picking: null,
      uShapeView: false,
    }),

    getPedigree: () => get().pedigree,

    undo: () => {
      const { past, pedigree, future } = get();
      if (past.length === 0) return;
      set({
        pedigree: past[past.length - 1],
        past: past.slice(0, -1),
        future: [pedigree, ...future],
        isDirty: true,
      });
      pruneSelection();
    },

    redo: () => {
      const { future, pedigree, past } = get();
      if (future.length === 0) return;
      set({
        pedigree: future[0],
        future: future.slice(1),
        past: [...past, pedigree],
        isDirty: true,
      });
      pruneSelection();
    },

    groupEdits: (run) => {
      const before = get().past.length;
      run();
      const { past } = get();
      if (past.length > before + 1) set({ past: past.slice(0, before + 1) });
    },

    applyFix: (fix) => applyFixEdit(fix.edit, get()),
    applyFixes: (fixes) => get().groupEdits(() => { for (const fix of fixes) applyFixEdit(fix.edit, get()); }),
  };
});

/**
 * Several fields of the store, for a component that destructures them. It
 * re-renders only when one of those fields changes, where
 * `usePedigreeStore()` re-renders on any change, a hover included (#197).
 * Use it, or `usePedigreeStore(s => s.field)`, never the bare call.
 */
export function usePedigreeFields<K extends keyof PedigreeState>(...keys: K[]): Pick<PedigreeState, K> {
  return usePedigreeStore(useShallow((s: PedigreeState) => {
    const picked = {} as Pick<PedigreeState, K>;
    for (const k of keys) picked[k] = s[k];
    return picked;
  }));
}
