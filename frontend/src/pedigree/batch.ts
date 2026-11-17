import type { Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { twinSetOf } from "./twins";
import { geneticParentsSexProblem } from "./sameSex";
import { affectedControlOn, conditionStateOf, conditionTags, soleCondition, type ConditionState } from "./conditions";

/**
 * Batch status changes on a multiple selection: what the more menu's
 * "N selected" items show and which of them are allowed. The store applies
 * the edits (`setAffectedMany` and friends), each as one undo step.
 */

/** Carrier status is one choice: a carrier dot, the presymptomatic line, or neither. */
export type CarrierStatus = "carrier" | "presymptomatic" | "none";

export function carrierStatusOf(
  ind: { carrier?: boolean; presymptomatic?: boolean; tags?: string[]; carrierTags?: string[] },
  pedigree?: Pick<Pedigree, "tags">,
): CarrierStatus {
  if (ind.presymptomatic) return "presymptomatic";
  if (ind.carrier) return "carrier";
  // With one condition the Carrier control records it, so a carrier of it counts.
  const sole = pedigree && soleCondition(pedigree);
  return sole && conditionStateOf(ind, sole.id) === "carrier" ? "carrier" : "none";
}

/** How many of the selected people have each status, for the menu labels. */
export interface BatchStatus {
  /** The selected ids that exist, in selection order. */
  ids: string[];
  affected: number;
  deceased: number;
  carrier: Record<CarrierStatus, number>;
  sex: Record<Sex, number>;
  /** Tag id to how many of the selected carry it. */
  tags: Record<string, number>;
  /** Condition (quadrant tag) id to how many of the selected are in each state. */
  conditions: Record<string, Record<ConditionState, number>>;
}

export function batchStatus(pedigree: Pedigree, ids: string[]): BatchStatus {
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const people = [...new Set(ids)].map(id => byId.get(id)).filter(i => i !== undefined);
  const out: BatchStatus = {
    ids: people.map(i => i.id),
    affected: 0,
    deceased: 0,
    carrier: { carrier: 0, presymptomatic: 0, none: 0 },
    sex: { male: 0, female: 0, unknown: 0 },
    tags: {},
    conditions: {},
  };
  const conditions = conditionTags(pedigree);
  for (const t of conditions) out.conditions[t.id] = { affected: 0, carrier: 0, none: 0 };
  for (const ind of people) {
    if (affectedControlOn(ind, pedigree)) out.affected++;
    if (ind.deceased) out.deceased++;
    out.carrier[carrierStatusOf(ind, pedigree)]++;
    for (const t of conditions) out.conditions[t.id]![conditionStateOf(ind, t.id)]++;
    out.sex[ind.sex]++;
    for (const t of ind.tags ?? []) out.tags[t] = (out.tags[t] ?? 0) + 1;
  }
  return out;
}

/**
 * Everyone whose sex setting `ids` to `sex` changes: the ids themselves plus
 * their monozygotic twins, who share a sex, as the single-person
 * `setSex` does.
 */
export function batchSexTargets(pedigree: Pedigree, ids: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    if (!pedigree.individuals.some(i => i.id === id)) continue;
    out.add(id);
    const twin = twinSetOf(pedigree, id);
    if (twin?.set.zygosity === "monozygotic") for (const m of twin.set.members) out.add(m);
  }
  return out;
}

/**
 * Why `ids` cannot all be given `sex`, or null. Partners may be of the same
 * sex; the genetic parents of a child may not, so a change that
 * would make two of them the same known sex is refused (see
 * `geneticParentsSexProblem`). Nor can anyone who carried a pregnancy, a
 * surrogate (S) or a child's "Carried by", be made male: sex is
 * biological sex, and a gender identity is the way to draw them as a man.
 * The single-person Sex menu uses this too.
 */
export function batchSexProblem(pedigree: Pedigree, ids: string[], sex: Sex): string | null {
  const targets = batchSexTargets(pedigree, ids);
  if (targets.size === 0) return "Nobody selected.";
  if (sex === "unknown") return null;
  if (sex === "male") {
    const carrier = carriedPregnancyProblem(pedigree, targets);
    if (carrier) return carrier;
  }
  const sexOf = new Map(pedigree.individuals.map(i => [i.id, i.sex]));
  for (const id of targets) sexOf.set(id, sex);
  return geneticParentsSexProblem(pedigree, targets, id => sexOf.get(id));
}

/** Why none of `targets` can be male: one carried a pregnancy. Null when none did. */
function carriedPregnancyProblem(pedigree: Pedigree, targets: Set<string>): string | null {
  for (const id of targets) {
    const ind = pedigree.individuals.find(i => i.id === id);
    const child = pedigree.individuals.find(i => i.carriedBy === id);
    if (!ind || (ind.reproductiveRole !== "surrogate" && !child)) continue;
    const name = ind.name?.trim();
    const what = ind.reproductiveRole === "surrogate"
      ? `${name ? `${name} is` : "this is"} a surrogate (S)`
      : `${name || "this person"} carried ${child!.name?.trim() || "a child"}`;
    return `Not available: ${what}, and sex here is biological sex. Record a gender identity to draw them as a man.`;
  }
  return null;
}
