import type { AlignState } from "./types.js";

/**
 * Port of R alignped3().
 *
 * Merges two side-by-side sub-trees into one.
 * The key special case: when the rightmost individual in x1 at some level is the
 * same individual as the leftmost in x2 at that level (consanguinity / shared
 * person appears under two parent pairs), the two slots are collapsed into one.
 *
 * All arrays are 1-based (index 0 unused).
 */
export function alignped3(x1: AlignState, x2: AlignState, packed: boolean, space = 1): AlignState {
  const maxlev = x1.n.length - 1; // 1-based levels 1..maxlev

  // Maximum columns we could possibly need (before collapse)
  let maxcol = 0;
  for (let i = 1; i <= maxlev; i++) maxcol = Math.max(maxcol, (x1.n[i] ?? 0) + (x2.n[i] ?? 0));

  // Allocate output arrays (1-based)
  const n = new Int32Array(maxlev + 1);
  const nid: Float64Array[] = [];
  const pos: Float64Array[] = [];
  const fam: Int32Array[] = [];
  for (let i = 0; i <= maxlev; i++) {
    nid.push(new Float64Array(maxcol + 1));
    pos.push(new Float64Array(maxcol + 1));
    fam.push(new Int32Array(maxcol + 1));
  }

  // Copy x1 into left side
  for (let i = 1; i <= maxlev; i++) {
    n[i] = (x1.n[i] ?? 0) + (x2.n[i] ?? 0);
    const x1n = x1.n[i] ?? 0;
    for (let c = 1; c <= x1n; c++) {
      nid[i]![c] = x2.nid[i]![c] !== undefined ? x1.nid[i]![c]! : x1.nid[i]![c]!;
      // simpler: just copy x1
      nid[i]![c] = x1.nid[i]![c]!;
      pos[i]![c] = x1.pos[i]![c]!;
      fam[i]![c] = x1.fam[i]![c]!;
    }
  }

  // Make a mutable copy of x2.fam so we can adjust pointers
  const fam2: Int32Array[] = [];
  for (let i = 0; i <= maxlev; i++) {
    fam2.push(new Int32Array(x2.fam[i] ?? new Int32Array(1)));
  }

  // ---- Slide (unpacked case) ----
  let slide = 0;
  if (!packed) {
    for (let i = 1; i <= maxlev; i++) {
      const n1 = x1.n[i] ?? 0;
      const n2 = x2.n[i] ?? 0;
      if (n1 > 0 && n2 > 0) {
        const x1_rightmost_nid = x1.nid[i]![n1]!;
        const x2_leftmost_nid = x2.nid[i]![1]!;
        let temp: number;
        if (x1_rightmost_nid === Math.floor(x2_leftmost_nid)) {
          temp = pos[i]![n1]! - x2.pos[i]![1]!;
        } else {
          temp = space + pos[i]![n1]! - x2.pos[i]![1]!;
        }
        if (temp > slide) slide = temp;
      }
    }
  }

  // ---- Merge ----
  for (let i = 1; i <= maxlev; i++) {
    const n1 = x1.n[i] ?? 0;
    const n2 = x2.n[i] ?? 0;
    if (n2 === 0) continue;

    let overlap = 0;
    if (n1 > 0 && Math.floor(x2.nid[i]![1]!) === nid[i]![n1]) {
      // Two subjects overlap: rightmost of x1 equals leftmost of x2
      overlap = 1;
      fam[i]![n1] = Math.max(fam[i]![n1]!, fam2[i]![1]!);
      // Preserve the .5 encoding if either copy has it
      nid[i]![n1] = Math.max(nid[i]![n1]!, x2.nid[i]![1]!);

      if (!packed) {
        if (fam2[i]![1]! > 0) {
          if (fam[i]![n1]! > 0) {
            pos[i]![n1] = (x2.pos[i]![1]! + pos[i]![n1]! + slide) / 2;
          } else {
            pos[i]![n1] = x2.pos[i]![1]! + slide;
          }
        }
      }
      n[i] -= 1;
    }

    // Packed slide: position of right tree starts right after x1's rightmost
    if (packed) {
      slide = n1 === 0 ? 0 : pos[i]![n1]! + space - overlap;
    }

    // Copy remaining x2 entries (skipping the overlapping first entry if any)
    // zz in R: seq(from = overlap + 1, length = n2 - overlap)
    for (let k = overlap + 1; k <= n2; k++) {
      const destCol = n1 + (k - overlap);
      nid[i]![destCol] = x2.nid[i]![k]!;
      fam[i]![destCol] = fam2[i]![k]!;
      pos[i]![destCol] = x2.pos[i]![k]! + slide;
    }

    // Look ahead: adjust fam pointers for children of x2 in the next level
    if (i < maxlev) {
      const cols2 = x2.fam[i + 1]?.length ?? 0;
      for (let c = 1; c < cols2; c++) {
        const f = fam2[i + 1]![c]!;
        if (f !== 0) fam2[i + 1]![c] = f + n1 - overlap;
      }
    }
  }

  // Trim unused columns
  let finalMaxcol = 0;
  for (let i = 1; i <= maxlev; i++) finalMaxcol = Math.max(finalMaxcol, n[i] ?? 0);

  if (finalMaxcol < maxcol) {
    for (let i = 0; i <= maxlev; i++) {
      nid[i] = nid[i]!.slice(0, finalMaxcol + 1) as Float64Array;
      pos[i] = pos[i]!.slice(0, finalMaxcol + 1) as Float64Array;
      fam[i] = fam[i]!.slice(0, finalMaxcol + 1) as Int32Array;
    }
  }

  return { n, nid, pos, fam };
}
