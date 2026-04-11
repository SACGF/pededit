import type { LayoutInput } from "./types.js";

/**
 * Port of R kindepth().
 *
 * Computes the generation depth of every individual.
 * Founders get depth 0; depth[i] = max(depth[father], depth[mother]) + 1.
 *
 * With align=true, further adjusts depths so that both parents of every child
 * are at the same depth (required before align.pedigree).
 *
 * Input/output arrays are 1-based: index 0 is unused.
 */
export function kindepth(input: LayoutInput, align = false): Int32Array {
  const { n, findex: didx, mindex: midx } = input;

  if (n === 1) {
    const depth = new Int32Array(2);
    return depth; // depth[1] = 0
  }

  const depth = new Int32Array(n + 1); // 1-based, depth[0] unused

  // founders: individuals with no parents
  let parents: number[] = [];
  for (let i = 1; i <= n; i++) {
    if (midx[i] === 0 && didx[i] === 0) parents.push(i);
  }

  // Iteratively assign depths: children of current parents get depth i+1
  let childOld = new Int32Array(n + 1);
  for (let iter = 1; iter <= n; iter++) {
    // child[i] > 0 iff i is a child of someone in 'parents'
    const parentSet = new Set(parents);
    const child = new Int32Array(n + 1);
    for (let i = 1; i <= n; i++) {
      if (parentSet.has(midx[i]!) || parentSet.has(didx[i]!)) {
        child[i] = 1;
      }
    }

    // Check for progress
    let sameAsOld = true;
    for (let i = 1; i <= n; i++) {
      if (child[i] !== childOld[i]) { sameAsOld = false; break; }
    }
    if (sameAsOld) throw new Error(`Impossible pedigree: no progress at iteration ${iter}`);

    let anyChild = false;
    const nextParents: number[] = [];
    for (let i = 1; i <= n; i++) {
      if (child[i] > 0) {
        anyChild = true;
        depth[i] = iter;
        nextParents.push(i);
      }
    }
    if (!anyChild) break;
    if (iter === n) throw new Error("Impossible pedigree: someone is their own ancestor");

    parents = nextParents;
    childOld = child;
  }

  if (!align) return depth;

  // ---- align pass ----
  // Collect unique (dad, mom) pairs (one per couple, not one per child)
  const pairSet = new Map<number, [number, number]>();
  for (let i = 1; i <= n; i++) {
    const d = didx[i]!, m = midx[i]!;
    if (d > 0 && m > 0) {
      const key = d * (n + 1) + m;
      if (!pairSet.has(key)) pairSet.set(key, [d, m]);
    }
  }
  let dads = Array.from(pairSet.values()).map(p => p[0]!);
  let moms = Array.from(pairSet.values()).map(p => p[1]!);
  const npair = dads.length;
  const done = new Uint8Array(npair);

  // chaseup: follow ancestors of a set of individuals upward
  function chaseup(xs: number[]): number[] {
    let result = [...xs];
    while (true) {
      const toAdd: number[] = [];
      for (const x of result) {
        const m = midx[x]!;
        const d = didx[x]!;
        if (m > 0 && !result.includes(m)) toAdd.push(m);
        if (d > 0 && !result.includes(d)) toAdd.push(d);
      }
      if (toAdd.length === 0) break;
      result = [...result, ...toAdd];
    }
    return result;
  }

  while (true) {
    // Find pairs where depths differ and not yet done
    const pairsToFix: number[] = [];
    for (let i = 0; i < npair; i++) {
      if (!done[i] && depth[dads[i]!] !== depth[moms[i]!]) pairsToFix.push(i);
    }
    if (pairsToFix.length === 0) break;

    // Pick the pair with the smallest max(depth[dad], depth[mom]), breaking ties by smallest index
    const minMaxDepth = pairsToFix.reduce((best, i) => {
      const d = Math.max(depth[dads[i]!]!, depth[moms[i]!]!);
      return d < best ? d : best;
    }, Infinity);
    const who = pairsToFix.filter(i => Math.max(depth[dads[i]!]!, depth[moms[i]!]!) === minMaxDepth)[0]!;

    const dadWho = dads[who]!;
    const momWho = moms[who]!;
    let good: number, bad: number;
    if (depth[dadWho]! > depth[momWho]!) {
      good = dadWho; bad = momWho;
    } else {
      good = momWho; bad = dadWho;
    }

    const abad = chaseup([bad]);

    // Check if bad is a simple solitary marry-in
    const badAppearances = dads.filter(d => d === bad).length + moms.filter(m => m === bad).length;
    if (abad.length === 1 && badAppearances === 1) {
      // Simple case: just shift the single marry-in
      depth[bad] = depth[good]!;
    } else {
      // Complex case: chase good's ancestors and spouses upward
      let agood = chaseup([good]);

      // Exclude the current pair when looking for spouses
      const tdads = dads.filter((_, i) => i !== who);
      const tmoms = moms.filter((_, i) => i !== who);
      const agoodDepth = depth[good]!;

      while (true) {
        const agoodSet = new Set(agood);
        // spouses of anyone in agood
        const spouses: number[] = [];
        for (let i = 0; i < tdads.length; i++) {
          if (agoodSet.has(tdads[i]!)) spouses.push(tmoms[i]!);
          if (agoodSet.has(tmoms[i]!)) spouses.push(tdads[i]!);
        }
        let temp = [...new Set([...agood, ...spouses])];
        temp = [...new Set(chaseup(temp))]; // add ancestors
        // add children at or above good's depth
        for (let i = 1; i <= n; i++) {
          if ((agoodSet.has(midx[i]!) || agoodSet.has(didx[i]!)) && depth[i]! <= agoodDepth) {
            if (!temp.includes(i)) temp.push(i);
          }
        }
        if (temp.length === agood.length) break;
        agood = temp;
      }

      const agoodSet = new Set(agood);
      if (abad.every(x => !agoodSet.has(x))) {
        // Shift abad down
        const shift = depth[good]! - depth[bad]!;
        for (const x of abad) depth[x] = depth[x]! + shift;

        // Repair descendants: ensure all children are below parents
        for (let lvl = 0; lvl <= n; lvl++) {
          const atLevel: number[] = [];
          for (let i = 1; i <= n; i++) {
            if (depth[i] === lvl) atLevel.push(i);
          }
          const atLevelSet = new Set(atLevel);
          let anyChildFound = false;
          for (let i = 1; i <= n; i++) {
            if (atLevelSet.has(midx[i]!) || atLevelSet.has(didx[i]!)) {
              depth[i] = Math.max(lvl + 1, depth[i]!);
              anyChildFound = true;
            }
          }
          if (!anyChildFound) break;
        }
      }
    }

    // Mark bad as done (all pairs involving bad)
    for (let i = 0; i < npair; i++) {
      if (dads[i] === bad || moms[i] === bad) done[i] = 1;
    }
  }

  // Sanity check: at least one individual must be at depth 0
  let hasZero = false;
  for (let i = 1; i <= n; i++) {
    if (depth[i] === 0) { hasZero = true; break; }
  }
  if (!hasZero) throw new Error("Bug in kindepth alignment: no individual at depth 0");

  return depth;
}
