import { expect } from "vitest";
import { usePedigreeStore } from "../usePedigreeStore";

/*
 * "One undo step" and "not an edit", said through what a user can do (undo)
 * rather than through the length of the history, so a change to how the
 * history is kept leaves the tests alone. The store's state object is never
 * changed in place, so a test can put an earlier one back with `setState`.
 */

const store = () => usePedigreeStore.getState();

/**
 * Runs `action`, which must change the pedigree, and checks that one undo
 * puts back the pedigree from before it. Redoes it afterwards, so the test
 * goes on from the edited pedigree. Returns what `action` returned.
 */
export function expectOneUndoStep<T>(action: () => T): T {
  const before = store().pedigree;
  const result = action();
  const after = store().pedigree;
  expect(after, "the action changed nothing").not.toEqual(before);
  store().undo();
  expect(store().pedigree, "one undo does not give back the pedigree from before").toEqual(before);
  store().redo();
  expect(store().pedigree).toEqual(after);
  return result;
}

/**
 * Runs `action` and checks that it was not an edit: the pedigree and
 * `isDirty` are unchanged, and an undo goes where it would have gone before
 * (no step was added). Returns what `action` returned.
 */
export function expectNoEdit<T>(action: () => T): T {
  const before = store();
  const result = action();
  const after = store();
  expect(after.pedigree, "the action changed the pedigree").toEqual(before.pedigree);
  expect(after.isDirty, "the action changed isDirty").toBe(before.isDirty);
  after.undo();
  const undoneAfter = store().pedigree;
  usePedigreeStore.setState(before, true);
  store().undo();
  const undoneBefore = store().pedigree;
  usePedigreeStore.setState(after, true);
  expect(undoneAfter, "the action added an undo step").toEqual(undoneBefore);
  return result;
}
