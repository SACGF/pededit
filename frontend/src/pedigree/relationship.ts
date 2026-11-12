import type { Pedigree, Sex } from "@pedigree-editor/layout-engine";

/**
 * The name of the relationship between two people (#90): "first cousin once
 * removed", "half-sister", "great-aunt". Framework-free.
 *
 * A name is given only when it is certain. The relationship is read off the
 * closest common ancestors, then the kinship it implies is compared with the
 * kinship the engine computed for the pair. They differ whenever there is a
 * second line of descent, inbred ancestry or a monozygotic twin up the tree
 * (double first cousins, an uncle who is also a cousin), and then no name is
 * given: the panel falls back to the coefficient and its degree.
 */

export interface RelationshipName {
  /** The person the term describes: the one nearer the common ancestors, or `b` when level. */
  subjectId: string;
  /** The person the term is relative to. */
  objectId: string;
  /** "mother", "half-brother", "first cousin twice removed". */
  term: string;
}

const EPS = 1e-9;

/** Each person's parents, from the partnerships that list them as a child. */
function parentsMap(pedigree: Pedigree): Map<string, [string, string]> {
  const parents = new Map<string, [string, string]>();
  for (const p of pedigree.partnerships) {
    for (const child of pedigree.parentOf[p.id] ?? []) parents.set(child, [p.individual1, p.individual2]);
  }
  return parents;
}

/** Every ancestor of `id`, and `id` itself at 0, with the fewest generations up to each. */
function ancestorDistances(id: string, parents: Map<string, [string, string]>): Map<string, number> {
  const dist = new Map<string, number>([[id, 0]]);
  let frontier = [id];
  for (let d = 1; frontier.length > 0; d++) {
    const next: string[] = [];
    for (const x of frontier) {
      for (const parent of parents.get(x) ?? []) {
        if (dist.has(parent)) continue;
        dist.set(parent, d);
        next.push(parent);
      }
    }
    frontier = next;
  }
  return dist;
}

const ORDINAL_WORDS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

function ordinalNumber(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n] ?? ordinalNumber(n);
}

function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

function bySex(sex: Sex | undefined, male: string, female: string, other: string): string {
  return sex === "male" ? male : sex === "female" ? female : other;
}

/** "great-" `k` times, written out up to two and as "3rd great-" beyond. */
function greats(k: number): string {
  if (k <= 0) return "";
  if (k <= 2) return "great-".repeat(k);
  return `${ordinalNumber(k)} great-`;
}

/**
 * The term for the subject, `up` generations below the common ancestors,
 * relative to the object, `down` generations below them (up <= down).
 */
function term(up: number, down: number, half: boolean, sex: Sex | undefined, twin?: string): string {
  const h = half ? "half-" : "";
  if (up === 0) {
    if (down === 1) return bySex(sex, "father", "mother", "parent");
    return greats(down - 2) + bySex(sex, "grandfather", "grandmother", "grandparent");
  }
  if (up === 1 && down === 1) {
    const sibling = bySex(sex, "brother", "sister", "sibling");
    return twin ? `${twin} ${sibling}` : h + sibling;
  }
  if (up === 1) return h + greats(down - 2) + bySex(sex, "uncle", "aunt", "aunt or uncle");
  const removed = down - up;
  return `${half ? "half " : ""}${ordinalWord(up - 1)} cousin${removed > 0 ? ` ${times(removed)} removed` : ""}`;
}

/**
 * The relationship of `a` and `b`, or null when it cannot be named for
 * certain (unrelated, or related in more than one way). `kinship` is the
 * engine's autosomal kinship coefficient of the pair.
 */
export function nameRelationship(pedigree: Pedigree, a: string, b: string, kinship: number): RelationshipName | null {
  if (a === b || !(kinship > EPS)) return null;
  const parents = parentsMap(pedigree);
  const sexOf = (id: string) => pedigree.individuals.find(i => i.id === id)?.sex;

  const fromA = ancestorDistances(a, parents);
  const fromB = ancestorDistances(b, parents);

  // The closest common ancestors: fewest generations in total.
  let best = Infinity;
  let closest: { id: string; m: number; n: number }[] = [];
  for (const [id, m] of fromA) {
    const n = fromB.get(id);
    if (n === undefined) continue;
    if (m + n < best) { best = m + n; closest = []; }
    if (m + n === best) closest.push({ id, m, n });
  }
  if (closest.length === 0) return null;
  const { m, n } = closest[0];
  if (closest.some(c => c.m !== m || c.n !== n)) return null;

  let expected: number;
  let half = false;
  let twin: string | undefined;
  if (m === 0 || n === 0) {
    // One is the other's ancestor.
    if (closest.length !== 1) return null;
    expected = 0.5 ** (m + n + 1);
  } else if (closest.length === 1) {
    half = true;
    expected = 0.5 ** (m + n + 1);
  } else if (closest.length === 2) {
    // Full relatives descend from one couple through a shared child of theirs.
    const [x, y] = [closest[0].id, closest[1].id];
    const couple = pedigree.partnerships.find(p =>
      (p.individual1 === x && p.individual2 === y) || (p.individual1 === y && p.individual2 === x));
    if (!couple) return null;
    const children = pedigree.parentOf[couple.id] ?? [];
    const onLine = (dist: Map<string, number>, gens: number) => children.some(c => dist.get(c) === gens - 1);
    if (!onLine(fromA, m) || !onLine(fromB, n)) return null;
    expected = 2 * 0.5 ** (m + n + 1);
    if (m === 1 && n === 1) {
      const set = (couple.twins ?? []).find(t => t.members.includes(a) && t.members.includes(b));
      if (set?.zygosity === "monozygotic") { twin = "identical twin"; expected = 0.5; }
      else if (set?.zygosity === "dizygotic") twin = "fraternal twin";
      else if (set) twin = "twin";
    }
  } else {
    return null;
  }
  if (Math.abs(expected - kinship) > EPS) return null;

  const [subjectId, objectId, up, down] = m < n ? [a, b, m, n] : [b, a, n, m];
  return { subjectId, objectId, term: term(up, down, half, sexOf(subjectId), twin) };
}

/**
 * What the pair panel calls the two people: their names, else "the unnamed
 * female" (or male, or person). When that would not tell them apart, the
 * selection order does: "the first selected", "the last selected" (the
 * primary, which `selectedPair` puts second).
 */
export function pairLabels(pedigree: Pedigree, a: string, b: string): Record<string, string> {
  const unnamed = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    if (ind?.name?.trim()) return ind.name.trim();
    return `the unnamed ${ind?.sex === "male" ? "male" : ind?.sex === "female" ? "female" : "person"}`;
  };
  const labels = { [a]: unnamed(a), [b]: unnamed(b) };
  if (labels[a] === labels[b]) {
    const named = !!pedigree.individuals.find(i => i.id === a)?.name?.trim();
    labels[a] = named ? `${labels[a]} (first selected)` : "the first selected";
    labels[b] = named ? `${labels[b]} (last selected)` : "the last selected";
  }
  return labels;
}
