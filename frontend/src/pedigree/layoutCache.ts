// The layout, kept while the structure it was computed from is unchanged.
//
// The engine's quadratic program (alignped4) is nearly all of the cost of an
// edit on a large pedigree, and most edits cannot move anyone: marking someone
// affected, typing a name, dropping a dragged person. So the engine is never
// given the pedigree itself. It is given `layoutInput(pedigree)`, a copy with
// everything the layout does not read left out, and the result is kept under
// that copy's JSON. Two pedigrees with the same input have the same layout by
// construction: nothing the engine was not given can change what it returns.
//
// Each unconnected family is kept separately as well (the engine's
// `alignFamily` hook), so a change of structure in one family does not lay the
// others out again.
import { alignPedigree, alignPedigreeByFamily } from "@pedigree-editor/layout-engine";
import type { AlignOptions, Individual, LayoutResult, Partnership, Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Fields of a person the layout never reads. Leaving a field out of this list
 * is always safe (the layout is only recomputed more often than needed);
 * putting one in that the engine does read changes the drawing, which
 * `layoutCache.test.ts` catches over every example and test data file.
 * `dob`, `affected` and `tags` are handled in `layoutInput`: the sibling order
 * settings decide whether they are read.
 */
export const PERSON_FIELDS_NOT_LAID_OUT = [
  "name", "notes", "age", "dod", "onset", "tagOnset", "evaluations", "hpoTerms",
  "genderIdentity", "deceased", "carrier", "carrierTags", "presymptomatic",
  "proband", "consultand", "familyHistoryUnknown", "lifeStatus", "adopted",
  "reproductiveRole",
] as const satisfies readonly (keyof Individual)[];

/** Fields of a couple the layout never reads. */
export const COUPLE_FIELDS_NOT_LAID_OUT = [
  "consanguineous", "consanguinityLabel", "childless", "childlessReason", "ended",
] as const satisfies readonly (keyof Partnership)[];

function without<T extends object>(value: T, fields: readonly (keyof T)[]): T {
  const copy = { ...value };
  for (const field of fields) delete copy[field];
  return copy;
}

/** The pedigree as the layout engine is given it: structure and the settings that order or space it, nothing else. */
export function layoutInput(pedigree: Pedigree): Pedigree {
  const { mode, affectedFirst } = pedigree.siblingOrder;
  const individuals = pedigree.individuals.map(ind => {
    const copy = without(ind, PERSON_FIELDS_NOT_LAID_OUT);
    // Read only by "Order siblings by date of birth" and "Affected first".
    if (mode !== "birthDate") delete copy.dob;
    if (!affectedFirst) { copy.affected = false; delete copy.tags; }
    return copy;
  });
  const input: Pedigree = {
    individuals,
    partnerships: pedigree.partnerships.map(p => without(p, COUPLE_FIELDS_NOT_LAID_OUT)),
    parentOf: pedigree.parentOf,
    siblingOrder: pedigree.siblingOrder,
  };
  // "Affected first" asks which of a person's tags are conditions.
  if (affectedFirst && pedigree.tags) input.tags = pedigree.tags;
  const layoutWidth = pedigree.canvasSettings?.layoutWidth;
  if (layoutWidth) input.canvasSettings = { layoutWidth } as Pedigree["canvasSettings"];
  return input;
}

// A few entries, most recently used last: undo and redo move between two
// structures, and the swap sides check tries two or three.
const MAX_WHOLE = 6;
const MAX_FAMILIES = 24;
const whole = new Map<string, LayoutResult>();
const families = new Map<string, LayoutResult>();

/** How often the layout was reused or computed, for tests and `perf.mjs`. */
export const layoutCacheStats = { hits: 0, misses: 0, familyHits: 0, familyMisses: 0 };

function remember(cache: Map<string, LayoutResult>, max: number, key: string, compute: () => LayoutResult, hit: () => void, miss: () => void): LayoutResult {
  const found = cache.get(key);
  if (found) {
    hit();
    cache.delete(key);
    cache.set(key, found);
    return found;
  }
  miss();
  const result = compute();
  cache.set(key, result);
  if (cache.size > max) cache.delete(cache.keys().next().value!);
  return result;
}

function alignFamily(family: Pedigree, options: AlignOptions): LayoutResult {
  const { alignFamily: _hook, ...rest } = options;
  const key = `${JSON.stringify(rest)}|${JSON.stringify(family)}`;
  return remember(families, MAX_FAMILIES, key, () => alignPedigree(family, rest),
    () => { layoutCacheStats.familyHits++; }, () => { layoutCacheStats.familyMisses++; });
}

/**
 * `alignPedigreeByFamily(pedigree, options)`, computed once for each
 * structure. The result is shared between callers and must not be changed.
 */
export function cachedLayout(pedigree: Pedigree, options: Pick<AlignOptions, "improve"> = {}): LayoutResult {
  const input = layoutInput(pedigree);
  const improve = options.improve ?? true;
  const key = `${improve}|${JSON.stringify(input)}`;
  return remember(whole, MAX_WHOLE, key, () => alignPedigreeByFamily(input, { improve, alignFamily }),
    () => { layoutCacheStats.hits++; }, () => { layoutCacheStats.misses++; });
}

/** Forget every kept layout (tests, and timing a layout from cold). */
export function clearLayoutCache(): void {
  whole.clear();
  families.clear();
}
