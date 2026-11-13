import type { Individual, Pedigree, Tag } from "./types.js";

/** A condition (#115): a quadrant tag that is not a trait (#118). */
export function isConditionTag(tag: Pick<Tag, "style" | "kind">): boolean {
  return tag.style === "quadrant" && tag.kind !== "trait";
}


/**
 * Affected overall (#118): the plain `affected` flag, or affected with any
 * condition (a quadrant tag in `Individual.tags`, #115; not a trait). The flag on its own
 * means affected with something not recorded; recording a condition does not
 * set it. Everything that asks "is this person affected?" (sibling order,
 * PED and CSV export, filters, warnings) reads this, not the flag.
 */
export function isAffected(
  ind: Pick<Individual, "affected" | "tags">,
  pedigree: Pick<Pedigree, "tags">,
): boolean {
  if (ind.affected) return true;
  if (!ind.tags?.length) return false;
  const mine = new Set(ind.tags);
  return (pedigree.tags ?? []).some(t => isConditionTag(t) && mine.has(t.id));
}
