import { create } from "zustand";
import { produce } from "immer";
import type {
  Pedigree, Individual, Sex, SiblingOrderSettings, Partnership, CanvasSettings, Tag, LifeStatus, ChildlessStatus, Adoption, ReproductiveRole, Zygosity, ClinicalDetails, ViewFilters
} from "@pedigree-editor/layout-engine";
import type { Evaluation } from "@pedigree-editor/layout-engine";
import { twinSetProblem, twinSetOf } from "../pedigree/twins";
import { removeWithDescendantsSet, removeWithAncestorsSet, removeIndividuals, dropAssistedLinks } from "../pedigree/removal";
import { setParentsProblem, currentParentsOf } from "../pedigree/parents";
import { dropLeftoverPlaceholders, partnersIn } from "../pedigree/placeholders";
import { linkPartnerProblem, swapSidesPlan } from "../pedigree/partners";
import { kinshipOf } from "../pedigree/relatedness";
import { activeSnapGrid, snapPoint } from "../pedigree/snap";
import { collapseInfo, filterHidingNew, rootsHidingNew } from "../pedigree/collapse";
import { addDonorProblem, applyAddDonor, addSurrogateProblem, applyAddSurrogate, type Gamete } from "../pedigree/assisted";
import { applySameSexChildren, isSameSexCouple, sameSexChildProblem } from "../pedigree/sameSex";
import { batchSexProblem, batchSexTargets, carrierStatusOf, type CarrierStatus } from "../pedigree/batch";
import { applyAffected, applyCarrier, applyConditionState, type ConditionState } from "../pedigree/conditions";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ActiveTool = "select" | "addMale" | "addFemale" | "addUnknown";

/**
 * On-canvas picking (#36): clicks choose existing individuals instead of
 * selecting. "parents" collects one or two parents for a child; "child"
 * takes one click, the individual who becomes a child of the partnership
 * (of `geneticParentId` and a donor, for a same-sex couple, #105).
 * "partner" (#84) takes one click, the existing individual who becomes the
 * partner of individualId. "relatedness" (#90) takes one click and selects
 * that person with individualId, so the panel shows how the two are related.
 * "donor" and "surrogate" (#104) take one click, an existing person who
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

const EMPTY_PEDIGREE: Pedigree = {
  individuals: [],
  partnerships: [],
  parentOf: {},
  siblingOrder: { mode: "insertion", affectedFirst: false },
};

/** Default snap grid size in canvas pixels. Used when a pedigree has no canvasSettings. */
export const DEFAULT_SNAP_GRID_SIZE = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────

function newId(): string {
  return crypto.randomUUID();
}

/** Find the partnership ID where individualId is a child. Returns null if none. */
function findParentPartnershipId(
  pedigree: Pedigree,
  individualId: string
): string | null {
  for (const [partnerId, children] of Object.entries(pedigree.parentOf)) {
    if (children.includes(individualId)) return partnerId;
  }
  return null;
}

/** Find all partnership IDs where individualId is individual1 or individual2. */
function findOwnPartnerships(
  pedigree: Pedigree,
  individualId: string
): string[] {
  return pedigree.partnerships
    .filter(p => p.individual1 === individualId || p.individual2 === individualId)
    .map(p => p.id);
}

/**
 * True when the individual has a partner or children. Children only exist
 * through a partnership, so one check covers both. A pregnancy or pregnancy
 * loss can have neither, see setLifeStatus.
 */
export function hasPartnerOrChild(pedigree: Pedigree, individualId: string): boolean {
  return findOwnPartnerships(pedigree, individualId).length > 0;
}

/** Next sibOrder value within a sibling group (children of partnershipId). */
function nextSibOrderInFamily(pedigree: Pedigree, partnershipId: string): number {
  const siblings = pedigree.parentOf[partnershipId] ?? [];
  if (siblings.length === 0) return 0;
  const max = Math.max(
    ...siblings.map(id => {
      const ind = pedigree.individuals.find(i => i.id === id);
      return ind?.sibOrder ?? 0;
    })
  );
  return max + 1;
}

/** Next sibOrder for a root individual (no parents) within the root group. */
function nextRootSibOrder(pedigree: Pedigree): number {
  const rootIds = new Set(
    pedigree.individuals.map(i => i.id)
  );
  // Remove anyone who IS a child
  for (const children of Object.values(pedigree.parentOf)) {
    for (const c of children) rootIds.delete(c);
  }
  if (rootIds.size === 0) return 0;
  const max = Math.max(
    ...[...rootIds].map(id => {
      const ind = pedigree.individuals.find(i => i.id === id);
      return ind?.sibOrder ?? 0;
    })
  );
  return max + 1;
}

function makeIndividual(sex: Sex, sibOrder: number): Individual {
  return {
    id: newId(),
    sex,
    affected: false,
    sibOrder,
    name: "",
    notes: "",
  };
}

/** The automatic second parent of a single parent's child (#107, `pedigree/placeholders.ts`). */
function makePlaceholder(sex: Sex): Individual {
  return { ...makeIndividual(sex, 0), placeholder: true };
}

/**
 * Partnership to which a child of individualId should be added, creating one
 * (with an opposite-sex placeholder partner) if the individual has none.
 * Mirrors the partnership choice made by addChild.
 */
function ensureChildPartnershipId(draft: Pedigree, individualId: string, preferred?: string): string {
  const ownPs = findOwnPartnerships(draft, individualId);
  if (preferred && ownPs.includes(preferred)) return preferred;
  if (ownPs.length > 0) return ownPs[0]!;

  const ind = draft.individuals.find(i => i.id === individualId)!;
  const partnerSex: Sex =
    ind.sex === "male" ? "female" :
    ind.sex === "female" ? "male" : "unknown";
  const placeholder = makePlaceholder(partnerSex);
  const partnership: Partnership = {
    id: newId(),
    individual1: individualId,
    individual2: placeholder.id,
  };
  draft.individuals.push(placeholder);
  draft.partnerships.push(partnership);
  draft.parentOf[partnership.id] = [];
  return partnership.id;
}

/** Take an individual out of any twin set; a set left with one member is dropped (#11). */
function removeFromTwinSets(draft: Pedigree, individualId: string): void {
  for (const p of draft.partnerships) {
    if (!p.twins) continue;
    p.twins = p.twins
      .map(t => ({ ...t, members: t.members.filter(m => m !== individualId) }))
      .filter(t => t.members.length >= 2);
    if (p.twins.length === 0) delete p.twins;
  }
}

/** Drop an individual's age of onset for one tag (#93), and the map when it empties. */
/** Whether an in-place edit would change the person, tried on a copy (store state is frozen). */
function dryRun(ind: Individual, edit: (copy: Individual) => boolean): boolean {
  return edit(JSON.parse(JSON.stringify(ind)) as Individual);
}

function removeTagOnset(ind: Individual, tagId: string): void {
  if (!ind.tagOnset || !(tagId in ind.tagOnset)) return;
  delete ind.tagOnset[tagId];
  if (Object.keys(ind.tagOnset).length === 0) delete ind.tagOnset;
}

/** A child contradicts a childless mark, so adding one removes the mark (#15). */
function clearChildless(draft: Pedigree, partnershipId: string): void {
  const p = draft.partnerships.find(x => x.id === partnershipId);
  if (!p) return;
  delete p.childless;
  delete p.childlessReason;
}

/**
 * Selection fields for selecting exactly `id` (or nothing). Every store write
 * of the selection goes through here or `selectionOf`, so `selectedId` is
 * always the primary member of `selectedIds` (#21).
 */
function selectOnly(id: string | null): { selectedId: string | null; selectedIds: string[] } {
  return { selectedId: id, selectedIds: id ? [id] : [] };
}

/** Selection fields for `ids` (deduplicated), with `primary` (default the last id) as selectedId. */
function selectionOf(ids: string[], primary?: string | null): { selectedId: string | null; selectedIds: string[] } {
  const selectedIds = [...new Set(ids)];
  const selectedId = primary && selectedIds.includes(primary) ? primary : (selectedIds[selectedIds.length - 1] ?? null);
  return { selectedId, selectedIds };
}

/**
 * The two selected individuals when exactly two are selected, else null:
 * the primary (last clicked) second. For pairwise views such as #90.
 */
export function selectedPair(state: { selectedId: string | null; selectedIds: string[] }): [string, string] | null {
  if (state.selectedIds.length !== 2 || !state.selectedId) return null;
  const other = state.selectedIds.find(id => id !== state.selectedId)!;
  return [other, state.selectedId];
}

/** Clamp the batch size accepted by addChildren. */
export const MAX_ADD_CHILDREN = 10;

// ── Store interface ────────────────────────────────────────────────────────────

interface PedigreeState {
  pedigree: Pedigree;
  past: Pedigree[];    // undo stack, newest last
  future: Pedigree[];  // redo stack, newest last

  activeTool: ActiveTool;
  /**
   * Selection (#21). `selectedIds` holds every selected individual id;
   * `selectedId` is the primary one (the last clicked), which the edit
   * panel and single-person actions use. With nothing selected they are
   * [] and null; with one, [id] and id. Kept in step by the actions below,
   * never set directly. `selectedPair` reads exactly two.
   */
  selectedId: string | null;
  selectedIds: string[];
  hoveredId: string | null;
  /** The person outlined on the canvas while a problem is hovered in the problems list (#116). Not undoable. */
  problemHighlightId: string | null;
  isDirty: boolean;
  /** Bumped by resetLayout so the canvas can refit the view (#64). Not undoable. */
  layoutResetCount: number;
  /** The latest notice for the page to show, or null. */
  notice: Notice | null;
  setNotice: (notice: Omit<Notice, "id"> | null) => void;

  /** Active on-canvas picking, or null. Not undoable. */
  picking: Picking | null;
  startPickingParents: (childId: string) => void;
  startPickingChild: (partnershipId: string, geneticParentId?: string) => void;
  startPickingPartner: (individualId: string) => void;
  startPickingRelatedness: (individualId: string) => void;
  /** Pick an existing person as the child's sperm or egg donor, or as the surrogate (#104). */
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

  // Lifecycle
  initialize: (p: Pedigree) => void;
  reset: () => void;
  getPedigree: () => Pedigree;  // used by useAppStore to read for save

  // Tool + selection
  setActiveTool: (tool: ActiveTool) => void;
  /** Select only this individual, or clear the selection with null. */
  setSelectedId: (id: string | null) => void;
  /** Shift / Ctrl / Cmd+click: add id to the selection (as primary) or take it out. */
  toggleSelected: (id: string) => void;
  /** Replace the selection (rubber band, select descendants). Primary defaults to the last id. */
  setSelection: (ids: string[], primary?: string | null) => void;
  /**
   * Select a person, their descendants and the partners who married into
   * that branch (the "remove with descendants" set, #34), with the person
   * as primary. Returns how many are selected.
   */
  selectDescendants: (id: string) => number;
  setHoveredId: (id: string | null) => void;
  setProblemHighlightId: (id: string | null) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;
  /**
   * Run several edits as one undo step ("Fix all like this", #116): the
   * snapshots they push are folded into the first, so one undo restores
   * the pedigree as it was before all of them.
   */
  groupEdits: (run: () => void) => void;

  // Structural mutations (each snapshots before mutating)
  addIndividual: (sex: Sex) => void;
  addParent: (individualId: string, sex: Sex) => void;
  addChild: (individualId: string, sex: Sex) => void;
  addChildren: (individualId: string, count: number, sex: Sex, partnershipId?: string) => void;
  addSibling: (individualId: string) => void;
  addPartner: (individualId: string) => void;
  /**
   * Make two existing individuals partners (#84), which is how a marriage
   * between relatives is drawn. The new partnership has no children, keeps
   * the father role first. Nothing records that they are related: the double
   * line comes from their kinship (#85). Returns the reason when refused,
   * else null.
   */
  linkPartner: (individualId: string, partnerId: string) => string | null;
  deleteIndividual: (individualId: string) => void;
  /**
   * Delete several individuals as one undo step (Delete with a multiple
   * selection, #21); children stay, as founders. Refused, with an error
   * notice, when nobody would be left. Returns how many were removed.
   */
  deleteIndividuals: (individualIds: string[]) => number;
  /**
   * Remove these individuals with everyone below them, plus partners who
   * married in and have no other link (#34). Refused, with an error notice,
   * when nobody would be left. Returns how many were removed.
   */
  removeWithDescendants: (individualIds: string[]) => number;
  /** Remove these individuals with everyone above them; their descendants become founders (#34). */
  removeWithAncestors: (individualIds: string[]) => number;
  /**
   * Hide or show everyone below these individuals (#94); see
   * `pedigree/collapse.ts` for who that takes. One undo step. Hidden people
   * are dropped from the selection.
   */
  setDescendantsHidden: (individualIds: string[], hidden: boolean) => void;
  /**
   * Switch a view filter (#4) on or off; see `pedigree/viewFilters.ts`.
   * Saved with the pedigree, one undo step. Hidden people are dropped from
   * the selection.
   */
  setViewFilter: (key: keyof ViewFilters, on: boolean) => void;
  /**
   * Make one or two existing individuals the parents of childId (#36). Uses
   * their existing partnership or creates one; a single parent gets a new
   * unknown-sex partner. A
   * child who already has parents is moved. Returns the reason when
   * refused, else null.
   */
  setParents: (childId: string, parentIds: string[]) => string | null;
  /**
   * Take childId out of their parents' sibship (#104): they become a founder
   * and the parents stay, as a couple (a gamete donor pair left with no
   * children is removed, as it is not a couple).
   */
  /**
   * Make an existing person a child of a same-sex couple (#105): of
   * `geneticParentId` and a donor, the other partner a social parent (see
   * `applySameSexChildren`). Returns the reason when refused.
   */
  setSameSexChild: (childId: string, partnershipId: string, geneticParentId: string) => string | null;
  detachFromParents: (childId: string) => void;
  /**
   * Remove a partnership without removing either person (#104), for a
   * partner linked by mistake. Refused, with the reason, while it has
   * children: they would lose a parent, so move them first.
   */
  removePartnership: (partnershipId: string) => string | null;
  moveSibLeft: (individualId: string) => void;
  moveSibRight: (individualId: string) => void;

  // Individual property mutations
  updateIndividual: (id: string, updates: Partial<Individual>) => void;
  /**
   * The plain Affected status. With exactly one condition tag it records that
   * condition too; unticking clears every affected condition (#115,
   * `applyAffected`).
   */
  setAffected: (id: string, affected: boolean) => void;
  /**
   * One person's state for one condition (quadrant tag, #115): affected,
   * carrier or neither (`applyConditionState`).
   */
  setConditionStatus: (id: string, tagId: string, state: ConditionState) => void;
  /** Unticking deceased also clears the date of death (#103). */
  setDeceased: (id: string, deceased: boolean) => void;
  /** Date of death (#103), "YYYY", "YYYY-MM" or "YYYY-MM-DD"; a non-empty one also ticks deceased, empty removes it. */
  setDateOfDeath: (id: string, dod: string | undefined) => void;
  /**
   * Carrier with no condition recorded (the dot in 2008, the dotted half in
   * 2022); with exactly one condition tag, a carrier of it (#115). Setting it
   * clears `presymptomatic`: the two are one carrier status (#101).
   */
  setCarrier: (id: string, carrier: boolean) => void;
  /** Presymptomatic carrier, a vertical line through the symbol (#101). Setting it clears `carrier`. */
  setPresymptomatic: (id: string, presymptomatic: boolean) => void;
  /** Replace the person's evaluations (#101); an empty list removes the field. */
  setEvaluations: (id: string, evaluations: Evaluation[]) => void;
  setProband: (id: string) => void;
  /** Consultand arrow without the "P" (#99). Several people may be consultands. */
  setConsultand: (id: string, consultand: boolean) => void;
  /** "?" above the symbol: family history not known (#100). */
  setFamilyHistoryUnknown: (id: string, unknown: boolean) => void;
  setSex: (id: string, sex: Sex) => void;
  // Batch status changes on a multiple selection (#35). Each is one undo step
  // and a no-op (no undo step) when nobody would change; the rules are the
  // single-person setters' applied to each person.
  setAffectedMany: (ids: string[], affected: boolean) => void;
  setDeceasedMany: (ids: string[], deceased: boolean) => void;
  /** Carrier dot, presymptomatic line or neither, kept exclusive as `setCarrier` / `setPresymptomatic` do. */
  setCarrierStatusMany: (ids: string[], status: CarrierStatus) => void;
  /** Refused with the reason (see `batchSexProblem`); monozygotic twins follow. */
  setSexMany: (ids: string[], sex: Sex) => string | null;
  setIndividualTagMany: (ids: string[], tagId: string, on: boolean) => void;
  /** `setConditionStatus` for several people, one undo step (#115). */
  setConditionStatusMany: (ids: string[], tagId: string, state: ConditionState) => void;
  /** Pregnancy / loss status. Refused (no-op) when the individual has a partner or children. */
  setLifeStatus: (id: string, status: LifeStatus | undefined) => void;
  /** Adoption brackets (#12): "in", "out" or none. */
  setAdopted: (id: string, status: Adoption | undefined) => void;
  /**
   * Assisted reproduction (#45). addDonor makes a new sperm or egg donor the
   * child's genetic parent in place of one parent, who stays linked to the
   * child (see `applyAddDonor` in pedigree/assisted.ts); addSurrogate adds
   * the woman who carried the child. Both return a reason when refused.
   * `existingId` makes someone already on the tree the donor or surrogate (#104).
   */
  addDonor: (childId: string, gamete: Gamete, existingId?: string) => string | null;
  addSurrogate: (childId: string, existingId?: string) => string | null;
  setReproductiveRole: (id: string, role: ReproductiveRole | undefined) => void;
  /** The woman who carried the child when not its genetic mother; undefined clears it. */
  setCarriedBy: (childId: string, carrierId: string | undefined) => void;
  /** Parents of the child who are not genetic parents (dashed line). */
  setSocialParents: (childId: string, parentIds: string[]) => void;
  /**
   * Make (or replace) a twin set (#11) among the children of partnershipId.
   * Members already in another set of that partnership are moved into this
   * one. Returns the reason when refused (fewer than two members, not all
   * children of the couple, different sexes for monozygotic), else null.
   */
  setTwins: (partnershipId: string, members: string[], zygosity: Zygosity) => string | null;
  /** Take an individual out of their twin set; a set left with one member is dropped. */
  removeTwin: (id: string) => void;

  // Partnership property mutations
  /**
   * Childless couple mark (#15). Refused (no-op) when the partnership has
   * children. Clearing with undefined also drops the reason.
   */
  setPartnershipChildless: (partnershipId: string, status: ChildlessStatus | undefined) => void;
  /** Reason under the mark; empty clears it. */
  setPartnershipChildlessReason: (partnershipId: string, reason: string) => void;
  /**
   * The double-line override (#85): mark a couple as related when the
   * pedigree does not show how. False removes the flag; a couple the
   * pedigree shows to be related keeps its double line either way.
   */
  setPartnershipConsanguineous: (partnershipId: string, related: boolean) => void;
  /** Text above the double line (#97); empty clears it. */
  setPartnershipConsanguinityLabel: (partnershipId: string, label: string) => void;
  /** Ended relationship (#98): two strokes across the couple line. False removes the flag. */
  setPartnershipEnded: (partnershipId: string, ended: boolean) => void;
  /**
   * Draw the couple's partners the other way round (#106), by setting
   * `Partnership.leftPartner` (and the partner's other couple's, when they
   * have exactly two partners). One undo step, nobody pinned. Returns the
   * reason when refused, also shown as a notice.
   */
  swapPartnerSides: (partnershipId: string) => string | null;

  // Pedigree-level settings
  updateSiblingOrderSettings: (settings: Partial<SiblingOrderSettings>) => void;

  // Pin / drag
  pinIndividual: (individualId: string, pos: { x: number; y: number }) => void;
  /** Pin several individuals as one undo step (a group drag, #21). Positions in normal spacing. */
  pinIndividuals: (positions: Record<string, { x: number; y: number }>) => void;
  unpinIndividual: (individualId: string) => void;
  resetLayout: () => void;

  // Lock / unlock per-node
  unlockIndividual: (individualId: string) => void;
  lockIndividual: (individualId: string) => void;
  /** Unlock several individuals as one undo step (#21). No-op when all are unlocked already. */
  unlockIndividuals: (individualIds: string[]) => void;
  /** Lock several individuals as one undo step, dropping their pins (back to auto layout). */
  lockIndividuals: (individualIds: string[]) => void;

  // Canvas settings
  updateCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  /** Title above the chart (#20). "" hides it; undefined falls back to the pedigree's name. */
  setChartTitle: (title: string | undefined) => void;
  /** Set one clinical key field (#102); an empty value removes it, and the block goes when empty. */
  setClinicalDetail: (field: keyof ClinicalDetails, value: string) => void;

  // Tags (definitions live on the pedigree; individuals reference them by id)
  addTag: (tag: Omit<Tag, "id"> & { id?: string }) => string;
  updateTag: (id: string, updates: Partial<Omit<Tag, "id">>) => void;
  deleteTag: (id: string) => void;
  moveTag: (id: string, direction: -1 | 1) => void;
  setIndividualTag: (individualId: string, tagId: string, on: boolean) => void;
  /**
   * Age of onset (#93) of the affected status (tagId null) or of a condition
   * tag. An empty or blank value removes it.
   */
  setOnset: (individualId: string, tagId: string | null, value: string) => void;
}

// ── Store implementation ───────────────────────────────────────────────────────

export const usePedigreeStore = create<PedigreeState>()((set, get) => {

  /** Snapshot current pedigree to undo stack before any mutation. */
  function snapshot() {
    const { pedigree, past } = get();
    set({ past: [...past, structuredClone(pedigree)], future: [], isDirty: true });
  }

  /**
   * Mutate pedigree with an Immer recipe, after snapshotting. Only
   * setDescendantsHidden and setViewFilter may hide people (`hides`): after
   * any other edit, a collapsed branch that would swallow someone added or
   * moved is shown (#94), and if a view filter would still leave someone new
   * out of the drawing, the filters are turned off (#4).
   */
  function mutate(recipe: (draft: Pedigree) => void, hides = false) {
    snapshot();
    set(state => {
      let next = produce(state.pedigree, recipe);
      const reveal = hides ? [] : rootsHidingNew(state.pedigree, next);
      if (reveal.length) next = produce(next, d => { for (const i of d.individuals) if (reveal.includes(i.id)) delete i.descendantsHidden; });
      if (!hides && filterHidingNew(state.pedigree, next)) next = produce(next, d => { delete d.filters; });
      return { pedigree: next };
    });
    pruneSelection();
  }

  /**
   * Say what adding a child to a same-sex couple did (#105): the donor is
   * new on the canvas, so the user should know where it came from.
   */
  function noticeDonorChildren(geneticParentId: string, pairId: string, n: number) {
    const ped = get().pedigree;
    const pair = ped.partnerships.find(p => p.id === pairId);
    const donor = ped.individuals.find(i => i.id === (pair?.individual1 === geneticParentId ? pair?.individual2 : pair?.individual1));
    const name = ped.individuals.find(i => i.id === geneticParentId)?.name?.trim() || "this person";
    const kind = donor?.sex === "male" ? "sperm donor" : "egg donor";
    get().setNotice({
      kind: "info",
      text: `Added ${n === 1 ? "a child" : `${n} children`} of ${name} and ${donor?.name?.trim() || `a ${kind}`}: partners of the same sex have no genetic children together, so the partner is recorded as a parent who is not genetic.`,
      undoable: true,
    });
  }

  /**
   * One undo step applying `apply` to each of `ids` that `changes` (#35),
   * then an undoable notice saying how many changed. Nothing happens when
   * nobody would change.
   */
  function mutateEach(ids: string[], changes: (ind: Individual) => boolean, apply: (ind: Individual) => void, text: (n: number) => string) {
    const wanted = new Set(ids);
    const changing = get().pedigree.individuals.filter(i => wanted.has(i.id) && changes(i)).map(i => i.id);
    if (changing.length === 0) return;
    const targets = new Set(changing);
    mutate(draft => { for (const ind of draft.individuals) if (targets.has(ind.id)) apply(ind); });
    get().setNotice({ kind: "info", text: text(changing.length), undoable: true });
  }

  /** Drop selected ids that are no longer in the pedigree (after a removal, undo or redo). */
  function pruneSelection() {
    const { pedigree, selectedIds, selectedId } = get();
    if (selectedIds.length === 0) return;
    const present = new Set(pedigree.individuals.map(i => i.id));
    const kept = selectedIds.filter(id => present.has(id));
    if (kept.length !== selectedIds.length) set(selectionOf(kept, selectedId));
  }

  /** Shared body of removeWithDescendants / removeWithAncestors (#34). */
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
    // Couples losing a child here may leave a placeholder partner with none (#107).
    // and partners of removed people may be left alone.
    const candidates = partnersIn(pedigree, pedigree.partnerships
      .filter(p => gone.has(p.individual1) || gone.has(p.individual2) || (pedigree.parentOf[p.id] ?? []).some(c => gone.has(c)))
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
    pedigree: EMPTY_PEDIGREE,
    past: [],
    future: [],
    activeTool: "select",
    selectedId: null,
    selectedIds: [],
    hoveredId: null,
    problemHighlightId: null,
    isDirty: false,
    layoutResetCount: 0,
    notice: null,
    picking: null,

    setNotice: (notice) => set(s => ({ notice: notice ? { ...notice, id: (s.notice?.id ?? 0) + 1 } : null })),

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

    initialize: (p) => set({
      pedigree: p,
      past: [],
      future: [],
      activeTool: "select",
      ...selectOnly(null),
      isDirty: false,
      picking: null,
    }),

    reset: () => set({
      pedigree: EMPTY_PEDIGREE,
      past: [],
      future: [],
      activeTool: "select",
      ...selectOnly(null),
      isDirty: false,
      picking: null,
    }),

    getPedigree: () => get().pedigree,

    setActiveTool: (tool) => set({ activeTool: tool }),
    setSelectedId: (id) => set(selectOnly(id)),
    toggleSelected: (id) => {
      const { selectedIds, selectedId } = get();
      if (selectedIds.includes(id)) set(selectionOf(selectedIds.filter(x => x !== id), selectedId));
      else set(selectionOf([...selectedIds, id], id));
    },
    setSelection: (ids, primary) => set(selectionOf(ids, primary)),
    selectDescendants: (id) => {
      const { pedigree } = get();
      if (!pedigree.individuals.some(i => i.id === id)) return 0;
      const ids = [...removeWithDescendantsSet(pedigree, [id])];
      set(selectionOf(ids, id));
      return ids.length;
    },
    setHoveredId: (id) => set({ hoveredId: id }),
    setProblemHighlightId: (id) => set({ problemHighlightId: id }),

    groupEdits: (run) => {
      const before = get().past.length;
      run();
      const { past } = get();
      if (past.length > before + 1) set({ past: past.slice(0, before + 1) });
    },

    undo: () => {
      const { past, pedigree, future } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({
        pedigree: prev,
        past: past.slice(0, -1),
        future: [structuredClone(pedigree), ...future],
        isDirty: true,
      });
      pruneSelection();
    },

    redo: () => {
      const { future, pedigree, past } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({
        pedigree: next,
        future: future.slice(1),
        past: [...past, structuredClone(pedigree)],
        isDirty: true,
      });
      pruneSelection();
    },

    // ── Structural mutations ─────────────────────────────────────────────────

    addIndividual: (sex) => {
      mutate(draft => {
        draft.individuals.push(makeIndividual(sex, nextRootSibOrder(draft)));
      });
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
        const parentPId = findParentPartnershipId(draft, individualId);

        if (parentPId) {
          // Partnership exists — find the correct slot
          const p = draft.partnerships.find(p => p.id === parentPId)!;
          const ind1 = draft.individuals.find(i => i.id === p.individual1)!;
          const ind2 = draft.individuals.find(i => i.id === p.individual2)!;

          // If there's an unknown-sex placeholder, convert it
          // The user has now asked for this parent, so it is no longer a placeholder (#107).
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

        // No parents yet — create a couple
        const newParent = makeIndividual(sex, 0);
        const oppositeSex: Sex = sex === "male" ? "female" : sex === "female" ? "male" : "unknown";
        const placeholder = makePlaceholder(oppositeSex);

        const partnership: Partnership = {
          id: newId(),
          individual1: sex === "male" ? newParent.id : placeholder.id,
          individual2: sex === "male" ? placeholder.id : newParent.id,
        };

        draft.individuals.push(newParent, placeholder);
        draft.partnerships.push(partnership);
        draft.parentOf[partnership.id] = [individualId];
      });
    },

    /**
     * Add a child of the given sex to individualId.
     *
     * - If individual has an existing partnership → add child there
     * - If individual has multiple partnerships → use first one (sufficient for Phase 4)
     * - If individual has no partnership → create an opposite-sex partner + partnership
     */
    addChild: (individualId, sex) => {
      if (get().pedigree.individuals.find(i => i.id === individualId)?.lifeStatus) {
        console.warn("Cannot add a child to a pregnancy or pregnancy loss");
        return;
      }
      let viaDonor: string | undefined;
      mutate(draft => {
        let partnershipId: string;
        const ownPs = findOwnPartnerships(draft, individualId);

        if (ownPs.length > 0) {
          partnershipId = ownPs[0]!;
        } else {
          // No partnership — create one with an opposite-sex partner
          const ind = draft.individuals.find(i => i.id === individualId)!;
          const partnerSex: Sex =
            ind.sex === "male" ? "female" :
            ind.sex === "female" ? "male" : "unknown";
          const placeholder = makePlaceholder(partnerSex);
          const partnership: Partnership = {
            id: newId(),
            individual1: individualId,
            individual2: placeholder.id,
          };
          draft.individuals.push(placeholder);
          draft.partnerships.push(partnership);
          draft.parentOf[partnership.id] = [];
          partnershipId = partnership.id;
        }

        const child = makeIndividual(sex, nextSibOrderInFamily(draft, partnershipId));
        draft.individuals.push(child);
        // A same-sex couple's child is this person's and a donor's (#105).
        if (isSameSexCouple(draft, draft.partnerships.find(p => p.id === partnershipId))) {
          viaDonor = applySameSexChildren(draft, partnershipId, individualId, [child.id], { donor: newId(), pair: newId() }) ?? undefined;
          return;
        }
        draft.parentOf[partnershipId] = [...(draft.parentOf[partnershipId] ?? []), child.id];
        clearChildless(draft, partnershipId);
      });
      if (viaDonor) noticeDonorChildren(individualId, viaDonor, 1);
    },

    /**
     * Add `count` children of the given sex to individualId in one undo step.
     *
     * Uses the same partnership addChild would (first existing partnership, or a
     * new one with a placeholder partner). Children get consecutive sibOrder
     * values after the existing siblings. count is clamped to 1..MAX_ADD_CHILDREN.
     * `partnershipId` picks one of the individual's partnerships (the more
     * menu offers a partner choice when there are several); an id that is not
     * one of theirs falls back to the first.
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
        // A same-sex couple's children are this person's and a donor's (#105).
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
          draft.parentOf[pid] = [...(draft.parentOf[pid] ?? []), child.id];
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
        const parentPId = findParentPartnershipId(draft, individualId);
        if (!parentPId) return; // no parents — can't add sibling

        const sibling = makeIndividual("unknown", nextSibOrderInFamily(draft, parentPId));
        draft.individuals.push(sibling);
        draft.parentOf[parentPId] = [...draft.parentOf[parentPId], sibling.id];
      });
    },

    /**
     * Add a partner to individualId.
     *
     * Creates a new unknown-sex individual and a new Partnership.
     * If individual already has a partnership, this creates a second one
     * (multiple partnerships are valid — e.g. second marriage).
     */
    addPartner: (individualId) => {
      if (get().pedigree.individuals.find(i => i.id === individualId)?.lifeStatus) {
        console.warn("Cannot add a partner to a pregnancy or pregnancy loss");
        return;
      }
      mutate(draft => {
        const partner = makeIndividual("unknown", 0);
        const partnership: Partnership = {
          id: newId(),
          individual1: individualId,
          individual2: partner.id,
        };
        draft.individuals.push(partner);
        draft.partnerships.push(partnership);
        if (!draft.parentOf[partnership.id]) {
          draft.parentOf[partnership.id] = [];
        }
      });
    },

    linkPartner: (individualId, partnerId) => {
      const problem = linkPartnerProblem(get().pedigree, individualId, partnerId);
      if (problem) { console.warn(`Cannot link partners: ${problem}`); return problem; }
      // Related couples are found at draw time from kinship (#85); nothing is stored.
      const related = kinshipOf(get().pedigree).kinship(individualId, partnerId) > 0;
      mutate(draft => {
        let [a, b] = [individualId, partnerId];
        const aSex = draft.individuals.find(i => i.id === a)!.sex;
        const bSex = draft.individuals.find(i => i.id === b)!.sex;
        // Keep the father role first where the sexes say so, as setParents does.
        if (aSex === "female" || (aSex === "unknown" && bSex === "male")) [a, b] = [b, a];
        const partnership: Partnership = { id: newId(), individual1: a, individual2: b };
        draft.partnerships.push(partnership);
        draft.parentOf[partnership.id] = [];
      });
      const name = (id: string) => get().pedigree.individuals.find(i => i.id === id)?.name?.trim() || "an individual";
      get().setNotice({
        kind: "info",
        text: `${name(individualId)} and ${name(partnerId)} are now partners${related ? " (related, so drawn with a double line)" : ""}.`,
        undoable: true,
      });
      return null;
    },

    /**
     * Delete an individual.
     *
     * - Remove from individuals array
     * - Remove from any partnerships they are in
     *   - If partnership had children, those children become roots (removed from parentOf)
     *   - The partnership itself is deleted
     * - Remove from parentOf (as a child) in their parent partnership
     */
    deleteIndividual: (individualId) => {
      // Placeholder partners of the couples this person is a child or partner of (#107).
      const ped0 = get().pedigree;
      const candidates = partnersIn(ped0, [
        ...Object.keys(ped0.parentOf).filter(pid => ped0.parentOf[pid]!.includes(individualId)),
        ...findOwnPartnerships(ped0, individualId),
      ]);
      mutate(draft => {
        // Remove from parent partnership's child list
        for (const [pid, children] of Object.entries(draft.parentOf)) {
          if (children.includes(individualId)) {
            draft.parentOf[pid] = children.filter(c => c !== individualId);
          }
        }

        // Remove partnerships where this individual is a partner
        const ownPs = findOwnPartnerships(draft, individualId);
        for (const pid of ownPs) {
          // Children of this partnership become orphans (roots) — just drop the parentOf entry
          delete draft.parentOf[pid];
          draft.partnerships = draft.partnerships.filter(p => p.id !== pid);
        }

        // Remove the individual
        draft.individuals = draft.individuals.filter(i => i.id !== individualId);
        removeFromTwinSets(draft, individualId);
        dropAssistedLinks(draft, new Set([individualId]));
        // A placeholder left with no children, or alone, goes too (#107).
        dropLeftoverPlaceholders(draft, candidates);

        // Drop their pin and unlock entries, which would otherwise dangle
        // (the JSON importer warns about them on every later load).
        if (draft.pinnedPositions) {
          delete draft.pinnedPositions[individualId];
          if (Object.keys(draft.pinnedPositions).length === 0) delete draft.pinnedPositions;
        }
        if (draft.unlockedIndividuals) {
          draft.unlockedIndividuals = draft.unlockedIndividuals.filter(id => id !== individualId);
          if (draft.unlockedIndividuals.length === 0) delete draft.unlockedIndividuals;
        }
      });
    },

    setSameSexChild: (childId, partnershipId, geneticParentId) => {
      const ped = get().pedigree;
      const couple = ped.partnerships.find(p => p.id === partnershipId);
      const partner = couple && (couple.individual1 === geneticParentId ? couple.individual2 : couple.individual1);
      const problem = sameSexChildProblem(ped, partnershipId, geneticParentId)
        ?? setParentsProblem(ped, childId, [geneticParentId])
        ?? setParentsProblem(ped, childId, [partner!]);
      if (problem) { console.warn(`Cannot set parents: ${problem}`); return problem; }
      const before = currentParentsOf(ped, childId);
      mutate(draft => {
        if (before) {
          draft.parentOf[before.id] = (draft.parentOf[before.id] ?? []).filter(c => c !== childId);
          const old = draft.partnerships.find(p => p.id === before.id);
          if (old?.twins) {
            old.twins = old.twins.map(t => ({ ...t, members: t.members.filter(m => m !== childId) })).filter(t => t.members.length >= 2);
            if (old.twins.length === 0) delete old.twins;
          }
        }
        applySameSexChildren(draft, partnershipId, geneticParentId, [childId], { donor: newId(), pair: newId() });
        // An empty donor pair left behind is not a couple; nor is a placeholder left alone (#107).
        if (before?.donorConception && (draft.parentOf[before.id] ?? []).length === 0) {
          draft.partnerships = draft.partnerships.filter(p => p.id !== before.id);
          delete draft.parentOf[before.id];
        }
        if (before) dropLeftoverPlaceholders(draft, [before.individual1, before.individual2]);
      });
      const name = (id: string) => get().pedigree.individuals.find(i => i.id === id)?.name?.trim() || "an individual";
      get().setNotice({
        kind: "info",
        text: `${name(childId)} is now a child of ${name(geneticParentId)} and a donor, with ${name(partner!)} as a parent who is not genetic.`,
        undoable: true,
      });
      return null;
    },

    detachFromParents: (childId) => {
      const before = currentParentsOf(get().pedigree, childId);
      if (!before) return;
      mutate(draft => {
        draft.parentOf[before.id] = (draft.parentOf[before.id] ?? []).filter(c => c !== childId);
        const old = draft.partnerships.find(p => p.id === before.id)!;
        if (old.twins) {
          old.twins = old.twins.map(t => ({ ...t, members: t.members.filter(m => m !== childId) })).filter(t => t.members.length >= 2);
          if (old.twins.length === 0) delete old.twins;
        }
        if (old.donorConception && draft.parentOf[old.id]!.length === 0) {
          draft.partnerships = draft.partnerships.filter(p => p.id !== old.id);
          delete draft.parentOf[old.id];
        }
        dropLeftoverPlaceholders(draft, [old.individual1, old.individual2]);
        const child = draft.individuals.find(i => i.id === childId);
        if (child) child.sibOrder = nextRootSibOrder(draft);
      });
      const name = (id: string) => get().pedigree.individuals.find(i => i.id === id)?.name?.trim() || "This person";
      get().setNotice({ kind: "info", text: `${name(childId)} no longer has parents drawn.`, undoable: true });
    },

    removePartnership: (partnershipId) => {
      const { pedigree } = get();
      const p = pedigree.partnerships.find(x => x.id === partnershipId);
      if (!p) return "Unknown partnership.";
      const kids = pedigree.parentOf[partnershipId] ?? [];
      if (kids.length > 0) {
        return `Not removed: this couple has ${kids.length === 1 ? "a child" : `${kids.length} children`}. Use Replace parents or Detach from parents on ${kids.length === 1 ? "the child" : "each child"} first.`;
      }
      // An untouched placeholder partner would be left alone on the canvas, so it goes too (#107).
      mutate(draft => {
        draft.partnerships = draft.partnerships.filter(x => x.id !== partnershipId);
        delete draft.parentOf[partnershipId];
        dropLeftoverPlaceholders(draft, [p.individual1, p.individual2]);
      });
      get().setNotice({ kind: "info", text: "Partnership removed; both people stay.", undoable: true });
      return null;
    },

    setParents: (childId, parentIds) => {
      const unique = [...new Set(parentIds)];
      const problem = setParentsProblem(get().pedigree, childId, unique);
      if (problem) { console.warn(`Cannot set parents: ${problem}`); return problem; }
      const before = currentParentsOf(get().pedigree, childId);
      mutate(draft => {
        // Leave the current parents, if any.
        if (before) {
          draft.parentOf[before.id] = (draft.parentOf[before.id] ?? []).filter(c => c !== childId);
          const old = draft.partnerships.find(p => p.id === before.id);
          if (old?.twins) {
            old.twins = old.twins.map(t => ({ ...t, members: t.members.filter(m => m !== childId) })).filter(t => t.members.length >= 2);
            if (old.twins.length === 0) delete old.twins;
          }
        }
        // The partnership to attach to: existing, or new (with a placeholder for a single parent).
        let [a, b] = unique as [string, string | undefined];
        let partnership = b ? draft.partnerships.find(p =>
          (p.individual1 === a && p.individual2 === b) || (p.individual1 === b && p.individual2 === a)) : undefined;
        if (!partnership) {
          if (!b) {
            const parent = draft.individuals.find(i => i.id === a)!;
            const partnerSex: Sex = parent.sex === "male" ? "female" : parent.sex === "female" ? "male" : "unknown";
            const placeholder = makePlaceholder(partnerSex);
            draft.individuals.push(placeholder);
            b = placeholder.id;
          }
          const aSex = draft.individuals.find(i => i.id === a)!.sex;
          const bSex = draft.individuals.find(i => i.id === b)!.sex;
          // Keep the father role first where the sexes say so.
          if (aSex === "female" || (aSex === "unknown" && bSex === "male")) [a, b] = [b, a];
          partnership = { id: newId(), individual1: a, individual2: b };
          draft.partnerships.push(partnership);
          draft.parentOf[partnership.id] = [];
        }
        const child = draft.individuals.find(i => i.id === childId)!;
        child.sibOrder = nextSibOrderInFamily(draft, partnership.id);
        draft.parentOf[partnership.id] = [...(draft.parentOf[partnership.id] ?? []), childId];
        clearChildless(draft, partnership.id);
        // The previous couple's placeholder partner, if this was their last child (#107).
        if (before) dropLeftoverPlaceholders(draft, [before.individual1, before.individual2]);
      });
      const after = currentParentsOf(get().pedigree, childId)!;
      const name = (id: string) => get().pedigree.individuals.find(i => i.id === id)?.name?.trim() || "an individual";
      get().setNotice({
        kind: "info",
        text: `${name(childId)} is now a child of ${name(after.individual1)} and ${name(after.individual2)}${before ? " (moved from the previous parents)" : ""}.`,
        undoable: true,
      });
      return null;
    },

    deleteIndividuals: (individualIds) => removeBranch(individualIds, (_p, ids) => new Set(ids), null),

    removeWithDescendants: (individualIds) => removeBranch(individualIds, removeWithDescendantsSet, "descendants"),
    removeWithAncestors: (individualIds) => removeBranch(individualIds, removeWithAncestorsSet, "ancestors"),

    setDescendantsHidden: (individualIds, hidden) => {
      const ids = new Set(individualIds);
      const changes = get().pedigree.individuals.some(i => ids.has(i.id) && !!i.descendantsHidden !== hidden);
      if (!changes) return;
      mutate(draft => {
        for (const i of draft.individuals) {
          if (!ids.has(i.id)) continue;
          if (hidden) i.descendantsHidden = true;
          else delete i.descendantsHidden;
        }
      }, hidden);
      const gone = collapseInfo(get().pedigree).hidden;
      const { selectedIds, selectedId } = get();
      if (selectedIds.some(id => gone.has(id))) set(selectionOf(selectedIds.filter(id => !gone.has(id)), selectedId));
    },

    setViewFilter: (key, on) => {
      if ((get().pedigree.filters?.[key] === true) === on) return;
      mutate(draft => {
        const filters = { ...draft.filters };
        if (on) filters[key] = true;
        else delete filters[key];
        if (Object.keys(filters).length > 0) draft.filters = filters;
        else delete draft.filters;
      }, on);
      const gone = collapseInfo(get().pedigree).hidden;
      const { selectedIds, selectedId } = get();
      if (selectedIds.some(id => gone.has(id))) set(selectionOf(selectedIds.filter(id => !gone.has(id)), selectedId));
    },

    /**
     * Move a sibling one position left within its sibling group.
     * Swaps sibOrder with the sibling immediately to the left (lower sibOrder).
     */
    moveSibLeft: (individualId) => {
      mutate(draft => {
        const parentPId = findParentPartnershipId(draft, individualId);
        if (!parentPId) return;

        const siblings = (draft.parentOf[parentPId] ?? [])
          .map(id => draft.individuals.find(i => i.id === id)!)
          .filter(Boolean)
          .sort((a, b) => a.sibOrder - b.sibOrder);

        const idx = siblings.findIndex(s => s.id === individualId);
        if (idx <= 0) return; // already leftmost

        const current = draft.individuals.find(i => i.id === individualId)!;
        const leftNeighbour = draft.individuals.find(i => i.id === siblings[idx - 1]!.id)!;
        const tmp = current.sibOrder;
        current.sibOrder = leftNeighbour.sibOrder;
        leftNeighbour.sibOrder = tmp;
        // Ensure manual mode so the swap takes effect regardless of current sort mode.
        draft.siblingOrder.mode = "manual";
      });
    },

    moveSibRight: (individualId) => {
      mutate(draft => {
        const parentPId = findParentPartnershipId(draft, individualId);
        if (!parentPId) return;

        const siblings = (draft.parentOf[parentPId] ?? [])
          .map(id => draft.individuals.find(i => i.id === id)!)
          .filter(Boolean)
          .sort((a, b) => a.sibOrder - b.sibOrder);

        const idx = siblings.findIndex(s => s.id === individualId);
        if (idx >= siblings.length - 1) return; // already rightmost

        const current = draft.individuals.find(i => i.id === individualId)!;
        const rightNeighbour = draft.individuals.find(i => i.id === siblings[idx + 1]!.id)!;
        const tmp = current.sibOrder;
        current.sibOrder = rightNeighbour.sibOrder;
        rightNeighbour.sibOrder = tmp;
        // Ensure manual mode so the swap takes effect regardless of current sort mode.
        draft.siblingOrder.mode = "manual";
      });
    },

    // ── Individual property mutations ────────────────────────────────────────

    updateIndividual: (id, updates) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (ind) Object.assign(ind, updates);
      });
    },

    setAffected: (id, affected) => {
      const current = get().pedigree.individuals.find(i => i.id === id);
      if (!current || !dryRun(current, ind => applyAffected(ind, affected, get().pedigree))) return;
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        // Onset belongs to the affected status (#93); conditions follow it (#115).
        if (ind) applyAffected(ind, affected, draft);
      });
    },

    setConditionStatus: (id, tagId, state) => {
      const { pedigree } = get();
      const current = pedigree.individuals.find(i => i.id === id);
      if (!current || !pedigree.tags?.some(t => t.id === tagId && t.style === "quadrant")) return;
      if (!dryRun(current, ind => applyConditionState(ind, tagId, state, pedigree))) return;
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (ind) applyConditionState(ind, tagId, state, draft);
      });
    },

    setDeceased: (id, deceased) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        ind.deceased = deceased;
        if (!deceased) delete ind.dod;
      });
    },

    setDateOfDeath: (id, dod) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        if (dod) { ind.dod = dod; ind.deceased = true; }
        else delete ind.dod;
      });
    },

    setCarrier: (id, carrier) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (ind) applyCarrier(ind, carrier, draft);
      });
    },

    setPresymptomatic: (id, presymptomatic) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        if (presymptomatic) {
          // One carrier status (#101): with one condition, its carrier state goes too (#115).
          applyCarrier(ind, false, draft);
          ind.presymptomatic = true;
        } else delete ind.presymptomatic;
      });
    },

    setEvaluations: (id, evaluations) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        if (evaluations.length > 0) ind.evaluations = evaluations.map(e => ({ ...e }));
        else delete ind.evaluations;
      });
    },

    /**
     * Toggle proband for id. Only one proband per pedigree — clears previous proband first.
     * If id is already the proband, clears it.
     */
    setProband: (id) => {
      mutate(draft => {
        const target = draft.individuals.find(i => i.id === id);
        const isAlreadyProband = !!target?.proband;
        for (const ind of draft.individuals) {
          ind.proband = (!isAlreadyProband && ind.id === id) ? true : undefined;
        }
      });
    },

    setConsultand: (id, consultand) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        if (consultand) ind.consultand = true;
        else delete ind.consultand;
      });
    },

    setFamilyHistoryUnknown: (id, unknown) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        if (unknown) ind.familyHistoryUnknown = true;
        else delete ind.familyHistoryUnknown;
      });
    },

    /** Monozygotic twins share a sex, so changing one changes the whole set (#11). */
    setSex: (id, sex) => {
      const problem = batchSexProblem(get().pedigree, [id], sex);
      if (problem) { get().setNotice({ kind: "error", text: problem }); return; }
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        ind.sex = sex;
        delete ind.placeholder; // a sex the user chose is a recorded fact (#107)
        const twin = twinSetOf(draft as Pedigree, id);
        if (twin?.set.zygosity === "monozygotic") {
          for (const m of twin.set.members) {
            const mate = draft.individuals.find(i => i.id === m);
            if (mate) mate.sex = sex;
          }
        }
      });
    },

    setAffectedMany: (ids, affected) => {
      const { pedigree } = get();
      mutateEach(ids, ind => dryRun(ind, c => applyAffected(c, affected, pedigree)), ind => {
        applyAffected(ind, affected, pedigree);
      }, n => `Marked ${n} ${affected ? "affected" : "unaffected"}.`);
    },

    setDeceasedMany: (ids, deceased) => {
      mutateEach(ids, ind => !!ind.deceased !== deceased, ind => {
        ind.deceased = deceased;
        if (!deceased) delete ind.dod;
      }, n => `Marked ${n} ${deceased ? "deceased" : "living"}.`);
    },

    setCarrierStatusMany: (ids, status) => {
      const { pedigree } = get();
      mutateEach(ids, ind => carrierStatusOf(ind, pedigree) !== status, ind => {
        // With one condition, carrier records it (#115, `applyCarrier`).
        if (status === "carrier") applyCarrier(ind, true, pedigree);
        else if (status === "presymptomatic") { applyCarrier(ind, false, pedigree); ind.presymptomatic = true; }
        else { applyCarrier(ind, false, pedigree); delete ind.presymptomatic; }
      }, n => status === "none" ? `Cleared the carrier status of ${n}.`
        : `Marked ${n} ${status === "carrier" ? "carrier" : "presymptomatic carrier"}.`);
    },

    setSexMany: (ids, sex) => {
      const { pedigree } = get();
      const problem = batchSexProblem(pedigree, ids, sex);
      if (problem) { get().setNotice({ kind: "error", text: problem }); return problem; }
      mutateEach([...batchSexTargets(pedigree, ids)], ind => ind.sex !== sex, ind => { ind.sex = sex; },
        n => `Set ${n} to ${sex === "unknown" ? "unknown sex" : sex}.`);
      return null;
    },

    setIndividualTagMany: (ids, tagId, on) => {
      const tag = get().pedigree.tags?.find(t => t.id === tagId);
      if (!tag) return;
      // A condition tag is "affected with it" (#115): same rule as setConditionStatus.
      if (tag.style === "quadrant") {
        const { pedigree } = get();
        const state: ConditionState = on ? "affected" : "none";
        mutateEach(ids, ind => (ind.tags?.includes(tagId) ?? false) !== on, ind => {
          applyConditionState(ind, tagId, state, pedigree);
        }, n => `${on ? "Added" : "Removed"} ${tag.label} ${on ? "to" : "from"} ${n}.`);
        return;
      }
      const order = new Map((get().pedigree.tags ?? []).map((t, i) => [t.id, i]));
      mutateEach(ids, ind => (ind.tags?.includes(tagId) ?? false) !== on, ind => {
        if (on) {
          ind.tags = [...(ind.tags ?? []), tagId].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
        } else {
          ind.tags = ind.tags!.filter(t => t !== tagId);
          if (ind.tags.length === 0) delete ind.tags;
          removeTagOnset(ind, tagId);
        }
      }, n => `${on ? "Added" : "Removed"} ${tag.label} ${on ? "to" : "from"} ${n}.`);
    },

    setConditionStatusMany: (ids, tagId, state) => {
      const { pedigree } = get();
      const tag = pedigree.tags?.find(t => t.id === tagId && t.style === "quadrant");
      if (!tag) return;
      mutateEach(ids, ind => dryRun(ind, c => applyConditionState(c, tagId, state, pedigree)), ind => {
        applyConditionState(ind, tagId, state, pedigree);
      }, n => state === "affected" ? `Marked ${n} affected with ${tag.label}.`
        : state === "carrier" ? `Marked ${n} ${n === 1 ? "carrier" : "carriers"} of ${tag.label}.`
          : `Cleared ${tag.label} from ${n}.`);
    },

    setTwins: (partnershipId, members, zygosity) => {
      const unique = [...new Set(members)];
      const problem = twinSetProblem(get().pedigree, partnershipId, unique, zygosity);
      if (problem) {
        console.warn(`Cannot make twin set: ${problem}`);
        return problem;
      }
      mutate(draft => {
        const p = draft.partnerships.find(x => x.id === partnershipId);
        if (!p) return;
        const order = draft.parentOf[partnershipId] ?? [];
        const sorted = [...unique].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        const rest = (p.twins ?? [])
          .map(t => ({ ...t, members: t.members.filter(m => !unique.includes(m)) }))
          .filter(t => t.members.length >= 2);
        p.twins = [...rest, { members: sorted, zygosity }];
      });
      return null;
    },

    removeTwin: (id) => {
      if (!twinSetOf(get().pedigree, id)) return;
      mutate(draft => removeFromTwinSets(draft, id));
    },

    /**
     * Set or clear the pregnancy / loss status. Clearing is always allowed.
     * Setting is refused when the individual has a partner or children, since
     * a pregnancy or pregnancy loss can have neither.
     */
    setLifeStatus: (id, status) => {
      if (status !== undefined && hasPartnerOrChild(get().pedigree, id)) {
        console.warn("Cannot mark an individual with a partner or children as a pregnancy or pregnancy loss");
        return;
      }
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        if (status === undefined) delete ind.lifeStatus;
        else ind.lifeStatus = status;
      });
    },

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

    setReproductiveRole: (id, role) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        if (role === undefined) delete ind.reproductiveRole;
        else ind.reproductiveRole = role;
      });
    },

    setCarriedBy: (childId, carrierId) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === childId);
        if (!ind) return;
        if (!carrierId || carrierId === childId) delete ind.carriedBy;
        else ind.carriedBy = carrierId;
      });
    },

    setSocialParents: (childId, parentIds) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === childId);
        if (!ind) return;
        const ids = [...new Set(parentIds)].filter(id => id !== childId);
        if (ids.length) ind.socialParents = ids;
        else delete ind.socialParents;
      });
    },

    setAdopted: (id, status) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        if (status === undefined) delete ind.adopted;
        else ind.adopted = status;
      });
    },

    // ── Partnership property mutations ───────────────────────────────────────

    setPartnershipChildless: (partnershipId, status) => {
      if (status !== undefined && (get().pedigree.parentOf[partnershipId] ?? []).length > 0) {
        console.warn("Cannot mark a couple with children as childless");
        return;
      }
      mutate(draft => {
        const p = draft.partnerships.find(x => x.id === partnershipId);
        if (!p) return;
        if (status === undefined) { delete p.childless; delete p.childlessReason; }
        else p.childless = status;
      });
    },

    setPartnershipChildlessReason: (partnershipId, reason) => {
      mutate(draft => {
        const p = draft.partnerships.find(x => x.id === partnershipId);
        if (!p) return;
        if (reason === "") delete p.childlessReason;
        else p.childlessReason = reason;
      });
    },

    setPartnershipConsanguineous: (partnershipId, related) => {
      const current = get().pedigree.partnerships.find(x => x.id === partnershipId);
      if (!current || !!current.consanguineous === related) return;
      mutate(draft => {
        const p = draft.partnerships.find(x => x.id === partnershipId)!;
        if (related) p.consanguineous = true;
        else delete p.consanguineous;
      });
    },

    setPartnershipConsanguinityLabel: (partnershipId, label) => {
      const current = get().pedigree.partnerships.find(x => x.id === partnershipId);
      if (!current || (current.consanguinityLabel ?? "") === label) return;
      mutate(draft => {
        const p = draft.partnerships.find(x => x.id === partnershipId)!;
        if (label === "") delete p.consanguinityLabel;
        else p.consanguinityLabel = label;
      });
    },

    setPartnershipEnded: (partnershipId, ended) => {
      const current = get().pedigree.partnerships.find(x => x.id === partnershipId);
      if (!current || !!current.ended === ended) return;
      mutate(draft => {
        const p = draft.partnerships.find(x => x.id === partnershipId)!;
        if (ended) p.ended = true;
        else delete p.ended;
      });
    },

    swapPartnerSides: (partnershipId) => {
      const { pedigree } = get();
      const plan = swapSidesPlan(pedigree, partnershipId);
      if ("problem" in plan) {
        get().setNotice({ kind: "error", text: plan.problem });
        return plan.problem;
      }
      mutate(draft => {
        for (const p of draft.partnerships) if (plan.sides[p.id]) p.leftPartner = plan.sides[p.id];
      });
      const p = pedigree.partnerships.find(x => x.id === partnershipId)!;
      const pinned = [p.individual1, p.individual2].filter(id => pedigree.pinnedPositions?.[id]);
      if (pinned.length > 0) {
        const name = (id: string) => pedigree.individuals.find(i => i.id === id)?.name?.trim() || "a partner";
        get().setNotice({ kind: "info", text: `Sides swapped, but ${pinned.map(name).join(" and ")} ${pinned.length === 1 ? "is" : "are"} pinned and stay${pinned.length === 1 ? "s" : ""} where dragged: unpin to see the swap.`, undoable: true });
      }
      return null;
    },

    // ── Pedigree-level settings ──────────────────────────────────────────────

    updateSiblingOrderSettings: (settings) => {
      mutate(draft => {
        Object.assign(draft.siblingOrder, settings);
      });
    },

    // ── Pin / drag ───────────────────────────────────────────────────────────

    pinIndividual: (individualId, pos) => {
      mutate(draft => {
        if (!draft.pinnedPositions) draft.pinnedPositions = {};
        // Store on the grid in normal spacing. A compact drag lands on the
        // compact grid and unscales off it; rounding here comes back to the
        // same compact grid point because the compact scales are below 1.
        draft.pinnedPositions[individualId] = snapPoint(pos, activeSnapGrid(draft as Pedigree));
      });
    },

    pinIndividuals: (positions) => {
      const entries = Object.entries(positions);
      if (entries.length === 0) return;
      mutate(draft => {
        if (!draft.pinnedPositions) draft.pinnedPositions = {};
        // A group drag keeps its shape: the canvas snaps the group's delta,
        // and nodes start on the grid, so rounding each one is a no-op there.
        const grid = activeSnapGrid(draft as Pedigree);
        for (const [id, pos] of entries) draft.pinnedPositions[id] = snapPoint(pos, grid);
      });
    },

    unpinIndividual: (individualId) => {
      mutate(draft => {
        if (draft.pinnedPositions) {
          delete draft.pinnedPositions[individualId];
          if (Object.keys(draft.pinnedPositions).length === 0) {
            delete draft.pinnedPositions;
          }
        }
      });
    },

    resetLayout: () => {
      mutate(draft => {
        delete draft.pinnedPositions;
      });
      set(s => ({ layoutResetCount: s.layoutResetCount + 1 }));
    },

    // ── Lock / unlock per-node ────────────────────────────────────────────────

    unlockIndividual: (individualId) => {
      mutate(draft => {
        if (!draft.unlockedIndividuals) draft.unlockedIndividuals = [];
        if (!draft.unlockedIndividuals.includes(individualId)) {
          draft.unlockedIndividuals.push(individualId);
        }
      });
    },

    unlockIndividuals: (individualIds) => {
      const unlocked = new Set(get().pedigree.unlockedIndividuals ?? []);
      const ids = [...new Set(individualIds)].filter(id => !unlocked.has(id));
      if (ids.length === 0) return;
      mutate(draft => {
        draft.unlockedIndividuals = [...(draft.unlockedIndividuals ?? []), ...ids];
      });
    },

    lockIndividuals: (individualIds) => {
      const { pedigree } = get();
      const ids = new Set(individualIds);
      const changes = [...ids].some(id => (pedigree.unlockedIndividuals ?? []).includes(id) || pedigree.pinnedPositions?.[id]);
      if (!changes) return;
      mutate(draft => {
        if (draft.unlockedIndividuals) {
          draft.unlockedIndividuals = draft.unlockedIndividuals.filter(id => !ids.has(id));
          if (draft.unlockedIndividuals.length === 0) delete draft.unlockedIndividuals;
        }
        if (draft.pinnedPositions) {
          for (const id of ids) delete draft.pinnedPositions[id];
          if (Object.keys(draft.pinnedPositions).length === 0) delete draft.pinnedPositions;
        }
      });
    },

    lockIndividual: (individualId) => {
      mutate(draft => {
        if (draft.unlockedIndividuals) {
          draft.unlockedIndividuals = draft.unlockedIndividuals.filter(id => id !== individualId);
          if (draft.unlockedIndividuals.length === 0) delete draft.unlockedIndividuals;
        }
        // Locking also removes any pinned position so the node returns to auto-layout.
        if (draft.pinnedPositions) {
          delete draft.pinnedPositions[individualId];
          if (Object.keys(draft.pinnedPositions).length === 0) delete draft.pinnedPositions;
        }
      });
    },

    // ── Tags ──────────────────────────────────────────────────────────────────

    addTag: (tag) => {
      const id = tag.id ?? newId();
      mutate(draft => {
        if (!draft.tags) draft.tags = [];
        draft.tags.push({ ...tag, id });
      });
      return id;
    },

    updateTag: (id, updates) => {
      mutate(draft => {
        const tag = draft.tags?.find(t => t.id === id);
        if (tag) Object.assign(tag, updates);
      });
    },

    /** Remove a tag definition and every reference to it. */
    deleteTag: (id) => {
      mutate(draft => {
        if (!draft.tags) return;
        draft.tags = draft.tags.filter(t => t.id !== id);
        if (draft.tags.length === 0) delete draft.tags;
        for (const ind of draft.individuals) {
          removeTagOnset(ind, id);
          if (ind.carrierTags?.includes(id)) {
            ind.carrierTags = ind.carrierTags.filter(t => t !== id);
            if (ind.carrierTags.length === 0) delete ind.carrierTags;
          }
          if (!ind.tags?.includes(id)) continue;
          ind.tags = ind.tags.filter(t => t !== id);
          if (ind.tags.length === 0) delete ind.tags;
        }
      });
    },

    /** Swap a tag with its neighbour. Order decides which quadrant a quadrant tag gets. */
    moveTag: (id, direction) => {
      mutate(draft => {
        const tags = draft.tags;
        if (!tags) return;
        const idx = tags.findIndex(t => t.id === id);
        const target = idx + direction;
        if (idx < 0 || target < 0 || target >= tags.length) return;
        [tags[idx], tags[target]] = [tags[target]!, tags[idx]!];
      });
    },

    setIndividualTag: (individualId, tagId, on) => {
      // A condition tag means affected with it (#115): ticking sets affected, unticking the last clears it.
      if (get().pedigree.tags?.some(t => t.id === tagId && t.style === "quadrant")) {
        get().setConditionStatus(individualId, tagId, on ? "affected" : "none");
        return;
      }
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === individualId);
        if (!ind) return;
        const has = ind.tags?.includes(tagId) ?? false;
        if (on && !has) {
          // Keep the individual's list in pedigree tag order so rendering is stable.
          const order = new Map((draft.tags ?? []).map((t, i) => [t.id, i]));
          ind.tags = [...(ind.tags ?? []), tagId].sort(
            (a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity),
          );
        } else if (!on && has) {
          ind.tags = ind.tags!.filter(t => t !== tagId);
          if (ind.tags.length === 0) delete ind.tags;
          removeTagOnset(ind, tagId);
        }
      });
    },

    setOnset: (individualId, tagId, value) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === individualId);
        if (!ind) return;
        const keep = value.trim() !== "";
        if (tagId === null) {
          if (keep) ind.onset = value; else delete ind.onset;
        } else if (keep) {
          ind.tagOnset = { ...(ind.tagOnset ?? {}), [tagId]: value };
        } else {
          removeTagOnset(ind, tagId);
        }
      });
    },

    // ── Canvas settings ───────────────────────────────────────────────────────

    setChartTitle: (title) => {
      mutate(draft => {
        if (title === undefined) delete draft.chartTitle;
        else draft.chartTitle = title;
      });
    },

    setClinicalDetail: (field, value) => {
      mutate(draft => {
        const details = { ...(draft.clinicalDetails ?? {}) };
        if (value.trim() === "") delete details[field];
        else details[field] = value;
        if (Object.keys(details).length === 0) delete draft.clinicalDetails;
        else draft.clinicalDetails = details;
      });
    },

    updateCanvasSettings: (settings) => {
      mutate(draft => {
        const wasSnapping = draft.canvasSettings?.snapToGrid ?? false;
        if (!draft.canvasSettings) {
          draft.canvasSettings = {
            nodesMoveable: false,
            snapToGrid: false,
            snapGridSize: DEFAULT_SNAP_GRID_SIZE,
            ...settings,
          };
        } else {
          Object.assign(draft.canvasSettings, settings);
        }
        // Turning snap on, or changing the grid size while snap is on, snaps every
        // pinned (manually moved) node so existing nodes line up with the grid.
        // Auto-laid-out nodes have no stored position; layoutToFlow rounds
        // them to the grid when it draws them (pedigree/snap.ts).
        const { snapToGrid, snapGridSize } = draft.canvasSettings;
        const sizeChanged = settings.snapGridSize !== undefined;
        if (snapToGrid && snapGridSize > 0 && (!wasSnapping || sizeChanged) && draft.pinnedPositions) {
          for (const pos of Object.values(draft.pinnedPositions)) {
            pos.x = Math.round(pos.x / snapGridSize) * snapGridSize;
            pos.y = Math.round(pos.y / snapGridSize) * snapGridSize;
          }
        }
      });
    },
  };
});
