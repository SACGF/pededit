import type { Pedigree } from "@pedigree-editor/layout-engine";
import { descendantsOf } from "./removal";
import { hasDescendants } from "./collapse";

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

/**
 * Hiding and showing descendants for a multiple selection (#1): `toHide`
 * are the selected people with descendants whose descendants are drawn,
 * leaving out anyone below another of them (their flag would hide nothing
 * more, and would linger after the branch above is shown again); `toShow`
 * are the selected people whose descendants are hidden.
 */
export function batchCollapseState(pedigree: Pedigree, ids: string[]): { toHide: string[]; toShow: string[] } {
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const sel = ids.filter(id => byId.has(id));
  const candidates = sel.filter(id => !byId.get(id)!.descendantsHidden && hasDescendants(pedigree, id));
  // One at a time: descendantsOf leaves out the ids it starts from.
  const below = new Set(candidates.flatMap(c => [...descendantsOf(pedigree, [c])]));
  return {
    toHide: candidates.filter(id => !below.has(id)),
    toShow: sel.filter(id => byId.get(id)!.descendantsHidden && hasDescendants(pedigree, id)),
  };
}
