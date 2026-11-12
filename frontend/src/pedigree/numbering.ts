/**
 * Pedigree numbers (#8): generation in Roman numerals, then the person's
 * place in that generation counting left to right, "II-3". Computed from the
 * layout every time, never stored, so adding a sibling renumbers everyone to
 * their right. Only drawn people are numbered (hidden descendants, #94, get
 * none), so the figure reads I-1, I-2, I-3 with no gaps.
 *
 * `pedigreeNumbers` in `layoutToFlow.ts` is the entry point for a whole
 * pedigree; this module is the counting, kept free of the canvas code.
 */

import type { LayoutResult, Pedigree } from "@pedigree-editor/layout-engine";

const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** 1 → "I", 14 → "XIV". */
export function toRoman(n: number): string {
  let out = "";
  for (const [value, numeral] of ROMAN) {
    while (n >= value) { out += numeral; n -= value; }
  }
  return out;
}

/**
 * Number everyone in `result` (a layout of `pedigree`, already the drawn
 * pedigree), level by level in slot order. Someone drawn twice keeps the
 * number of their first copy; slots in `skip` ("level-slot", copies the
 * canvas leaves out) are passed over.
 */
export function numberFromLayout(
  pedigree: Pedigree,
  result: LayoutResult,
  skip: Set<string> = new Set(),
): Map<string, string> {
  const assigned = new Map<string, string>();
  let generation = 0;
  for (let level = 0; level < result.n.length; level++) {
    let count = 0;
    for (let slot = 0; slot < result.n[level]; slot++) {
      if (skip.has(`${level}-${slot}`)) continue;
      const individual = pedigree.individuals[result.nid[level][slot] - 1];
      if (!individual || assigned.has(individual.id)) continue;
      if (count === 0) generation++;
      assigned.set(individual.id, `${toRoman(generation)}-${++count}`);
    }
  }
  return assigned;
}

/** True when the pedigree asks for its numbers to be drawn with the names. */
export function showsNumbers(pedigree: Pick<Pedigree, "canvasSettings">): boolean {
  return pedigree.canvasSettings?.showNumbers === true;
}
