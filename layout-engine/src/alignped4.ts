import type { AlignState } from "./types.js";
import { solveQP } from "quadprog";

/**
 * Port of R alignped4().
 *
 * The final optimisation pass: sets up a quadratic program to align children
 * under parents and keep spouses close.
 *
 * Falls back to the raw positions from alignped1-3 if quadprog is unavailable
 * or the solve fails.
 *
 * align parameter:
 *   true  → use defaults [1.5, 2]
 *   [a,b] → penalty exponent and spouse weight
 */
export function alignped4(
  rval: AlignState,
  spouse: number[][], // 1-based Boolean matrix: spouse[lev][col] > 0 iff left of couple
  level: Int32Array,
  width: number,
  align: boolean | [number, number],
): Float64Array[] {
  const alignParams: [number, number] = align === true || align === false ? [1.5, 2] : align;

  const maxlev = rval.n.length - 1;
  const nTotal = Array.from(rval.n).slice(1).reduce((s, v) => s + v, 0);

  // Ensure width is at least max row width + a tiny amount
  let maxN = 0;
  for (let i = 1; i <= maxlev; i++) maxN = Math.max(maxN, rval.n[i] ?? 0);
  width = Math.max(width, maxN + 0.01);

  // Build myid: for each plotting position, its 1-based index in the flat parameter vector
  const myid: Int32Array[] = Array.from({ length: maxlev + 1 }, () => new Int32Array((rval.nid[1]?.length ?? 1)));
  let paramIdx = 0;
  for (let i = 1; i <= maxlev; i++) {
    const ni = rval.n[i] ?? 0;
    const row = rval.nid[i]!;
    for (let c = 1; c <= (row.length - 1); c++) {
      if (row[c]! > 0) {
        // Only fill for the first ni slots (which should all be > 0)
        if (c <= ni) {
          paramIdx++;
          myid[i]![c] = paramIdx;
        }
      }
    }
  }
  // nTotal == paramIdx

  // Count penalties
  let npenal = 0;
  for (let i = 1; i <= maxlev; i++) {
    const ni = rval.n[i] ?? 0;
    const spRow = spouse[i]!;
    for (let c = 1; c <= ni; c++) {
      if ((spRow[c] ?? 0) > 0) npenal++;
    }
  }
  for (let i = 2; i <= maxlev; i++) {
    const ni = rval.n[i] ?? 0;
    for (let c = 1; c <= ni; c++) {
      if ((rval.fam[i]?.[c] ?? 0) > 0) npenal++;
    }
  }

  // pmat: (npenal+1) × nTotal
  const pmat: number[][] = Array.from({ length: npenal + 1 }, () => new Array(nTotal + 1).fill(0));

  let indx = 0;

  // Spouse penalties: keep spouses close
  for (let lev = 1; lev <= maxlev; lev++) {
    const ni = rval.n[lev] ?? 0;
    const spRow = spouse[lev]!;
    for (let c = 1; c <= ni; c++) {
      if ((spRow[c] ?? 0) > 0) {
        indx++;
        const sqrtB = Math.sqrt(alignParams[1]);
        pmat[indx]![myid[lev]![c]!] = sqrtB;
        pmat[indx]![myid[lev]![c + 1]!] = -sqrtB;
      }
    }
  }

  // Child-parent penalties: keep children close to mid-parent
  for (let lev = 2; lev <= maxlev; lev++) {
    const famRow = rval.fam[lev]!;
    const ni = rval.n[lev] ?? 0;

    // Group children by family
    const families = new Set<number>();
    for (let c = 1; c <= ni; c++) {
      const f = famRow[c] ?? 0;
      if (f > 0) families.add(f);
    }

    for (const fam of families) {
      const who: number[] = [];
      for (let c = 1; c <= ni; c++) {
        if (famRow[c] === fam) who.push(c);
      }
      const k = who.length;
      const penalty = Math.sqrt(Math.pow(k, -alignParams[0]));
      for (const c of who) {
        indx++;
        pmat[indx]![myid[lev]![c]!] = -penalty;
        // Left parent at fam col, right parent at fam col + 1
        pmat[indx]![myid[lev - 1]![fam]!] = penalty / 2;
        pmat[indx]![myid[lev - 1]![fam + 1]!] = penalty / 2;
      }
    }
  }

  // Small leftward pull on widest row to make the problem positive-definite.
  // Uses row 0 (always zero-initialised, unused by the penalty loops above which
  // write rows 1..npenal) so it never overwrites a real penalty term.
  let maxRowLev = 1;
  for (let i = 2; i <= maxlev; i++) {
    if ((rval.n[i] ?? 0) >= (rval.n[maxRowLev] ?? 0)) maxRowLev = i;
  }
  pmat[0]![myid[maxRowLev]![1]!] = 1e-5;

  // Constraint matrix: (n + maxlev) × nTotal
  // For each level: (ni-1) spacing constraints + 1 lower bound + 1 upper bound
  const ncon = nTotal + maxlev;
  const cmat: number[][] = Array.from({ length: ncon + 1 }, () => new Array(nTotal + 1).fill(0));
  const dvec: number[] = new Array(ncon + 1).fill(1);

  let coff = 0;
  for (let lev = 1; lev <= maxlev; lev++) {
    const ni = rval.n[lev] ?? 0;
    if (ni > 1) {
      for (let c = 1; c <= ni - 1; c++) {
        coff++;
        cmat[coff]![myid[lev]![c]!] = -1;
        cmat[coff]![myid[lev]![c + 1]!] = 1;
        // dvec[coff] = 1 (already set)
      }
    }
    // First element >= 0
    coff++;
    cmat[coff]![myid[lev]![1]!] = 1;
    dvec[coff] = 0;
    // Last element <= width - 1
    coff++;
    cmat[coff]![myid[lev]![ni]!] = -1;
    dvec[coff] = 1 - width;
  }

  // Try to solve using quadprog
  try {
    // D = pmat^T * pmat + epsilon * I (make it positive definite)
    const eps = 1e-8;
    const D: number[][] = Array.from({ length: nTotal }, (_, i) =>
      Array.from({ length: nTotal }, (__, j) => {
        let s = 0;
        for (let k = 0; k <= npenal; k++) s += (pmat[k]![i + 1] ?? 0) * (pmat[k]![j + 1] ?? 0);
        return s + (i === j ? eps : 0);
      })
    );

    // Amat: nTotal × ncon (quadprog expects cols = constraints)
    // R: t(cmat) passed as Amat; our cmat is [ncon × nTotal] (rows=constraints, cols=vars)
    // quadprog npm: solve_QP(Dmat, dvec, Amat, bvec) where Amat is nvar × ncon
    // So we need to transpose cmat from [ncon × nTotal] to [nTotal × ncon]
    const Amat: number[][] = Array.from({ length: nTotal }, (_, i) =>
      Array.from({ length: coff }, (__, j) => cmat[j + 1]![i + 1] ?? 0)
    );
    const bvec = dvec.slice(1, coff + 1);
    const dvecQP = new Array(nTotal).fill(0);

    const fit = solveQP(D, dvecQP, Amat, bvec);

    // Unpack solution into newpos
    const newpos = rval.pos.map(row => new Float64Array(row));
    for (let i = 1; i <= maxlev; i++) {
      const ni = rval.n[i] ?? 0;
      for (let c = 1; c <= ni; c++) {
        const pid = myid[i]![c]!;
        if (pid > 0) newpos[i]![c] = fit.solution[pid - 1]!;
      }
    }
    return newpos;
  } catch {
    // Solve failed (ill-conditioned problem) — fall back to centering.
    return centerChildrenFallback(rval);
  }
}

/**
 * Simple centering fallback used when quadprog is unavailable.
 *
 * For each generation, shifts each family's children so their midpoint aligns
 * with the midpoint of their parent couple. Processes families left-to-right
 * to avoid cascading shifts within a level.
 */
function centerChildrenFallback(rval: AlignState): Float64Array[] {
  const maxlev = rval.n.length - 1;
  const pos = rval.pos.map(row => new Float64Array(row));

  for (let lev = 2; lev <= maxlev; lev++) {
    const ni = rval.n[lev] ?? 0;
    const famRow = rval.fam[lev]!;

    // Collect family groups (fam value → 1-based child slots)
    const families = new Map<number, number[]>();
    for (let c = 1; c <= ni; c++) {
      const f = famRow[c] ?? 0;
      if (f > 0) {
        if (!families.has(f)) families.set(f, []);
        families.get(f)!.push(c);
      }
    }

    // Sort by left-parent position so we process left-to-right
    const sortedFamilies = [...families.entries()].sort(
      ([fa], [fb]) => (pos[lev - 1]![fa] ?? 0) - (pos[lev - 1]![fb] ?? 0),
    );

    for (const [f, slots] of sortedFamilies) {
      const niParent = rval.n[lev - 1] ?? 0;
      if (f < 1 || f + 1 > niParent) continue;

      const leftParentPos  = pos[lev - 1]![f]!;
      const rightParentPos = pos[lev - 1]![f + 1]!;
      const parentMid = (leftParentPos + rightParentPos) / 2;

      const childMid = slots.reduce((s, c) => s + pos[lev]![c]!, 0) / slots.length;
      const shift = parentMid - childMid;

      if (Math.abs(shift) > 1e-6) {
        for (const c of slots) {
          pos[lev]![c] = pos[lev]![c]! + shift;
        }
      }
    }
  }

  return pos;
}
