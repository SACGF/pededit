import type { Pedigree } from "@pedigree-editor/layout-engine";
import { descendantsOf } from "./graph";
import { personLabel } from "./personLabel";

/**
 * Linking a child to existing parents: the rules, framework-free so
 * the store and the picking UI share them.
 */

/**
 * Why `parentIds` (one or two existing individuals) cannot be the parents of
 * `childId`, or null when they can. A single parent gets a placeholder
 * partner. Unknown sex is always allowed; two parents of the same known sex
 * are not: these are the genetic parents, and sex is biological sex. A
 * same-sex couple's children are donor-conceived (`sameSex.ts`).
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
    if (p.lifeStatus) return `${personLabel(pedigree, id, "this person", { start: true })} is a pregnancy or pregnancy loss and cannot have children.`;
  }
  const below = descendantsOf(pedigree, [childId]);
  for (const id of unique) {
    if (below.has(id)) return `${personLabel(pedigree, id, "this person", { start: true })} is a descendant of ${personLabel(pedigree, childId, "this person")}, so cannot be their parent.`;
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
