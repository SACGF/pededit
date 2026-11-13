import { isConditionTag, type Individual, type Pedigree } from "@pedigree-editor/layout-engine";
import { ancestorsOf } from "./removal";

/**
 * View filters (#4): global switches, saved with the pedigree in
 * `Pedigree.filters`, that simplify what is drawn without touching the data.
 * Each filter only says who is drawn; `collapse.ts` turns that into the drawn
 * pedigree, so the hidden people go the same way as a collapsed branch
 * (#1, #94): a drawn couple's children who are not drawn become one numbered
 * group symbol, and every renderer, the legend, pedigree numbers and the
 * figure exports follow. JSON, PED and CSV keep everyone.
 *
 * Only "affected only" exists so far. A further filter (hide married-in,
 * founders down) adds a field to `ViewFilters`, a `kept` function here,
 * joined in `filterHidden`, and a row in `VIEW_FILTERS` for the controls.
 */

/** True when the person is affected with a condition (a quadrant tag that is not a trait, #118). */
function hasConditionTag(individual: Individual, conditions: Set<string>): boolean {
  return (individual.tags ?? []).some(t => conditions.has(t));
}

/**
 * The people "affected only" starts from: affected, carrying a condition
 * (quadrant) tag, carriers (plain, of a condition, #115, or presymptomatic),
 * the proband and the consultand.
 */
export function affectedOnlySeeds(pedigree: Pedigree): Set<string> {
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

/** True when "affected only" is switched on for this pedigree. */
export function affectedOnlyOn(pedigree: Pedigree): boolean {
  return pedigree.filters?.affectedOnly === true;
}

/** True when any view filter is switched on. */
export function anyFilterOn(pedigree: Pedigree): boolean {
  return affectedOnlyOn(pedigree);
}

/**
 * Everyone the switched-on filters leave out of the drawing. Empty when no
 * filter is on, and when a filter would leave nobody drawn (nobody affected):
 * an empty canvas says nothing, so the filter then has no effect and the
 * banner says why.
 */
export function filterHidden(pedigree: Pedigree): Set<string> {
  if (!affectedOnlyOn(pedigree)) return new Set();
  const kept = affectedOnlyKept(pedigree);
  if (kept.size === 0) return new Set();
  return new Set(pedigree.individuals.filter(i => !kept.has(i.id)).map(i => i.id));
}

/** The pedigree with every view filter off: what hiding descendants alone draws. */
export function withoutFilters(pedigree: Pedigree): Pedigree {
  if (!pedigree.filters) return pedigree;
  const { filters: _, ...rest } = pedigree;
  return rest;
}

/** The filter controls, in the order the settings panel lists them. */
export const VIEW_FILTERS = [
  {
    key: "affectedOnly",
    label: "Affected only",
    description: "Draw affected people, carriers, people with a condition tag, the proband and the consultand, with their ancestors. Other siblings become one numbered symbol. Exports draw the same; CSV, PED and JSON keep everyone.",
  },
] as const;

/**
 * The banner text while a filter is on: what it is and how many people it
 * leaves out, or why it does nothing.
 */
export function filterBannerText(pedigree: Pedigree, notDrawn: number): string | null {
  if (!affectedOnlyOn(pedigree)) return null;
  if (notDrawn === 0) {
    return affectedOnlySeeds(pedigree).size === 0
      ? "Affected only: nobody is affected, so everyone is drawn"
      : "Affected only: everyone is drawn";
  }
  return `Affected only: ${notDrawn} ${notDrawn === 1 ? "person" : "people"} not drawn`;
}
