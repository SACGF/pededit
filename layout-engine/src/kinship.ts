import type { Pedigree } from "./types.js";

/**
 * Relatedness coefficients from the pedigree structure (#32).
 *
 * The kinship coefficient of two people is the chance that an allele drawn
 * at random from one is identical by descent to one drawn from the other.
 * The inbreeding coefficient F of a person is the kinship of their parents.
 * This is the autosomal case; X-linked kinship is not computed.
 */
export interface KinshipCoefficients {
  /**
   * Kinship coefficient of two individuals. For someone with themself it is
   * (1 + F) / 2, and monozygotic twins are that close to each other. 0 when
   * either id is not in the pedigree.
   */
  kinship(a: string, b: string): number;
  /** Inbreeding coefficient F: the kinship of the individual's parents. 0 for a founder. */
  inbreeding(id: string): number;
}

/**
 * Kinship coefficients of every pair, by the standard recursion over
 * parents (the one kinship2's `kinship()` uses): taking people so that
 * parents come before children,
 *
 *   kinship(i, i) = (1 + kinship(father, mother)) / 2
 *   kinship(i, j) = (kinship(father, j) + kinship(mother, j)) / 2   for j before i
 *
 * and a founder has kinship 1/2 with themself and 0 with everyone before.
 *
 * What counts as a parent here is blood, not the drawing:
 * - someone adopted in (`adopted: "in"`) is a founder, since the couple
 *   they hang from are their adoptive parents;
 * - monozygotic twins are one genome, so every member of a set stands for
 *   the same row of the matrix. Dizygotic and unknown-zygosity twins are
 *   ordinary siblings.
 *
 * O(n²) time and memory, fine for the hundreds of people an editor holds.
 */
export function kinshipCoefficients(pedigree: Pedigree): KinshipCoefficients {
  const n = pedigree.individuals.length;
  const index = new Map<string, number>();
  pedigree.individuals.forEach((ind, i) => index.set(ind.id, i));

  // Biological parents as indices, -1 for none.
  const father = new Int32Array(n).fill(-1);
  const mother = new Int32Array(n).fill(-1);
  const hasParents = new Uint8Array(n);
  for (const p of pedigree.partnerships) {
    const a = index.get(p.individual1) ?? -1;
    const b = index.get(p.individual2) ?? -1;
    for (const childId of pedigree.parentOf[p.id] ?? []) {
      const c = index.get(childId);
      if (c === undefined || hasParents[c]) continue;
      if (pedigree.individuals[c]!.adopted === "in") continue;
      hasParents[c] = 1;
      father[c] = a;
      mother[c] = b;
    }
  }

  // Each monozygotic set is computed once, as its first member.
  const rep = new Int32Array(n);
  for (let i = 0; i < n; i++) rep[i] = i;
  for (const p of pedigree.partnerships) {
    for (const set of p.twins ?? []) {
      if (set.zygosity !== "monozygotic") continue;
      const members = set.members.map(id => index.get(id)).filter((i): i is number => i !== undefined);
      for (const m of members) rep[m] = members[0]!;
    }
  }

  // Parents before children. Ancestry that loops back on itself is broken
  // data; the link that closes the loop is ignored so the rest still works.
  const order: number[] = [];
  const state = new Uint8Array(n); // 0 new, 1 on the stack, 2 done
  const visit = (i: number): void => {
    if (state[i] === 2) return;
    state[i] = 1;
    for (const parents of [father, mother]) {
      const raw = parents[i]!;
      if (raw < 0) continue;
      const p = rep[raw]!;
      if (p === i || state[p] === 1) { parents[i] = -1; continue; }
      visit(p);
    }
    state[i] = 2;
    order.push(i);
  };
  for (let i = 0; i < n; i++) if (rep[i] === i) visit(i);

  const k = new Float64Array(n * n);
  for (let pos = 0; pos < order.length; pos++) {
    const i = order[pos]!;
    const f = father[i]! < 0 ? -1 : rep[father[i]!]!;
    const m = mother[i]! < 0 ? -1 : rep[mother[i]!]!;
    for (let q = 0; q < pos; q++) {
      const j = order[q]!;
      const v = ((f < 0 ? 0 : k[f * n + j]!) + (m < 0 ? 0 : k[m * n + j]!)) / 2;
      k[i * n + j] = v;
      k[j * n + i] = v;
    }
    k[i * n + i] = (1 + (f < 0 || m < 0 ? 0 : k[f * n + m]!)) / 2;
  }

  const at = (a: string, b: string): number => {
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined) return 0;
    return k[rep[i]! * n + rep[j]!]!;
  };
  return {
    kinship: at,
    inbreeding: id => (index.has(id) ? 2 * at(id, id) - 1 : 0),
  };
}
