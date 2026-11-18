import type { LayoutResult, Pedigree } from "@pedigree-editor/layout-engine";
import { drawnBesideChoices, drawnBesideConflict, drawnLeftPartner } from "@pedigree-editor/layout-engine";
import { cachedLayout } from "./layoutCache";
import { drawnPedigree } from "./collapse";
import { layoutToFlow, type FlowData } from "./layoutToFlow";

/**
 * Linking two existing individuals as partners: the rules,
 * framework-free so the store and the picking UI share them.
 */

function label(pedigree: Pedigree, id: string): string {
  const ind = pedigree.individuals.find(i => i.id === id);
  return ind?.name?.trim() || "this person";
}

/**
 * Why `aId` and `bId` cannot become partners, or null when they can.
 * Relatives are allowed, parent and child included: that is the point, and
 * the layout draws them. Any sexes are allowed: a same-sex couple
 * has no genetic children together, and adding a child to one goes through
 * a donor (`sameSex.ts`).
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
  return null;
}

// ── Swap sides ──────────────────────────────────────────────────────────────

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
  const before = cachedLayout(base);
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
    const result = cachedLayout(after);
    const honoured = (q: { id: string; leftPartner?: string }) => drawnLeftPartner(after, result, q.id) === q.leftPartner;
    if (
      honoured({ id: partnershipId, leftPartner: plan[partnershipId] })
      && extraCopies(after, result) <= extraCopies(base, before)
      // A swap must not undo where couples were chosen to be drawn ("Draw this couple beside").
      && !drawnBesideConflict(after)
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

// ── Draw this couple beside ─────────────────────────────────────────────────

/** The pedigree the canvas lays out when it draws this couple (hidden branches and filters applied). */
function laidOutWith(pedigree: Pedigree, partnershipId: string): Pedigree {
  const drawn = drawnPedigree(pedigree);
  return drawn.partnerships.some(q => q.id === partnershipId) ? drawn : pedigree;
}

/**
 * The partners "Draw this couple beside" can offer for a couple: both, or
 * none when the couple can only be drawn where it is (one of them has no
 * place of their own on the chart, as someone who married in has not).
 */
export function drawBesideOptions(pedigree: Pedigree, partnershipId: string): string[] {
  const choices = drawnBesideChoices(laidOutWith(pedigree, partnershipId), partnershipId);
  return choices.length === 2 ? choices : [];
}

/**
 * How to name one partner of a couple in a menu or a notice: their name, or
 * for someone unnamed "the man" / "the woman" where that tells the two
 * apart, else the side they are drawn on.
 */
export function couplePartnerLabel(pedigree: Pedigree, partnershipId: string, id: string): string {
  const p = pedigree.partnerships.find(q => q.id === partnershipId);
  const person = pedigree.individuals.find(i => i.id === id);
  const name = person?.name?.trim();
  if (name || !p || !person) return name || "this person";
  const other = pedigree.individuals.find(i => i.id === (id === p.individual1 ? p.individual2 : p.individual1));
  if (person.sex !== other?.sex && person.sex !== "unknown") return person.sex === "male" ? "the man" : "the woman";
  const base = laidOutWith(pedigree, partnershipId);
  const left = drawnLeftPartner(base, cachedLayout(base), partnershipId);
  if (!left) return id === p.individual1 ? "the first partner" : "the second partner";
  return left === id ? "the partner on the left" : "the partner on the right";
}

function drawnTwice(flow: FlowData): Set<string> {
  return new Set(flow.nodes.filter(n => n.data.isDuplicate).map(n => n.data.individual.id));
}

function sameDrawing(a: FlowData, b: FlowData): boolean {
  return a.nodes.length === b.nodes.length && a.nodes.every((n, i) => {
    const m = b.nodes[i]!;
    return n.data.individual.id === m.data.individual.id && n.position.x === m.position.x && n.position.y === m.position.y;
  });
}

/** "Ann and Bob are", "2 people are": the subject and verb of a notice about `ids`. */
function peopleAre(pedigree: Pedigree, ids: string[]): string {
  const names = ids.map(id => pedigree.individuals.find(i => i.id === id)?.name?.trim() ?? "");
  const verb = ids.length === 1 ? "is" : "are";
  if (names.every(Boolean)) {
    const list = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return `${list} ${verb}`;
  }
  return `${ids.length} ${ids.length === 1 ? "person" : "people"} ${verb}`;
}

export interface DrawBesidePlan {
  /** What to store on the couple; undefined removes the field. */
  drawnBeside: string | undefined;
  leftPartner: string | undefined;
  /** Who is drawn twice, or no longer is, because of the change. Null when nobody. */
  notice: string | null;
}

/**
 * What choosing `besideId` (a partner, or null for "Automatic") under "Draw
 * this couple beside" stores on the couple, or `unchanged` with the reason
 * when there is nothing to do.
 *
 * `Partnership.drawnBeside` needs a side to act on (see `applyPartnerSides`),
 * so the side is stored with it: the one chosen with "Swap sides" if any,
 * else whichever of the two draws fewer people twice, the side drawn now
 * winning a tie. "Automatic" hands both back to the layout. Unlike a swap,
 * the choice may draw someone twice: that is what it is for.
 */
export function drawBesidePlan(pedigree: Pedigree, partnershipId: string, besideId: string | null): DrawBesidePlan | { unchanged: string } {
  const p = pedigree.partnerships.find(q => q.id === partnershipId);
  if (!p) return { unchanged: "Unknown partnership." };
  // Pins hold people where they were dragged, whatever the layout says.
  const flowOf = (q: Pedigree) => layoutToFlow({ ...q, pinnedPositions: undefined });
  const withChoice = (drawnBeside: string | undefined, leftPartner: string | undefined): Pedigree => ({
    ...pedigree,
    partnerships: pedigree.partnerships.map(q => {
      if (q.id !== partnershipId) return q;
      const { drawnBeside: _b, leftPartner: _l, ...rest } = q;
      return { ...rest, ...(drawnBeside ? { drawnBeside } : {}), ...(leftPartner ? { leftPartner } : {}) };
    }),
  });
  const before = flowOf(pedigree);
  const plan = (drawnBeside: string | undefined, leftPartner: string | undefined, after: FlowData): DrawBesidePlan => {
    const was = drawnTwice(before), now = [...drawnTwice(after)];
    const same = now.length === was.size && now.every(id => was.has(id));
    const earlier = was.size === 0 ? "nobody was" : `${was.size} ${was.size === 1 ? "was" : "were"}`;
    const notice = same ? null
      : now.length === 0 ? `Nobody is drawn twice now; ${earlier} before.`
      : `${peopleAre(pedigree, now)} drawn twice now; ${earlier} before.`;
    return { drawnBeside, leftPartner, notice };
  };

  if (besideId === null) {
    if (!p.drawnBeside) return { unchanged: "The layout already chooses where this couple is drawn." };
    return plan(undefined, undefined, flowOf(withChoice(undefined, undefined)));
  }
  if (besideId !== p.individual1 && besideId !== p.individual2) return { unchanged: "That person is not one of this couple." };
  const name = couplePartnerLabel(pedigree, partnershipId, besideId);
  if (p.drawnBeside === besideId) return { unchanged: `This couple is already drawn beside ${name}.` };
  if (!drawBesideOptions(pedigree, partnershipId).includes(besideId)) {
    return { unchanged: "This couple can only be drawn where it is: one partner has no other place on the chart." };
  }

  const base = laidOutWith(pedigree, partnershipId);
  const drawnLeft = drawnLeftPartner(base, cachedLayout(base), partnershipId) ?? p.individual1;
  const sides = p.leftPartner ? [p.leftPartner] : [drawnLeft, drawnLeft === p.individual1 ? p.individual2 : p.individual1];
  let pick: { left: string; flow: FlowData } | null = null;
  for (const left of sides) {
    const chosen = withChoice(besideId, left);
    // Together with the choices made for other couples, this one may be more than the layout can draw.
    if (drawnBesideConflict(drawnPedigree(chosen))) continue;
    const flow = flowOf(chosen);
    if (!pick || drawnTwice(flow).size < drawnTwice(pick.flow).size) pick = { left, flow };
  }
  if (!pick) {
    return { unchanged: `This couple cannot be drawn beside ${name} together with the choices made for other couples. Set one of those to Automatic first.` };
  }
  // Nothing moves, or only what the side alone would move: the layout already draws the couple there.
  const already = sameDrawing(pick.flow, before)
    || (!p.drawnBeside && sameDrawing(pick.flow, flowOf(withChoice(undefined, pick.left))));
  if (already) return { unchanged: `This couple is already drawn beside ${name}, so nothing changes.` };
  return plan(besideId, pick.left, pick.flow);
}
