import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Linking two existing individuals as partners (#84): the rules,
 * framework-free so the store and the picking UI share them.
 */

function label(pedigree: Pedigree, id: string): string {
  const ind = pedigree.individuals.find(i => i.id === id);
  return ind?.name?.trim() || "this person";
}

/**
 * Why `aId` and `bId` cannot become partners, or null when they can.
 * Relatives are allowed, parent and child included: that is the point, and
 * the layout draws them. Unknown sex is always allowed; two of the same
 * known sex are not, as everywhere else in the editor.
 */
export function linkPartnerProblem(pedigree: Pedigree, aId: string, bId: string): string | null {
  if (aId === bId) return "Someone cannot be their own partner.";
  const a = pedigree.individuals.find(i => i.id === aId);
  const b = pedigree.individuals.find(i => i.id === bId);
  if (!a || !b) return "Unknown individual.";
  for (const ind of [a, b]) {
    if (ind.lifeStatus) return `${label(pedigree, ind.id)} is a pregnancy or pregnancy loss and cannot have a partner.`;
  }
  const already = pedigree.partnerships.some(p =>
    (p.individual1 === aId && p.individual2 === bId) || (p.individual1 === bId && p.individual2 === aId));
  if (already) return "They are already partners.";
  if (a.sex !== "unknown" && a.sex === b.sex) return `Two partners cannot both be ${a.sex}.`;
  return null;
}
