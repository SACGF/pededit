import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Branch removal (#34): which individuals go when someone is removed together
 * with their descendants or their ancestors. Pure set computations; the
 * store applies them. Framework-free so the rules are unit testable.
 */

function partnershipsOf(pedigree: Pedigree, id: string) {
  return pedigree.partnerships.filter(p => p.individual1 === id || p.individual2 === id);
}

function parentPartnershipOf(pedigree: Pedigree, id: string) {
  return pedigree.partnerships.find(p => (pedigree.parentOf[p.id] ?? []).includes(id));
}

/** Everyone below any of `ids` through their partnerships, not including `ids` themselves. */
export function descendantsOf(pedigree: Pedigree, ids: string[]): Set<string> {
  const out = new Set<string>();
  const queue = [...ids];
  while (queue.length) {
    const id = queue.shift()!;
    for (const p of partnershipsOf(pedigree, id)) {
      for (const child of pedigree.parentOf[p.id] ?? []) {
        if (!out.has(child) && !ids.includes(child)) { out.add(child); queue.push(child); }
      }
    }
  }
  return out;
}

/** Everyone above any of `ids` (parents, their parents, ...), not including `ids` themselves. */
export function ancestorsOf(pedigree: Pedigree, ids: string[]): Set<string> {
  const out = new Set<string>();
  const queue = [...ids];
  while (queue.length) {
    const id = queue.shift()!;
    const p = parentPartnershipOf(pedigree, id);
    if (!p) continue;
    for (const parent of [p.individual1, p.individual2]) {
      if (!out.has(parent) && !ids.includes(parent)) { out.add(parent); queue.push(parent); }
    }
  }
  return out;
}

/**
 * `people` plus the partners of those people who married in (no parents in
 * the pedigree) and have no partnership with anyone outside the set, repeated
 * until nothing changes. A partner who is a blood relative, or has a
 * partnership with someone outside the set, is not added. Shared by branch
 * removal (#34) and hiding descendants (#94, `collapse.ts`).
 */
export function withMarriedInPartners(pedigree: Pedigree, people: Iterable<string>): Set<string> {
  const out = new Set<string>(people);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...out]) {
      for (const p of partnershipsOf(pedigree, id)) {
        const other = p.individual1 === id ? p.individual2 : p.individual1;
        if (out.has(other)) continue;
        const marriedIn = !parentPartnershipOf(pedigree, other);
        const onlyWithOut = partnershipsOf(pedigree, other).every(q =>
          out.has(q.individual1 === other ? q.individual2 : q.individual1));
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
  if (draft.pinnedPositions) {
    for (const id of gone) delete draft.pinnedPositions[id];
    if (Object.keys(draft.pinnedPositions).length === 0) delete draft.pinnedPositions;
  }
  if (draft.unlockedIndividuals) {
    draft.unlockedIndividuals = draft.unlockedIndividuals.filter(id => !gone.has(id));
    if (draft.unlockedIndividuals.length === 0) delete draft.unlockedIndividuals;
  }
}
