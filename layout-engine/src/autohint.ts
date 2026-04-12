import type { LayoutInput, Hints, Pedigree, Individual, SiblingOrderMode } from "./types.js";
import { kindepth } from "./kindepth.js";

export function autohint(input: LayoutInput, pedigree: Pedigree): Hints {
  const n = input.n;
  const depth = kindepth(input, true);
  const horder = new Float64Array(n + 1);

  const { mode, affectedFirst } = pedigree.siblingOrder;

  const idToIdx = new Map<string, number>();
  for (let i = 0; i < pedigree.individuals.length; i++) {
    idToIdx.set(pedigree.individuals[i]!.id, i + 1);
  }

  const assignedOrder = new Map<number, number>();

  for (const [, childIds] of Object.entries(pedigree.parentOf)) {
    const siblings = childIds
      .map(id => ({ idx: idToIdx.get(id) ?? 0, ind: pedigree.individuals.find(i => i.id === id)! }))
      .filter(s => s.idx > 0 && s.ind);

    siblings.sort((a, b) => {
      const [ap, as_] = effectiveSibOrder(a.ind, mode, affectedFirst);
      const [bp, bs]  = effectiveSibOrder(b.ind, mode, affectedFirst);
      if (ap !== bp) return ap - bp;
      return as_ - bs;
    });

    for (let k = 0; k < siblings.length; k++) {
      assignedOrder.set(siblings[k]!.idx, k + 1);
    }
  }

  const depthGroups = new Map<number, number[]>();
  for (let i = 1; i <= n; i++) {
    const d = depth[i] ?? 0;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(i);
  }

  for (const [, members] of depthGroups) {
    const sorted = [...members].sort((a, b) => {
      const ao = assignedOrder.get(a) ?? (pedigree.individuals[a - 1]?.sibOrder ?? a);
      const bo = assignedOrder.get(b) ?? (pedigree.individuals[b - 1]?.sibOrder ?? b);
      return ao - bo;
    });
    for (let k = 0; k < sorted.length; k++) {
      horder[sorted[k]!] = k + 1;
    }
  }

  return { order: horder, spouse: buildSpouseHints(input) };
}

/**
 * For each parent-couple in the layout input, determine the anchor sex.
 * Anchor = the partner whose subtree already contains the couple relationship;
 * the other partner "marries in" from outside the subtree.
 *
 * anchorSex values:
 *   0 = both are founders (no parents) — no preference
 *   1 = male has parents — male side owns the couple in traversal
 *   2 = female has parents — female side owns the couple in traversal
 *
 * When BOTH have parents (inbred/consanguineous), we fall back to 0.
 * alignped1 handles this via a "cross-level" check already.
 *
 * Returns null if there are no couples (single individual or all unpartnered).
 */
function buildSpouseHints(input: LayoutInput): Int32Array | null {
  const { n, findex, mindex } = input;

  // Collect unique (dad, mom) pairs from the parent index arrays
  const seen = new Set<number>();
  const couples: [number, number][] = [];

  for (let i = 1; i <= n; i++) {
    const d = findex[i]!, m = mindex[i]!;
    if (d === 0 || m === 0) continue;
    const key = Math.min(d, m) * (n + 1) + Math.max(d, m);
    if (seen.has(key)) continue;
    seen.add(key);
    couples.push([d, m]);
  }

  if (couples.length === 0) return null;

  const result = new Int32Array(couples.length * 3);
  for (let i = 0; i < couples.length; i++) {
    const [d, m] = couples[i]!;
    const dadHasParents = findex[d]! > 0 || mindex[d]! > 0;
    const momHasParents = findex[m]! > 0 || mindex[m]! > 0;

    let anchor: 0 | 1 | 2 = 0;
    if (dadHasParents && !momHasParents)  anchor = 1;
    else if (!dadHasParents && momHasParents) anchor = 2;
    // Both have parents (consanguineous/inbred): anchor=0, let alignped1 handle it
    // Neither has parents (both founders): anchor=0, no preference

    result[i * 3]     = d;
    result[i * 3 + 1] = m;
    result[i * 3 + 2] = anchor;
  }

  return result;
}

function effectiveSibOrder(
  individual: Individual,
  mode: SiblingOrderMode,
  affectedFirst: boolean,
): [number, number] {
  const affectedKey = affectedFirst ? (individual.affected ? 0 : 1) : 0;
  let orderKey: number;
  if (mode === "birthDate" && individual.dob) {
    orderKey = new Date(individual.dob).getTime();
  } else {
    orderKey = individual.sibOrder;
  }
  return [affectedKey, orderKey];
}

export { kindepth };
