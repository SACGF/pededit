import { isAffected, isConditionTag } from "@pedigree-editor/layout-engine";
import type { Individual, Pedigree, Tag } from "@pedigree-editor/layout-engine";

export { isAffected, isConditionTag };

/**
 * Affected and carrier status per condition (#115).
 *
 * A condition is a quadrant tag (#3). Each person has one state per
 * condition: affected (the tag id is in `Individual.tags`), carrier (in
 * `Individual.carrierTags`) or neither. The plain flags stay:
 * `Individual.affected` is affected with something not recorded (#118), and
 * recording or clearing a condition never touches it. "Affected" overall
 * (PED export, the Affected only filter, sibling order, the warnings) is the
 * flag or any affected condition: `isAffected`. `Individual.carrier` is a
 * carrier whose condition is not recorded, and recording a carrier condition
 * clears it.
 *
 * How the editor asks depends on how many conditions the pedigree defines
 * (`conditionMode`), not how many are in use, so every defined condition can
 * be recorded (the drawing divides the symbol by those in use,
 * `sectionConditions` in tags.ts):
 * - none: the Affected and Carrier controls set the plain flags, as before;
 * - one ("single"): the same controls also record that condition, so ticking
 *   Affected adds the tag and Carrier adds it to `carrierTags`;
 * - two or more ("per-condition"): the edit panel and the batch menu ask per
 *   condition. A plain flag still draws, keyed "(condition not recorded)",
 *   and a warning (validation.ts, "condition-not-recorded") offers a
 *   one-click fix per condition. Nothing is refused.
 *
 * Everything here is framework-free; the store calls `applyConditionState`
 * on its immer drafts so single and batch edits follow one rule.
 */

export type ConditionState = "affected" | "carrier" | "none";

export type ConditionMode = "plain" | "single" | "per-condition";

/** The pedigree's conditions (quadrant tags that are not traits, #118), in order. */
export function conditionTags(pedigree: Pick<Pedigree, "tags">): Tag[] {
  return (pedigree.tags ?? []).filter(isConditionTag);
}

export function conditionMode(pedigree: Pick<Pedigree, "tags">): ConditionMode {
  const n = conditionTags(pedigree).length;
  return n === 0 ? "plain" : n === 1 ? "single" : "per-condition";
}

/** The only condition when there is exactly one, else undefined. */
export function soleCondition(pedigree: Pick<Pedigree, "tags">): Tag | undefined {
  const c = conditionTags(pedigree);
  return c.length === 1 ? c[0] : undefined;
}

export function conditionStateOf(ind: Pick<Individual, "tags" | "carrierTags">, tagId: string): ConditionState {
  if (ind.tags?.includes(tagId)) return "affected";
  if (ind.carrierTags?.includes(tagId)) return "carrier";
  return "none";
}

/** Conditions the person is recorded as affected with, in pedigree order. */
export function affectedConditions(ind: Pick<Individual, "tags">, pedigree: Pick<Pedigree, "tags">): Tag[] {
  const mine = new Set(ind.tags ?? []);
  return conditionTags(pedigree).filter(t => mine.has(t.id));
}

/**
 * Conditions the person is a carrier of, in pedigree order. A tag in both
 * lists (only hand-edited JSON can do that) counts as affected.
 */
export function carrierConditions(ind: Pick<Individual, "tags" | "carrierTags">, pedigree: Pick<Pedigree, "tags">): Tag[] {
  const mine = new Set(ind.carrierTags ?? []);
  const affected = new Set(ind.tags ?? []);
  return conditionTags(pedigree).filter(t => mine.has(t.id) && !affected.has(t.id));
}

/**
 * The plain flag says something the recorded conditions do not: affected with
 * something not recorded (#118), drawn as the black fill (under any condition
 * sections in NSGC 2022). With two or more conditions that is so even beside
 * a recorded condition, and the editor warns ("condition-not-recorded"). With
 * one condition, the flag beside that condition adds nothing.
 */
export function plainAffected(ind: Individual, pedigree: Pick<Pedigree, "tags">): boolean {
  if (!ind.affected) return false;
  const sole = soleCondition(pedigree);
  return !(sole && ind.tags?.includes(sole.id));
}

/**
 * The state of the plain Affected control (A, the more menu, batch): the
 * flag, or with one condition, that condition. With two or more conditions
 * someone affected only with a recorded condition shows "Mark affected",
 * which sets the flag (#118).
 */
export function affectedControlOn(ind: Individual, pedigree: Pick<Pedigree, "tags">): boolean {
  if (ind.affected) return true;
  const sole = soleCondition(pedigree);
  return !!sole && !!ind.tags?.includes(sole.id);
}

/** A carrier with no condition recorded: the plain flag alone. */
export function plainCarrier(ind: Individual, pedigree: Pick<Pedigree, "tags">): boolean {
  return !!ind.carrier && carrierConditions(ind, pedigree).length === 0;
}

/** A carrier of anything: the plain flag or a recorded condition. */
export function isCarrier(ind: Individual, pedigree: Pick<Pedigree, "tags">): boolean {
  return !!ind.carrier || carrierConditions(ind, pedigree).length > 0;
}

/** Key label suffix for a plain flag once the pedigree has two or more conditions. */
export const CONDITION_NOT_RECORDED = "(condition not recorded)";

export function plainStatusLabel(status: "Affected" | "Carrier", pedigree: Pick<Pedigree, "tags">): string {
  return conditionMode(pedigree) === "per-condition" ? `${status} ${CONDITION_NOT_RECORDED}` : status;
}

/** Key label for a condition's carriers: "Cystic fibrosis carrier". */
export function carrierLabel(tag: Pick<Tag, "label">): string {
  return `${tag.label} carrier`;
}

function sortedInsert(list: string[] | undefined, id: string, order: Map<string, number>): string[] {
  const out = [...(list ?? []).filter(t => t !== id), id];
  return out.sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
}

function remove(ind: Individual, key: "tags" | "carrierTags", id: string): boolean {
  const list = ind[key];
  if (!list?.includes(id)) return false;
  const next = list.filter(t => t !== id);
  if (next.length === 0) delete ind[key]; else ind[key] = next;
  return true;
}

/**
 * Set one person's state for one condition, in place (an immer draft or a
 * copy). The rules, shared by every editor path:
 * - affected: the tag joins `tags` (pedigree order). The plain `affected`
 *   flag is left alone (#118): it means something not recorded.
 * - carrier: the tag joins `carrierTags` and the plain `carrier` flag is
 *   cleared (it is now this condition). Presymptomatic is left alone: it is
 *   a separate mark, usually for a dominant condition.
 * - none: the tag leaves both lists.
 * Leaving affected drops that condition's onset, and the affected status's
 * own onset (`Individual.onset`) when the plain control is now off.
 * Returns whether anything changed.
 */
export function applyConditionState(
  ind: Individual, tagId: string, state: ConditionState, pedigree: Pick<Pedigree, "tags">,
): boolean {
  if (conditionStateOf(ind, tagId) === state && (state !== "carrier" || !ind.carrier)) return false;
  const order = new Map((pedigree.tags ?? []).map((t, i) => [t.id, i]));
  const wasAffectedWithIt = !!ind.tags?.includes(tagId);
  remove(ind, "carrierTags", tagId);
  if (state === "affected") {
    ind.tags = sortedInsert(ind.tags, tagId, order);
    return true;
  }
  remove(ind, "tags", tagId);
  if (wasAffectedWithIt && ind.tagOnset && tagId in ind.tagOnset) {
    const { [tagId]: _gone, ...rest } = ind.tagOnset;
    if (Object.keys(rest).length === 0) delete ind.tagOnset; else ind.tagOnset = rest;
  }
  if (state === "carrier") {
    ind.carrierTags = sortedInsert(ind.carrierTags, tagId, order);
    if (ind.carrier) ind.carrier = false;
  }
  if (wasAffectedWithIt && ind.onset !== undefined && !affectedControlOn(ind, pedigree)) delete ind.onset;
  return true;
}

/**
 * The update that resolves a plain flag the conditions do not explain (#118),
 * for a warning's one-click fix (one `updateIndividual`, so one undo step):
 * record it as condition `tagId`, or with `tagId` null drop the flag because
 * the recorded conditions say it all. The affected status's own onset moves
 * to the condition it becomes (or the only recorded one) when that has none.
 */
export function resolvePlainAffected(ind: Individual, tagId: string | null, pedigree: Pick<Pedigree, "tags">): Partial<Individual> {
  const copy = structuredClone(ind);
  if (tagId) applyConditionState(copy, tagId, "affected", pedigree);
  const recorded = affectedConditions(copy, pedigree);
  const target = tagId ?? (recorded.length === 1 ? recorded[0]!.id : undefined);
  const onset = copy.onset?.trim();
  let tagOnset = copy.tagOnset;
  if (onset && target && !tagOnset?.[target]?.trim()) tagOnset = { ...tagOnset, [target]: onset };
  return { affected: false, onset: undefined, tags: copy.tags, carrierTags: copy.carrierTags, tagOnset };
}

/**
 * The plain Affected control (checkbox, more menu, "A" shortcut, batch). With
 * one condition it records that condition; otherwise it sets the plain flag
 * (#118). Unticking removes the flag and every affected condition, since a
 * condition section on an unaffected person would contradict the box.
 * Returns whether anything changed.
 */
export function applyAffected(ind: Individual, affected: boolean, pedigree: Pick<Pedigree, "tags">): boolean {
  const sole = soleCondition(pedigree);
  if (affected) {
    if (sole) return applyConditionState(ind, sole.id, "affected", pedigree);
    if (ind.affected) return false;
    ind.affected = true;
    return true;
  }
  let changed = false;
  for (const t of affectedConditions(ind, pedigree)) changed = applyConditionState(ind, t.id, "none", pedigree) || changed;
  if (ind.affected) { ind.affected = false; changed = true; }
  if (ind.onset !== undefined) { delete ind.onset; changed = true; }
  return changed;
}

/**
 * The plain Carrier control. With one condition, carrier means a carrier of
 * it (`carrierTags`) and unsetting clears that too; otherwise it is the plain
 * flag only (with two or more conditions, carriers of a condition are set per
 * condition; unlike affected, nothing requires the flag to follow them).
 * Presymptomatic is cleared when set, as the one carrier status select has
 * always done (#101). Returns whether anything changed.
 */
export function applyCarrier(ind: Individual, carrier: boolean, pedigree: Pick<Pedigree, "tags">): boolean {
  const sole = soleCondition(pedigree);
  let changed = false;
  if (carrier) {
    if (ind.presymptomatic) { delete ind.presymptomatic; changed = true; }
    if (sole) return applyConditionState(ind, sole.id, "carrier", pedigree) || changed;
    if (!ind.carrier) { ind.carrier = true; changed = true; }
    return changed;
  }
  if (sole && conditionStateOf(ind, sole.id) === "carrier") changed = applyConditionState(ind, sole.id, "none", pedigree);
  if (ind.carrier) { ind.carrier = false; changed = true; }
  return changed;
}
