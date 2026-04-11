import type { Pedigree, LayoutInput, Hints, LayoutResult, AlignState } from "./types.js";
import { kindepth } from "./kindepth.js";
import { autohint } from "./autohint.js";
import { alignped1 } from "./alignped1.js";
import { alignped3 } from "./alignped3.js";
import { alignped4 } from "./alignped4.js";

export interface AlignOptions {
  packed?: boolean;   // default true
  width?: number;     // default 10
  align?: boolean;    // default true — use QP optimisation
  hints?: Hints;      // if omitted, autohint() is called
}

/**
 * Port of R align.pedigree().
 *
 * Takes a Pedigree (public model) and returns x/y layout positions for every individual.
 * Internally converts to 1-based LayoutInput, runs the algorithm, and returns 1-based output.
 *
 * NOTE: Unlike the plan's original design, the output uses 1-based individual indices
 * (matching the R output) so tests can directly compare against R ground truth.
 * n[lev] counts individuals at level lev (1-based levels in internal arrays, returned
 * as 0-based in LayoutResult.n following the plan spec).
 */
export function alignPedigree(
  pedigree: Pedigree,
  options: AlignOptions = {},
): LayoutResult {
  const { packed = true, width = 10, align = true } = options;

  // 1. Convert to LayoutInput (1-based)
  const input = pedigreeToLayoutInput(pedigree);

  // 2. Assign generations
  const depth = kindepth(input, true);
  const level = new Int32Array(input.n + 1);
  for (let i = 1; i <= input.n; i++) level[i] = depth[i]! + 1;

  // 3. Get ordering hints
  const hints = options.hints ?? autohint(input, depth);

  // 4. Build spouselist
  const { spouselist, spouselistRows } = buildSpouseList(input, hints, pedigree);

  // 5. Find founder ordering and run alignped1 for each founder, merging with alignped3
  const { founders } = findFounders(input, spouselist, spouselistRows, hints);

  let rval = alignped1(
    founders[0]!,
    input.findex,
    input.mindex,
    level,
    hints.order,
    packed,
    spouselist,
    spouselistRows,
  );

  if (founders.length > 1) {
    let sl = rval.spouselist;
    let slRows = rval.spouselistRows;
    for (let i = 1; i < founders.length; i++) {
      const rval2 = alignped1(founders[i]!, input.findex, input.mindex, level, hints.order, packed, sl, slRows);
      sl = rval2.spouselist;
      slRows = rval2.spouselistRows;
      const merged = alignped3(rval, rval2, packed);
      rval = { ...merged, spouselist: sl, spouselistRows: slRows };
    }
  }

  // 6. Separate nid (integer) from spouse marker (fractional .5 → 1)
  const maxlev = rval.n.length - 1;
  const nidInt: Int32Array[] = rval.nid.map(row => {
    const a = new Int32Array(row.length);
    for (let c = 0; c < row.length; c++) a[c] = Math.floor(row[c]!);
    return a;
  });
  const spouseMatrix: number[][] = rval.nid.map((row, i) => {
    const a = new Array(row.length).fill(0);
    for (let c = 0; c < row.length; c++) {
      a[c] = row[c]! !== nidInt[i]![c]! ? 1 : 0;
    }
    return a;
  });

  // 7. Mark consanguineous couples with spouse=2
  function getAncestors(me: number): Set<number> {
    const alist = new Set<number>([me]);
    while (true) {
      const before = alist.size;
      for (const x of [...alist]) {
        const m = input.mindex[x] ?? 0;
        const d = input.findex[x] ?? 0;
        if (m > 0) alist.add(m);
        if (d > 0) alist.add(d);
      }
      if (alist.size === before) break;
    }
    alist.delete(me);
    return alist;
  }

  for (let lev = 1; lev <= maxlev; lev++) {
    const ni = rval.n[lev] ?? 0;
    for (let c = 1; c <= ni; c++) {
      if (spouseMatrix[lev]![c]! > 0) {
        const id1 = nidInt[lev]![c]!;
        const id2 = nidInt[lev]![c + 1]!;
        if (id1 > 0 && id2 > 0) {
          const a1 = getAncestors(id1);
          const a2 = getAncestors(id2);
          let consang = false;
          for (const x of a1) {
            if (a2.has(x)) { consang = true; break; }
          }
          if (consang) spouseMatrix[lev]![c] = 2;
        }
      }
    }
  }

  // 8. QP optimisation
  const pos = (align && maxlev > 1)
    ? alignped4(rval, spouseMatrix, level, width, align)
    : rval.pos.map(row => new Float64Array(row));

  // 9. Convert to LayoutResult (0-based level arrays, but keeping 1-based individual indices)
  return toLayoutResult(rval, nidInt, pos, spouseMatrix, maxlev);
}

/**
 * Convert from 1-based internal AlignState to the public LayoutResult.
 * Level arrays are converted from 1-based to 0-based (level 1 → index 0, etc.).
 */
function toLayoutResult(
  rval: AlignState,
  nidInt: Int32Array[],
  pos: Float64Array[],
  spouseMatrix: number[][],
  maxlev: number,
): LayoutResult {
  const n: number[] = [];
  const nidOut: number[][] = [];
  const posOut: number[][] = [];
  const famOut: number[][] = [];
  const spouseOut: number[][] = [];

  for (let lev = 1; lev <= maxlev; lev++) {
    const ni = rval.n[lev] ?? 0;
    n.push(ni);

    const nidRow: number[] = [];
    const posRow: number[] = [];
    const famRow: number[] = [];
    const spRow: number[] = [];

    for (let c = 1; c <= ni; c++) {
      nidRow.push(nidInt[lev]![c]!);
      posRow.push(pos[lev]![c]!);
      famRow.push(rval.fam[lev]![c]!);
      spRow.push(spouseMatrix[lev]![c]!);
    }
    nidOut.push(nidRow);
    posOut.push(posRow);
    famOut.push(famRow);
    spouseOut.push(spRow);
  }

  return { n, nid: nidOut, pos: posOut, fam: famOut, spouse: spouseOut };
}

/**
 * Convert the public Pedigree model to a 1-based LayoutInput.
 * Individuals get 1-based sequential indices in the order they appear in pedigree.individuals.
 */
export function pedigreeToLayoutInput(pedigree: Pedigree): LayoutInput {
  const { individuals, partnerships, parentOf } = pedigree;
  const n = individuals.length;

  const idToIdx = new Map<string, number>();
  for (let i = 0; i < n; i++) idToIdx.set(individuals[i]!.id, i + 1);

  const findex = new Int32Array(n + 1); // father index
  const mindex = new Int32Array(n + 1); // mother index
  const sex = new Uint8Array(n + 1);

  for (let i = 0; i < n; i++) {
    const ind = individuals[i]!;
    const idx = i + 1;
    sex[idx] = ind.sex === "male" ? 1 : ind.sex === "female" ? 2 : 3;
  }

  // Fill in parent indices from partnerships
  for (const p of partnerships) {
    const children = parentOf[p.id] ?? [];
    const p1idx = idToIdx.get(p.individual1) ?? 0;
    const p2idx = idToIdx.get(p.individual2) ?? 0;

    // Determine which is father (male) and which is mother (female)
    let dadIdx = 0, momIdx = 0;
    if (p1idx > 0 && p2idx > 0) {
      const s1 = sex[p1idx]!;
      const s2 = sex[p2idx]!;
      if (s1 === 1) { dadIdx = p1idx; momIdx = p2idx; }
      else if (s2 === 1) { dadIdx = p2idx; momIdx = p1idx; }
      else { dadIdx = p1idx; momIdx = p2idx; } // both unknown/female: arbitrary
    }

    for (const childId of children) {
      const childIdx = idToIdx.get(childId) ?? 0;
      if (childIdx > 0) {
        findex[childIdx] = dadIdx;
        mindex[childIdx] = momIdx;
      }
    }
  }

  return { n, findex, mindex, sex };
}

/**
 * Build the spouselist (1-based) from hints and parent pairs.
 * Returns a flat Int32Array with 4 columns per row and the row count.
 *
 * Column layout: [husbandIdx, wifeIdx, anchorSex(1|2|0), hintSex(0)]
 */
function buildSpouseList(
  input: LayoutInput,
  hints: Hints,
  pedigree?: Pedigree,
): { spouselist: Int32Array; spouselistRows: number } {
  const n = input.n;
  const rows: [number, number, number, number][] = [];

  // Start with spouse hints
  if (hints.spouse !== null) {
    const hsp = hints.spouse;
    const hRows = hsp.length / 3;
    for (let r = 0; r < hRows; r++) {
      const left = hsp[r * 3]!;
      const right = hsp[r * 3 + 1]!;
      const anchor = hsp[r * 3 + 2]!;
      // tsex = sex of left member; if male → col1=left, col2=right; else swap
      const tsex = input.sex[left] ?? 3;
      if (tsex === 1) {
        rows.push([left, right, 1 + (tsex !== 1 ? 1 : 0), anchor]);
      } else {
        rows.push([right, left, 1 + (tsex !== 1 ? 1 : 0), anchor]);
      }
    }
  }

  // Add parent pairs
  for (let i = 1; i <= n; i++) {
    const d = input.findex[i]!;
    const m = input.mindex[i]!;
    if (d > 0 && m > 0) {
      rows.push([d, m, 0, 0]);
    }
  }

  // Deduplicate by hash(husband * n + wife)
  const seen = new Set<number>();
  const unique: [number, number, number, number][] = [];
  for (const row of rows) {
    const hash = row[0] * n + row[1];
    if (!seen.has(hash)) {
      seen.add(hash);
      unique.push(row);
    }
  }

  const spouselist = new Int32Array(unique.length * 4);
  for (let i = 0; i < unique.length; i++) {
    spouselist[i * 4] = unique[i]![0];
    spouselist[i * 4 + 1] = unique[i]![1];
    spouselist[i * 4 + 2] = unique[i]![2];
    spouselist[i * 4 + 3] = unique[i]![3];
  }

  return { spouselist, spouselistRows: unique.length };
}

/**
 * Determine which individuals are "founders" for the alignment traversal.
 *
 * Matches R align.pedigree's "Founders -align" block:
 * - noparents = couples where BOTH members have no parents
 * - dupmom = founding mothers with multiple marriages
 * - dupdad = founding fathers with multiple marriages
 * - foundmom = founding mothers in non-duplicated marriages
 * - founders = union of the above, ordered by horder
 */
function findFounders(
  input: LayoutInput,
  spouselist: Int32Array,
  spouselistRows: number,
  hints: Hints,
): { founders: number[] } {
  const { findex: dad, mindex: mom } = input;

  // noparents[r] = true iff both husband and wife in row r have no parents
  const noparentsRows: number[] = [];
  for (let r = 0; r < spouselistRows; r++) {
    const h = spouselist[r * 4]!;
    const w = spouselist[r * 4 + 1]!;
    if (dad[h] === 0 && dad[w] === 0) noparentsRows.push(r);
  }

  // Collect husbands and wives from noparents rows
  const npHusbands = noparentsRows.map(r => spouselist[r * 4]!);
  const npWives = noparentsRows.map(r => spouselist[r * 4 + 1]!);

  // dupmom: founding mothers appearing more than once
  const momCount = new Map<number, number>();
  for (const m of npWives) momCount.set(m, (momCount.get(m) ?? 0) + 1);
  const dupmom = [...new Set(npWives.filter(m => (momCount.get(m) ?? 0) > 1))];

  // dupdad: founding fathers appearing more than once
  const dadCount = new Map<number, number>();
  for (const d of npHusbands) dadCount.set(d, (dadCount.get(d) ?? 0) + 1);
  const dupdad = [...new Set(npHusbands.filter(d => (dadCount.get(d) ?? 0) > 1))];

  const dupSet = new Set([...dupmom, ...dupdad]);

  // foundmom: founding mothers in marriages not involving any dup
  const foundmom: number[] = [];
  for (let i = 0; i < noparentsRows.length; i++) {
    const h = npHusbands[i]!;
    const w = npWives[i]!;
    if (!dupSet.has(h) && !dupSet.has(w)) {
      foundmom.push(w);
    }
  }

  const foundersSet = [...new Set([...dupmom, ...dupdad, ...foundmom])];
  // Sort by horder
  foundersSet.sort((a, b) => (hints.order[a] ?? 0) - (hints.order[b] ?? 0));

  return { founders: foundersSet };
}
