/**
 * Dev-only handles for agent page checks (frontend/scripts/browser/).
 *
 * Loaded from main.tsx behind `import.meta.env.DEV`, so a production build
 * never includes it. An agent can read state after a click, assert node
 * positions or undo depth, and drive edits without hunting for buttons:
 *
 *   __pededit.pedigree().individuals.length
 *   __pededit.usePedigreeStore.getState().past.length
 *   __pededit.layout().nodes.map(n => [n.id, n.position])
 */
import { usePedigreeStore } from "./store/usePedigreeStore";
import { useAppStore } from "./store/useAppStore";
import { layoutToFlow } from "./pedigree/layoutToFlow";
import { importPed } from "./io/ped";
import { EXAMPLES } from "./data/examples";
import type { Pedigree } from "@pedigree-editor/layout-engine";

const hooks = {
  usePedigreeStore,
  useAppStore,
  layoutToFlow,
  importPed,
  EXAMPLES,
  /** The pedigree currently in the editor. */
  pedigree: (): Pedigree => usePedigreeStore.getState().getPedigree(),
  /** React Flow nodes and edges for the current pedigree, as the canvas computes them. */
  layout: () => layoutToFlow(usePedigreeStore.getState().getPedigree()),
  /** Replace the editor's pedigree (clears undo history). */
  load: (pedigree: Pedigree) => usePedigreeStore.getState().initialize(pedigree),
};

declare global {
  interface Window {
    __pededit?: typeof hooks;
  }
}

window.__pededit = hooks;
