import type { Pedigree, Individual, Sex, Partnership } from "@pedigree-editor/layout-engine";
import { dropLeftoverPlaceholders } from "../../pedigree/placeholders";

/**
 * Edits to a pedigree in place, for the store's Immer recipes: making
 * people and couples, taking a child out of a family, and the small
 * rules of the saved format (an unset field is absent). None of them
 * touch the store, so each can be read and tested on its own.
 */

export function newId(): string {
  return crypto.randomUUID();
}

/** Find the partnership ID where individualId is a child. Returns null if none. */
export function findParentPartnershipId(
  pedigree: Pedigree,
  individualId: string
): string | null {
  for (const [partnerId, children] of Object.entries(pedigree.parentOf)) {
    if (children.includes(individualId)) return partnerId;
  }
  return null;
}

/** Find all partnership IDs where individualId is individual1 or individual2. */
export function findOwnPartnerships(
  pedigree: Pedigree,
  individualId: string
): string[] {
  return pedigree.partnerships
    .filter(p => p.individual1 === individualId || p.individual2 === individualId)
    .map(p => p.id);
}

/**
 * True when the individual has a partner or children. Children only exist
 * through a partnership, so one check covers both. A pregnancy or pregnancy
 * loss can have neither, see setLifeStatus.
 */
export function hasPartnerOrChild(pedigree: Pedigree, individualId: string): boolean {
  return findOwnPartnerships(pedigree, individualId).length > 0;
}

/** Next sibOrder value within a sibling group (children of partnershipId). */
export function nextSibOrderInFamily(pedigree: Pedigree, partnershipId: string): number {
  const siblings = pedigree.parentOf[partnershipId] ?? [];
  if (siblings.length === 0) return 0;
  const max = Math.max(
    ...siblings.map(id => {
      const ind = pedigree.individuals.find(i => i.id === id);
      return ind?.sibOrder ?? 0;
    })
  );
  return max + 1;
}

/** Next sibOrder for a root individual (no parents) within the root group. */
export function nextRootSibOrder(pedigree: Pedigree): number {
  const rootIds = new Set(
    pedigree.individuals.map(i => i.id)
  );
  // Remove anyone who IS a child
  for (const children of Object.values(pedigree.parentOf)) {
    for (const c of children) rootIds.delete(c);
  }
  if (rootIds.size === 0) return 0;
  const max = Math.max(
    ...[...rootIds].map(id => {
      const ind = pedigree.individuals.find(i => i.id === id);
      return ind?.sibOrder ?? 0;
    })
  );
  return max + 1;
}

export function makeIndividual(sex: Sex, sibOrder: number): Individual {
  return {
    id: newId(),
    sex,
    affected: false,
    sibOrder,
    name: "",
    notes: "",
  };
}

/** The automatic second parent of a single parent's child (`pedigree/placeholders.ts`). */
export function makePlaceholder(sex: Sex): Individual {
  return { ...makeIndividual(sex, 0), placeholder: true };
}

/** The sex a new partner of someone of `sex` is made with; unknown stays unknown. */
export function oppositeSex(sex: Sex): Sex {
  return sex === "male" ? "female" : sex === "female" ? "male" : "unknown";
}

/** `a` and `b` (both in the draft) with the father role first where the sexes say so. */
export function fatherFirst(draft: Pedigree, a: string, b: string): [string, string] {
  const sexOf = (id: string) => draft.individuals.find(i => i.id === id)!.sex;
  return sexOf(a) === "female" || (sexOf(a) === "unknown" && sexOf(b) === "male") ? [b, a] : [a, b];
}

/** A new couple, in the order given, with no children yet. */
export function addCouple(draft: Pedigree, individual1: string, individual2: string): Partnership {
  const partnership: Partnership = { id: newId(), individual1, individual2 };
  draft.partnerships.push(partnership);
  draft.parentOf[partnership.id] = [];
  return partnership;
}

/** A new placeholder partner for `individualId`, of the opposite sex. The caller makes the couple. */
export function addPlaceholderFor(draft: Pedigree, individualId: string): Individual {
  const placeholder = makePlaceholder(oppositeSex(draft.individuals.find(i => i.id === individualId)!.sex));
  draft.individuals.push(placeholder);
  return placeholder;
}

/**
 * Partnership to which a child of individualId should be added: `preferred`
 * when it is one of theirs, else their first, else a new one with a
 * placeholder partner, the person first.
 */
export function ensureChildPartnershipId(draft: Pedigree, individualId: string, preferred?: string): string {
  const ownPs = findOwnPartnerships(draft, individualId);
  if (preferred && ownPs.includes(preferred)) return preferred;
  return ownPs[0] ?? addCouple(draft, individualId, addPlaceholderFor(draft, individualId).id).id;
}

/** Take an individual out of any twin set; a set left with one member is dropped. */
export function removeFromTwinSets(draft: Pedigree, individualId: string): void {
  for (const p of draft.partnerships) {
    if (!p.twins) continue;
    p.twins = p.twins
      .map(t => ({ ...t, members: t.members.filter(m => m !== individualId) }))
      .filter(t => t.members.length >= 2);
    if (p.twins.length === 0) delete p.twins;
  }
}

/**
 * Take `childId` out of the couple `before` they are a child of: their
 * place among its children and in its twin sets. Follow it with
 * `tidyCoupleLeft` once the child has their new place, which may be with
 * the same couple or donor.
 */
export function leaveParents(draft: Pedigree, before: Partnership, childId: string): void {
  draft.parentOf[before.id] = (draft.parentOf[before.id] ?? []).filter(c => c !== childId);
  removeFromTwinSets(draft, childId);
}

/**
 * What is left of the couple `before` after a child moved away: a donor
 * pair with no child is not a couple and goes, as does a placeholder
 * partner left with nothing (`dropLeftoverPlaceholders`).
 */
export function tidyCoupleLeft(draft: Pedigree, before: Partnership): void {
  if (before.donorConception && (draft.parentOf[before.id] ?? []).length === 0) {
    draft.partnerships = draft.partnerships.filter(p => p.id !== before.id);
    delete draft.parentOf[before.id];
  }
  dropLeftoverPlaceholders(draft, [before.individual1, before.individual2]);
}

/** Whether an in-place edit would change the person, tried on a copy (store state is frozen). */
export function dryRun(ind: Individual, edit: (copy: Individual) => boolean): boolean {
  return edit(JSON.parse(JSON.stringify(ind)) as Individual);
}

/**
 * Set an optional field, or delete it when the value is undefined, false or
 * "": a field that is not set is saved as absent, never as false or empty.
 */
export function setOptional<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined | false | ""): void {
  if (value === undefined || value === false || value === "") delete obj[key];
  else obj[key] = value as T[K];
}

/** Drop an individual's age of onset for one tag, and the map when it empties. */
export function removeTagOnset(ind: Individual, tagId: string): void {
  if (!ind.tagOnset || !(tagId in ind.tagOnset)) return;
  delete ind.tagOnset[tagId];
  if (Object.keys(ind.tagOnset).length === 0) delete ind.tagOnset;
}

/**
 * Give or take a tag that is not a condition (a condition goes through
 * `applyConditionState`). The person's list is kept in the pedigree's tag
 * order so the drawing is stable; taking a tag drops its age of onset.
 */
export function setPlainTag(ind: Individual, tagId: string, on: boolean, pedigree: Pedigree): void {
  if ((ind.tags?.includes(tagId) ?? false) === on) return;
  if (on) {
    const order = new Map((pedigree.tags ?? []).map((t, i) => [t.id, i]));
    ind.tags = [...(ind.tags ?? []), tagId].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  } else {
    ind.tags = ind.tags!.filter(t => t !== tagId);
    if (ind.tags.length === 0) delete ind.tags;
    removeTagOnset(ind, tagId);
  }
}

/** Forget the pinned positions of `ids`, so the layout places them again. */
export function dropPins(draft: Pedigree, ids: Iterable<string>): void {
  if (!draft.pinnedPositions) return;
  for (const id of ids) delete draft.pinnedPositions[id];
  if (Object.keys(draft.pinnedPositions).length === 0) delete draft.pinnedPositions;
}

/** A child contradicts a childless mark, so adding one removes the mark. */
export function clearChildless(draft: Pedigree, partnershipId: string): void {
  const p = draft.partnerships.find(x => x.id === partnershipId);
  if (!p) return;
  delete p.childless;
  delete p.childlessReason;
}
