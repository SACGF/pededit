import type { Pedigree } from "@pedigree-editor/layout-engine";
import { ancestorsOf, couplesOf, descendantsOf, parentCoupleOf, partnerIn } from "./graph";

/**
 * Branch removal: which individuals go when someone is removed together
 * with their descendants or their ancestors. Pure set computations; the
 * store applies them. Framework-free so the rules are unit testable.
 */

/** The tooltips of the three ways to remove people (more menu, one person or several). */
export const DELETE_TITLE = "Delete (children stay, as founders)";
export const REMOVE_WITH_DESCENDANTS_TITLE = "Shift+Delete. Also removes everyone below and partners who married in";
export const REMOVE_WITH_ANCESTORS_TITLE = "Alt+Delete. Also removes everyone above; descendants become founders";

/**
 * `people` plus the partners of those people who married in (no parents in
 * the pedigree) and have no partnership with anyone outside the set, repeated
 * until nothing changes. A partner who is a blood relative, or has a
 * partnership with someone outside the set, is not added. Shared by branch
 * removal and hiding descendants (`collapse.ts`).
 */
export function withMarriedInPartners(pedigree: Pedigree, people: Iterable<string>): Set<string> {
  const out = new Set<string>(people);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...out]) {
      for (const p of couplesOf(pedigree, id, { donorPairs: true })) {
        const other = partnerIn(p, id);
        if (out.has(other)) continue;
        const marriedIn = !parentCoupleOf(pedigree, other);
        const onlyWithOut = couplesOf(pedigree, other, { donorPairs: true }).every(q => out.has(partnerIn(q, other)));
        if (marriedIn && onlyWithOut) { out.add(other); changed = true; }
      }
    }
  }
  return out;
}

/**
 * The individuals removed by "remove with descendants": `ids`, everyone below
 * them, and the partners of those people who married in (no parents in the
 * pedigree) and have no partnership with anyone staying. A partner who is a
 * blood relative, or has children by someone outside the branch, stays.
 */
export function removeWithDescendantsSet(pedigree: Pedigree, ids: string[]): Set<string> {
  return withMarriedInPartners(pedigree, [...ids, ...descendantsOf(pedigree, ids)]);
}

/** The individuals removed by "remove with ancestors": `ids` and everyone above them. */
export function removeWithAncestorsSet(pedigree: Pedigree, ids: string[]): Set<string> {
  return new Set<string>([...ids, ...ancestorsOf(pedigree, ids)]);
}

/**
 * Remove a set of individuals from a pedigree in place (an immer draft):
 * their partnerships, their places as children, twin sets, pins and unlock
 * entries. Children of a removed partnership become founders; the rest of
 * the pedigree is kept even when it falls into several pieces.
 */
export function removeIndividuals(draft: Pedigree, gone: Set<string>): void {
  if (gone.size === 0) return;
  const removedPartnerships = new Set(
    draft.partnerships.filter(p => gone.has(p.individual1) || gone.has(p.individual2)).map(p => p.id),
  );
  draft.partnerships = draft.partnerships.filter(p => !removedPartnerships.has(p.id));
  for (const pid of Object.keys(draft.parentOf)) {
    if (removedPartnerships.has(pid)) { delete draft.parentOf[pid]; continue; }
    draft.parentOf[pid] = draft.parentOf[pid]!.filter(c => !gone.has(c));
  }
  for (const p of draft.partnerships) {
    if (!p.twins) continue;
    p.twins = p.twins.map(t => ({ ...t, members: t.members.filter(m => !gone.has(m)) })).filter(t => t.members.length >= 2);
    if (p.twins.length === 0) delete p.twins;
  }
  draft.individuals = draft.individuals.filter(i => !gone.has(i.id));
  dropAssistedLinks(draft, gone);
  if (draft.pinnedPositions) {
    for (const id of gone) delete draft.pinnedPositions[id];
    if (Object.keys(draft.pinnedPositions).length === 0) delete draft.pinnedPositions;
  }
  if (draft.unlockedIndividuals) {
    draft.unlockedIndividuals = draft.unlockedIndividuals.filter(id => !gone.has(id));
    if (draft.unlockedIndividuals.length === 0) delete draft.unlockedIndividuals;
  }
}

/**
 * Clear `carriedBy` and `socialParents` that name someone in `gone`,
 * in place (an immer draft).
 */
export function dropAssistedLinks(draft: Pedigree, gone: Set<string>): void {
  for (const ind of draft.individuals) {
    if (ind.carriedBy && gone.has(ind.carriedBy)) delete ind.carriedBy;
    if (ind.socialParents?.some(id => gone.has(id))) {
      const kept = ind.socialParents.filter(id => !gone.has(id));
      if (kept.length) ind.socialParents = kept; else delete ind.socialParents;
    }
  }
}
