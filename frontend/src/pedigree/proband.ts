/**
 * Proband and consultand arrows (NSGC 2008 Fig. 1). The proband (the
 * affected person through whom the family came to attention) gets an arrow
 * at the lower left with a "P" at its tail; a consultand (the person seeking
 * counselling, who may be unaffected) gets the same arrow without the "P".
 * Someone who is both is drawn as the proband. Framework-free, shared by the
 * canvas (`ProbandArrow` in `chart/symbols.tsx`), both SVG exporters and the
 * legends, so they agree.
 */

import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";

export type ArrowKind = "proband" | "consultand";

/** Length (px, along each axis) of the arrow from its tail to the symbol corner. */
export const ARROW_TAIL = 18;
export const PROBAND_LETTER = "P";
export const PROBAND_LETTER_SIZE = 10;

/** Which arrow, if any, points at this person. */
export function arrowKind(ind: Pick<Individual, "proband" | "consultand">): ArrowKind | undefined {
  if (ind.proband) return "proband";
  if (ind.consultand) return "consultand";
  return undefined;
}

/**
 * Arrow geometry for a symbol box of `size` with top-left (x, y): the tip at
 * the box's lower-left corner, the tail ARROW_TAIL below-left of it, and the
 * baseline point of the "P", just below-left of the tail (Fig. 1.7).
 */
export function arrowGeometry(size: number, x = 0, y = 0) {
  const tip = { x, y: y + size };
  const tail = { x: x - ARROW_TAIL, y: y + size + ARROW_TAIL };
  // The "P" ends 4px left of the tail: with a partner on the proband's left
  // their couple's line of descent drops half a slot gap left of the symbol
  // (x - 20), and the letter then sits just clear of it. A white box behind
  // the letter covers any line that does cross it (a pinned node), which
  // then shows a gap rather than running through the P, as the label
  // backing does.
  const letter = { x: tail.x - 4, y: tail.y + PROBAND_LETTER_SIZE - 1 };
  const letterBox = { x: letter.x - LETTER_WIDTH - 1, y: letter.y - PROBAND_LETTER_SIZE + 1, w: LETTER_WIDTH + 1.5, h: PROBAND_LETTER_SIZE };
  return { tip, tail, letter, letterBox };
}

/** Rough width (px) of the bold "P" at PROBAND_LETTER_SIZE. */
const LETTER_WIDTH = 7;

/** Legend wording, shared by the in-app legend and the export key. */
export const ARROW_LEGEND_LABEL: Record<ArrowKind, string> = {
  proband: "Proband (index case)",
  consultand: "Consultand (seeking counselling)",
};


/**
 * The tooltip of the proband controls (Person tab, more menu): there is one
 * proband per pedigree, so marking another moves the arrow, and this says
 * from whom.
 */
export function probandTitle(pedigree: Pedigree, individual: Individual): string {
  const other = pedigree.individuals.find(i => i.proband && i.id !== individual.id);
  if (!other) return "The affected person through whom the family came to attention: an arrow with a P. One per pedigree.";
  return `One per pedigree: marking this person moves the proband arrow from ${other.name?.trim() || "another person"}.`;
}
