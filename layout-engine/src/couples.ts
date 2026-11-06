import type { LayoutInput, LayoutResult, Pedigree } from "./types.js";

/**
 * Helpers for working out which two people a spouse marker actually joins.
 *
 * alignped1 lays out someone with several partners as a single run of
 * marriage-linked slots, e.g. a man with three wives becomes
 *
 *     wife2 ~ man ~ wife1 ~ wife3
 *
 * with a spouse marker on every slot but the last. The marker between wife1 and
 * wife3 does not mean they are a couple: it is the man's marriage line passing
 * through wife1 to reach wife3 (kinship2 draws it straight through). Renderers
 * use resolveCouple() to find the real partner so the line can hop over the
 * intermediate slot instead.
 */

/** Set of partner pairs keyed by 1-based individual index, both directions. */
export type PartnerSet = Set<number>;

function pairKey(a: number, b: number): number {
  return Math.min(a, b) * 1_000_003 + Math.max(a, b);
}

/** Partner pairs implied by the parent indices of a LayoutInput. */
export function buildPartnerSet(input: LayoutInput): PartnerSet {
  const set: PartnerSet = new Set();
  for (let i = 1; i <= input.n; i++) {
    const d = input.findex[i]!, m = input.mindex[i]!;
    if (d > 0 && m > 0) set.add(pairKey(d, m));
  }
  return set;
}

/** Partner pairs from a Pedigree's partnership list (1-based individual indices). */
export function buildPartnerSetFromPedigree(pedigree: Pedigree): PartnerSet {
  const idToIdx = new Map<string, number>();
  pedigree.individuals.forEach((ind, i) => idToIdx.set(ind.id, i + 1));
  const set: PartnerSet = new Set();
  for (const p of pedigree.partnerships) {
    const a = idToIdx.get(p.individual1) ?? 0;
    const b = idToIdx.get(p.individual2) ?? 0;
    if (a > 0 && b > 0) set.add(pairKey(a, b));
  }
  return set;
}

export function isPartnerPair(set: PartnerSet, a: number, b: number): boolean {
  return set.has(pairKey(a, b));
}

/** The two slots a spouse marker joins, after resolving pass-through markers. */
export interface ResolvedCouple {
  /** 0-based slot of the left partner. */
  leftSlot: number;
  /** 0-based slot of the right partner. */
  rightSlot: number;
  /** True when the partners are not adjacent: the line must hop over the slots between them. */
  hop: boolean;
}

/**
 * Resolve the spouse marker at (level, slot) to the slots of the real partners.
 *
 * If the two adjacent people are partners the answer is just (slot, slot+1).
 * Otherwise the marker is a pass-through: search the marriage run leftwards for
 * a partner of the right-hand person, then rightwards for a partner of the
 * left-hand person. Falls back to the adjacent pair if nothing matches, so a
 * pedigree with inconsistent data still renders.
 */
export function resolveCouple(
  result: LayoutResult,
  partners: PartnerSet,
  level: number,
  slot: number,
): ResolvedCouple {
  const nid = result.nid[level]!;
  const sp = result.spouse[level]!;
  const n = result.n[level]!;
  const left = nid[slot]!, right = nid[slot + 1]!;
  if (isPartnerPair(partners, left, right)) return { leftSlot: slot, rightSlot: slot + 1, hop: false };

  // Leftwards along the run for a partner of `right`.
  for (let p = slot - 1; p >= 0 && sp[p]! > 0; p--) {
    if (isPartnerPair(partners, nid[p]!, right)) return { leftSlot: p, rightSlot: slot + 1, hop: true };
  }
  // Rightwards along the run for a partner of `left`.
  for (let p = slot + 2; p < n && sp[p - 1]! > 0; p++) {
    if (isPartnerPair(partners, left, nid[p]!)) return { leftSlot: slot, rightSlot: p, hop: true };
  }
  return { leftSlot: slot, rightSlot: slot + 1, hop: false };
}
