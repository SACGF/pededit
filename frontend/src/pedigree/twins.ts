import type { Pedigree, Partnership, TwinSet, Zygosity } from "@pedigree-editor/layout-engine";
import { childrenOf, parentCoupleOf } from "./graph";

/**
 * Twins (NSGC 2008): a twin set's members share one fork from the
 * sibship bar. Monozygotic twins get a bar across the fork, unknown zygosity
 * a "?". The sets live on the partnership (`Partnership.twins`), so members
 * always share both parents. Framework-free helpers shared by the store, the
 * canvas, the exporters and the legend.
 */

/**
 * The sibling drawn next to this person: the next one in the sibship, or the
 * previous one for the last. Choosing a zygosity for someone not yet a twin
 * pairs them with this sibling (the Person tab and the more menu).
 */
export function adjacentSibling(pedigree: Pedigree, individualId: string): string | undefined {
  const couple = parentCoupleOf(pedigree, individualId);
  const sibs = couple ? childrenOf(pedigree, couple.id) : [];
  const i = sibs.indexOf(individualId);
  if (i < 0 || sibs.length < 2) return undefined;
  return sibs[i + 1] ?? sibs[i - 1];
}

export const ZYGOSITY_OPTIONS: { value: Zygosity; label: string }[] = [
  { value: "monozygotic", label: "Monozygotic (identical)" },
  { value: "dizygotic",   label: "Dizygotic (fraternal)" },
  { value: "unknown",     label: "Unknown zygosity" },
];

/** Legend wording. */
export function twinLegendLabel(z: Zygosity): string {
  return z === "monozygotic" ? "Monozygotic twins" : z === "dizygotic" ? "Dizygotic twins" : "Twins, zygosity unknown";
}

/** The twin set this individual belongs to, with its partnership, or undefined. */
export function twinSetOf(pedigree: Pedigree, individualId: string): { partnership: Partnership; set: TwinSet } | undefined {
  const partnership = parentCoupleOf(pedigree, individualId);
  const set = partnership?.twins?.find(t => t.members.includes(individualId));
  return partnership && set ? { partnership, set } : undefined;
}

/**
 * Why a twin set cannot be made, or null when it can: at least two members,
 * all children of the partnership, and the same sex for monozygotic twins
 * (sex determines the symbol, and identical twins share it). Members already
 * in another set are allowed: `setTwins` moves them into the new set.
 */
export function twinSetProblem(pedigree: Pedigree, partnershipId: string, members: string[], zygosity: Zygosity): string | null {
  const unique = [...new Set(members)];
  if (unique.length < 2) return "A twin set needs at least two siblings.";
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!partnership) return "Unknown partnership.";
  const children = new Set(childrenOf(pedigree, partnershipId));
  if (unique.some(id => !children.has(id))) return "Twins must all be children of the same couple.";
  if (zygosity === "monozygotic") {
    const sexes = new Set(unique.map(id => pedigree.individuals.find(i => i.id === id)?.sex));
    if (sexes.size > 1) return "Monozygotic twins must have the same sex.";
  }
  return null;
}

/** Twin sets drawn in the pedigree, by zygosity, for the legends. */
export function zygositiesInUse(pedigree: Pedigree): Set<Zygosity> {
  const out = new Set<Zygosity>();
  for (const p of pedigree.partnerships) {
    const children = new Set(childrenOf(pedigree, p.id));
    for (const t of p.twins ?? []) {
      if (t.members.filter(m => children.has(m)).length >= 2) out.add(t.zygosity);
    }
  }
  return out;
}

/** Font size (px) of the "?" on a fork of unknown zygosity. */
export const TWIN_QUESTION_FONT_SIZE = 11;

/**
 * Individual id to twin set key ("partnershipId:index") and zygosity, for
 * every drawable set. Used by `buildScene` so the sibship edges can fork.
 */
export function twinMembership(pedigree: Pedigree): Map<string, { twinSet: string; zygosity: Zygosity }> {
  const out = new Map<string, { twinSet: string; zygosity: Zygosity }>();
  for (const p of pedigree.partnerships) {
    const children = new Set(childrenOf(pedigree, p.id));
    (p.twins ?? []).forEach((t, k) => {
      const members = t.members.filter(m => children.has(m) && !out.has(m));
      if (members.length < 2) return;
      for (const m of members) out.set(m, { twinSet: `${p.id}:${k}`, zygosity: t.zygosity });
    });
  }
  return out;
}
