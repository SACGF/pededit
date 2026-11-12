import type { Pedigree } from "@pedigree-editor/layout-engine";
import { pedigreeNumbers } from "../../pedigree/layoutToFlow";
import type { SvgExportOptions } from "./types";
import { asDrawn, drawnPedigree, isBranchPlaceholderId } from "../../pedigree/collapse";

function ageBucket(dob: string, referenceDate = new Date()): string {
  const birth = new Date(dob);
  const ageYears = (referenceDate.getTime() - birth.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (ageYears < 1)  return "infant";
  if (ageYears < 10) return "child";
  if (ageYears < 18) return "teen";
  const decade = Math.floor(ageYears / 10) * 10;
  return `${decade}s`;
}

/**
 * The drawn pedigree (hidden descendants left out, #94) with names replaced by
 * generation numbers, dates bucketed or dropped, and free-text age, notes
 * and chart title dropped.
 */
export function deidentify(full: Pedigree, options: SvgExportOptions = {}): Pedigree {
  const pedigree = drawnPedigree(full);
  // The pedigree numbers (#8), so a de-identified figure reads like the
  // numbered one.
  const notations = pedigreeNumbers(pedigree);

  // The chart title and the free-text age (#20) can name or date someone, so
  // both go; age ranges come from the DOB only.
  return asDrawn({
    ...pedigree,
    chartTitle: "",
    // The names are the numbers now: drawing them again would repeat them.
    ...(pedigree.canvasSettings ? { canvasSettings: { ...pedigree.canvasSettings, showNumbers: false } } : {}),
    individuals: pedigree.individuals.map(ind => ({
      ...ind,
      name:  isBranchPlaceholderId(ind.id) ? undefined : notations.get(ind.id) ?? ind.id,
      dob:   options.ageBuckets && ind.dob ? ageBucket(ind.dob) : undefined,
      age:   undefined,
      notes: undefined,
    })),
  }, pedigree);
}
