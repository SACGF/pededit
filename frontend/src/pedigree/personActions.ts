import type { Individual, Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { hasParents } from "./graph";

export type PersonAddKey = "parents" | "son" | "daughter" | "child" | "sibling";

export interface PersonAddAction {
  key: PersonAddKey;
  /** What the button shows: the hover pill shows it alone, the Person tab above `label`. */
  glyph: string;
  /** The short word under the glyph on the Person tab. */
  label: string;
  /** The tooltip and accessible name. */
  title: string;
  disabled: boolean;
}

/**
 * The add buttons of the hover pill and of the Person tab's row
 * (`components/PersonActions.tsx`), so the two always offer the same.
 * Read from the stored pedigree, never the drawn one: under a view filter a
 * married-in partner's parents are not drawn but are still there, and
 * "Add parents" must not offer to add them again.
 */
export function personAddActions(pedigree: Pedigree, individual: Individual): PersonAddAction[] {
  const parents = hasParents(pedigree, individual.id);
  // A pregnancy or pregnancy loss cannot have children.
  const noChildren = !!individual.lifeStatus;
  return [
    { key: "parents", glyph: "↑", label: "Parents", title: "Add parents", disabled: parents },
    { key: "son", glyph: "□↓", label: "Son", title: "Add son", disabled: noChildren },
    { key: "daughter", glyph: "○↓", label: "Daughter", title: "Add daughter", disabled: noChildren },
    { key: "child", glyph: "◇↓", label: "Child", title: "Add child (unknown sex)", disabled: noChildren },
    { key: "sibling", glyph: "←│→", label: "Sibling", title: "Add sibling", disabled: !parents },
  ];
}

/** The store actions the add buttons call. */
export interface PersonAddEdits {
  addParent: (id: string, sex: Sex) => void;
  addChild: (id: string, sex: Sex) => void;
  addSibling: (id: string) => void;
}

/** Make the edit of one add button. */
export function runPersonAdd(key: PersonAddKey, id: string, edits: PersonAddEdits): void {
  switch (key) {
    case "parents": return edits.addParent(id, "male");
    case "son": return edits.addChild(id, "male");
    case "daughter": return edits.addChild(id, "female");
    case "child": return edits.addChild(id, "unknown");
    case "sibling": return edits.addSibling(id);
  }
}

/** The lock button beside them, shown while "nodes moveable" is off. */
export function lockActionTitle(unlocked: boolean): string {
  return unlocked ? "Lock position" : "Unlock to drag";
}
