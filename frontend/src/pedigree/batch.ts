import type { Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { twinSetOf } from "./twins";

/**
 * Batch status changes on a multiple selection (#35): what the more menu's
 * "N selected" items show and which of them are allowed. The store applies
 * the edits (`setAffectedMany` and friends), each as one undo step.
 */

/** Carrier status is one choice (#101): a carrier dot, the presymptomatic line, or neither. */
export type CarrierStatus = "carrier" | "presymptomatic" | "none";

export function carrierStatusOf(ind: { carrier?: boolean; presymptomatic?: boolean }): CarrierStatus {
  return ind.presymptomatic ? "presymptomatic" : ind.carrier ? "carrier" : "none";
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
  };
  for (const ind of people) {
    if (ind.affected) out.affected++;
    if (ind.deceased) out.deceased++;
    out.carrier[carrierStatusOf(ind)]++;
    out.sex[ind.sex]++;
    for (const t of ind.tags ?? []) out.tags[t] = (out.tags[t] ?? 0) + 1;
  }
  return out;
}

/**
 * Everyone whose sex setting `ids` to `sex` changes: the ids themselves plus
 * their monozygotic twins, who share a sex (#11), as the single-person
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
 * Why `ids` cannot all be given `sex`, or null. The single-person Sex menu
 * greys out the sex of a partner of known sex; here the check is on the
 * result, so two selected partners cannot both be made male, while a couple
 * can still be swapped one at a time.
 */
export function batchSexProblem(pedigree: Pedigree, ids: string[], sex: Sex): string | null {
  const targets = batchSexTargets(pedigree, ids);
  if (targets.size === 0) return "Nobody selected.";
  if (sex === "unknown") return null;
  const sexOf = new Map(pedigree.individuals.map(i => [i.id, i.sex]));
  for (const id of targets) sexOf.set(id, sex);
  const name = (id: string) => pedigree.individuals.find(i => i.id === id)?.name?.trim();
  for (const p of pedigree.partnerships) {
    if (!targets.has(p.individual1) && !targets.has(p.individual2)) continue;
    const a = sexOf.get(p.individual1), b = sexOf.get(p.individual2);
    if (a === sex && b === sex) {
      const n1 = name(p.individual1), n2 = name(p.individual2);
      return n1 && n2
        ? `Not available: ${n1} and ${n2} are partners and would both be ${sex}.`
        : `Not available: two partners would both be ${sex}.`;
    }
  }
  return null;
}
