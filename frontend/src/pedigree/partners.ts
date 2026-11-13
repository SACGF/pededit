import type { LayoutResult, Pedigree } from "@pedigree-editor/layout-engine";
import { alignPedigreeByFamily, drawnLeftPartner } from "@pedigree-editor/layout-engine";
import { drawnPedigree } from "./collapse";

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

// ── Swap sides (#106) ─────────────────────────────────────────────────────────

function extraCopies(p: Pedigree, r: LayoutResult): number {
  return r.n.reduce((a, b) => a + b, 0) - p.individuals.length;
}

function withSides(p: Pedigree, sides: Record<string, string>): Pedigree {
  return { ...p, partnerships: p.partnerships.map(q => sides[q.id] ? { ...q, leftPartner: sides[q.id] } : q) };
}

/**
 * The `Partnership.leftPartner` values that swap which side the partners of
 * `partnershipId` are drawn on, or the reason it cannot be done.
 *
 * The current side is read from the layout the canvas draws (hidden branches
 * and filters applied), not from the stored value, which may be absent. When
 * one partner has exactly two partners, drawn either side of them, the other
 * couple swaps too, so they trade places instead of ending up on one side
 * with a line passing behind (or, when that cannot be drawn, this couple
 * alone swaps). A swap kinship2 can only draw by drawing someone twice (or
 * not at all) is refused rather than made.
 */
export function swapSidesPlan(pedigree: Pedigree, partnershipId: string): { sides: Record<string, string> } | { problem: string } {
  const p = pedigree.partnerships.find(q => q.id === partnershipId);
  if (!p) return { problem: "Unknown partnership." };
  const drawn = drawnPedigree(pedigree);
  const base = drawn.partnerships.some(q => q.id === partnershipId) ? drawn : pedigree;
  const before = alignPedigreeByFamily(base);
  const left = drawnLeftPartner(base, before, partnershipId);
  if (!left) return { problem: "These partners are not drawn side by side, so there is no side to swap." };
  const other = (q: { individual1: string; individual2: string }, id: string) => id === q.individual1 ? q.individual2 : q.individual1;
  const sides: Record<string, string> = { [partnershipId]: other(p, left) };

  const couples = (id: string) => base.partnerships.filter(q => !q.donorConception && (q.individual1 === id || q.individual2 === id));
  for (const hub of [p.individual1, p.individual2]) {
    const mine = couples(hub);
    if (mine.length !== 2) continue;
    const q = mine.find(x => x.id !== partnershipId)!;
    const qLeft = drawnLeftPartner(base, before, q.id);
    if (!qLeft) continue;
    // This couple's partner and q's partner on opposite sides of the hub: trade places.
    if ((left === hub) !== (qLeft === hub)) sides[q.id] = other(q, qLeft);
  }

  // Trading places first; failing that, this couple alone.
  const plans = Object.keys(sides).length > 1 ? [sides, { [partnershipId]: sides[partnershipId]! }] : [sides];
  for (const plan of plans) {
    const after = withSides(base, plan);
    const result = alignPedigreeByFamily(after);
    const honoured = (q: { id: string; leftPartner?: string }) => drawnLeftPartner(after, result, q.id) === q.leftPartner;
    if (
      honoured({ id: partnershipId, leftPartner: plan[partnershipId] })
      && extraCopies(after, result) <= extraCopies(base, before)
      // Sides chosen earlier for other couples stay as they were drawn.
      && after.partnerships.every(q => !q.leftPartner || plan[q.id] || honoured(q) || drawnLeftPartner(base, before, q.id) !== q.leftPartner)
    ) {
      return { sides: plan };
    }
  }
  const n1 = pedigree.individuals.find(i => i.id === p.individual1)?.name?.trim();
  const n2 = pedigree.individuals.find(i => i.id === p.individual2)?.name?.trim();
  const who = n1 && n2 ? `${n1} and ${n2}` : "These partners";
  return { problem: `${who} cannot swap sides in this layout without drawing someone twice or moving another couple. Dragging moves them instead, and pins them.` };
}
