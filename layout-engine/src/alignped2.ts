import type { AlignStateWithSpouseList } from "./alignped1.js";
import { alignped1 } from "./alignped1.js";
import { alignped3 } from "./alignped3.js";

/**
 * Port of R alignped2().
 *
 * Takes a list of siblings, sorts them by horder, calls alignped1 on each,
 * and merges the results side by side using alignped3.
 *
 * Special case: if a sibling was already added to rval (because an earlier
 * sibling's marriage pulled them in), skip adding a duplicate 1-element tree.
 */
export function alignped2(
  xs: number[],             // 1-based sibling indices
  dad: Int32Array,
  mom: Int32Array,
  level: Int32Array,
  horder: Float64Array,
  packed: boolean,
  spouselist: Int32Array,
  spouselistRows: number,
): AlignStateWithSpouseList {
  // Sort siblings by their hint order
  const sorted = [...xs].sort((a, b) => horder[a]! - horder[b]!);

  let rval = alignped1(sorted[0]!, dad, mom, level, horder, packed, spouselist, spouselistRows);
  spouselist = rval.spouselist;
  spouselistRows = rval.spouselistRows;

  if (sorted.length > 1) {
    const mylev = level[sorted[0]!]!;

    for (let i = 1; i < sorted.length; i++) {
      const rval2 = alignped1(sorted[i]!, dad, mom, level, horder, packed, spouselist, spouselistRows);
      spouselist = rval2.spouselist;
      spouselistRows = rval2.spouselistRows;

      // Special case: if rval2 is a single-element tree and sorted[i] is already
      // in rval at this level, skip merging (avoid duplicate)
      const alreadyPresent =
        rval2.n[mylev] === 1 &&
        Array.from(rval.nid[mylev] ?? []).some(v => Math.floor(v) === sorted[i]);

      if (!alreadyPresent) {
        const merged = alignped3(rval, rval2, packed);
        rval = { ...merged, spouselist, spouselistRows };
      }
    }

    rval.spouselist = spouselist;
    rval.spouselistRows = spouselistRows;
  }

  return rval;
}
