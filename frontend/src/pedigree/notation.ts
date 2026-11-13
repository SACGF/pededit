/**
 * Which edition of the NSGC nomenclature the drawing follows
 * (`canvasSettings.notation`). Absent means the latest, "nsgc2022": the
 * maintainer's rule is to default to the latest standard and keep the older
 * style as an option for people who still work in it.
 *
 * What changes with "nsgc2008": evaluation results are written with the "E"
 * prefix, numbered E1, E2 ("E+ (BRCA1 c.5266dupC)", #101) instead of the
 * 2022 "BRCA1 c.5266dupC +" (#114). Later 2022 changes (the carrier dot, #115)
 * belong here too.
 */

import type { NotationEdition, Pedigree } from "@pedigree-editor/layout-engine";

export const NOTATION_OPTIONS: { value: NotationEdition; label: string }[] = [
  { value: "nsgc2022", label: "NSGC 2022 (current)" },
  { value: "nsgc2008", label: "NSGC 2008" },
];

export function notationOf(pedigree: Pick<Pedigree, "canvasSettings"> | undefined): NotationEdition {
  return pedigree?.canvasSettings?.notation === "nsgc2008" ? "nsgc2008" : "nsgc2022";
}
