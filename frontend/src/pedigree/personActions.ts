import type { Individual, Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { hasParents } from "./graph";
import { NO_CHILDREN_TITLE, NO_PARTNER_TITLE } from "./lifeStatus";

export type PersonAddKey = "parents" | "son" | "daughter" | "child" | "sibling" | "partner";

export interface PersonAddAction {
  key: PersonAddKey;
  /** What the button shows: the hover pill shows it alone, the Person tab above `label`. */
  glyph: string;
  /** The short word under the glyph on the Person tab. */
  label: string;
  /** The tooltip and accessible name. */
  title: string;
  disabled: boolean;
  /** Why it is disabled, for the menus and the Person tab's hint. */
  reason?: string;
  /**
   * Shown on wide screens only: on a phone the pill is already wider than
   * the screen, and the more menu has the same item (#243).
   */
  wideOnly?: boolean;
}

/** Why "Add sibling" is disabled for someone with no parents (#243). */
export const ADD_SIBLING_NEEDS_PARENTS = "Add parents first: a sibling shares this person's parents";
/** Why "Add parents" is disabled for someone who has them. */
export const ADD_PARENTS_HAS_PARENTS = "Already has parents: use Replace parents... in the more menu";

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
  const why = (on: boolean, reason: string) => (on ? { disabled: true, reason } : { disabled: false });
  return [
    { key: "parents", glyph: "↑", label: "Parents", title: "Add parents", ...why(parents, ADD_PARENTS_HAS_PARENTS) },
    { key: "son", glyph: "□↓", label: "Son", title: "Add son", ...why(noChildren, NO_CHILDREN_TITLE) },
    { key: "daughter", glyph: "○↓", label: "Daughter", title: "Add daughter", ...why(noChildren, NO_CHILDREN_TITLE) },
    { key: "child", glyph: "◇↓", label: "Child", title: "Add child (unknown sex)", ...why(noChildren, NO_CHILDREN_TITLE) },
    { key: "sibling", glyph: "←│→", label: "Sibling", title: "Add sibling", ...why(!parents, ADD_SIBLING_NEEDS_PARENTS) },
    // The commonest relative after a child (#243): on the pill on wide screens.
    { key: "partner", glyph: "─◇", label: "Partner", title: "Add partner", wideOnly: true, ...why(!!individual.lifeStatus, NO_PARTNER_TITLE) },
  ];
}

/** The store actions the add buttons call. */
export interface PersonAddEdits {
  addParent: (id: string, sex: Sex) => void;
  addChild: (id: string, sex: Sex) => void;
  addSibling: (id: string) => void;
  addPartner: (id: string) => void;
}

/** Make the edit of one add button. */
export function runPersonAdd(key: PersonAddKey, id: string, edits: PersonAddEdits): void {
  switch (key) {
    case "parents": return edits.addParent(id, "male");
    case "son": return edits.addChild(id, "male");
    case "daughter": return edits.addChild(id, "female");
    case "child": return edits.addChild(id, "unknown");
    case "sibling": return edits.addSibling(id);
    case "partner": return edits.addPartner(id);
  }
}

/** The lock button beside them, shown while "nodes moveable" is off. */
export function lockActionTitle(unlocked: boolean): string {
  return unlocked ? "Lock position" : "Unlock to drag";
}
