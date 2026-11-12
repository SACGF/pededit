import type { Individual, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { tagsOf, tagCanvasText } from "./tags";

/**
 * Age of onset (#93). An individual records it for the affected status
 * (`Individual.onset`) and per condition, that is per quadrant tag they carry
 * (`Individual.tagOnset`). Values are free text ("45y", "40s", "childhood")
 * because onset is often known only roughly.
 *
 * Stored values that no longer apply (the person is no longer affected, the
 * tag was removed from them or is no longer a quadrant tag) are ignored here,
 * so every reader (edit panel, canvas, exports, CSV) agrees on what is shown.
 */

/** Only condition tags (drawn as a quarter of the symbol) take an age of onset. */
export function tagTakesOnset(tag: Tag): boolean {
  return tag.style === "quadrant";
}

export interface OnsetItem {
  /** The condition tag, or undefined for the affected status. */
  tag?: Tag;
  onset: string;
}

/** The individual's ages of onset that apply: affected status first, then tags in pedigree order. */
export function onsetsOf(individual: Individual, pedigree: Pedigree): OnsetItem[] {
  const items: OnsetItem[] = [];
  const own = individual.onset?.trim();
  if (individual.affected && own) items.push({ onset: own });
  const byTag = individual.tagOnset;
  if (byTag) {
    for (const tag of tagsOf(individual, pedigree)) {
      const value = byTag[tag.id]?.trim();
      if (value && tagTakesOnset(tag)) items.push({ tag, onset: value });
    }
  }
  return items;
}

/** Name of what an onset belongs to, for the CSV and other text: the tag label, or "Affected". */
export function onsetSubject(item: OnsetItem): string {
  return item.tag ? item.tag.label : "Affected";
}

/**
 * Short text for under the symbol: "onset 45y" for the affected status,
 * the tag's canvas text then the age ("BC 45y") for a condition.
 */
export function onsetLabel(item: OnsetItem): string {
  return item.tag ? `${tagCanvasText(item.tag)} ${item.onset}` : `onset ${item.onset}`;
}
