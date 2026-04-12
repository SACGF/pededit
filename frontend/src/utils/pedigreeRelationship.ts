import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Returns the set of all ancestor IDs for the given individual within the pedigree.
 * Does not include the individual itself.
 */
export function getAncestors(pedigree: Pedigree, individualId: string): Set<string> {
  // Build parent lookup: childId → [parent1Id, parent2Id]
  const parentLookup = new Map<string, [string, string]>();
  for (const partnership of pedigree.partnerships) {
    const children = pedigree.parentOf[partnership.id] ?? [];
    for (const childId of children) {
      parentLookup.set(childId, [partnership.individual1, partnership.individual2]);
    }
  }

  function collect(id: string, visited: Set<string>): Set<string> {
    if (visited.has(id)) return new Set(); // cycle guard
    visited.add(id);
    const result = new Set<string>();
    const parents = parentLookup.get(id);
    if (!parents) return result;
    for (const parentId of parents) {
      result.add(parentId);
      for (const a of collect(parentId, visited)) result.add(a);
    }
    return result;
  }

  return collect(individualId, new Set());
}

/**
 * Returns true if two individuals share any ancestor in the pedigree,
 * or if one is an ancestor of the other.
 * Used to auto-detect consanguinity when creating partnerships.
 */
export function shareAncestor(pedigree: Pedigree, id1: string, id2: string): boolean {
  const anc1 = getAncestors(pedigree, id1);
  const anc2 = getAncestors(pedigree, id2);
  if (anc1.has(id2) || anc2.has(id1)) return true;
  for (const a of anc1) {
    if (anc2.has(a)) return true;
  }
  return false;
}
