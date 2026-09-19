import type { Pedigree, Individual, Partnership } from "@pedigree-editor/layout-engine";

export interface SyntheticOptions {
  seed?: number;
  generations?: number;
  /** Children per couple, inclusive range. */
  minChildren?: number;
  maxChildren?: number;
  /** Chance that a non-founder has a partner and children. */
  partnerRate?: number;
}

/**
 * Deterministic random family descending from one founder couple, with
 * married-in partners. Used to exercise layouts on wide pedigrees.
 */
export function makeSyntheticFamily(opts: SyntheticOptions = {}): Pedigree {
  const { seed = 1, generations = 5, minChildren = 1, maxChildren = 5, partnerRate = 0.6 } = opts;
  let state = seed >>> 0 || 1;
  const rand = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const individuals: Individual[] = [];
  const partnerships: Partnership[] = [];
  const parentOf: Record<string, string[]> = {};
  let nextId = 1;

  const person = (sex: "male" | "female", sibOrder: number, gen: number): Individual => {
    const ind: Individual = {
      id: String(nextId++),
      sex,
      affected: rand() < 0.2,
      deceased: rand() < Math.max(0, 0.9 - gen * 0.3),
      carrier: rand() < 0.15,
      sibOrder,
    };
    individuals.push(ind);
    return ind;
  };

  const couple = (a: Individual, gen: number): void => {
    const spouse = person(a.sex === "male" ? "female" : "male", 0, gen);
    spouse.affected = false;
    const p: Partnership = { id: `p${partnerships.length + 1}`, individual1: a.id, individual2: spouse.id };
    partnerships.push(p);
    const n = minChildren + Math.floor(rand() * (maxChildren - minChildren + 1));
    parentOf[p.id] = [];
    const kids: Individual[] = [];
    for (let i = 0; i < n; i++) {
      const kid = person(rand() < 0.5 ? "male" : "female", i, gen + 1);
      parentOf[p.id].push(kid.id);
      kids.push(kid);
    }
    if (gen + 1 < generations - 1) {
      for (const kid of kids) if (rand() < partnerRate) couple(kid, gen + 1);
    }
  };

  couple(person("male", 0, 0), 0);
  const lastGen = individuals[individuals.length - 1];
  if (lastGen) lastGen.proband = true;

  return { individuals, partnerships, parentOf, siblingOrder: { mode: "insertion", affectedFirst: false } };
}
