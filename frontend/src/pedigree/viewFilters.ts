import { isConditionTag, type Individual, type Pedigree, type Tag, type ViewFilters } from "@pedigree-editor/layout-engine";
import { ancestorsOf, descendantsOf } from "./removal";

/**
 * View filters (#4): global switches, saved with the pedigree in
 * `Pedigree.filters`, that simplify what is drawn without touching the data.
 * Each filter only says who is drawn; `collapse.ts` turns that into the drawn
 * pedigree, so the hidden people go the same way as a collapsed branch
 * (#1, #94): a drawn couple's children who are not drawn become one numbered
 * group symbol, and every renderer, the legend, pedigree numbers and the
 * figure exports follow. JSON, PED and CSV keep everyone.
 *
 * Filters: "affected only" (optionally one condition), "blood relatives
 * only" (hides the families of people who married in) and one side of the
 * family. Each is a row in `VIEW_FILTERS` that says whether it is on, who it
 * keeps (or why it has no effect), and how to switch it; several on at once
 * draw only the people every one of them keeps.
 */

/** True when the person is affected with a condition (a quadrant tag that is not a trait, #118). */
function hasConditionTag(individual: Individual, conditions: Set<string>): boolean {
  return (individual.tags ?? []).some(t => conditions.has(t));
}

/** The condition "affected only" is narrowed to, when it names a condition tag that still exists. */
export function chosenCondition(pedigree: Pedigree): Tag | undefined {
  const id = pedigree.filters?.affectedCondition;
  return id ? (pedigree.tags ?? []).find(t => t.id === id && isConditionTag(t)) : undefined;
}

/**
 * The people "affected only" starts from: affected, carrying a condition
 * (quadrant) tag, carriers (plain, of a condition, #115, or presymptomatic),
 * the proband and the consultand. With a condition chosen
 * (`affectedCondition`), only people affected with or carrying it, and the
 * proband and consultand.
 */
export function affectedOnlySeeds(pedigree: Pedigree): Set<string> {
  const chosen = chosenCondition(pedigree);
  if (chosen) {
    return new Set(pedigree.individuals
      .filter(i => i.proband || i.consultand
        || (i.tags ?? []).includes(chosen.id) || (i.carrierTags ?? []).includes(chosen.id))
      .map(i => i.id));
  }
  const conditions = new Set((pedigree.tags ?? []).filter(isConditionTag).map(t => t.id));
  return new Set(pedigree.individuals
    .filter(i => i.affected || i.carrier || i.presymptomatic || i.proband
      || i.consultand
      || hasConditionTag(i, conditions)
      || (i.carrierTags ?? []).some(t => conditions.has(t)))
    .map(i => i.id));
}

/**
 * Who "affected only" draws: the seeds (`affectedOnlySeeds`) and every
 * ancestor on a line of descent to one of them (both parents of each, so the
 * couples needed as parents). A seed with no parents in the pedigree who is
 * not a parent of anyone drawn (an affected person who married in, or an
 * affected founder with no affected descendants) would float unconnected, so
 * their partners and those partners' ancestors are drawn too. Empty when
 * nobody is a seed.
 */
export function affectedOnlyKept(pedigree: Pedigree): Set<string> {
  const seeds = affectedOnlySeeds(pedigree);
  if (seeds.size === 0) return seeds;
  const kept = new Set([...seeds, ...ancestorsOf(pedigree, [...seeds])]);
  const hasParents = new Set(Object.values(pedigree.parentOf).flat());
  const parentsOfKept = new Set<string>();
  for (const p of pedigree.partnerships) {
    if ((pedigree.parentOf[p.id] ?? []).some(c => kept.has(c))) {
      parentsOfKept.add(p.individual1);
      parentsOfKept.add(p.individual2);
    }
  }
  const partners: string[] = [];
  for (const id of seeds) {
    if (hasParents.has(id) || parentsOfKept.has(id)) continue;
    for (const p of pedigree.partnerships) {
      if (p.individual1 === id) partners.push(p.individual2);
      else if (p.individual2 === id) partners.push(p.individual1);
    }
  }
  for (const id of partners) kept.add(id);
  for (const id of ancestorsOf(pedigree, partners)) kept.add(id);
  return kept;
}

/**
 * The people the family filters are drawn around: the probands, or the
 * consultands when nobody is marked proband.
 */
export function referencePeople(pedigree: Pedigree): string[] {
  const probands = pedigree.individuals.filter(i => i.proband).map(i => i.id);
  return probands.length > 0 ? probands : pedigree.individuals.filter(i => i.consultand).map(i => i.id);
}

/**
 * The blood relatives of `roots` and their partners: the roots, their
 * ancestors and everyone descended from any of those, plus every partner of
 * one of them (so each couple line and its children stay). The partners'
 * own families (parents, siblings, children by someone else) are left out.
 */
export function bloodRelativesKept(pedigree: Pedigree, roots: string[]): Set<string> {
  const line = [...roots, ...ancestorsOf(pedigree, roots)];
  const blood = new Set([...line, ...descendantsOf(pedigree, line)]);
  const kept = new Set(blood);
  for (const p of pedigree.partnerships) {
    if (blood.has(p.individual1)) kept.add(p.individual2);
    if (blood.has(p.individual2)) kept.add(p.individual1);
  }
  return kept;
}

/** The genetic parent of `id` of the given sex, if their parents are in the pedigree. */
function parentOfSex(pedigree: Pedigree, id: string, sex: "male" | "female"): string | undefined {
  const couple = pedigree.partnerships.find(p => (pedigree.parentOf[p.id] ?? []).includes(id));
  if (!couple) return undefined;
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const [a, b] = [byId.get(couple.individual1), byId.get(couple.individual2)];
  if (a?.sex === sex && b?.sex !== sex) return a.id;
  if (b?.sex === sex && a?.sex !== sex) return b.id;
  // Parents of unknown or matching sex: the father role is listed first.
  return sex === "male" ? couple.individual1 : couple.individual2;
}

/** What one filter does: who it keeps, or why it changes nothing. */
type FilterResult = { kept: Set<string> } | { noEffect: string };

function affectedOnlyResult(pedigree: Pedigree): FilterResult {
  const kept = affectedOnlyKept(pedigree);
  if (kept.size > 0) return { kept };
  const chosen = chosenCondition(pedigree);
  return { noEffect: chosen ? `nobody has ${chosen.label}` : "nobody is affected" };
}

const NO_PROBAND = "no proband or consultand is marked";

function bloodRelativesResult(pedigree: Pedigree): FilterResult {
  const roots = referencePeople(pedigree);
  if (roots.length === 0) return { noEffect: NO_PROBAND };
  return { kept: bloodRelativesKept(pedigree, roots) };
}

function sideResult(pedigree: Pedigree): FilterResult {
  const refs = referencePeople(pedigree);
  if (refs.length === 0) return { noEffect: NO_PROBAND };
  const sex = pedigree.filters?.side === "paternal" ? "male" : "female";
  const parents = refs.map(r => parentOfSex(pedigree, r, sex)).filter((id): id is string => !!id);
  if (parents.length === 0) return { noEffect: "the proband's parents are not in the pedigree" };
  const kept = bloodRelativesKept(pedigree, parents);
  // A proband without parents (one of several) is still drawn.
  for (const r of refs) kept.add(r);
  return { kept };
}

/** The value `setViewFilter` writes for one field; `undefined` removes it. */
export type ViewFilterPatch = { [K in keyof ViewFilters]?: ViewFilters[K] | undefined };

export interface ViewFilterControl {
  id: string;
  label: string;
  description: string;
  on: (filters: ViewFilters | undefined) => boolean;
  /** The fields to write to switch it on or off. */
  patch: (on: boolean) => ViewFilterPatch;
  result: (pedigree: Pedigree) => FilterResult;
  /** Controls that share a group are alternatives: the menu draws them as one row of radio buttons. */
  group?: "side";
  /** The radio button's text inside its group's row. */
  shortLabel?: string;
}

/** The filter controls, in the order the toolbar's Filter menu lists them. */
export const VIEW_FILTERS: readonly ViewFilterControl[] = [
  {
    id: "affectedOnly",
    label: "Affected only",
    description: "Draw affected people, carriers, people with a condition tag, the proband and the consultand, with their ancestors. Other siblings become one numbered symbol.",
    on: f => f?.affectedOnly === true,
    patch: on => on ? { affectedOnly: true } : { affectedOnly: undefined, affectedCondition: undefined },
    result: affectedOnlyResult,
  },
  {
    id: "bloodRelativesOnly",
    label: "Blood relatives only",
    description: "Draw the proband's blood relatives and their partners. The families of people who married in (their parents, siblings and children by other partners) are left out.",
    on: f => f?.bloodRelativesOnly === true,
    patch: on => ({ bloodRelativesOnly: on ? true : undefined }),
    result: bloodRelativesResult,
  },
  {
    id: "maternal",
    label: "Mother's side only",
    description: "Draw the proband, their mother's blood relatives and those relatives' partners. The father is drawn, his family is not.",
    on: f => f?.side === "maternal",
    patch: on => ({ side: on ? "maternal" : undefined }),
    result: sideResult,
    group: "side",
    shortLabel: "Mother's",
  },
  {
    id: "paternal",
    label: "Father's side only",
    description: "Draw the proband, their father's blood relatives and those relatives' partners. The mother is drawn, her family is not.",
    on: f => f?.side === "paternal",
    patch: on => ({ side: on ? "paternal" : undefined }),
    result: sideResult,
    group: "side",
    shortLabel: "Father's",
  },
];

/** The filters switched on for this pedigree, in menu order. */
export function activeFilters(pedigree: Pedigree): ViewFilterControl[] {
  return VIEW_FILTERS.filter(f => f.on(pedigree.filters));
}

/** True when "affected only" is switched on for this pedigree. */
export function affectedOnlyOn(pedigree: Pedigree): boolean {
  return pedigree.filters?.affectedOnly === true;
}

/** True when any view filter is switched on. */
export function anyFilterOn(pedigree: Pedigree): boolean {
  return activeFilters(pedigree).length > 0;
}

/** A filter's name as the toolbar and banner write it: "Affected only (BRCA1)" with a condition chosen. */
export function filterLabel(control: ViewFilterControl, pedigree: Pedigree): string {
  const chosen = control.id === "affectedOnly" ? chosenCondition(pedigree) : undefined;
  return chosen ? `${control.label} (${chosen.label})` : control.label;
}

/**
 * Everyone the switched-on filters leave out of the drawing: anyone some
 * filter does not keep. Empty when no filter is on. A filter that would have
 * no sensible result (nobody affected, no proband) is skipped, and the banner
 * says why: an empty canvas says nothing.
 */
export function filterHidden(pedigree: Pedigree): Set<string> {
  const out = new Set<string>();
  for (const f of activeFilters(pedigree)) {
    const r = f.result(pedigree);
    if (!("kept" in r)) continue;
    for (const i of pedigree.individuals) if (!r.kept.has(i.id)) out.add(i.id);
  }
  return out;
}

/** The pedigree with every view filter off: what hiding descendants alone draws. */
export function withoutFilters(pedigree: Pedigree): Pedigree {
  if (!pedigree.filters) return pedigree;
  const { filters: _, ...rest } = pedigree;
  return rest;
}

/**
 * The banner text while a filter is on: which filters, how many people they
 * leave out, and why any of them does nothing.
 */
export function filterBannerText(pedigree: Pedigree, notDrawn: number): string | null {
  const active = activeFilters(pedigree);
  if (active.length === 0) return null;
  const why = active.flatMap(f => {
    const r = f.result(pedigree);
    return "noEffect" in r ? [`${filterLabel(f, pedigree)}: ${r.noEffect}`] : [];
  });
  if (notDrawn === 0) {
    if (why.length > 0) return `${why.join("; ")}, so everyone is drawn`;
    return `${active.map(f => filterLabel(f, pedigree)).join(", ")}: everyone is drawn`;
  }
  const working = active.filter(f => "kept" in f.result(pedigree)).map(f => filterLabel(f, pedigree));
  const text = `${working.join(", ")}: ${notDrawn} ${notDrawn === 1 ? "person" : "people"} not drawn`;
  return why.length > 0 ? `${text} (${why.join("; ")})` : text;
}
