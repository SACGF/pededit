import type { AlignState } from "./types.js";
import { alignped3 } from "./alignped3.js";
import { alignped2 } from "./alignped2.js";

/**
 * Extends AlignState with the spouselist (passed by reference through recursion).
 * The spouselist is a flat row-major Int32Array with 4 columns per row:
 *   [husbandIdx, wifeIdx, anchorSex(1|2|0), hintSex(1|2|0)]
 * Processed marriages are removed by rebuilding the array without them.
 */
export interface AlignStateWithSpouseList extends AlignState {
  spouselist: Int32Array;
  spouselistRows: number;
}

/**
 * Port of R alignped1().
 *
 * Processes one individual x and builds its subtree.
 * Spouse positions are +0.5 encoded: nid value N+0.5 means individual N is
 * the LEFT member of a couple pair (a marriage line will be drawn between
 * this slot and the slot to its right).
 *
 * All indices are 1-based; index 0 is unused.
 */
export function alignped1(
  x: number,
  dad: Int32Array,
  mom: Int32Array,
  level: Int32Array,
  horder: Float64Array,
  packed: boolean,
  spouselist: Int32Array,
  spouselistRows: number,
): AlignStateWithSpouseList {
  const n = level.length - 1;
  const maxlev = Math.max(...Array.from(level).slice(1, n + 1));
  const lev = level[x]!;

  // ---- Part 1: find this individual's spouses in the spouselist ----
  // If x appears in column 1 → x is male (husband).
  // If x appears in column 2 → x is female (wife).
  // Anchoring rule: include this marriage if hint (col4) matches anchor (col3) or is 0.
  let sex: 1 | 2 = 2;
  for (let r = 0; r < spouselistRows; r++) {
    if (spouselist[r * 4] === x) { sex = 1; break; }
  }

  const sprows: number[] = []; // 0-based row indices of matching marriages
  const spouse: number[] = [];

  if (sex === 1) {
    for (let r = 0; r < spouselistRows; r++) {
      if (spouselist[r * 4] !== x) continue;
      const sl3 = spouselist[r * 4 + 2]!;
      const sl4 = spouselist[r * 4 + 3]!;
      if (sl4 === sl3 || sl4 === 0) {
        sprows.push(r);
        spouse.push(spouselist[r * 4 + 1]!);
      }
    }
  } else {
    for (let r = 0; r < spouselistRows; r++) {
      if (spouselist[r * 4 + 1] !== x) continue;
      const sl3 = spouselist[r * 4 + 2]!;
      const sl4 = spouselist[r * 4 + 3]!;
      if (sl4 !== sl3 || sl4 === 0) {
        sprows.push(r);
        spouse.push(spouselist[r * 4]!);
      }
    }
  }

  // Drop spouses at a lower level (cross-level marriages plotted at the lower level)
  const keepMask = spouse.map((sp, i) => level[sp]! <= lev ? i : -1).filter(i => i !== -1);
  const filteredSpouse = keepMask.map(i => spouse[i]!);
  const filteredSprows = keepMask.map(i => sprows[i]!);

  const nspouse = filteredSpouse.length;

  // ---- Part 2: allocate return matrices (1-based) ----
  const cols = nspouse + 2; // extra slot to avoid off-by-one on resizing
  const nArr = new Int32Array(maxlev + 1);
  const nid: Float64Array[] = Array.from({ length: maxlev + 1 }, () => new Float64Array(cols));
  const pos: Float64Array[] = Array.from({ length: maxlev + 1 }, () => new Float64Array(cols));
  const fam: Int32Array[] = Array.from({ length: maxlev + 1 }, () => new Int32Array(cols));

  nArr[lev] = nspouse + 1;
  for (let c = 1; c <= nspouse + 1; c++) pos[lev]![c] = c - 1; // 0, 1, 2, …

  if (nspouse === 0) {
    nid[lev]![1] = x;
    return { n: nArr, nid, pos, fam, spouselist, spouselistRows };
  }

  // ---- Part 3: split spouses into left and right ----
  const sprowSet = new Set(filteredSprows);
  const lspouseArr: number[] = [];
  const rspouseArr: number[] = [];
  const undecidedSpouse: number[] = [];

  for (let i = 0; i < filteredSprows.length; i++) {
    const r = filteredSprows[i]!;
    const sl3 = spouselist[r * 4 + 2]!;
    if (sl3 === 3 - sex) {
      lspouseArr.push(filteredSpouse[i]!);
    } else if (sl3 === sex) {
      rspouseArr.push(filteredSpouse[i]!);
    } else {
      undecidedSpouse.push(filteredSpouse[i]!);
    }
  }

  if (undecidedSpouse.length > 0) {
    // nleft = total to go left - already decided left count
    const nleft = Math.max(0, Math.floor((filteredSprows.length + (sex === 2 ? 1 : 0)) / 2) - lspouseArr.length);
    const take = Math.min(nleft, undecidedSpouse.length);
    for (let i = 0; i < take; i++) lspouseArr.push(undecidedSpouse[i]!);
    for (let i = take; i < undecidedSpouse.length; i++) rspouseArr.unshift(undecidedSpouse[i]!);
  }

  // Layout order: [lspouse..., x, rspouse...]
  const allOrdered = [...lspouseArr, x, ...rspouseArr];
  for (let c = 1; c <= allOrdered.length; c++) nid[lev]![c] = allOrdered[c - 1]!;
  // Mark slots 1..nspouse with +0.5 (each is the LEFT of a couple pair)
  // The last slot (nspouse+1) is never left-marked
  for (let c = 1; c <= nspouse; c++) nid[lev]![c] = nid[lev]![c]! + 0.5;

  // Remove processed rows from spouselist
  const { newSpouselist, newRows } = removeRows(spouselist, spouselistRows, sprowSet);
  spouselist = newSpouselist;
  spouselistRows = newRows;

  // ---- Part 4: for each spouse, recurse on their children ----
  // Process left spouses first, then right spouses (R: spouse <- c(lspouse, rspouse))
  const spouseOrder = [...lspouseArr, ...rspouseArr];
  let rval: AlignStateWithSpouseList | null = null;
  let nokids = true;

  for (let i = 0; i < nspouse; i++) {
    const ispouse = spouseOrder[i]!;
    const children: number[] = [];
    for (let j = 1; j <= n; j++) {
      if ((dad[j] === x && mom[j] === ispouse) || (dad[j] === ispouse && mom[j] === x)) {
        children.push(j);
      }
    }

    if (children.length === 0) continue;

    const rval1 = alignped2(children, dad, mom, level, horder, packed, spouselist, spouselistRows);
    spouselist = rval1.spouselist;
    spouselistRows = rval1.spouselistRows;

    // Set parentage for kids at level lev+1
    // R: family index is i (1-based loop), here i+1 (since i is 0-based)
    const famIndex = i + 1;
    const nextLev = lev + 1;
    if (nextLev <= maxlev) {
      const nextN = rval1.n[nextLev] ?? 0;
      for (let c = 1; c <= nextN; c++) {
        const ind = Math.floor(rval1.nid[nextLev]![c]!);
        if (children.includes(ind)) {
          rval1.fam[nextLev]![c] = famIndex;
        }
      }
    }

    if (!packed && nextLev <= maxlev) {
      // Center children under parents
      const nextN = rval1.n[nextLev] ?? 0;
      const indx: number[] = [];
      for (let c = 1; c <= nextN; c++) {
        if (children.includes(Math.floor(rval1.nid[nextLev]![c]!))) indx.push(c);
      }
      if (indx.length > 0) {
        const kidmean = indx.reduce((s, c) => s + rval1.pos[nextLev]![c]!, 0) / indx.length;
        // Parent couple occupies slots i+1 and i+2 (1-based) in the current level
        const parmean = (pos[lev]![i + 1]! + pos[lev]![i + 2]!) / 2;
        if (kidmean > parmean) {
          for (let c = i + 1; c <= nspouse + 1; c++) pos[lev]![c] = pos[lev]![c]! + (kidmean - parmean);
        } else {
          const shift = parmean - kidmean;
          for (let j = nextLev; j <= maxlev; j++) {
            const jn = rval1.n[j] ?? 0;
            for (let c = 1; c <= jn; c++) rval1.pos[j]![c] = rval1.pos[j]![c]! + shift;
          }
        }
      }
    }

    if (nokids) {
      rval = rval1;
      nokids = false;
    } else {
      const merged = alignped3(rval!, rval1, packed);
      rval = { ...merged, spouselist, spouselistRows };
    }
  }

  // ---- Part 5: splice children subtree with current level ----
  if (nokids) {
    return { n: nArr, nid, pos, fam, spouselist, spouselistRows };
  }

  const rv = rval!;
  // Number of columns in rv (1-based: actual cols = length - 1)
  const rvCols = (rv.nid[lev + 1]?.length ?? 1) - 1;

  if (rvCols >= nspouse + 1) {
    // rval has enough columns: write current level into it
    rv.n[lev] = nArr[lev]!;
    for (let c = 1; c <= nspouse + 1; c++) {
      rv.nid[lev]![c] = nid[lev]![c]!;
      rv.pos[lev]![c] = pos[lev]![c]!;
      // fam[lev] stays 0 (x has no parent pointer at this level)
    }
  } else {
    // Our matrix is wider: copy rv's data into our arrays
    const rvN = rvCols;
    for (let j = lev + 1; j <= maxlev; j++) {
      nArr[j] = rv.n[j]!;
      const jn = rv.n[j] ?? 0;
      for (let c = 1; c <= jn && c <= rvN; c++) {
        nid[j]![c] = rv.nid[j]![c]!;
        pos[j]![c] = rv.pos[j]![c]!;
        fam[j]![c] = rv.fam[j]![c]!;
      }
    }
    return { n: nArr, nid, pos, fam, spouselist, spouselistRows };
  }

  rv.spouselist = spouselist;
  rv.spouselistRows = spouselistRows;
  return rv;
}

/** Remove rows at given 0-based row indices from the spouselist. */
function removeRows(
  spouselist: Int32Array,
  rows: number,
  toRemove: Set<number>,
): { newSpouselist: Int32Array; newRows: number } {
  const kept: number[] = [];
  for (let r = 0; r < rows; r++) {
    if (!toRemove.has(r)) kept.push(r);
  }
  const newSpouselist = new Int32Array(kept.length * 4);
  for (let i = 0; i < kept.length; i++) {
    const r = kept[i]!;
    newSpouselist[i * 4] = spouselist[r * 4]!;
    newSpouselist[i * 4 + 1] = spouselist[r * 4 + 1]!;
    newSpouselist[i * 4 + 2] = spouselist[r * 4 + 2]!;
    newSpouselist[i * 4 + 3] = spouselist[r * 4 + 3]!;
  }
  return { newSpouselist, newRows: kept.length };
}
