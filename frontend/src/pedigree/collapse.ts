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
 * The hidden people are drawn as one diamond per couple (#1), the NSGC
 * symbol for several people of unspecified sex with their number inside: the
 * drawn copy gets a stand-in child (`branchPlaceholderId`) under each drawn
 * partnership of a collapsed person whose children were all hidden. Being an
 * ordinary child of the couple, it is laid out, joined by the sibship line
 * and drawn by every renderer like anyone else; `CollapseInfo.placeholders`
 * carries what it stands for. It is never in the stored pedigree.
 */

export interface CollapseInfo {
  /** The pedigree to lay out and draw. The input object itself when nothing is hidden. */
  drawn: Pedigree;
  /** Ids of everyone left out of the drawing. */
  hidden: Set<string>;
  /**
   * For each drawn collapsed person, the hidden people under them: their
   * hidden descendants and the hidden partners of those. Someone below two
   * collapsed people (descendants who intermarry) is listed under both. For
   * a branch drawn as one node with a count (#1), this is the count.
   */
  branches: Map<string, Set<string>>;
  /** The diamonds standing for hidden people (#1), by placeholder id. Their individuals are in `drawn`. */
  placeholders: Map<string, CollapsedBranch>;
}

/** What one collapsed-branch diamond stands for (#1). */
export interface CollapsedBranch {
  /** The collapsed partner (or both partners) whose flag hides these people; expanding clears it. */
  roots: string[];
  /** The drawn partnership the diamond hangs from. */
  partnershipId: string;
  /** The hidden people under this partnership: its children, their descendants and the hidden partners of those. */
  hidden: Set<string>;
  affected: number;
  male: number;
  female: number;
  unknownSex: number;
}

const PLACEHOLDER_PREFIX = "collapsed-branch:";

/** Id of the diamond under partnership `partnershipId` in the drawn pedigree. */
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

const cache = new WeakMap<Pedigree, CollapseInfo>();

/** Who is drawn and who is hidden (see the module comment). Cached per pedigree object. */
export function collapseInfo(pedigree: Pedigree): CollapseInfo {
  const cached = cache.get(pedigree);
  if (cached) return cached;
  const roots = pedigree.individuals.filter(i => i.descendantsHidden).map(i => i.id);
  if (roots.length === 0) return { drawn: pedigree, hidden: new Set(), branches: new Map(), placeholders: new Map() };

  // One root at a time: descendantsOf leaves out the ids it starts from, and
  // a collapsed person below another one is hidden too.
  const hidden = withMarriedInPartners(pedigree, roots.flatMap(r => [...descendantsOf(pedigree, [r])]));
  const branches = new Map<string, Set<string>>();
  for (const root of roots) {
    if (hidden.has(root)) continue;
    const below = [...descendantsOf(pedigree, [root])];
    const branch = new Set(below);
    for (const id of below) for (const p of pedigree.partnerships) {
      const other = p.individual1 === id ? p.individual2 : p.individual2 === id ? p.individual1 : null;
      if (other && hidden.has(other)) branch.add(other);
    }
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

  const placeholders = addPlaceholders(pedigree, drawn, hidden, branches);

  const info: CollapseInfo = { drawn, hidden, branches, placeholders };
  cache.set(pedigree, info);
  // The drawn copy is already drawn: asking again hands back the same answer,
  // with the branch counts, so callers can pass either object.
  cache.set(drawn, { drawn, hidden: new Set(), branches, placeholders });
  return info;
}

/**
 * Add a diamond child (#1) under each drawn partnership of a drawn collapsed
 * person that had children in the full pedigree. All of that couple's
 * children are hidden (they are the collapsed person's descendants), so the
 * diamond is the couple's only drawn child. A collapsed person whose every
 * partnership with children is gone from the drawing (their partner is
 * hidden under another collapsed person) gets no diamond: those people are
 * counted in that other person's diamond.
 */
function addPlaceholders(
  full: Pedigree, drawn: Pedigree, hidden: Set<string>, branches: Map<string, Set<string>>,
): Map<string, CollapsedBranch> {
  const out = new Map<string, CollapsedBranch>();
  const byId = new Map(full.individuals.map(i => [i.id, i]));
  const added: Individual[] = [];
  for (const p of drawn.partnerships) {
    const roots = [p.individual1, p.individual2].filter(id => branches.has(id));
    const children = full.parentOf[p.id] ?? [];
    if (roots.length === 0 || children.length === 0 || (drawn.parentOf[p.id]?.length ?? 0) > 0) continue;
    const below = new Set([...children, ...descendantsOf(full, children)]);
    const set = new Set(below);
    for (const id of below) for (const q of full.partnerships) {
      const other = q.individual1 === id ? q.individual2 : q.individual2 === id ? q.individual1 : null;
      if (other && hidden.has(other)) set.add(other);
    }
    const people = [...set].map(id => byId.get(id)!).filter(Boolean);
    const id = branchPlaceholderId(p.id);
    out.set(id, {
      roots,
      partnershipId: p.id,
      hidden: set,
      affected: people.filter(i => i.affected).length,
      male: people.filter(i => i.sex === "male").length,
      female: people.filter(i => i.sex === "female").length,
      unknownSex: people.filter(i => i.sex === "unknown").length,
    });
    added.push({ id, sex: "unknown", affected: false, sibOrder: 0 });
    drawn.parentOf[p.id] = [id];
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

/** Legend wording for the collapsed-branch diamond. */
export const COLLAPSED_BRANCH_LABEL = "Descendants not shown (number of people)";

/** Font size of the count inside a diamond of `symbolSize`: smaller for three digits and more. */
export function branchCountFontSize(count: number, symbolSize: number): number {
  const digits = String(count).length;
  return Math.round(symbolSize * (digits >= 3 ? 0.26 : 0.34));
}

/** The note under a diamond: how many of the hidden people are affected. */
export function branchNote(branch: CollapsedBranch): string | undefined {
  return branch.affected > 0 ? `${branch.affected} affected` : undefined;
}

/** Hover text for a diamond on the canvas: count, sex breakdown, affected count. */
export function branchTooltip(branch: CollapsedBranch): string {
  const n = branch.hidden.size;
  const parts = [
    branch.male && `${branch.male} male`,
    branch.female && `${branch.female} female`,
    branch.unknownSex && `${branch.unknownSex} unknown sex`,
  ].filter(Boolean).join(", ");
  const affected = branch.affected > 0 ? `, ${branch.affected} affected` : "";
  return `${n} ${n === 1 ? "person" : "people"} not shown (${parts}${affected}). Click to show.`;
}

/** SVG text of the count centred on (cx, cy), the centre of a diamond of `symbolSize`. */
export function renderBranchCountSvg(count: number, symbolSize: number, cx = 0, cy = 0): string {
  const fs = branchCountFontSize(count, symbolSize);
  // A baseline offset rather than dominant-baseline, which some rasterisers ignore.
  return `<text class="branch-count" x="${cx}" y="${cy + Math.round(fs * 0.36 * 10) / 10}" text-anchor="middle" font-family="sans-serif" font-size="${fs}" fill="black">${count}</text>`;
}
