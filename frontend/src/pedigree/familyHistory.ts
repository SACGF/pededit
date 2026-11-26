/**
 * "Family history not known" (NSGC 2008 Fig. 2): a "?" above the
 * individual's symbol, for someone whose family history is unavailable
 * (adopted with no records, a donor, a partner who married in and knows
 * nothing of their family). Stored as `Individual.familyHistoryUnknown`.
 * Framework-free: the canvas (`FamilyHistoryMark` in `chart/symbols.tsx`),
 * both SVG exporters and the legends share this placement.
 */

export const FAMILY_HISTORY_FONT_SIZE = 12;
export const FAMILY_HISTORY_LEGEND_LABEL = "Family history not known (?)";

/**
 * Baseline point of the "?" for a symbol box of `size` with top-left (x, y).
 * Centred above the symbol, as the standard draws it, unless a line of
 * descent comes down into the top of the symbol (`hasParents`): then it
 * moves left of that line so the two do not overlap.
 */
export function familyHistoryMarkAt(size: number, hasParents: boolean, x = 0, y = 0): { x: number; y: number } {
  return { x: x + size / 2 - (hasParents ? 9 : 0), y: y - 4 };
}

