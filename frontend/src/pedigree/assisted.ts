import { placementParentOf, type Individual, type Pedigree, type ReproductiveRole } from "@pedigree-editor/layout-engine";
import { parentCoupleOf } from "./graph";

/**
 * Assisted reproduction (NSGC 2008 Fig. 3). Framework-free. This file holds
 * the model, the links to draw and the letters and key wording;
 * `assistedLines.ts` has the line geometry and `assistedEdits.ts` the edits.
 *
 * The model keeps genetics in the ordinary structure, so kinship, X-linked
 * kinship, relationship names and PED need nothing special:
 *
 *  - the child's partnership in `parentOf` is its GENETIC parents. With a
 *    donated sperm or egg it is the donor and the other genetic parent, and
 *    carries `donorConception`: no couple line is drawn between them, and a
 *    line runs from each of them to the children instead. kinship2 lays them
 *    out as a couple, so the donor stands beside the other parent.
 *  - `Individual.carriedBy` is the woman who carried the pregnancy when she
 *    is not the genetic mother (a surrogate, or the mother of a child from a
 *    donor egg): a solid line from her to the child.
 *  - `Individual.socialParents` are parents who are not genetic (the
 *    intended father when donor sperm is used): a dashed line to the child,
 *    NSGC's dashed line of descent for a non-biological parent.
 *  - `Individual.reproductiveRole` puts a "D" or "S" inside the symbol.
 */

export const REPRODUCTIVE_ROLE_OPTIONS: { value: ReproductiveRole; label: string; letter: string }[] = [
  { value: "donor",     label: "Donor (D)",     letter: "D" },
  { value: "surrogate", label: "Surrogate (S)", letter: "S" },
];

export function roleLetter(role: ReproductiveRole | undefined): string | undefined {
  return REPRODUCTIVE_ROLE_OPTIONS.find(o => o.value === role)?.letter;
}

/** Legend wording for the letter inside the symbol. */
export function roleLegendLabel(role: ReproductiveRole): string {
  return role === "donor" ? "Sperm or egg donor (D)" : "Surrogate (S)";
}

/** Legend wording for the two lines. */
export const CARRIER_LINE_LEGEND = "Carried the pregnancy, not the genetic mother";
export const SOCIAL_LINE_LEGEND = "Not a genetic parent (dashed line)";

/** Font size of the letter inside a symbol of the given size. */
export function roleLetterFontSize(size: number): number {
  return Math.round(size * 0.45);
}

/** Baseline of the letter, centred in a size × size box whose top is at oy. */
export function roleLetterBaselineY(size: number, oy = 0): number {
  return oy + size / 2 + roleLetterFontSize(size) * 0.36;
}

/** The letter is drawn in white on a black-filled symbol (`SymbolPaint.base`). */
export function roleLetterFill(base: "black" | "white"): string {
  return base === "black" ? "white" : "black";
}

/** The letter for this individual, or undefined. A pregnancy's "P" wins. */
export function symbolLetter(ind: Pick<Individual, "reproductiveRole" | "lifeStatus">): string | undefined {
  if (ind.lifeStatus) return undefined;
  return roleLetter(ind.reproductiveRole);
}

/** One line of assisted reproduction: from a carrier, social or genetic parent to a child. */
export interface AssistedLink {
  from: string;
  child: string;
  /**
   * "carrier": solid, she carried the pregnancy. "social": dashed, not a
   * genetic parent. "genetic": solid, a genetic parent the child is not
   * drawn under (the egg donor when the child hangs from the couple carrying
   * it, see `placementParentOf`).
   */
  kind: "carrier" | "social" | "genetic";
}

/** The genetic parents of a child (the two members of its partnership), or none. */
export function geneticParents(pedigree: Pedigree, childId: string): string[] {
  const p = parentCoupleOf(pedigree, childId);
  return p ? [p.individual1, p.individual2] : [];
}

/**
 * Every line to draw besides the line of descent from the parents the child
 * hangs from (`placementParentOf`), between people who are both in the
 * pedigree, as NSGC 2008 Fig. 3 draws them:
 *
 *  - a genetic parent the child is not drawn under (the egg donor of
 *    scenario 2) and a woman who carried it but is neither (the surrogate of
 *    scenario 3) get a solid line;
 *  - a social parent gets a dashed line, unless they are the partner of
 *    someone with a biological line to the child: then the couple line is
 *    their link (scenario 1, the intended father beside the mother carrying
 *    a pregnancy by donor sperm; scenario 4, the wife beside the father).
 *
 * Someone with two roles is drawn once: genetic over carrier over social, so
 * a woman who is both egg donor and carrier is shown only as the donor.
 */
export function assistedLinks(pedigree: Pedigree): AssistedLink[] {
  if (!pedigree.individuals.some(c => c.carriedBy || c.socialParents?.length)) return [];
  const ids = new Set(pedigree.individuals.map(i => i.id));
  const placed = placementParentOf(pedigree);
  const drawnUnder = (childId: string) => {
    const p = pedigree.partnerships.find(x => (placed[x.id] ?? []).includes(childId));
    return new Set(p ? [p.individual1, p.individual2] : []);
  };
  const couples = new Set(pedigree.partnerships.filter(p => !p.donorConception)
    .flatMap(p => [`${p.individual1}|${p.individual2}`, `${p.individual2}|${p.individual1}`]));
  const out: AssistedLink[] = [];
  for (const child of pedigree.individuals) {
    if (!child.carriedBy && !child.socialParents?.length) continue;
    const genetic = geneticParents(pedigree, child.id);
    const under = drawnUnder(child.id);
    const ok = (id: string) => ids.has(id) && id !== child.id;
    const bio = new Set(genetic);
    for (const g of genetic) if (!under.has(g) && ok(g)) out.push({ from: g, child: child.id, kind: "genetic" });
    const carrier = child.carriedBy && ok(child.carriedBy) && !bio.has(child.carriedBy) ? child.carriedBy : undefined;
    if (carrier) {
      bio.add(carrier);
      if (!under.has(carrier)) out.push({ from: carrier, child: child.id, kind: "carrier" });
    }
    for (const sp of new Set(child.socialParents ?? [])) {
      if (!ok(sp) || bio.has(sp) || under.has(sp)) continue;
      if ([...bio].some(b => couples.has(`${sp}|${b}`))) continue;
      out.push({ from: sp, child: child.id, kind: "social" });
    }
  }
  return out;
}
