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
 *   __pededit.check()          // render lint: [] when the canvas draws cleanly
 *   __pededit.checkExport()    // the same for the SVG export (io/svg/exportLint.ts)
 *   __pededit.problems()       // editor warnings (#116): [] when nothing looks wrong
 *   __pededit.exportSvg({ uShape: true })   // the export as an SVG string, for shot.mjs FILE.svg
 *   __pededit.align().pos      // raw kinship2 LayoutResult
 *   __pededit.kinship().kinship("a", "b")   // kinship coefficient (#32)
 *   __pededit.kinship(undefined, { chromosome: "X" }).inbreeding("a")   // X-linked (#87)
 */
import { usePedigreeStore } from "./store/usePedigreeStore";
import { useAppStore } from "./store/useAppStore";
import { layoutToFlow } from "./pedigree/layoutToFlow";
import type { LayoutToFlowOptions } from "./pedigree/layoutToFlow";
import { lintFlow } from "./pedigree/renderLint";
import { lintExport } from "./io/svg/exportLint";
import { exportSvg } from "./io/svg/svgExporter";
import { exportUShapeSvg } from "./io/svg/uShapeExporter";
import { chartTitle } from "./pedigree/labels";
import { problemsOf } from "./pedigree/validation";
import type { SvgExportOptions } from "./io/svg/types";
import { alignPedigree, kinshipCoefficients } from "@pedigree-editor/layout-engine";
import { importPed, exportPed } from "./io/ped";
import { importJson, exportJson } from "./io/json";
import { EXAMPLES } from "./data/examples";
import type { KinshipOptions, Pedigree } from "@pedigree-editor/layout-engine";

/** The canvas reads compact mode from localStorage at mount and writes it on toggle. */
function canvasOptions(): LayoutToFlowOptions {
  try { return { compact: localStorage.getItem("compactLayout") === "true" }; } catch { return {}; }
}

const hooks = {
  usePedigreeStore,
  useAppStore,
  layoutToFlow,
  importPed,
  exportPed,
  importJson,
  exportJson,
  lintFlow,
  EXAMPLES,
  /** Commit the dev server was serving when this page loaded (see vite.config.ts). */
  commit: __PEDEDIT_COMMIT__,
  /** The pedigree currently in the editor. */
  pedigree: (): Pedigree => usePedigreeStore.getState().getPedigree(),
  /**
   * React Flow nodes and edges for a pedigree (default: the current one), as
   * the canvas computes them, including compact mode. Override with options.
   */
  layout: (pedigree?: Pedigree, options?: LayoutToFlowOptions) =>
    layoutToFlow(pedigree ?? usePedigreeStore.getState().getPedigree(), { ...canvasOptions(), ...options }),
  /** The raw kinship2 LayoutResult (alignPedigree) for a pedigree, default the current one. */
  align: (pedigree?: Pedigree) => alignPedigree(pedigree ?? usePedigreeStore.getState().getPedigree()),
  /** Kinship and inbreeding coefficients (#32): `.kinship(a, b)` and `.inbreeding(id)`; `{ chromosome: "X" }` for X-linked (#87). */
  kinship: (pedigree?: Pedigree, options?: KinshipOptions) =>
    kinshipCoefficients(pedigree ?? usePedigreeStore.getState().getPedigree(), options),
  /**
   * Render lint (pedigree/renderLint.ts): lines through symbols, lines to
   * missing nodes, children with no parent line, and so on. [] means clean.
   */
  check: (pedigree?: Pedigree, options?: LayoutToFlowOptions) => {
    const p = pedigree ?? usePedigreeStore.getState().getPedigree();
    return lintFlow(p, layoutToFlow(p, { ...canvasOptions(), ...options }));
  },
  /**
   * Export lint (io/svg/exportLint.ts): what the standard SVG export (and so
   * PNG and PDF) draws, checked the same way. [] means clean.
   */
  checkExport: (pedigree?: Pedigree, options?: SvgExportOptions) => {
    const p = pedigree ?? usePedigreeStore.getState().getPedigree();
    // With the chart title the export dialog would draw (#20); none when de-identified.
    const title = options?.deidentify ? undefined : chartTitle(p, useAppStore.getState().activeTitle) || undefined;
    return lintExport(p, { ...canvasOptions(), title, ...options });
  },
  /** The SVG export of the current pedigree (save it and `shot.mjs FILE.svg` to look at it). */
  exportSvg: (options?: SvgExportOptions) => {
    const p = usePedigreeStore.getState().getPedigree();
    return (options?.uShape ? exportUShapeSvg : exportSvg)(p, { ...canvasOptions(), ...options });
  },
  /** Editor warnings (#116, pedigree/validation.ts), without the fix functions so they print as JSON. */
  problems: (pedigree?: Pedigree) =>
    problemsOf(pedigree ?? usePedigreeStore.getState().getPedigree()).all.map(({ fix, moreFixes, ...p }) => ({
      ...p, ...(fix ? { fix: fix.label } : {}), ...(moreFixes ? { moreFixes: moreFixes.map(f => f.label) } : {}),
    })),
  /** Replace the editor's pedigree (clears undo history). */
  load: (pedigree: Pedigree) => usePedigreeStore.getState().initialize(pedigree),
};

declare global {
  /** Set by the pededit-served-commit plugin in vite.config.ts at server start. */
  const __PEDEDIT_COMMIT__: { commit: string; branch: string; dirty: number; root: string } | null;
  interface Window {
    __pededit?: typeof hooks;
  }
}

window.__pededit = hooks;
