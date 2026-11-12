import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";
import { ancestorsOf, descendantsOf, removeIndividuals, withMarriedInPartners } from "./removal";

/**
 * Hidden descendants (#94). `Individual.descendantsHidden` leaves everyone
 * below that person out of the drawing without deleting them. Everything that
 * draws (layout, canvas, legend, render lint, SVG / PNG / PDF and U-shape
 * export) works from `drawnPedigree(pedigree)`, the pedigree with those people
 * stripped out, so they agree by construction and the layout is run on the
 * drawn people only. Data exports (JSON, PED, CSV) keep everyone.
 *
 * Who is hidden, for each collapsed person who is drawn:
 *  - every descendant, by any line. A child of a hidden person and a visible
 *    relative (a consanguineous loop, or a hidden person married to a cousin
 *    on a visible line) is hidden too: "everything below this person" is the
 *    rule a reader can predict, and the child cannot be drawn without one of
 *    their parents anyway. The visible relative stays, without that
 *    partnership.
 *  - partners of hidden people who married in (no parents in the pedigree)
 *    and have no partnership with anyone drawn, the same rule as remove with
 *    descendants (#34). The collapsed person's own partner stays, since they
 *    partner someone drawn, so the couple line stays and only the children
 *    go.
 * Ancestors of a drawn person are never hidden (a hidden parent would make
 * the person a hidden descendant), so kinship and the double couple line come
 * out the same on the drawn pedigree as on the full one.
 *
 * A collapsed person who is themselves hidden folds into the branch of the
 * drawn collapsed person above them. A flag on someone with no descendants
 * hides nothing and is dropped from the drawn copy.
 *
 * A collapsed couple's children are drawn as NSGC 2008 Fig. 1 has it (#1):
 * a number inside a symbol means that many siblings, and affected people are
 * not grouped. Each child who is affected, or carries a condition tag (a
 * quadrant fill), stays drawn as themselves (`shown`), with their own
 * partners and descendants hidden. The other children are drawn as one
 * stand-in child (`branchPlaceholderId`) with their number inside: a square
 * or circle when they all share a sex, a diamond otherwise. Being an ordinary
 * child of the couple, it is laid out, joined by the sibship line and drawn
 * by every renderer like anyone else; `CollapseInfo.placeholders` carries
 * what it stands for. It is never in the stored pedigree.
 */

export interface CollapseInfo {
  /** The pedigree to lay out and draw. The input object itself when nothing is hidden. */
  drawn: Pedigree;
  /** Ids of everyone left out of the drawing. */
  hidden: Set<string>;
  /**
   * For each drawn collapsed person, the hidden people under them: their
   * hidden descendants and the hidden partners of those. Someone below two
   * collapsed people (descendants who intermarry) is listed under both.
   */
  branches: Map<string, Set<string>>;
  /** The group symbols standing for hidden siblings (#1), by placeholder id. Their individuals are in `drawn`. */
  placeholders: Map<string, CollapsedBranch>;
}

/** What one collapsed-branch group symbol stands for (#1). */
export interface CollapsedBranch {
  /** The collapsed partner (or both partners) whose flag hides these people; expanding clears it. */
  roots: string[];
  /** The drawn partnership the symbol hangs from. */
  partnershipId: string;
  /** The couple's children the symbol groups: the number inside it. */
  children: string[];
  /**
   * Everyone hidden under this partnership: the grouped children, the
   * descendants of all its children (drawn affected ones included) and the
   * hidden partners of those.
   */
  hidden: Set<string>;
  /** Affected people among `hidden` (grandchildren and below; the grouped children are unaffected). */
  affected: number;
  /** Sex breakdown of the grouped children. */
  male: number;
  female: number;
  unknownSex: number;
}

const PLACEHOLDER_PREFIX = "collapsed-branch:";

/** Id of the group symbol under partnership `partnershipId` in the drawn pedigree. */
export function branchPlaceholderId(partnershipId: string): string {
  return PLACEHOLDER_PREFIX + partnershipId;
}

/** True for the stand-in individual of a collapsed branch, who is drawn but is nobody in the pedigree. */
export function isBranchPlaceholderId(id: string): boolean {
  return typeof id === "string" && id.startsWith(PLACEHOLDER_PREFIX);
}

/** The branch a drawn individual stands for, or undefined for a real person. */
export function branchOf(drawn: Pedigree, id: string): CollapsedBranch | undefined {
  return isBranchPlaceholderId(id) ? collapseInfo(drawn).placeholders.get(id) : undefined;
}

/**
 * True when a child of a collapsed couple is drawn as themselves rather than
 * counted in the group symbol: affected, or carrying a condition tag (a
 * quadrant fill). NSGC: affected people are not grouped.
 */
export function drawnIndividually(individual: Individual, pedigree: Pedigree): boolean {
  if (individual.affected) return true;
  const conditions = new Set((pedigree.tags ?? []).filter(t => t.style === "quadrant").map(t => t.id));
  return (individual.tags ?? []).some(t => conditions.has(t));
}

const cache = new WeakMap<Pedigree, CollapseInfo>();

function partnersOf(pedigree: Pedigree, id: string): string[] {
  const out: string[] = [];
  for (const p of pedigree.partnerships) {
    if (p.individual1 === id) out.push(p.individual2);
    else if (p.individual2 === id) out.push(p.individual1);
  }
  return out;
}

/** Who is drawn and who is hidden (see the module comment). Cached per pedigree object. */
export function collapseInfo(pedigree: Pedigree): CollapseInfo {
  const cached = cache.get(pedigree);
  if (cached) return cached;
  const roots = pedigree.individuals.filter(i => i.descendantsHidden).map(i => i.id);
  if (roots.length === 0) return { drawn: pedigree, hidden: new Set(), branches: new Map(), placeholders: new Map() };

  // One root at a time: descendantsOf leaves out the ids it starts from, and
  // a collapsed person below another one is hidden too.
  const below = new Set(roots.flatMap(r => [...descendantsOf(pedigree, [r])]));
  const drawnRoots = new Set(roots.filter(r => !below.has(r)));
  // The couples whose children are collapsed: a drawn collapsed person and a
  // partner who is drawn too (not below another collapsed person).
  const couples = pedigree.partnerships.filter(p =>
    (drawnRoots.has(p.individual1) || drawnRoots.has(p.individual2))
    && !below.has(p.individual1) && !below.has(p.individual2)
    && (pedigree.parentOf[p.id]?.length ?? 0) > 0);
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const shown = new Set<string>();
  for (const p of couples) for (const c of pedigree.parentOf[p.id]!) {
    const child = byId.get(c);
    if (child && drawnIndividually(child, pedigree)) shown.add(c);
  }

  const hidden = withMarriedInPartners(pedigree, below);
  for (const id of shown) hidden.delete(id);
  const branches = new Map<string, Set<string>>();
  for (const root of drawnRoots) {
    const branch = hiddenUnder(pedigree, descendantsOf(pedigree, [root]), hidden);
    if (branch.size > 0) branches.set(root, branch);
  }

  // A copy for removeIndividuals to strip in place: it reassigns the arrays,
  // but writes into parentOf, pinnedPositions and the partnership objects.
  const drawn: Pedigree = {
    ...pedigree,
    partnerships: pedigree.partnerships.map(p => ({ ...p })),
    parentOf: { ...pedigree.parentOf },
    ...(pedigree.pinnedPositions ? { pinnedPositions: { ...pedigree.pinnedPositions } } : {}),
  };
  removeIndividuals(drawn, hidden);
  // A child drawn as themselves keeps none of their own partnerships: their
  // partners and children are part of the hidden branch. A partner drawn
  // elsewhere (a cousin) stays, without the couple line.
  const cut = new Set(drawn.partnerships.filter(p => shown.has(p.individual1) || shown.has(p.individual2)).map(p => p.id));
  if (cut.size > 0) {
    drawn.partnerships = drawn.partnerships.filter(p => !cut.has(p.id));
    for (const id of cut) delete drawn.parentOf[id];
  }
  for (const p of drawn.partnerships) {
    // Children hidden, not absent: the couple is not childless.
    if ((pedigree.parentOf[p.id]?.length ?? 0) > 0 && (drawn.parentOf[p.id]?.length ?? 0) === 0) {
      delete p.childless;
      delete p.childlessReason;
    }
  }
  drawn.individuals = drawn.individuals.map(i => {
    if (!i.descendantsHidden || branches.has(i.id)) return i;
    const { descendantsHidden: _, ...rest } = i;
    return rest as Individual;
  });

  const placeholders = addPlaceholders(pedigree, drawn, hidden, couples.filter(p => !cut.has(p.id)), drawnRoots);

  const info: CollapseInfo = { drawn, hidden, branches, placeholders };
  cache.set(pedigree, info);
  // The drawn copy is already drawn: asking again hands back the same answer,
  // with the branch counts, so callers can pass either object.
  cache.set(drawn, { drawn, hidden: new Set(), branches, placeholders });
  return info;
}

/** The hidden people among `people`, plus the hidden partners of any of `people`. */
function hiddenUnder(pedigree: Pedigree, people: Iterable<string>, hidden: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const id of people) {
    if (hidden.has(id)) out.add(id);
    for (const other of partnersOf(pedigree, id)) if (hidden.has(other)) out.add(other);
  }
  return out;
}

/**
 * Add a group symbol child (#1) under each collapsed couple that has
 * children to group (those not drawn as themselves). The symbol takes the
 * birth order (sibOrder and date of birth) of the first grouped child, so it
 * sits among the drawn affected siblings where that child would. A couple
 * whose children are all drawn as themselves gets no symbol. A collapsed
 * person whose every partnership with children is gone from the drawing
 * (their partner is hidden under another collapsed person) gets none either:
 * those people are counted under that other person.
 */
function addPlaceholders(
  full: Pedigree, drawn: Pedigree, hidden: Set<string>, couples: Pedigree["partnerships"], drawnRoots: Set<string>,
): Map<string, CollapsedBranch> {
  const out = new Map<string, CollapsedBranch>();
  const byId = new Map(full.individuals.map(i => [i.id, i]));
  const added: Individual[] = [];
  const { mode } = full.siblingOrder ?? { mode: "insertion" };
  const orderKey = (i: Individual) => mode === "birthDate" && i.dob ? new Date(i.dob).getTime() : i.sibOrder;
  for (const p of couples) {
    if (!drawn.partnerships.some(q => q.id === p.id)) continue;
    const children = full.parentOf[p.id] ?? [];
    const kept = new Set(drawn.parentOf[p.id] ?? []);
    const grouped = children.filter(c => !kept.has(c)).map(c => byId.get(c)!).filter(Boolean);
    if (grouped.length === 0) continue;
    const set = hiddenUnder(full, [...children, ...descendantsOf(full, children)], hidden);
    const people = [...set].map(id => byId.get(id)!).filter(Boolean);
    const sexes = new Set(grouped.map(i => i.sex));
    const sex = sexes.size === 1 ? grouped[0]!.sex : "unknown";
    const first = [...grouped].sort((a, b) => orderKey(a) - orderKey(b))[0]!;
    const id = branchPlaceholderId(p.id);
    out.set(id, {
      roots: [p.individual1, p.individual2].filter(r => drawnRoots.has(r)),
      partnershipId: p.id,
      children: grouped.map(i => i.id),
      hidden: set,
      affected: people.filter(i => i.affected).length,
      male: grouped.filter(i => i.sex === "male").length,
      female: grouped.filter(i => i.sex === "female").length,
      unknownSex: grouped.filter(i => i.sex === "unknown").length,
    });
    added.push({ id, sex, affected: false, sibOrder: first.sibOrder, ...(first.dob ? { dob: first.dob } : {}) });
    // In the first grouped child's place among the drawn siblings.
    const at = children.indexOf(first.id);
    const before = children.slice(0, at).filter(c => kept.has(c));
    const after = children.slice(at).filter(c => kept.has(c));
    drawn.parentOf[p.id] = [...before, id, ...after];
  }
  drawn.individuals = [...drawn.individuals, ...added];
  return out;
}

/**
 * Record that `derived` (a copy of an already drawn pedigree with, say, names
 * replaced, as de-identified export does) is itself drawn, keeping the branch
 * counts and diamonds. Without this, the diamonds would be taken for real
 * people and the collapsed people for childless ones. Returns `derived`.
 */
export function asDrawn(derived: Pedigree, source: Pedigree): Pedigree {
  const { branches, placeholders } = collapseInfo(source);
  cache.set(derived, { drawn: derived, hidden: new Set(), branches, placeholders });
  return derived;
}

/** The pedigree with hidden people left out: what the canvas and exports draw. */
export function drawnPedigree(pedigree: Pedigree): Pedigree {
  return collapseInfo(pedigree).drawn;
}

/** True when the person has anyone below them, so hiding their descendants would change something. */
export function hasDescendants(pedigree: Pedigree, id: string): boolean {
  return descendantsOf(pedigree, [id]).size > 0;
}

/**
 * After an edit, the collapsed people whose flag must be cleared so that
 * nobody the edit added or moved disappears into a hidden branch: a child
 * added under a collapsed person (or their partner), or someone made a child
 * of a hidden couple. Hiding descendants is the only edit meant to hide
 * people, and the store does not run this for it.
 */
export function rootsHidingNew(before: Pedigree, after: Pedigree): string[] {
  const now = collapseInfo(after).hidden;
  if (now.size === 0) return [];
  const was = collapseInfo(before).hidden;
  const fresh = [...now].filter(id => !was.has(id));
  if (fresh.length === 0) return [];
  const near = new Set(fresh);
  for (const p of after.partnerships) {
    if (near.has(p.individual1)) near.add(p.individual2);
    else if (near.has(p.individual2)) near.add(p.individual1);
  }
  const line = new Set([...near, ...ancestorsOf(after, [...near])]);
  return after.individuals.filter(i => i.descendantsHidden && line.has(i.id)).map(i => i.id);
}

// ── Diamond ───────────────────────────────────────────────────────────────────

/** Legend wording for the collapsed-branch group symbol. */
export const COLLAPSED_BRANCH_LABEL = "Unaffected siblings (number); descendants not shown";

/** Font size of the count inside a group symbol of `symbolSize`: smaller for three digits and more. */
export function branchCountFontSize(count: number, symbolSize: number): number {
  const digits = String(count).length;
  return Math.round(symbolSize * (digits >= 3 ? 0.26 : 0.34));
}

/** Hover text for a group symbol on the canvas: the grouped children, then everyone hidden under the couple. */
export function branchTooltip(branch: CollapsedBranch): string {
  const k = branch.children.length;
  const n = branch.hidden.size;
  const parts = [
    branch.male && `${branch.male} male`,
    branch.female && `${branch.female} female`,
    branch.unknownSex && `${branch.unknownSex} unknown sex`,
  ].filter(Boolean).join(", ");
  const head = `${k} unaffected ${k === 1 ? "child" : "children"} (${parts})`;
  const all = n > k
    ? `. ${n} people not shown in all${branch.affected > 0 ? `, ${branch.affected} of them affected` : ""}`
    : "";
  return `${head}${all}. Click to show.`;
}

/** SVG text of the count centred on (cx, cy), the centre of a group symbol of `symbolSize`. */
export function renderBranchCountSvg(count: number, symbolSize: number, cx = 0, cy = 0): string {
  const fs = branchCountFontSize(count, symbolSize);
  // A baseline offset rather than dominant-baseline, which some rasterisers ignore.
  return `<text class="branch-count" x="${cx}" y="${cy + Math.round(fs * 0.36 * 10) / 10}" text-anchor="middle" font-family="sans-serif" font-size="${fs}" fill="black">${count}</text>`;
}
