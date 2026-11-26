import type { StoreApi } from "zustand";
import type { Individual, Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import type { ProblemFix } from "../../pedigree/validation";
import type { ViewSlice } from "./view";
import type { StructureSlice } from "./structure";
import type { PersonSlice } from "./person";
import type { CoupleSlice } from "./couple";
import type { ChartSlice } from "./chart";

/** The pedigree and its undo history, implemented in `usePedigreeStore.ts`. */
export interface CoreSlice {
  pedigree: Pedigree;
  past: Pedigree[];    // undo stack, newest last
  future: Pedigree[];  // redo stack, newest first
  isDirty: boolean;
  /**
   * Bumped by resetLayout and by initialize so the canvas refits the
   * view. React Flow's fitView prop fits only once, on mount, and the canvas
   * mounts while the previous pedigree is still here: opening an example
   * after another pedigree was fitted to the old one. Not undoable.
   */
  layoutResetCount: number;
  initialize: (p: Pedigree) => void;
  reset: () => void;
  getPedigree: () => Pedigree;  // used by useAppStore to read for save
  undo: () => void;
  redo: () => void;
  /**
   * Run several edits as one undo step ("Fix all like this"): the undo
   * steps they record are folded into the first, so one undo restores
   * the pedigree as it was before all of them.
   */
  groupEdits: (run: () => void) => void;
  /** Make a problem's one-click fix. A fix is data (`FixEdit`); this is where it becomes an edit. */
  applyFix: (fix: ProblemFix) => void;
  /** Several fixes as one undo step ("Fix all like this"). */
  applyFixes: (fixes: ProblemFix[]) => void;
}

/** Everything in the pedigree store: one slice per file in this directory. */
export type PedigreeState = CoreSlice & ViewSlice & StructureSlice & PersonSlice & CoupleSlice & ChartSlice;

/**
 * What each slice is given to read and edit the store. Every change to
 * the pedigree goes through `mutate` or one of the three built on it,
 * never through `set`, which is for what is not saved (selection, notices).
 */
export interface EditTools {
  set: StoreApi<PedigreeState>["setState"];
  get: () => PedigreeState;
  /**
   * Apply an Immer recipe to the pedigree as one undo step. A recipe that
   * changes nothing is not an edit: no undo step, and the pedigree is not
   * marked as needing a save. So an action need not check first whether it
   * would change anything, as long as its recipe only assigns what differs
   * (assigning an equal value or deleting a missing key is no change to
   * Immer; building a new array or object is).
   *
   * Only the actions meant to hide people pass `hides`: after any other
   * edit, a collapsed branch that would swallow someone added or moved is
   * shown, and if a view filter would still leave someone new out of the
   * drawing, the filters are turned off.
   */
  mutate: (recipe: (draft: Pedigree) => void, hides?: boolean) => void;
  /** One undo step editing the person `id`. Nothing happens when they are not in the pedigree. */
  editIndividual: (id: string, edit: (ind: Individual, draft: Pedigree) => void) => void;
  /** One undo step editing the partnership `id`. Nothing happens when it is not in the pedigree. */
  editPartnership: (id: string, edit: (p: Partnership, draft: Pedigree) => void) => void;
  /**
   * One undo step applying `apply` to each of `ids` that `changes`, then
   * an undoable notice saying how many changed. Nothing happens when
   * nobody would change.
   */
  mutateEach: (ids: string[], changes: (ind: Individual) => boolean, apply: (ind: Individual) => void, text: (n: number) => string) => void;
  /** A person's name for a notice, or `fallback` when they have none. */
  nameOr: (id: string, fallback: string) => string;
}
