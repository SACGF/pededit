/**
 * The pedigree store's types: one slice interface per action file in this
 * directory, the whole state, and the EditTools each slice is given. They
 * are here, not beside their code, so the action files import this file
 * and it imports none of them: the store has no import cycle.
 */
import type { StoreApi } from "zustand";
import type {
  Individual, Partnership, Pedigree, Sex, LifeStatus, Adoption, ReproductiveRole, Evaluation,
  ChildlessStatus, Zygosity, SiblingOrderSettings, CanvasSettings, Tag, ClinicalDetails, ViewFilters,
} from "@pedigree-editor/layout-engine";
import type { ProblemFix } from "../../pedigree/validation";
import type { Gamete } from "../../pedigree/assistedEdits";
import type { CarrierStatus } from "../../pedigree/batch";
import type { ConditionState } from "../../pedigree/conditions";
import type { ViewFilterPatch } from "../../pedigree/viewFilters";

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
  /** Parents for `childId`, or for every one of `childIds` at once (the batch "Set parents...", one undo step). */
  | { kind: "parents"; childId: string; childIds?: string[]; picked: string[] }
  /** An existing person to be a child of `individualId` (with a placeholder partner when they have none). */
  | { kind: "childOf"; individualId: string }
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

/** Implemented in `view.ts`. */
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
  /** "Set parents..." for several people: the parents picked are given to all of them, as one undo step. */
  startPickingParentsOf: (childIds: string[]) => void;
  /** "Add existing child..." for one person: the person clicked becomes their child. */
  startPickingChildOf: (individualId: string) => void;
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
  /** Select the person and everyone "Remove with ancestors" would take (`removeWithAncestorsSet`). Returns how many. */
  selectAncestors: (id: string) => number;
  setProblemHighlightId: (id: string | null) => void;
}

/** Implemented in `structure.ts`. */
export interface StructureSlice {
  addIndividual: (sex: Sex) => void;
  addParent: (individualId: string, sex: Sex) => void;
  addChild: (individualId: string, sex: Sex) => void;
  addChildren: (individualId: string, count: number, sex: Sex, partnershipId?: string) => void;
  addSibling: (individualId: string, sex?: Sex) => void;
  addPartner: (individualId: string) => void;
  /**
   * Make two existing individuals partners, which is how a marriage
   * between relatives is drawn. The new partnership has no children, keeps
   * the father role first. Nothing records that they are related: the double
   * line comes from their kinship (#85). Returns the reason when refused,
   * else null.
   */
  linkPartner: (individualId: string, partnerId: string) => string | null;
  deleteIndividual: (individualId: string) => void;
  /**
   * Delete several individuals as one undo step (Delete with a multiple
   * selection); children stay, as founders. Refused, with an error
   * notice, when nobody would be left. Returns how many were removed.
   */
  deleteIndividuals: (individualIds: string[]) => number;
  /**
   * Remove these individuals with everyone below them, plus partners who
   * married in and have no other link. Refused, with an error notice,
   * when nobody would be left. Returns how many were removed.
   */
  removeWithDescendants: (individualIds: string[]) => number;
  /** Remove these individuals with everyone above them; their descendants become founders. */
  removeWithAncestors: (individualIds: string[]) => number;
  /**
   * Make one or two existing individuals the parents of childId. Uses
   * their existing partnership or creates one; a single parent gets a new
   * unknown-sex partner. A
   * child who already has parents is moved. Returns the reason when
   * refused, else null.
   */
  setParents: (childId: string, parentIds: string[]) => string | null;
  /**
   * Take childId out of their parents' sibship: they become a founder
   * and the parents stay, as a couple (a gamete donor pair left with no
   * children is removed, as it is not a couple).
   */
  /**
   * Make an existing person a child of a same-sex couple: of
   * `geneticParentId` and a donor, the other partner a social parent (see
   * `applySameSexChildren`). Returns the reason when refused.
   */
  setSameSexChild: (childId: string, partnershipId: string, geneticParentId: string) => string | null;
  detachFromParents: (childId: string) => void;
  /** Detach every one of `childIds` from their parents, as one undo step. */
  detachFromParentsMany: (childIds: string[]) => void;
  /** Give every one of `childIds` the same parents, as one undo step. A problem with any of them refuses all. */
  setParentsMany: (childIds: string[], parentIds: string[]) => string | null;
  /**
   * Remove a partnership without removing either person, for a
   * partner linked by mistake. Refused, with the reason, while it has
   * children: they would lose a parent, so move them first.
   */
  removePartnership: (partnershipId: string) => string | null;
  moveSibLeft: (individualId: string) => void;
  moveSibRight: (individualId: string) => void;
  /**
   * Assisted reproduction. addDonor makes a new sperm or egg donor the
   * child's genetic parent in place of one parent, who stays linked to the
   * child (see `applyAddDonor` in pedigree/assisted.ts); addSurrogate adds
   * the woman who carried the child. Both return a reason when refused.
   * `existingId` makes someone already on the tree the donor or surrogate.
   */
  addDonor: (childId: string, gamete: Gamete, existingId?: string) => string | null;
  addSurrogate: (childId: string, existingId?: string) => string | null;
  /** The inverse of addDonor: the replaced parent is the genetic parent again (`applyRemoveDonor`). */
  removeDonor: (childId: string) => string | null;
  /** The inverse of addSurrogate (`applyRemoveSurrogate`). */
  removeSurrogate: (childId: string) => string | null;
}

/** Implemented in `person.ts`. */
export interface PersonSlice {
  updateIndividual: (id: string, updates: Partial<Individual>) => void;
  setSex: (id: string, sex: Sex) => void;
  /**
   * The plain Affected status. With exactly one condition tag it records that
   * condition too; unticking clears every affected condition
   * (`applyAffected`).
   */
  setAffected: (id: string, affected: boolean) => void;
  /**
   * One person's state for one condition (quadrant tag): affected,
   * carrier or neither (`applyConditionState`).
   */
  setConditionStatus: (id: string, tagId: string, state: ConditionState) => void;
  /**
   * Carrier with no condition recorded (the dot in 2008, the dotted half in
   * 2022); with exactly one condition tag, a carrier of it. Setting it
   * clears `presymptomatic`: the two are one carrier status.
   */
  setCarrier: (id: string, carrier: boolean) => void;
  /** Presymptomatic carrier, a vertical line through the symbol. Setting it clears `carrier`. */
  setPresymptomatic: (id: string, presymptomatic: boolean) => void;
  /** Unticking deceased also clears the date of death. */
  setDeceased: (id: string, deceased: boolean) => void;
  /** Date of death, "YYYY", "YYYY-MM" or "YYYY-MM-DD"; a non-empty one also ticks deceased, empty removes it. */
  setDateOfDeath: (id: string, dod: string | undefined) => void;
  /** Pregnancy / loss status. Refused (no-op) when the individual has a partner or children. */
  setLifeStatus: (id: string, status: LifeStatus | undefined) => void;
  /** Replace the person's evaluations; an empty list removes the field. */
  setEvaluations: (id: string, evaluations: Evaluation[]) => void;
  setProband: (id: string) => void;
  /** Consultand arrow without the "P". Several people may be consultands. */
  setConsultand: (id: string, consultand: boolean) => void;
  /** "?" above the symbol: family history not known. */
  setFamilyHistoryUnknown: (id: string, unknown: boolean) => void;
  /** Adoption brackets: "in", "out" or none. */
  setAdopted: (id: string, status: Adoption | undefined) => void;
  setReproductiveRole: (id: string, role: ReproductiveRole | undefined) => void;
  /** The woman who carried the child when not its genetic mother; undefined clears it. */
  setCarriedBy: (childId: string, carrierId: string | undefined) => void;
  /** Parents of the child who are not genetic parents (dashed line). */
  setSocialParents: (childId: string, parentIds: string[]) => void;
  setIndividualTag: (individualId: string, tagId: string, on: boolean) => void;
  /**
   * Age of onset of the affected status (tagId null) or of a condition
   * tag. An empty or blank value removes it.
   */
  setOnset: (individualId: string, tagId: string | null, value: string) => void;
  // Batch status changes on a multiple selection. Each is one undo step
  // and a no-op (no undo step) when nobody would change; the rules are the
  // single-person setters' applied to each person.
  setAffectedMany: (ids: string[], affected: boolean) => void;
  setDeceasedMany: (ids: string[], deceased: boolean) => void;
  /** Carrier dot, presymptomatic line or neither, kept exclusive as `setCarrier` / `setPresymptomatic` do. */
  setCarrierStatusMany: (ids: string[], status: CarrierStatus) => void;
  /** Refused with the reason (see `batchSexProblem`); monozygotic twins follow. */
  setSexMany: (ids: string[], sex: Sex) => string | null;
  setIndividualTagMany: (ids: string[], tagId: string, on: boolean) => void;
  /** `setConditionStatus` for several people, one undo step. */
  setConditionStatusMany: (ids: string[], tagId: string, state: ConditionState) => void;
  setConsultandMany: (ids: string[], consultand: boolean) => void;
  setFamilyHistoryUnknownMany: (ids: string[], unknown: boolean) => void;
  setAdoptedMany: (ids: string[], status: Adoption | undefined) => void;
}

/** Implemented in `couple.ts`. */
export interface CoupleSlice {
  /**
   * Make (or replace) a twin set among the children of partnershipId.
   * Members already in another set of that partnership are moved into this
   * one. Returns the reason when refused (fewer than two members, not all
   * children of the couple, different sexes for monozygotic), else null.
   */
  setTwins: (partnershipId: string, members: string[], zygosity: Zygosity) => string | null;
  /** Take an individual out of their twin set; a set left with one member is dropped. */
  removeTwin: (id: string) => void;
  /** Take every one of `ids` out of their twin sets, as one undo step. */
  removeTwins: (ids: string[]) => void;
  /**
   * Childless couple mark. Refused (no-op) when the partnership has
   * children. Clearing with undefined also drops the reason.
   */
  setPartnershipChildless: (partnershipId: string, status: ChildlessStatus | undefined) => void;
  /** Reason under the mark; empty clears it. */
  setPartnershipChildlessReason: (partnershipId: string, reason: string) => void;
  /**
   * The double-line override: mark a couple as related when the
   * pedigree does not show how. False removes the flag; a couple the
   * pedigree shows to be related keeps its double line either way.
   */
  setPartnershipConsanguineous: (partnershipId: string, related: boolean) => void;
  /** Text above the double line; empty clears it. */
  setPartnershipConsanguinityLabel: (partnershipId: string, label: string) => void;
  /** Ended relationship: two strokes across the couple line. False removes the flag. */
  setPartnershipEnded: (partnershipId: string, ended: boolean) => void;
  /**
   * Draw the couple's partners the other way round, by setting
   * `Partnership.leftPartner` (and the partner's other couple's, when they
   * have exactly two partners). One undo step, nobody pinned. Returns the
   * reason when refused, also shown as a notice.
   */
  swapPartnerSides: (partnershipId: string) => string | null;
  /**
   * Draw the couple where `individualId` (one of its partners) is placed, so
   * the other partner is the one drawn twice if someone must be; null hands
   * the choice back to the layout. Sets `Partnership.drawnBeside` and the
   * side it acts on. One undo step, nobody pinned. A notice says who is now
   * drawn twice, or why nothing changed (also returned).
   */
  setCoupleDrawnBeside: (partnershipId: string, individualId: string | null) => string | null;
}

/** Implemented in `chart.ts`. */
export interface ChartSlice {
  /** Title above the chart. "" hides it; undefined falls back to the pedigree's name. */
  setChartTitle: (title: string | undefined) => void;
  /** Set one clinical key field; an empty value removes it, and the block goes when empty. */
  setClinicalDetail: (field: keyof ClinicalDetails, value: string) => void;
  updateCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  updateSiblingOrderSettings: (settings: Partial<SiblingOrderSettings>) => void;
  addTag: (tag: Omit<Tag, "id"> & { id?: string }) => string;
  updateTag: (id: string, updates: Partial<Omit<Tag, "id">>) => void;
  deleteTag: (id: string) => void;
  moveTag: (id: string, direction: -1 | 1) => void;
  /**
   * Hide or show everyone below these individuals; see
   * `pedigree/collapse.ts` for who that takes. One undo step. Hidden people
   * are dropped from the selection.
   */
  setDescendantsHidden: (individualIds: string[], hidden: boolean) => void;
  /**
   * Set a view filter field, see `pedigree/viewFilters.ts`; `false` or
   * `undefined` removes it, and switching off `affectedOnly` drops its
   * `affectedCondition` too.
   * Saved with the pedigree, one undo step. Hidden people are dropped from
   * the selection.
   */
  setViewFilter: <K extends keyof ViewFilters>(key: K, value: ViewFilters[K] | false | undefined) => void;
  /** Write several view filter fields at once (`undefined` removes one), one undo step. */
  updateViewFilters: (patch: ViewFilterPatch) => void;
  /** Switch every view filter off, one undo step. */
  clearViewFilters: () => void;
  pinIndividual: (individualId: string, pos: { x: number; y: number }) => void;
  /** Pin several individuals as one undo step (a group drag). Positions in normal spacing. */
  pinIndividuals: (positions: Record<string, { x: number; y: number }>) => void;
  unpinIndividual: (individualId: string) => void;
  unpinIndividuals: (individualIds: string[]) => void;
  resetLayout: () => void;
  unlockIndividual: (individualId: string) => void;
  /** Unlock several individuals as one undo step. No-op when all are unlocked already. */
  unlockIndividuals: (individualIds: string[]) => void;
  /** Lock several individuals as one undo step, dropping their pins (back to auto layout). */
  lockIndividuals: (individualIds: string[]) => void;
  lockIndividual: (individualId: string) => void;
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
