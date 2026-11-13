/**
 * Which edition of the NSGC nomenclature the drawing follows
 * (`canvasSettings.notation`).
 *
 * Absent means "nsgc2008": pedigrees saved before the setting existed keep
 * the look they were drawn with (maintainer's rule on #115). Everything made
 * from now on is written with the latest edition, "nsgc2022", through
 * `withCurrentNotation`: a new blank pedigree (`pedigreeApi.create`), a PED
 * import (`importPed`) and every built-in example. A JSON import keeps what
 * the file says.
 *
 * What changes with "nsgc2008":
 * - evaluation results are written with the "E" prefix, numbered E1, E2
 *   ("E+ (BRCA1 c.5266dupC)", #101) instead of the 2022 "BRCA1 c.5266dupC +"
 *   (#114);
 * - a carrier with no condition recorded is the centre dot instead of half
 *   the symbol patterned, and an affected person with condition tags keeps
 *   the black centre (#115, `symbolPaint` in tags.ts).
 */

import type { NotationEdition, Pedigree } from "@pedigree-editor/layout-engine";

export const NOTATION_OPTIONS: { value: NotationEdition; label: string }[] = [
  { value: "nsgc2022", label: "NSGC 2022 (current)" },
  { value: "nsgc2008", label: "NSGC 2008" },
];

/** The edition written into everything newly made. */
export const CURRENT_NOTATION: NotationEdition = "nsgc2022";

export function notationOf(pedigree: Pick<Pedigree, "canvasSettings"> | undefined): NotationEdition {
  return pedigree?.canvasSettings?.notation === "nsgc2022" ? "nsgc2022" : "nsgc2008";
}

/**
 * The pedigree with `canvasSettings.notation` set to the current edition when
 * it has none. For things made now (new, PED import, examples), never for a
 * saved pedigree being opened, which must keep its old look.
 */
export function withCurrentNotation<P extends Pick<Pedigree, "canvasSettings">>(pedigree: P): P {
  if (pedigree.canvasSettings?.notation) return pedigree;
  // The required fields take the store's defaults (`updateCanvasSettings`, DEFAULT_SNAP_GRID_SIZE).
  const base = pedigree.canvasSettings ?? { nodesMoveable: false, snapToGrid: false, snapGridSize: 5 };
  return { ...pedigree, canvasSettings: { ...base, notation: CURRENT_NOTATION } };
}
