import type { Pedigree } from "./types.js";

/**
 * Relatedness coefficients from the pedigree structure (#32).
 *
 * The kinship coefficient of two people is the chance that an allele drawn
 * at random from one is identical by descent to one drawn from the other.
 * The inbreeding coefficient F of a person is the kinship of their parents.
 * Autosomal by default; `{ chromosome: "X" }` gives the X-linked
 * coefficients (#87).
 */
export interface KinshipCoefficients {
  /**
   * Kinship coefficient of two individuals. For someone with themself it is
   * (1 + F) / 2, and monozygotic twins are that close to each other. 0 when
   * either id is not in the pedigree.
   *
   * X-linked: a male with himself is 1 (he has one X). NaN when the value
   * depends on a sex the pedigree does not give (see `kinshipCoefficients`).
   */
  kinship(a: string, b: string): number;
  /**
   * Inbreeding coefficient F: the kinship of the individual's parents. 0 for
   * a founder and for an id not in the pedigree.
   *
   * X-linked: NaN for a male, who has one X and so no inbreeding on it, and
   * for anyone of unknown sex.
   */
  inbreeding(id: string): number;
}

export interface KinshipOptions {
  /** "autosomal" (the default) or "X" for X-linked kinship (#87). */
  chromosome?: "autosomal" | "X";
}

/** X-linked values that differ by less than this are the same value. */
const SAME = 1e-12;

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
 * X-linked (kinship2's `chrtype = "x"`): a female is computed as above.
 * A male has his mother's X only, so
 *
 *   kinship(i, i) = 1
 *   kinship(i, j) = kinship(mother, j)
 *
 * which needs to know which parent is the mother. That is the parent
 * recorded female, or failing that the one whose partner is recorded male;
 * the left-right order of a couple says nothing.
 *
 * kinship2 gives NA for the whole row of a child of unknown sex. Here a person of
 * unknown sex is worked out both ways (and a son whose mother cannot be told
 * apart from his father both ways round), and a value is kept where the
 * answers agree and is NaN where they differ. So a coefficient is given
 * whenever it does not depend on the unknown sex, which covers relatives
 * unconnected to that person, and NaN spreads only to what does. Before
 * that, someone of unknown sex who has children with a partner of known
 * sex is taken to be the other sex, since a biological parent pair is one
 * of each.
 *
 * O(n²) time and memory, fine for the hundreds of people an editor holds.
 */
export function kinshipCoefficients(pedigree: Pedigree, options: KinshipOptions = {}): KinshipCoefficients {
  const xLinked = options.chromosome === "X";
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
  const at = (a: string, b: string): number => {
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined) return 0;
    return k[rep[i]! * n + rep[j]!]!;
  };

  if (xLinked) {
    const sex = effectiveSex(pedigree, father, mother, rep);
    fillX(n, sex, father, mother, rep, order, k);
    return {
      kinship: at,
      inbreeding: id => {
        const i = index.get(id);
        if (i === undefined) return 0;
        return sex[rep[i]!] === FEMALE ? 2 * at(id, id) - 1 : NaN;
      },
    };
  }

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
  return {
    kinship: at,
    inbreeding: id => (index.has(id) ? 2 * at(id, id) - 1 : 0),
  };
}

const UNKNOWN = 0, MALE = 1, FEMALE = 2;

/**
 * Sex for the X-linked recursion, indexed like the matrix (read at the
 * monozygotic representative). Unknown sex is filled in from a co-parent of
 * known sex when every such co-parent agrees.
 */
function effectiveSex(
  pedigree: Pedigree,
  father: Int32Array, mother: Int32Array, rep: Int32Array,
): Uint8Array {
  const n = pedigree.individuals.length;
  const sex = new Uint8Array(n);
  pedigree.individuals.forEach((ind, i) => {
    sex[rep[i]!] = ind.sex === "male" ? MALE : ind.sex === "female" ? FEMALE : sex[rep[i]!]!;
  });
  // What each unknown-sex parent's co-parents say they must be; 3 = both.
  const implied = new Uint8Array(n);
  for (let c = 0; c < n; c++) {
    const a = father[c]! < 0 ? -1 : rep[father[c]!]!;
    const b = mother[c]! < 0 ? -1 : rep[mother[c]!]!;
    if (a < 0 || b < 0) continue;
    if (sex[a] === UNKNOWN && sex[b] !== UNKNOWN) implied[a]! |= sex[b] === MALE ? FEMALE : MALE;
    if (sex[b] === UNKNOWN && sex[a] !== UNKNOWN) implied[b]! |= sex[a] === MALE ? FEMALE : MALE;
  }
  for (let i = 0; i < n; i++) if (sex[i] === UNKNOWN && (implied[i] === MALE || implied[i] === FEMALE)) sex[i] = implied[i]!;
  return sex;
}

/** The X-linked matrix, filled in parents-first `order` as described on `kinshipCoefficients`. */
function fillX(
  n: number, sex: Uint8Array,
  father: Int32Array, mother: Int32Array, rep: Int32Array,
  order: number[], k: Float64Array,
): void {
  const row = (p: number, j: number) => (p < 0 ? 0 : k[p * n + j]!);
  const same = (a: number, b: number) => Math.abs(a - b) < SAME; // false when either is NaN

  for (let pos = 0; pos < order.length; pos++) {
    const i = order[pos]!;
    const a = father[i]! < 0 ? -1 : rep[father[i]!]!;
    const b = mother[i]! < 0 ? -1 : rep[mother[i]!]!;

    // The parent(s) who could be the mother, for the male case.
    let mothers: number[];
    if (a < 0 && b < 0) mothers = [-1];
    else if (a < 0 || b < 0) {
      const p = a < 0 ? b : a;
      mothers = sex[p] === FEMALE ? [p] : sex[p] === MALE ? [-1] : [p, -1];
    } else if (sex[a] === FEMALE && sex[b] !== FEMALE) mothers = [a];
    else if (sex[b] === FEMALE && sex[a] !== FEMALE) mothers = [b];
    else if (sex[a] === MALE && sex[b] !== MALE) mothers = [b];
    else if (sex[b] === MALE && sex[a] !== MALE) mothers = [a];
    else mothers = [a, b];

    const asFemale = sex[i] !== MALE;
    const asMale = sex[i] !== FEMALE;
    for (let q = 0; q < pos; q++) {
      const j = order[q]!;
      let v = NaN;
      let first = true;
      const offer = (x: number) => {
        if (first) { v = x; first = false; } else if (!same(v, x)) v = NaN;
      };
      if (asFemale) offer((row(a, j) + row(b, j)) / 2);
      if (asMale) for (const m of mothers) offer(row(m, j));
      k[i * n + j] = v;
      k[j * n + i] = v;
    }
    // A male's diagonal is 1 and a female's at most 3/4 when unknown, so
    // unknown sex leaves the diagonal NaN.
    const female = (1 + (a < 0 || b < 0 ? 0 : k[a * n + b]!)) / 2;
    k[i * n + i] = asFemale && asMale ? NaN : asMale ? 1 : female;
  }
}
