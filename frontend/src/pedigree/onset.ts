import type { Individual, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { tagsOf } from "./tags";
import { affectedControlOn, isConditionTag } from "./conditions";

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

/** Only condition tags (quadrant tags that are not traits, #118) take an age of onset. */
export function tagTakesOnset(tag: Tag): boolean {
  return isConditionTag(tag);
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
  // The affected status's own onset goes with the plain Affected control (#118).
  if (own && affectedControlOn(individual, pedigree)) items.push({ onset: own });
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
