import { create } from "zustand";
import { produce } from "immer";
import type {
  Pedigree, Individual, Sex, SiblingOrderSettings, Partnership, CanvasSettings, Tag, LifeStatus, ChildlessStatus, Adoption, Zygosity
} from "@pedigree-editor/layout-engine";
import { shareAncestor } from "../utils/pedigreeRelationship";
import { twinSetProblem, twinSetOf } from "../pedigree/twins";
import { activeSnapGrid, snapPoint } from "../pedigree/snap";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ActiveTool = "select" | "addMale" | "addFemale" | "addUnknown";

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
  const placeholder = makeIndividual(partnerSex, 0);
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

/** A child contradicts a childless mark, so adding one removes the mark (#15). */
function clearChildless(draft: Pedigree, partnershipId: string): void {
  const p = draft.partnerships.find(x => x.id === partnershipId);
  if (!p) return;
  delete p.childless;
  delete p.childlessReason;
}

/** Clamp the batch size accepted by addChildren. */
export const MAX_ADD_CHILDREN = 10;

// ── Store interface ────────────────────────────────────────────────────────────

interface PedigreeState {
  pedigree: Pedigree;
  past: Pedigree[];    // undo stack, newest last
  future: Pedigree[];  // redo stack, newest last

  activeTool: ActiveTool;
  selectedId: string | null;
  hoveredId: string | null;
  isDirty: boolean;
  /** Bumped by resetLayout so the canvas can refit the view (#64). Not undoable. */
  layoutResetCount: number;

  // Lifecycle
  initialize: (p: Pedigree) => void;
  reset: () => void;
  getPedigree: () => Pedigree;  // used by useAppStore to read for save

  // Tool + selection
  setActiveTool: (tool: ActiveTool) => void;
  setSelectedId: (id: string | null) => void;
  setHoveredId: (id: string | null) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;

  // Structural mutations (each snapshots before mutating)
  addIndividual: (sex: Sex) => void;
  addParent: (individualId: string, sex: Sex) => void;
  addChild: (individualId: string, sex: Sex) => void;
  addChildren: (individualId: string, count: number, sex: Sex, partnershipId?: string) => void;
  addSibling: (individualId: string) => void;
  addPartner: (individualId: string) => void;
  deleteIndividual: (individualId: string) => void;
  moveSibLeft: (individualId: string) => void;
  moveSibRight: (individualId: string) => void;

  // Individual property mutations
  updateIndividual: (id: string, updates: Partial<Individual>) => void;
  setAffected: (id: string, affected: boolean) => void;
  setDeceased: (id: string, deceased: boolean) => void;
  setCarrier: (id: string, carrier: boolean) => void;
  setProband: (id: string) => void;
  setSex: (id: string, sex: Sex) => void;
  /** Pregnancy / loss status. Refused (no-op) when the individual has a partner or children. */
  setLifeStatus: (id: string, status: LifeStatus | undefined) => void;
  /** Adoption brackets (#12): "in", "out" or none. */
  setAdopted: (id: string, status: Adoption | undefined) => void;
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

  // Pedigree-level settings
  updateSiblingOrderSettings: (settings: Partial<SiblingOrderSettings>) => void;

  // Pin / drag
  pinIndividual: (individualId: string, pos: { x: number; y: number }) => void;
  unpinIndividual: (individualId: string) => void;
  resetLayout: () => void;

  // Lock / unlock per-node
  unlockIndividual: (individualId: string) => void;
  lockIndividual: (individualId: string) => void;

  // Canvas settings
  updateCanvasSettings: (settings: Partial<CanvasSettings>) => void;

  // Tags (definitions live on the pedigree; individuals reference them by id)
  addTag: (tag: Omit<Tag, "id"> & { id?: string }) => string;
  updateTag: (id: string, updates: Partial<Omit<Tag, "id">>) => void;
  deleteTag: (id: string) => void;
  moveTag: (id: string, direction: -1 | 1) => void;
  setIndividualTag: (individualId: string, tagId: string, on: boolean) => void;
}

// ── Store implementation ───────────────────────────────────────────────────────

export const usePedigreeStore = create<PedigreeState>()((set, get) => {

  /** Snapshot current pedigree to undo stack before any mutation. */
  function snapshot() {
    const { pedigree, past } = get();
    set({ past: [...past, structuredClone(pedigree)], future: [], isDirty: true });
  }

  /** Mutate pedigree with an Immer recipe, after snapshotting. */
  function mutate(recipe: (draft: Pedigree) => void) {
    snapshot();
    set(state => ({ pedigree: produce(state.pedigree, recipe) }));
  }

  return {
    pedigree: EMPTY_PEDIGREE,
    past: [],
    future: [],
    activeTool: "select",
    selectedId: null,
    hoveredId: null,
    isDirty: false,
    layoutResetCount: 0,

    initialize: (p) => set({
      pedigree: p,
      past: [],
      future: [],
      activeTool: "select",
      selectedId: null,
      isDirty: false,
    }),

    reset: () => set({
      pedigree: EMPTY_PEDIGREE,
      past: [],
      future: [],
      activeTool: "select",
      selectedId: null,
      isDirty: false,
    }),

    getPedigree: () => get().pedigree,

    setActiveTool: (tool) => set({ activeTool: tool }),
    setSelectedId: (id) => set({ selectedId: id }),
    setHoveredId: (id) => set({ hoveredId: id }),

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
          if (ind1.sex === "unknown" && sex !== "unknown") {
            ind1.sex = sex;
          } else if (ind2.sex === "unknown" && sex !== "unknown") {
            ind2.sex = sex;
          }
          // If both are already filled, no-op
          return;
        }

        // No parents yet — create a couple
        const newParent = makeIndividual(sex, 0);
        const oppositeSex: Sex = sex === "male" ? "female" : sex === "female" ? "male" : "unknown";
        const placeholder = makeIndividual(oppositeSex, 0);

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
          const placeholder = makeIndividual(partnerSex, 0);
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
        draft.parentOf[partnershipId] = [...(draft.parentOf[partnershipId] ?? []), child.id];
        clearChildless(draft, partnershipId);
      });
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
      mutate(draft => {
        if (!draft.individuals.some(i => i.id === individualId)) return;
        const pid = ensureChildPartnershipId(draft, individualId, partnershipId);
        let sibOrder = nextSibOrderInFamily(draft, pid);
        for (let k = 0; k < n; k++) {
          const child = makeIndividual(sex, sibOrder++);
          draft.individuals.push(child);
          draft.parentOf[pid] = [...(draft.parentOf[pid] ?? []), child.id];
        }
        clearChildless(draft, pid);
      });
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
        // Auto-detect consanguinity: set flag if the two individuals share an ancestor
        if (shareAncestor(draft as unknown as Pedigree, individualId, partner.id)) {
          partnership.consanguineous = true;
        }
      });
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
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (ind) ind.affected = affected;
      });
    },

    setDeceased: (id, deceased) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (ind) ind.deceased = deceased;
      });
    },

    setCarrier: (id, carrier) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (ind) ind.carrier = carrier;
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

    /** Monozygotic twins share a sex, so changing one changes the whole set (#11). */
    setSex: (id, sex) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (!ind) return;
        ind.sex = sex;
        const twin = twinSetOf(draft as Pedigree, id);
        if (twin?.set.zygosity === "monozygotic") {
          for (const m of twin.set.members) {
            const mate = draft.individuals.find(i => i.id === m);
            if (mate) mate.sex = sex;
          }
        }
      });
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
        }
      });
    },

    // ── Canvas settings ───────────────────────────────────────────────────────

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
