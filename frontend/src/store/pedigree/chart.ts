import type { Pedigree, ViewFilters } from "@pedigree-editor/layout-engine";
import { activeSnapGrid, snapPoint } from "../../pedigree/snap";
import { collapseInfo } from "../../pedigree/collapse";
import type { ViewFilterPatch } from "../../pedigree/viewFilters";
import { newId, removeTagOnset, dropPins } from "./draft";
import { selectionOf } from "./view";
import type { EditTools, ChartSlice } from "./state";

/**
 * Edits to the chart as a whole: title, clinical details, settings, the
 * definitions of conditions and tags, what is hidden, and where people
 * are pinned.
 */

/** Default snap grid size in canvas pixels. Used when a pedigree has no canvasSettings. */
export const DEFAULT_SNAP_GRID_SIZE = 5;

export function chartSlice(tools: EditTools): ChartSlice {
  const { set, get, mutate } = tools;

  /** Deselect anyone a collapsed branch or view filter now hides: they could be edited without being seen. */
  function deselectHidden() {
    const gone = collapseInfo(get().pedigree).hidden;
    const { selectedIds, selectedId } = get();
    if (selectedIds.some(id => gone.has(id))) set(selectionOf(selectedIds.filter(id => !gone.has(id)), selectedId));
  }

  return {
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
        // Auto-laid-out nodes have no stored position; buildScene rounds
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

    updateSiblingOrderSettings: (settings) => {
      mutate(draft => {
        Object.assign(draft.siblingOrder, settings);
      });
    },

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
      deselectHidden();
    },

    setViewFilter: (key, value) => {
      const patch: ViewFilterPatch = { [key]: value === false ? undefined : value };
      if (key === "affectedOnly" && !value) patch.affectedCondition = undefined;
      get().updateViewFilters(patch);
    },

    updateViewFilters: (patch) => {
      const current: ViewFilters = get().pedigree.filters ?? {};
      const next: Record<string, unknown> = { ...current };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      const same = Object.keys(next).length === Object.keys(current).length
        && Object.entries(next).every(([k, v]) => (current as Record<string, unknown>)[k] === v);
      if (same) return;
      // Filter changes are the edits meant to hide people.
      mutate(draft => {
        if (Object.keys(next).length > 0) draft.filters = next as ViewFilters;
        else delete draft.filters;
      }, true);
      deselectHidden();
    },

    clearViewFilters: () => {
      if (!get().pedigree.filters) return;
      mutate(draft => { delete draft.filters; });
    },

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

    unpinIndividual: (individualId) => mutate(draft => { dropPins(draft, [individualId]); }),

    resetLayout: () => {
      mutate(draft => {
        delete draft.pinnedPositions;
      });
      set(s => ({ layoutResetCount: s.layoutResetCount + 1 }));
    },

    unlockIndividual: (individualId) => get().unlockIndividuals([individualId]),

    unlockIndividuals: (individualIds) => {
      const unlocked = new Set(get().pedigree.unlockedIndividuals ?? []);
      const ids = [...new Set(individualIds)].filter(id => !unlocked.has(id));
      if (ids.length === 0) return;
      mutate(draft => {
        draft.unlockedIndividuals = [...(draft.unlockedIndividuals ?? []), ...ids];
      });
    },

    /** Locking also forgets any pinned position, so the person returns to the automatic layout. */
    lockIndividuals: (individualIds) => {
      const ids = new Set(individualIds);
      mutate(draft => {
        if (draft.unlockedIndividuals?.some(id => ids.has(id))) {
          draft.unlockedIndividuals = draft.unlockedIndividuals.filter(id => !ids.has(id));
          if (draft.unlockedIndividuals.length === 0) delete draft.unlockedIndividuals;
        }
        dropPins(draft, ids);
      });
    },

    lockIndividual: (individualId) => get().lockIndividuals([individualId]),
  };
}
