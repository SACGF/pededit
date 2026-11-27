/**
 * What the editor can do, as data (#243): the targets a selection is, every
 * action declared against a target kind, and three tables that make a
 * missing action visible, each cell an action or the reason there is none.
 * `__tests__/actionInventory.test.ts` fails on a cell that is neither, on an
 * add without its inverse, and on a store action nothing reaches.
 *
 * The menus, the hover pill and the Person tab are still written by hand
 * (the Person tab is forms; some items open a panel in the menu). This is
 * the inventory they are checked against, not a renderer. A new action goes
 * here and in the surface that shows it; a new store action in
 * `STORE_ACTIONS`.
 */
import type { Pedigree } from "@pedigree-editor/layout-engine";
import type { CoupleSlice, PersonSlice, StructureSlice } from "../store/pedigree/state";
import { coupleOfPair, personCouples } from "./partners";
import { parentCoupleOf } from "./graph";

// ── Targets ─────────────────────────────────────────────────────────────────

/** Something an action acts on. A selection is every target it is. */
export type Target =
  | { kind: "person"; id: string }
  | { kind: "couple"; partnershipId: string }
  /** Two people who are not partners. */
  | { kind: "pair"; a: string; b: string }
  /** Two or more children of one couple. */
  | { kind: "siblings"; partnershipId: string; ids: string[] }
  /** Two or more people: the batch. */
  | { kind: "people"; ids: string[] };

export type TargetKind = Target["kind"];

/**
 * Every target a selection is, or a right-clicked couple line
 * (`partnershipId` with nothing selected). One person is `person` plus a
 * `couple` for each couple they are in; two partners are `couple` and
 * `people`; two unrelated people `pair` and `people`; two brothers
 * `siblings`, `pair` and `people`. A donor pair is not a couple.
 */
export function selectionTargets(pedigree: Pedigree, ids: string[], partnershipId?: string): Target[] {
  const known = ids.filter(id => pedigree.individuals.some(i => i.id === id));
  if (known.length === 0) {
    const p = partnershipId && pedigree.partnerships.find(x => x.id === partnershipId && !x.donorConception);
    return p ? [{ kind: "couple", partnershipId: p.id }] : [];
  }
  if (known.length === 1) {
    const id = known[0]!;
    return [
      { kind: "person", id },
      ...personCouples(pedigree, id).filter(c => !c.donorPair).map(c => ({ kind: "couple" as const, partnershipId: c.partnershipId })),
    ];
  }
  const out: Target[] = [];
  const couple = known.length === 2 ? coupleOfPair(pedigree, known) : null;
  const parents = known.map(id => parentCoupleOf(pedigree, id)?.id);
  if (parents[0] && parents.every(p => p === parents[0])) out.push({ kind: "siblings", partnershipId: parents[0], ids: known });
  if (couple) out.push({ kind: "couple", partnershipId: couple.id });
  else if (known.length === 2) out.push({ kind: "pair", a: known[0]!, b: known[1]! });
  out.push({ kind: "people", ids: known });
  return out;
}

// ── Actions ─────────────────────────────────────────────────────────────────

/** Where an action is shown. */
export type Surface = "pill" | "menu" | "personTab" | "coupleMenu" | "batchMenu" | "shortcut";

export interface ActionSpec {
  target: TargetKind;
  /** The item's words, as shown. */
  label: string;
  surfaces: Surface[];
  /** Not an edit and in no table: it only selects or shows something. */
  view?: true;
  /** For an action that adds or links: the action that undoes it (an `ActionId`, checked by the tests), or why there is none. */
  inverse?: string | { reason: string };
}

/**
 * Every action, by id. Labels are what the surfaces show; the surfaces
 * render them by hand, so a label changed in one place is changed here too.
 */
export const ACTIONS = {
  // One person: relations.
  "person.addPartner": { target: "person", label: "Add partner", surfaces: ["menu", "pill"], inverse: "couple.removePartnership" },
  "person.addExistingPartner": { target: "person", label: "Add existing partner...", surfaces: ["menu"], inverse: "couple.removePartnership" },
  "person.addParents": { target: "person", label: "Add parents", surfaces: ["pill", "personTab", "menu"], inverse: "person.detachFromParents" },
  "person.setParents": { target: "person", label: "Set parents...", surfaces: ["menu"], inverse: "person.detachFromParents" },
  "person.detachFromParents": { target: "person", label: "Detach from parents", surfaces: ["menu"] },
  "person.addChildren": { target: "person", label: "Add children...", surfaces: ["pill", "personTab", "menu"], inverse: { reason: "A new child is removed by deleting them; Detach from parents keeps them." } },
  "person.addExistingChild": { target: "person", label: "Add existing child...", surfaces: ["menu"], inverse: "person.detachFromParents" },
  "person.addSibling": { target: "person", label: "Add sibling", surfaces: ["pill", "personTab", "menu"], inverse: { reason: "A new sibling is removed by deleting them." } },
  "person.addDonor": { target: "person", label: "Add sperm donor / Add egg donor", surfaces: ["menu"], inverse: "person.removeDonor" },
  "person.addExistingDonor": { target: "person", label: "Existing sperm donor... / Existing egg donor...", surfaces: ["menu"], inverse: "person.removeDonor" },
  "person.removeDonor": { target: "person", label: "Remove donor", surfaces: ["menu"] },
  "person.addSurrogate": { target: "person", label: "Add surrogate", surfaces: ["menu"], inverse: "person.removeSurrogate" },
  "person.addExistingSurrogate": { target: "person", label: "Existing surrogate...", surfaces: ["menu"], inverse: "person.removeSurrogate" },
  "person.removeSurrogate": { target: "person", label: "Remove surrogate", surfaces: ["menu"] },
  "person.socialParents": { target: "person", label: "Social parents (Person tab)", surfaces: ["personTab"], inverse: "person.socialParents" },
  "person.carriedBy": { target: "person", label: "Carried by (Person tab)", surfaces: ["personTab"], inverse: "person.carriedBy" },
  "person.twins": { target: "person", label: "Twins", surfaces: ["menu", "personTab"], inverse: "person.notTwin" },
  "person.notTwin": { target: "person", label: "Not a twin", surfaces: ["menu", "personTab"] },
  "person.moveSibling": { target: "person", label: "Move left / Move right", surfaces: ["menu"] },
  // One person: what is recorded.
  "person.affected": { target: "person", label: "Mark affected", surfaces: ["menu", "personTab", "shortcut"] },
  "person.deceased": { target: "person", label: "Mark deceased", surfaces: ["menu", "personTab", "shortcut"] },
  "person.carrier": { target: "person", label: "Mark carrier", surfaces: ["menu", "personTab"] },
  "person.presymptomatic": { target: "person", label: "Presymptomatic carrier", surfaces: ["menu", "personTab"] },
  "person.proband": { target: "person", label: "Mark as proband", surfaces: ["menu", "personTab"] },
  "person.consultand": { target: "person", label: "Mark as consultand", surfaces: ["menu", "personTab"] },
  "person.familyHistoryUnknown": { target: "person", label: "Family history not known", surfaces: ["menu", "personTab"] },
  "person.adoption": { target: "person", label: "Adoption", surfaces: ["menu", "personTab"] },
  "person.lifeStatus": { target: "person", label: "Pregnancy / loss", surfaces: ["menu", "personTab"] },
  "person.sex": { target: "person", label: "Sex", surfaces: ["menu", "personTab"] },
  "person.condition": { target: "person", label: "Affected with / Carrier of (a condition)", surfaces: ["menu", "personTab"] },
  "person.tag": { target: "person", label: "A tag", surfaces: ["menu", "personTab"] },
  "person.details": { target: "person", label: "Name, dates, age, notes, evaluations, onset, gender identity (Person tab)", surfaces: ["personTab"] },
  "person.lock": { target: "person", label: "Unlock to drag / Lock position", surfaces: ["pill"] },
  "person.unpin": { target: "person", label: "Unpin position", surfaces: ["menu"] },
  // One person: scope.
  "person.selectDescendants": { target: "person", label: "Select with descendants", surfaces: ["menu"] },
  "person.selectAncestors": { target: "person", label: "Select with ancestors", surfaces: ["menu"] },
  "person.relatedness": { target: "person", label: "Relatedness to...", surfaces: ["menu"], view: true },
  "person.hideDescendants": { target: "person", label: "Hide descendants", surfaces: ["menu"] },
  "person.delete": { target: "person", label: "Delete", surfaces: ["menu", "shortcut"] },
  "person.removeWithDescendants": { target: "person", label: "Remove with descendants", surfaces: ["menu", "shortcut"] },
  "person.removeWithAncestors": { target: "person", label: "Remove with ancestors", surfaces: ["menu", "shortcut"] },
  // A couple.
  "couple.addChildren": { target: "couple", label: "Add son / Add daughter / Add child of unknown sex", surfaces: ["coupleMenu"], inverse: { reason: "A new child is removed by deleting them." } },
  "couple.addExistingChild": { target: "couple", label: "Add existing child...", surfaces: ["coupleMenu"], inverse: "person.detachFromParents" },
  "couple.consanguineous": { target: "couple", label: "Consanguineous", surfaces: ["coupleMenu", "personTab"] },
  "couple.consanguinityLabel": { target: "couple", label: "Text above line...", surfaces: ["coupleMenu"] },
  "couple.ended": { target: "couple", label: "Relationship ended", surfaces: ["coupleMenu", "personTab"] },
  "couple.childless": { target: "couple", label: "Couple without children", surfaces: ["coupleMenu", "personTab"] },
  "couple.childlessReason": { target: "couple", label: "Reason (Person tab)", surfaces: ["personTab"] },
  "couple.swapSides": { target: "couple", label: "Swap sides", surfaces: ["coupleMenu"] },
  "couple.drawBeside": { target: "couple", label: "Draw this couple beside", surfaces: ["coupleMenu"] },
  "couple.removePartnership": { target: "couple", label: "Remove partnership", surfaces: ["coupleMenu"] },
  // Two people who are not partners.
  "pair.makePartners": { target: "pair", label: "Make partners", surfaces: ["batchMenu"], inverse: "couple.removePartnership" },
  // Siblings.
  "siblings.twins": { target: "siblings", label: "Twins", surfaces: ["batchMenu"], inverse: "siblings.notTwins" },
  "siblings.notTwins": { target: "siblings", label: "Not twins", surfaces: ["batchMenu"] },
  // The batch.
  "people.affected": { target: "people", label: "Mark N affected", surfaces: ["batchMenu", "shortcut"] },
  "people.deceased": { target: "people", label: "Mark N deceased", surfaces: ["batchMenu", "shortcut"] },
  "people.carrier": { target: "people", label: "Mark N carrier / presymptomatic / clear", surfaces: ["batchMenu"] },
  "people.consultand": { target: "people", label: "Mark N as consultands", surfaces: ["batchMenu"] },
  "people.familyHistoryUnknown": { target: "people", label: "Family history not known for N", surfaces: ["batchMenu"] },
  "people.adoption": { target: "people", label: "Adoption of N", surfaces: ["batchMenu"] },
  "people.sex": { target: "people", label: "Sex of N", surfaces: ["batchMenu"] },
  "people.condition": { target: "people", label: "Conditions of N", surfaces: ["batchMenu"] },
  "people.tag": { target: "people", label: "Tags of N", surfaces: ["batchMenu"] },
  "people.lock": { target: "people", label: "Unlock N / Lock N", surfaces: ["batchMenu"] },
  "people.unpin": { target: "people", label: "Unpin N", surfaces: ["batchMenu"] },
  "people.hideDescendants": { target: "people", label: "Hide descendants of N", surfaces: ["batchMenu"] },
  "people.setParents": { target: "people", label: "Set parents of N...", surfaces: ["batchMenu"], inverse: "people.detachFromParents" },
  "people.detachFromParents": { target: "people", label: "Detach N from parents", surfaces: ["batchMenu"] },
  "people.delete": { target: "people", label: "Delete N", surfaces: ["batchMenu", "shortcut"] },
  "people.removeWithDescendants": { target: "people", label: "Remove N with descendants", surfaces: ["batchMenu", "shortcut"] },
  "people.removeWithAncestors": { target: "people", label: "Remove N with ancestors", surfaces: ["batchMenu", "shortcut"] },
} as const satisfies Record<string, ActionSpec>;

export type ActionId = keyof typeof ACTIONS;

/** A table cell: the action that does it, or why there is none. */
export type Cell = ActionId | ActionId[] | { reason: string };

// ── Table 1: relation by verb ───────────────────────────────────────────────

export const RELATIONS = ["partner", "parents", "child", "sibling", "twin", "spermDonor", "eggDonor", "surrogate", "socialParent"] as const;
export const RELATION_VERBS = ["new", "existing", "remove"] as const;

export const RELATION_TABLE: Record<(typeof RELATIONS)[number], Record<(typeof RELATION_VERBS)[number], Cell>> = {
  partner: {
    new: "person.addPartner",
    existing: ["person.addExistingPartner", "pair.makePartners"],
    remove: "couple.removePartnership",
  },
  parents: {
    new: "person.addParents",
    existing: ["person.setParents", "people.setParents"],
    remove: ["person.detachFromParents", "people.detachFromParents"],
  },
  child: {
    new: ["person.addChildren", "couple.addChildren"],
    existing: ["person.addExistingChild", "couple.addExistingChild"],
    remove: { reason: "A child leaves its parents with Detach from parents on the child." },
  },
  sibling: {
    new: "person.addSibling",
    existing: { reason: "Making someone a sibling is giving them the same parents: Set parents... on the other person." },
    remove: { reason: "A sibling is not a link of its own: Detach from parents on either." },
  },
  twin: {
    new: { reason: "Add a sibling, then make the two twins." },
    existing: ["person.twins", "siblings.twins"],
    remove: ["person.notTwin", "siblings.notTwins"],
  },
  spermDonor: { new: "person.addDonor", existing: "person.addExistingDonor", remove: "person.removeDonor" },
  eggDonor: { new: "person.addDonor", existing: "person.addExistingDonor", remove: "person.removeDonor" },
  surrogate: { new: "person.addSurrogate", existing: "person.addExistingSurrogate", remove: "person.removeSurrogate" },
  socialParent: {
    new: { reason: "Social parents are picked from people on the tree: add the person, then pick them on the Person tab." },
    existing: "person.socialParents",
    remove: "person.socialParents",
  },
};

// ── Table 2: per-person flag by reach ───────────────────────────────────────

export const FLAGS = [
  "affected", "deceased", "carrier", "presymptomatic", "proband", "consultand", "familyHistoryUnknown",
  "adoption", "lifeStatus", "sex", "condition", "tag", "lock", "pin",
] as const;

export const FLAG_TABLE: Record<(typeof FLAGS)[number], { one: Cell; several: Cell }> = {
  affected: { one: "person.affected", several: "people.affected" },
  deceased: { one: "person.deceased", several: "people.deceased" },
  carrier: { one: "person.carrier", several: "people.carrier" },
  presymptomatic: { one: "person.presymptomatic", several: "people.carrier" },
  proband: { one: "person.proband", several: { reason: "A pedigree has one proband." } },
  consultand: { one: "person.consultand", several: "people.consultand" },
  familyHistoryUnknown: { one: "person.familyHistoryUnknown", several: "people.familyHistoryUnknown" },
  adoption: { one: "person.adoption", several: "people.adoption" },
  lifeStatus: { one: "person.lifeStatus", several: { reason: "A pregnancy or loss is one person's, with its own rules (no partner, no children): set it on each." } },
  sex: { one: "person.sex", several: "people.sex" },
  condition: { one: "person.condition", several: "people.condition" },
  tag: { one: "person.tag", several: "people.tag" },
  lock: { one: "person.lock", several: "people.lock" },
  pin: { one: "person.unpin", several: "people.unpin" },
};

// ── Table 3: scope by verb ──────────────────────────────────────────────────

export const SCOPES = ["person", "withDescendants", "withAncestors"] as const;
export const SCOPE_VERBS = ["select", "hide", "remove"] as const;

export const SCOPE_TABLE: Record<(typeof SCOPE_VERBS)[number], Record<(typeof SCOPES)[number], Cell>> = {
  select: {
    person: { reason: "A click selects a person; Shift+click adds to the selection." },
    withDescendants: "person.selectDescendants",
    withAncestors: "person.selectAncestors",
  },
  hide: {
    person: { reason: "Hiding one person would break the lines through them; view filters hide whole sides." },
    withDescendants: ["person.hideDescendants", "people.hideDescendants"],
    withAncestors: { reason: "A hidden branch is drawn as a marker under the person; nothing can be drawn above them for hidden ancestors." },
  },
  remove: {
    person: ["person.delete", "people.delete"],
    withDescendants: ["person.removeWithDescendants", "people.removeWithDescendants"],
    withAncestors: ["person.removeWithAncestors", "people.removeWithAncestors"],
  },
};

// ── Store actions ───────────────────────────────────────────────────────────

type EditActions = keyof StructureSlice | keyof PersonSlice | keyof CoupleSlice;

/**
 * Every edit action of the store, and the inventory action that reaches it,
 * or why it is internal. Typed over every key, so a new store action does
 * not compile until it is reached or explained.
 */
export const STORE_ACTIONS: Record<EditActions, ActionId | { internal: string }> = {
  addIndividual: { internal: "The toolbar's add buttons, for a person with no relation yet." },
  addParent: "person.addParents",
  addChild: "person.addChildren",
  addChildren: "person.addChildren",
  addSibling: "person.addSibling",
  addPartner: "person.addPartner",
  linkPartner: "person.addExistingPartner",
  deleteIndividual: "person.delete",
  deleteIndividuals: "people.delete",
  removeWithDescendants: "person.removeWithDescendants",
  removeWithAncestors: "person.removeWithAncestors",
  setParents: "person.setParents",
  setParentsMany: "people.setParents",
  setSameSexChild: "couple.addExistingChild",
  detachFromParents: "person.detachFromParents",
  detachFromParentsMany: "people.detachFromParents",
  removePartnership: "couple.removePartnership",
  moveSibLeft: "person.moveSibling",
  moveSibRight: "person.moveSibling",
  addDonor: "person.addDonor",
  addSurrogate: "person.addSurrogate",
  removeDonor: "person.removeDonor",
  removeSurrogate: "person.removeSurrogate",
  updateIndividual: "person.details",
  setSex: "person.sex",
  setAffected: "person.affected",
  setConditionStatus: "person.condition",
  setCarrier: "person.carrier",
  setPresymptomatic: "person.presymptomatic",
  setDeceased: "person.deceased",
  setDateOfDeath: "person.details",
  setLifeStatus: "person.lifeStatus",
  setEvaluations: "person.details",
  setProband: "person.proband",
  setConsultand: "person.consultand",
  setFamilyHistoryUnknown: "person.familyHistoryUnknown",
  setAdopted: "person.adoption",
  setReproductiveRole: { internal: "The Person tab's donor or surrogate role, set and cleared on the form." },
  setCarriedBy: "person.carriedBy",
  setSocialParents: "person.socialParents",
  setIndividualTag: "person.tag",
  setOnset: "person.details",
  setAffectedMany: "people.affected",
  setDeceasedMany: "people.deceased",
  setCarrierStatusMany: "people.carrier",
  setSexMany: "people.sex",
  setIndividualTagMany: "people.tag",
  setConditionStatusMany: "people.condition",
  setConsultandMany: "people.consultand",
  setFamilyHistoryUnknownMany: "people.familyHistoryUnknown",
  setAdoptedMany: "people.adoption",
  setTwins: "person.twins",
  removeTwin: "person.notTwin",
  removeTwins: "siblings.notTwins",
  setPartnershipChildless: "couple.childless",
  setPartnershipChildlessReason: "couple.childlessReason",
  setPartnershipConsanguineous: "couple.consanguineous",
  setPartnershipConsanguinityLabel: "couple.consanguinityLabel",
  setPartnershipEnded: "couple.ended",
  swapPartnerSides: "couple.swapSides",
  setCoupleDrawnBeside: "couple.drawBeside",
};

/** The actions a cell names. */
export function cellActions(cell: Cell): ActionId[] {
  return typeof cell === "string" ? [cell] : Array.isArray(cell) ? cell : [];
}

// ── Availability ────────────────────────────────────────────────────────────

/**
 * Why "Move left" or "Move right" does nothing for this person (#243, row
 * 15), or null when it moves them.
 */
export function moveSiblingProblem(pedigree: Pedigree, id: string, direction: -1 | 1): string | null {
  const p = parentCoupleOf(pedigree, id);
  if (!p) return "No parents drawn: sibling order is among the children of one couple";
  const order = (pedigree.parentOf[p.id] ?? [])
    .map(c => pedigree.individuals.find(i => i.id === c))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .sort((a, b) => a.sibOrder - b.sibOrder)
    .map(i => i.id);
  if (order.length < 2) return "An only child: there is no sibling to swap with";
  const at = order.indexOf(id);
  if (direction < 0 && at === 0) return "Already the first of the siblings";
  if (direction > 0 && at === order.length - 1) return "Already the last of the siblings";
  return null;
}
