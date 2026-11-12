import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Batch lock and unlock for a multiple selection (#21), shared by the more
 * menu and the edit panel. `toUnlock` are the selected people still locked;
 * `toLock` are those unlocked or pinned, which locking returns to the auto
 * layout. With "nodes moveable" on in settings everyone drags, so there is
 * nothing to unlock.
 */
export function batchLockState(pedigree: Pedigree, ids: string[]): { toUnlock: string[]; toLock: string[] } {
  const unlocked = new Set(pedigree.unlockedIndividuals ?? []);
  const pinned = pedigree.pinnedPositions ?? {};
  const moveable = pedigree.canvasSettings?.nodesMoveable ?? false;
  return {
    toUnlock: moveable ? [] : ids.filter(id => !unlocked.has(id)),
    toLock: ids.filter(id => unlocked.has(id) || !!pinned[id]),
  };
}
