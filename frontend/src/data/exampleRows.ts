/**
 * The builder behind the historic, classic and fiction examples
 * (`examples.ts`): parent-pointer rows, and the helpers that add what a row
 * cannot carry (tags, couples' sides, twins, social parents).
 */
import type { Pedigree, Individual, Partnership, Sex, Tag, TwinSet } from "@pedigree-editor/layout-engine";
import { person } from "./pedigreeBuilder";

/** [id, sex, father, mother, extras]. */
export type Row = [
  id: string,
  sex: Sex,
  father: string | null,
  mother: string | null,
  extras?: Partial<Pick<Individual, "name" | "affected" | "carrier" | "deceased" | "proband" | "consultand" | "notes">>,
];

/**
 * A pedigree from rows, with a couple for every pair of parents named. Fields
 * not set are left out, as the editor saves them; consanguinity is not
 * stored, since the chart reads it from kinship.
 */
export function fromRows(rows: Row[], defaults: { deceased?: boolean } = {}): Pedigree {
  const individuals: Individual[] = rows.map(([id, sex, , , extras = {}]) => {
    const { deceased = defaults.deceased, ...rest } = extras;
    return person(id, sex, { ...rest, ...(deceased ? { deceased } : {}) });
  });

  const hasParents = new Set<string>();
  const partnerships: Partnership[] = [];
  const parentOf: Record<string, string[]> = {};
  for (const [id, , father, mother] of rows) {
    if (!father || !mother) continue;
    hasParents.add(id);
    const pid = `${father}+${mother}`;
    if (!parentOf[pid]) {
      partnerships.push({ id: pid, individual1: father, individual2: mother });
      parentOf[pid] = [];
    }
    parentOf[pid].push(id);
  }

  const byId = new Map(individuals.map(i => [i.id, i]));
  // Founders are numbered in row order, as the PED importer does; the layout
  // uses sibOrder to order them.
  individuals.filter(i => !hasParents.has(i.id)).forEach((ind, k) => { ind.sibOrder = k; });
  for (const children of Object.values(parentOf)) {
    children.forEach((c, i) => { byId.get(c)!.sibOrder = i; });
  }

  return { siblingOrder: { mode: "insertion", affectedFirst: false }, individuals, partnerships, parentOf };
}

/**
 * Add tag definitions and apply each to its members, and append extra notes.
 * Throws on an unknown id so a typo fails the example tests.
 */
export function withTags(
  ped: Pedigree,
  tags: Array<Tag & { members: string[] }>,
  extraNotes: Record<string, string> = {},
): Pedigree {
  const byId = new Map(ped.individuals.map(i => [i.id, i]));
  const get = (id: string) => {
    const ind = byId.get(id);
    if (!ind) throw new Error(`withTags: no individual ${id}`);
    return ind;
  };
  for (const { members, ...tag } of tags) {
    for (const id of members) {
      const ind = get(id);
      ind.tags = [...(ind.tags ?? []), tag.id];
    }
  }
  for (const [id, note] of Object.entries(extraNotes)) {
    const ind = get(id);
    ind.notes = ind.notes ? `${ind.notes}. ${note}` : note;
  }
  return { ...ped, tags: tags.map(({ members: _members, ...tag }) => tag) };
}

/**
 * Set how couples are drawn: `Partnership.leftPartner` and `drawnBeside`, by
 * partnership id ("father+mother" as `fromRows` names them). Throws on an
 * unknown id so a typo fails the example tests.
 */
export function withCouples(ped: Pedigree, drawn: Record<string, Pick<Partnership, "leftPartner" | "drawnBeside">>): Pedigree {
  for (const id of Object.keys(drawn)) {
    if (!ped.partnerships.some(p => p.id === id)) throw new Error(`withCouples: no partnership ${id}`);
  }
  return { ...ped, partnerships: ped.partnerships.map(p => (drawn[p.id] ? { ...p, ...drawn[p.id] } : p)) };
}

/**
 * Add twin sets, each on the partnership whose children its members are, and
 * parents who are not genetic (`Individual.socialParents`), by child id.
 * Throws on an unknown id, or twins with different parents, so a typo fails
 * the example tests.
 */
export function withTwinsAndSocialParents(
  ped: Pedigree,
  twins: TwinSet[],
  socialParents: Record<string, string[]> = {},
): Pedigree {
  const ids = new Set(ped.individuals.map(i => i.id));
  const partnerships = ped.partnerships.map(p => ({ ...p }));
  for (const set of twins) {
    const p = partnerships.find(q => set.members.every(m => ped.parentOf[q.id]?.includes(m)));
    if (!p) throw new Error(`withTwinsAndSocialParents: ${set.members.join(", ")} are not children of one couple`);
    p.twins = [...(p.twins ?? []), set];
  }
  for (const [child, parents] of Object.entries(socialParents)) {
    for (const id of [child, ...parents]) {
      if (!ids.has(id)) throw new Error(`withTwinsAndSocialParents: no individual ${id}`);
    }
  }
  const individuals = ped.individuals.map(i => (socialParents[i.id] ? { ...i, socialParents: socialParents[i.id] } : i));
  return { ...ped, individuals, partnerships };
}
