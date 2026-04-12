import { create } from "zustand";
import { produce } from "immer";
import type {
  Pedigree, Individual, Sex, SiblingOrderSettings, Partnership, CanvasSettings
} from "@pedigree-editor/layout-engine";
import { shareAncestor } from "../utils/pedigreeRelationship";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ActiveTool = "select" | "addMale" | "addFemale" | "addUnknown";

const EMPTY_PEDIGREE: Pedigree = {
  individuals: [],
  partnerships: [],
  parentOf: {},
  siblingOrder: { mode: "insertion", affectedFirst: false },
};

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

// ── Store interface ────────────────────────────────────────────────────────────

interface PedigreeState {
  pedigree: Pedigree;
  past: Pedigree[];    // undo stack, newest last
  future: Pedigree[];  // redo stack, newest last

  activeTool: ActiveTool;
  selectedId: string | null;
  hoveredId: string | null;
  isDirty: boolean;

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
  addSibling: (individualId: string) => void;
  addPartner: (individualId: string) => void;
  deleteIndividual: (individualId: string) => void;
  moveSibLeft: (individualId: string) => void;
  moveSibRight: (individualId: string) => void;

  // Individual property mutations
  updateIndividual: (id: string, updates: Partial<Individual>) => void;
  setAffected: (id: string, affected: boolean) => void;
  setDeceased: (id: string, deceased: boolean) => void;
  setProband: (id: string) => void;
  setSex: (id: string, sex: Sex) => void;

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
        [current.sibOrder, leftNeighbour.sibOrder] = [leftNeighbour.sibOrder, current.sibOrder];
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
        [current.sibOrder, rightNeighbour.sibOrder] = [rightNeighbour.sibOrder, current.sibOrder];
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

    setSex: (id, sex) => {
      mutate(draft => {
        const ind = draft.individuals.find(i => i.id === id);
        if (ind) ind.sex = sex;
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
        draft.pinnedPositions[individualId] = pos;
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

    // ── Canvas settings ───────────────────────────────────────────────────────

    updateCanvasSettings: (settings) => {
      mutate(draft => {
        if (!draft.canvasSettings) {
          draft.canvasSettings = {
            nodesMoveable: false,
            snapToGrid: false,
            snapGridSize: 10,
            ...settings,
          };
        } else {
          Object.assign(draft.canvasSettings, settings);
        }
      });
    },
  };
});
