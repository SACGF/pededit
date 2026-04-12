import type { LayoutInput, Hints, Pedigree, Individual, SiblingOrderMode } from "./types.js";
import { kindepth } from "./kindepth.js";

/**
 * Port of R autohint().
 *
 * Produces ordering hints that minimise visual crossings.
 * Returns 1-based hint arrays.
 *
 * Sorts siblings within each family group according to Pedigree.siblingOrder.
 */
export function autohint(input: LayoutInput, pedigree: Pedigree): Hints {
  const n = input.n;
  const depth = kindepth(input, true);
  const horder = new Float64Array(n + 1);

  const { mode, affectedFirst } = pedigree.siblingOrder;

  // Build id→1-based index map (pedigree.individuals order matches input)
  const idToIdx = new Map<string, number>();
  for (let i = 0; i < pedigree.individuals.length; i++) {
    idToIdx.set(pedigree.individuals[i]!.id, i + 1);
  }

  // For each partnership, sort its children by effectiveSibOrder,
  // then assign horder values in that sorted order.
  const assignedOrder = new Map<number, number>(); // 1-based idx → assigned order value

  for (const [, childIds] of Object.entries(pedigree.parentOf)) {
    const siblings = childIds
      .map(id => ({ idx: idToIdx.get(id) ?? 0, ind: pedigree.individuals.find(i => i.id === id)! }))
      .filter(s => s.idx > 0 && s.ind);

    siblings.sort((a, b) => {
      const [ap, as_] = effectiveSibOrder(a.ind, mode, affectedFirst);
      const [bp, bs] = effectiveSibOrder(b.ind, mode, affectedFirst);
      if (ap !== bp) return ap - bp;
      return as_ - bs;
    });

    for (let k = 0; k < siblings.length; k++) {
      assignedOrder.set(siblings[k]!.idx, k + 1);
    }
  }

  // Now assign horder: within each depth level, order by:
  // 1. pre-assigned sibling order (from partnerships above)
  // 2. fallback to sibOrder for roots / unassigned
  const depthGroups = new Map<number, number[]>();
  for (let i = 1; i <= n; i++) {
    const d = depth[i] ?? 0;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(i);
  }

  for (const [, members] of depthGroups) {
    // Sort members by their sibling order (assigned or sibOrder fallback)
    const sorted = [...members].sort((a, b) => {
      const ao = assignedOrder.get(a) ?? (pedigree.individuals[a - 1]?.sibOrder ?? a);
      const bo = assignedOrder.get(b) ?? (pedigree.individuals[b - 1]?.sibOrder ?? b);
      return ao - bo;
    });
    for (let k = 0; k < sorted.length; k++) {
      horder[sorted[k]!] = k + 1;
    }
  }

  return { order: horder, spouse: null };
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
