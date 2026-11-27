import type { Individual, Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import { removeIndividuals } from "./removal";
import { childrenOf, couplesOf, hasParents } from "./graph";

/**
 * Placeholder partners. kinship2 needs a child to have 0 or 2
 * parents, so giving someone a single parent ("Add parent", "Add child" on
 * a person with no partner, "Set parents..." with one pick) also adds an
 * unnamed partner, created with `placeholder: true`. When an edit takes the
 * last child away from such a couple (Replace parents, Detach from parents,
 * deleting the child), a placeholder nobody has touched is removed with its
 * couple line, in the same undo step, instead of being left behind as a
 * childless partner. The same goes for a placeholder whose partner is
 * deleted or whose couple line is removed.
 *
 * The flag alone is not enough: it says how the person was made, not that
 * they are still blank. `isUntouchedPlaceholder` also requires every field
 * to be at its default, and `setSex` (and "Add parent" filling the slot)
 * clears the flag, since sex is the one field a placeholder is created with
 * a value in. Pedigrees saved before #107 have no flag, so their
 * placeholders are never removed automatically.
 */

/** Fields a new individual is made with, or that do not record anything about the person. */
const BOOKKEEPING = new Set(["id", "sex", "sibOrder", "placeholder"]);

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/** A placeholder partner with nothing recorded about them: no name, notes, status or any other field. */
export function isUntouchedPlaceholder(ind: Individual): boolean {
  if (ind.placeholder !== true) return false;
  return Object.entries(ind).every(([k, v]) => BOOKKEEPING.has(k) || isEmptyValue(v));
}

/**
 * A donor or surrogate added by "Add sperm donor", "Add egg donor" or "Add
 * surrogate" with nothing recorded about them since: removing the donor or
 * surrogate (#243) takes such a person away, as a placeholder goes.
 */
export function isUntouchedAddedRole(ind: Individual): boolean {
  if (!ind.reproductiveRole) return false;
  return Object.entries(ind).every(([k, v]) => BOOKKEEPING.has(k) || k === "reproductiveRole" || isEmptyValue(v));
}

/**
 * Partnership fields every couple has. A couple carrying any other field
 * (set by the user, or unknown to this version) is kept.
 */
const COUPLE_BOOKKEEPING = new Set(["id", "individual1", "individual2"]);

function coupleRecordsSomething(p: Partnership): boolean {
  return Object.entries(p).some(([k, v]) => !COUPLE_BOOKKEEPING.has(k) && !isEmptyValue(v));
}

/** Everyone who is a partner in any of `partnershipIds`: the candidates to pass to the functions below. */
export function partnersIn(pedigree: Pedigree, partnershipIds: Iterable<string>): string[] {
  const ids = new Set(partnershipIds);
  return pedigree.partnerships.filter(p => ids.has(p.id)).flatMap(p => [p.individual1, p.individual2]);
}

/**
 * The candidates (individual ids) who are untouched placeholders now left
 * over: no parents, no children, at most one partnership and that one with
 * no user-set fields, and nobody's carrier or social parent. Pass the
 * partners of the couples an edit took a child from or removed, taken
 * before the edit (`partnersIn`), and check them after it.
 */
export function leftoverPlaceholders(pedigree: Pedigree, candidateIds: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const referenced = new Set<string>();
  for (const i of pedigree.individuals) {
    if (i.carriedBy) referenced.add(i.carriedBy);
    for (const s of i.socialParents ?? []) referenced.add(s);
  }
  for (const id of new Set(candidateIds)) {
    const ind = pedigree.individuals.find(i => i.id === id);
    if (!ind || !isUntouchedPlaceholder(ind) || referenced.has(id)) continue;
    if (hasParents(pedigree, id)) continue;
    const own = couplesOf(pedigree, id, { donorPairs: true });
    if (own.length > 1) continue;
    const p = own[0];
    if (p && (childrenOf(pedigree, p.id).length > 0 || coupleRecordsSomething(p))) continue;
    out.add(id);
  }
  return out;
}

/**
 * Remove the leftover placeholders among `candidateIds` and their couples,
 * in place (an immer draft), unless that would empty the pedigree. Returns
 * how many people were removed.
 */
export function dropLeftoverPlaceholders(draft: Pedigree, candidateIds: Iterable<string>): number {
  const gone = leftoverPlaceholders(draft, candidateIds);
  if (gone.size === 0 || gone.size >= draft.individuals.length) return 0;
  removeIndividuals(draft, gone);
  return gone.size;
}
