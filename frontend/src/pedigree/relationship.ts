import type { Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { briefCoefficient } from "./relatedness";

/**
 * The name of the relationship between two people (#90): "first cousin once
 * removed", "half-sister", "great-aunt". Framework-free.
 *
 * The relationship is read off the closest common ancestors: one person
 * (half relatives, or one is the other's ancestor), one couple (full
 * relatives), or two couples at the same distance (double cousins, kinship
 * twice that of plain cousins). The kinship that relationship implies is then
 * compared with the kinship the engine computed for the pair. When the pair
 * is more closely related than the name says (a second line of descent,
 * inbred ancestry, a monozygotic twin up the tree: siblings whose parents are
 * siblings, an uncle who is also a cousin), the name is kept and `extra` is
 * set, so the text can say so rather than drop the name. The panels write
 * "and related in other ways too", the figure the kinship ("siblings (3/8)").
 * No name is given when the closest common ancestors fit none of those shapes
 * (reached at different distances, or two people who are not a couple); the
 * panels then say "related in more than one way".
 */

export interface RelationshipName {
  /** The person the term describes: the one nearer the common ancestors, or `b` when level. */
  subjectId: string;
  /** The person the term is relative to. */
  objectId: string;
  /** "mother", "half-brother", "first cousin twice removed". */
  term: string;
  /** Generations from the closest common ancestors down to the subject and to the object (up <= down). */
  up: number;
  down: number;
  /** Related through one common ancestor rather than a couple. */
  half: boolean;
  /** Related through two couples of common ancestors: double cousins. */
  double: boolean;
  /** More closely related than the term implies (kinship above what it gives). */
  extra: boolean;
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
function term(up: number, down: number, half: boolean, sex: Sex | undefined, twin?: string, double = false): string {
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
  return `${half ? "half " : double ? "double " : ""}${ordinalWord(up - 1)} cousin${removed > 0 ? ` ${times(removed)} removed` : ""}`;
}

/**
 * The relationship of `a` and `b`, or null when it cannot be named as
 * one shape (unrelated, or related in more than one way). `kinship` is the
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

  // A couple of common ancestors counts when both descend from a shared child of theirs.
  const children = (x: string, y: string) => {
    const couple = pedigree.partnerships.find(p =>
      (p.individual1 === x && p.individual2 === y) || (p.individual1 === y && p.individual2 === x));
    return couple ? { couple, children: pedigree.parentOf[couple.id] ?? [] } : null;
  };
  const onLine = (x: string, y: string) => {
    const c = children(x, y);
    const via = (dist: Map<string, number>, gens: number) => !!c?.children.some(ch => dist.get(ch) === gens - 1);
    return c && via(fromA, m) && via(fromB, n) ? c.couple : null;
  };

  let expected: number;
  let half = false;
  let double = false;
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
    const couple = onLine(closest[0].id, closest[1].id);
    if (!couple) return null;
    expected = 2 * 0.5 ** (m + n + 1);
    if (m === 1 && n === 1) {
      const set = (couple.twins ?? []).find(t => t.members.includes(a) && t.members.includes(b));
      if (set?.zygosity === "monozygotic") { twin = "identical twin"; expected = 0.5; }
      else if (set?.zygosity === "dizygotic") twin = "fraternal twin";
      else if (set) twin = "twin";
    }
  } else if (closest.length === 4 && m >= 2 && n >= 2) {
    // Double cousins: two couples, each a full line to both of them.
    const [first, ...rest] = closest.map(c => c.id);
    const partner = rest.find(y => onLine(first, y));
    const others = rest.filter(y => y !== partner);
    if (!partner || !onLine(others[0], others[1])) return null;
    double = true;
    expected = 4 * 0.5 ** (m + n + 1);
  } else {
    return null;
  }
  // Less related than the shape says cannot happen; be safe and give no name.
  if (kinship < expected - EPS) return null;
  const extra = kinship > expected + EPS;

  const [subjectId, objectId, up, down] = m < n ? [a, b, m, n] : [b, a, n, m];
  return { subjectId, objectId, term: term(up, down, half, sexOf(subjectId), twin, double), up, down, half, double, extra };
}

/**
 * What `personId` is to `otherId`, as a term for `personId`: "first cousin",
 * "niece", "grandson". `nameRelationship` describes whichever of the two is
 * nearer the common ancestors; when that is `otherId`, this turns the term
 * round ("aunt" becomes "niece" or "nephew" by `personId`'s sex). `extra`
 * as in `nameRelationship`. Null when the relationship cannot be named.
 */
export function relationshipTermFor(pedigree: Pedigree, personId: string, otherId: string, kinship: number): { term: string; extra: boolean } | null {
  // Level relationships name `b`, so put the person second.
  const named = nameRelationship(pedigree, otherId, personId, kinship);
  if (!named) return null;
  return { term: turnedTerm(pedigree, named, personId), extra: named.extra };
}

/** Panel wording for `RelationshipName.extra`, after the term. */
export const ALSO_RELATED_OTHERWISE = ", and related in other ways too";

function turnedTerm(pedigree: Pedigree, named: RelationshipName, personId: string): string {
  if (named.subjectId === personId) return named.term;
  const { up, down, half } = named;
  const sex = pedigree.individuals.find(i => i.id === personId)?.sex;
  if (up === 0) {
    return down === 1
      ? bySex(sex, "son", "daughter", "child")
      : greats(down - 2) + bySex(sex, "grandson", "granddaughter", "grandchild");
  }
  if (up === 1) return (half ? "half-" : "") + greats(down - 2) + bySex(sex, "nephew", "niece", "niece or nephew");
  // Cousins (up >= 2) read the same both ways.
  return named.term;
}

/**
 * The relationship of a couple as NSGC writes it above a consanguineous
 * double line (#97): "first cousins", "half second cousins once removed",
 * "uncle and niece", "double first cousins". When they are more closely
 * related than that (`extra`), their kinship follows, as short as the figure
 * needs (`briefCoefficient`): "siblings (3/8)", "uncle and niece (0.36)".
 * Null when `nameRelationship` cannot name them.
 */
export function nameCoupleRelationship(pedigree: Pedigree, a: string, b: string, kinship: number): string | null {
  const named = nameRelationship(pedigree, a, b, kinship);
  if (!named) return null;
  const text = coupleTerm(pedigree, named);
  return named.extra ? `${text} (${briefCoefficient(kinship)})` : text;
}

function coupleTerm(pedigree: Pedigree, named: RelationshipName): string {
  const { up, down, half } = named;
  if (up >= 2) return named.term.replace(/cousin/, "cousins");
  if (up === 1 && down === 1) return half ? "half-siblings" : "siblings";
  const objectSex = pedigree.individuals.find(i => i.id === named.objectId)?.sex;
  const object = up === 0
    ? greats(down - 2) + (down === 1 ? bySex(objectSex, "son", "daughter", "child") : bySex(objectSex, "grandson", "granddaughter", "grandchild"))
    : greats(down - 2) + bySex(objectSex, "nephew", "niece", "niece or nephew");
  return `${named.term} and ${object}`;
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
