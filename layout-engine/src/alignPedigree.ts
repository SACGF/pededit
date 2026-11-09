import type { Pedigree, Partnership, LayoutInput, Hints, LayoutResult, AlignState } from "./types.js";
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
  /**
   * Layout improvements beyond kinship2 (see layout-engine/AGENTS.md):
   * currently the spouse-hint balancing of #76. Default false, so a plain
   * call matches R; `alignPedigreeByFamily` turns it on.
   */
  improve?: boolean;
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
  const { packed = true, width = 10, align = true, improve = false } = options;

  // 1. Convert to LayoutInput (1-based)
  const input = pedigreeToLayoutInput(pedigree);

  // 2. Assign generations
  let depth: Int32Array;
  try {
    depth = kindepth(input, true);
  } catch {
    // Inbred pedigree that fails the couple-alignment pass.
    // Fall back to depth-only: parents may end up at different depths,
    // but the layout will not crash. Rare in practice.
    depth = kindepth(input, false);
  }
  const level = new Int32Array(input.n + 1);
  for (let i = 1; i <= input.n; i++) level[i] = depth[i]! + 1;

  // 3. Get ordering hints
  const hints = options.hints ?? autohint(input, pedigree, { balancePartners: improve });

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

  // 8. QP optimisation (with NaN guard — ill-conditioned problems fall back to raw positions)
  let pos: Float64Array[];
  if (align && maxlev > 1) {
    const qpPos = alignped4(rval, spouseMatrix, level, width, align);
    let hasNaN = false;
    outerQP: for (let lev = 1; lev <= maxlev; lev++) {
      const ni = rval.n[lev] ?? 0;
      for (let c = 1; c <= ni; c++) {
        if (!Number.isFinite(qpPos[lev]![c]!)) { hasNaN = true; break outerQP; }
      }
    }
    pos = hasNaN ? rval.pos.map(row => new Float64Array(row)) : qpPos;
  } else {
    pos = rval.pos.map(row => new Float64Array(row));
  }

  // 8.5. Post-QP centering: shift each sibship toward its parent midpoint where spacing allows
  pos = postQPCenter(rval, pos);

  // 8.7. Append isolated individuals (no partner, no children, never reached by
  // the traversal) to the right end of their generation. This runs after the
  // QP on purpose: the QP bounds every row by the widest row, so counting the
  // isolated people in the top row would leave the connected families no room
  // to centre parents over children.
  appendIsolated(input, level, rval, nidInt, spouseMatrix, pos);

  // 9. Convert to LayoutResult (0-based level arrays, but keeping 1-based individual indices)
  return toLayoutResult(rval, nidInt, pos, spouseMatrix, maxlev);
}

/**
 * Add every individual not yet placed to the end of their generation row,
 * one slot to the right of the current rightmost position. Extends all
 * per-row arrays in place.
 */
function appendIsolated(
  input: LayoutInput,
  level: Int32Array,
  rval: AlignState,
  nidInt: Int32Array[],
  spouseMatrix: number[][],
  pos: Float64Array[],
): void {
  const maxlev = rval.n.length - 1;
  const placed = new Set<number>();
  for (let lev = 1; lev <= maxlev; lev++) {
    const ni = rval.n[lev] ?? 0;
    for (let c = 1; c <= ni; c++) placed.add(nidInt[lev]![c]!);
  }
  const grow = <T extends Int32Array | Float64Array>(arr: T, len: number): T => {
    if (arr.length >= len) return arr;
    const out = new (arr.constructor as new (n: number) => T)(len);
    out.set(arr);
    return out;
  };
  for (let i = 1; i <= input.n; i++) {
    if (placed.has(i)) continue;
    const lev = level[i]!;
    if (!lev || lev > maxlev) continue;
    const ni = rval.n[lev] ?? 0;
    const col = ni + 1;
    rval.nid[lev] = grow(rval.nid[lev]!, col + 1);
    rval.fam[lev] = grow(rval.fam[lev]!, col + 1);
    rval.pos[lev] = grow(rval.pos[lev]!, col + 1);
    nidInt[lev]   = grow(nidInt[lev]!, col + 1);
    pos[lev]      = grow(pos[lev]!, col + 1);
    while (spouseMatrix[lev]!.length < col + 1) spouseMatrix[lev]!.push(0);
    rval.nid[lev]![col] = i;
    nidInt[lev]![col] = i;
    rval.fam[lev]![col] = 0;
    spouseMatrix[lev]![col] = 0;
    const x = ni > 0 ? pos[lev]![ni]! + 1 : 0;
    pos[lev]![col] = x;
    rval.pos[lev]![col] = x;
    rval.n[lev] = col;
    placed.add(i);
  }
}

/**
 * Post-QP centering pass.
 *
 * After the QP optimisation, each sibship's children are shifted toward
 * their parent couple midpoint as far as spacing constraints allow.
 *
 * The QP minimises a combined objective (spouse adjacency + centering) and
 * for cross-family couples the spouse-adjacency penalty dominates, leaving
 * children off-centre even though a simple shift would fix it.  This pass
 * corrects that by greedily shifting each sibship leftward or rightward,
 * clamped so no child is moved closer than 1 unit to any non-sibling neighbour.
 *
 * Levels are processed top→bottom so that a corrected parent position is
 * visible when we compute grandchild shifts.  Within each level, families
 * are processed left→right to ensure left-family shifts don't remove the
 * gap headroom that right families rely on.
 *
 * All arrays use 1-based indexing to match the internal AlignState convention.
 */
function postQPCenter(rval: AlignState, pos: Float64Array[]): Float64Array[] {
  const maxlev = rval.n.length - 1;

  for (let lev = 2; lev <= maxlev; lev++) {
    const ni = rval.n[lev] ?? 0;
    const famRow = rval.fam[lev]!;

    // Group child slots (1-based) by family index
    const families = new Map<number, number[]>();
    for (let c = 1; c <= ni; c++) {
      const f = famRow[c] ?? 0;
      if (f > 0) {
        if (!families.has(f)) families.set(f, []);
        families.get(f)!.push(c);
      }
    }

    // Sort families left→right by parent position
    const niParent = rval.n[lev - 1] ?? 0;
    const sorted = [...families.entries()].sort(
      ([fa], [fb]) => (pos[lev - 1]![fa] ?? 0) - (pos[lev - 1]![fb] ?? 0),
    );

    for (const [f, slots] of sorted) {
      // f is the 1-based slot index of the LEFT parent; f+1 is the right parent
      if (f < 1 || f + 1 > niParent) continue;

      const leftParentPos  = pos[lev - 1]![f]!;
      const rightParentPos = pos[lev - 1]![f + 1]!;
      const parentMid = (leftParentPos + rightParentPos) / 2;

      const childMid = slots.reduce((s, c) => s + pos[lev]![c]!, 0) / slots.length;
      let shift = parentMid - childMid;
      if (Math.abs(shift) < 1e-6) continue;

      // Clamp against every non-sibling slot beside a sibling, not just the two
      // ends: a married-in spouse can sit inside the sibship's span.
      const member = new Set(slots);
      for (const c of slots) {
        if (shift < 0 && c - 1 >= 1 && !member.has(c - 1)) {
          shift = Math.max(shift, -(pos[lev]![c]! - pos[lev]![c - 1]! - 1));
        } else if (shift > 0 && c + 1 <= ni && !member.has(c + 1)) {
          shift = Math.min(shift, pos[lev]![c + 1]! - pos[lev]![c]! - 1);
        }
      }

      if (Math.abs(shift) < 1e-6) continue;

      for (const c of slots) {
        pos[lev]![c] = pos[lev]![c]! + shift;
      }
    }
  }

  return pos;
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

  // Fill in parent indices from partnerships.
  //
  // The algorithm works in terms of a "father" and a "mother" role per couple
  // (findex/mindex) and treats someone as the father-role member whenever they
  // appear in findex. A male partner always takes the father role. When neither
  // partner is male (both female, or sex unknown) the roles are arbitrary, but
  // they must be consistent: a person who is the father-role member of one
  // couple must not be the mother-role member of another, or alignped1 will
  // only see half their marriages. Couples with a male are assigned first so
  // the ambiguous ones can follow whatever role their members already hold.
  const role = new Map<number, 1 | 2>(); // 1 = father role, 2 = mother role
  const resolved: Array<{ p: Partnership; dad: number; mom: number }> = [];
  const ambiguous: Partnership[] = [];
  for (const p of partnerships) {
    const p1idx = idToIdx.get(p.individual1) ?? 0;
    const p2idx = idToIdx.get(p.individual2) ?? 0;
    if (p1idx === 0 || p2idx === 0) continue;
    const s1 = sex[p1idx]!, s2 = sex[p2idx]!;
    if (s1 === 1 && s2 !== 1)      resolved.push({ p, dad: p1idx, mom: p2idx });
    else if (s2 === 1 && s1 !== 1) resolved.push({ p, dad: p2idx, mom: p1idx });
    else ambiguous.push(p);
  }
  for (const r of resolved) { role.set(r.dad, 1); role.set(r.mom, 2); }
  for (const p of ambiguous) {
    const p1idx = idToIdx.get(p.individual1)!;
    const p2idx = idToIdx.get(p.individual2)!;
    const swap = role.get(p1idx) === 2 || role.get(p2idx) === 1;
    const dad = swap ? p2idx : p1idx;
    const mom = swap ? p1idx : p2idx;
    if (!role.has(dad)) role.set(dad, 1);
    if (!role.has(mom)) role.set(mom, 2);
    resolved.push({ p, dad, mom });
  }

  const childless: number[] = [];
  const seenCouple = new Set<number>();
  for (const { p, dad, mom } of resolved) {
    let anyChild = false;
    for (const childId of parentOf[p.id] ?? []) {
      const childIdx = idToIdx.get(childId) ?? 0;
      if (childIdx > 0) {
        findex[childIdx] = dad;
        mindex[childIdx] = mom;
        anyChild = true;
      }
    }
    if (!anyChild && dad !== mom) {
      const key = Math.min(dad, mom) * (n + 1) + Math.max(dad, mom);
      if (!seenCouple.has(key)) { seenCouple.add(key); childless.push(dad, mom); }
    }
  }
  // A childless partnership is only a couple to kinship2 if no child links the
  // same two people (a second partnership record between them, say).
  const withKids = new Set<number>();
  for (let i = 1; i <= n; i++) {
    const d = findex[i]!, m = mindex[i]!;
    if (d > 0 && m > 0) withKids.add(Math.min(d, m) * (n + 1) + Math.max(d, m));
  }
  const childlessCouples: number[] = [];
  for (let k = 0; k < childless.length; k += 2) {
    const d = childless[k]!, m = childless[k + 1]!;
    if (!withKids.has(Math.min(d, m) * (n + 1) + Math.max(d, m))) childlessCouples.push(d, m);
  }

  return { n, findex, mindex, sex, childlessCouples: Int32Array.from(childlessCouples) };
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
  _pedigree?: Pedigree,
): { spouselist: Int32Array; spouselistRows: number } {
  const n = input.n;
  const rows: [number, number, number, number][] = [];

  // Father-role/mother-role orientation of every parent couple, so hint rows
  // can be written [father, mother] regardless of sex and still deduplicate
  // against the parent-pair rows below.
  const fatherMother = new Set<number>();
  for (let i = 1; i <= n; i++) {
    const d = input.findex[i]!, m = input.mindex[i]!;
    if (d > 0 && m > 0) fatherMother.add(d * (n + 1) + m);
  }
  const cc = input.childlessCouples;
  if (cc) for (let k = 0; k + 1 < cc.length; k += 2) fatherMother.add(cc[k]! * (n + 1) + cc[k + 1]!);

  // Start with spouse hints: [left, right, anchor] → [father, mother, leftIsFather ? 1 : 2, anchor]
  // (R: tsex = sex of the left member; col3 = 1 if male, else 2.)
  if (hints.spouse !== null) {
    const hsp = hints.spouse;
    const hRows = hsp.length / 3;
    for (let r = 0; r < hRows; r++) {
      const left = hsp[r * 3]!;
      const right = hsp[r * 3 + 1]!;
      const anchor = hsp[r * 3 + 2]!;
      let leftIsFather: boolean;
      if (fatherMother.has(left * (n + 1) + right))      leftIsFather = true;
      else if (fatherMother.has(right * (n + 1) + left)) leftIsFather = false;
      else leftIsFather = (input.sex[left] ?? 3) === 1;
      if (leftIsFather) rows.push([left, right, 1, anchor]);
      else              rows.push([right, left, 2, anchor]);
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

  // Childless partnerships (not part of R kinship2, which has no way to say
  // two people are partners without a child). alignped1 places the partners
  // of whoever it is processing from this list, children or not.
  if (cc) for (let k = 0; k + 1 < cc.length; k += 2) rows.push([cc[k]!, cc[k + 1]!, 0, 0]);

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

  // Fallback: if no founders found via the spouselist (e.g. a single individual with no
  // partnerships at all), use every root individual (no parents) as a starting point.
  if (foundersSet.length === 0) {
    for (let i = 1; i <= input.n; i++) {
      if (dad[i] === 0 && mom[i] === 0) foundersSet.push(i);
    }
    foundersSet.sort((a, b) => (hints.order[a] ?? 0) - (hints.order[b] ?? 0));
  }

  return { founders: foundersSet };
}
