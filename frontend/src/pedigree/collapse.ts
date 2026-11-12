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
 * hides nothing and is dropped from the drawn copy, so no marker is drawn.
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
}

const cache = new WeakMap<Pedigree, CollapseInfo>();

/** Who is drawn and who is hidden (see the module comment). Cached per pedigree object. */
export function collapseInfo(pedigree: Pedigree): CollapseInfo {
  const cached = cache.get(pedigree);
  if (cached) return cached;
  const roots = pedigree.individuals.filter(i => i.descendantsHidden).map(i => i.id);
  if (roots.length === 0) return { drawn: pedigree, hidden: new Set(), branches: new Map() };

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

  const info: CollapseInfo = { drawn, hidden, branches };
  cache.set(pedigree, info);
  // The drawn copy is already drawn: asking again hands back the same answer,
  // with the branch counts, so callers can pass either object.
  cache.set(drawn, { drawn, hidden: new Set(), branches });
  return info;
}

/**
 * Record that `derived` (a copy of an already drawn pedigree with, say, names
 * replaced, as de-identified export does) is itself drawn, keeping the branch
 * counts. Without this, the collapsed people in it have no descendants left
 * and would lose their mark. Returns `derived`.
 */
export function asDrawn(derived: Pedigree, source: Pedigree): Pedigree {
  cache.set(derived, { drawn: derived, hidden: new Set(), branches: collapseInfo(source).branches });
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

// ── Marker ────────────────────────────────────────────────────────────────────

/**
 * The mark on a collapsed person: a small boxed "+" just off the symbol's
 * lower right corner, clear of adoption brackets, the couple line (at mid
 * height) and the labels below. Shared by the canvas (`PedigreeSymbolNode`)
 * and both SVG exporters. Coordinates are relative to the symbol box's top
 * left corner.
 */
export const COLLAPSED_MARK = { x: 6, y: -10, size: 10 } as const;

/** Box (x, y, size) of the mark for a size × size symbol whose top-left corner is (ox, oy). */
export function collapsedMarkBox(symbolSize: number, ox = 0, oy = 0) {
  return { x: ox + symbolSize + COLLAPSED_MARK.x, y: oy + symbolSize + COLLAPSED_MARK.y, size: COLLAPSED_MARK.size };
}

/** SVG markup of the mark beside a symbol, for the exporters. */
export function renderCollapsedMarkSvg(symbolSize: number, ox = 0, oy = 0): string {
  const { x, y, size } = collapsedMarkBox(symbolSize, ox, oy);
  return `<g class="descendants-hidden">${collapsedMarkSvgAt(x, y, size)}</g>`;
}

/** Legend wording for the mark. */
export const COLLAPSED_MARK_LABEL = "Descendants not shown";

/** SVG markup of the mark in a size × size box with top-left (x, y). */
export function collapsedMarkSvgAt(x: number, y: number, size: number = COLLAPSED_MARK.size): string {
  const m = size / 2, arm = size / 2 - 2.5;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="white" stroke="black" stroke-width="1"/>`
    + `<path d="M ${x + m - arm} ${y + m} H ${x + m + arm} M ${x + m} ${y + m - arm} V ${y + m + arm}" stroke="black" stroke-width="1.2"/>`;
}
