import { alignPedigree } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult } from "@pedigree-editor/layout-engine";
import type { SvgExportOptions } from "./types";

// Supports generations I–X (more than sufficient for clinical pedigrees)
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function toRoman(n: number): string {
  return ROMAN[n - 1] ?? `G${n}`;
}

export function buildNotationMap(
  pedigree: Pedigree,
  result: LayoutResult,
): Map<string, string> {
  const assigned = new Map<string, string>();   // individualId → "II-3"
  const generationCounters: number[] = [];       // [level] → next individual #

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const nid = Math.floor(result.nid[level][slot]);   // 1-based
      const individual = pedigree.individuals[nid - 1];
      if (assigned.has(individual.id)) continue;         // skip duplicate slots

      if (generationCounters[level] === undefined) generationCounters[level] = 1;
      const num = generationCounters[level]++;
      assigned.set(individual.id, `${toRoman(level + 1)}-${num}`);
    }
  }
  return assigned;
}

function ageBucket(dob: string, referenceDate = new Date()): string {
  const birth = new Date(dob);
  const ageYears = (referenceDate.getTime() - birth.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (ageYears < 1)  return "infant";
  if (ageYears < 10) return "child";
  if (ageYears < 18) return "teen";
  const decade = Math.floor(ageYears / 10) * 10;
  return `${decade}s`;
}

export function deidentify(pedigree: Pedigree, options: SvgExportOptions = {}): Pedigree {
  const result = alignPedigree(pedigree);
  const notations = buildNotationMap(pedigree, result);

  return {
    ...pedigree,
    individuals: pedigree.individuals.map(ind => ({
      ...ind,
      name:  notations.get(ind.id) ?? ind.id,
      dob:   options.ageBuckets && ind.dob ? ageBucket(ind.dob) : undefined,
      notes: undefined,
    })),
  };
}
