import type { Pedigree } from "@pedigree-editor/layout-engine";
import { descendantsOf } from "./removal";

/**
 * Linking a child to existing parents (#36): the rules, framework-free so
 * the store and the picking UI share them.
 */

function label(pedigree: Pedigree, id: string): string {
  const ind = pedigree.individuals.find(i => i.id === id);
  return ind?.name?.trim() || "this person";
}

/**
 * Why `parentIds` (one or two existing individuals) cannot be the parents of
 * `childId`, or null when they can. A single parent gets a placeholder
 * partner. Unknown sex is always allowed; two parents of the same known sex
 * are not: these are the genetic parents, and sex is biological sex. A
 * same-sex couple's children are donor-conceived (`sameSex.ts`, #105).
 */
export function setParentsProblem(pedigree: Pedigree, childId: string, parentIds: string[]): string | null {
  const unique = [...new Set(parentIds)];
  if (unique.length === 0) return "Pick at least one parent.";
  if (unique.length > 2) return "A child has at most two parents.";
  const child = pedigree.individuals.find(i => i.id === childId);
  if (!child) return "Unknown child.";
  for (const id of unique) {
    const p = pedigree.individuals.find(i => i.id === id);
    if (!p) return "Unknown individual.";
    if (id === childId) return "Someone cannot be their own parent.";
    if (p.lifeStatus) return `${label(pedigree, id)} is a pregnancy or pregnancy loss and cannot have children.`;
  }
  const below = descendantsOf(pedigree, [childId]);
  for (const id of unique) {
    if (below.has(id)) return `${label(pedigree, id)} is a descendant of ${label(pedigree, childId)}, so cannot be their parent.`;
  }
  if (unique.length === 2) {
    const [a, b] = unique.map(id => pedigree.individuals.find(i => i.id === id)!);
    if (a.sex !== "unknown" && a.sex === b.sex) {
      const couple = pedigree.partnerships.some(p => !p.donorConception
        && ((p.individual1 === a.id && p.individual2 === b.id) || (p.individual1 === b.id && p.individual2 === a.id)));
      return couple
        ? `Two genetic parents cannot both be ${a.sex}. For a child of this couple, right-click the couple line and use Add child, which asks for the genetic parent and adds a donor.`
        : `Two parents cannot both be ${a.sex}.`;
    }
  }
  return null;
}

/** The partnership whose child this is, or undefined. */
export function currentParentsOf(pedigree: Pedigree, childId: string) {
  return pedigree.partnerships.find(p => (pedigree.parentOf[p.id] ?? []).includes(childId));
}
