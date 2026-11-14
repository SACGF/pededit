/**
 * Gender identity on the symbol (#26, NSGC 2022, Bennett et al., J Genet
 * Couns 31:1238). `Individual.sex` is biological sex and is what the layout,
 * kinship, PED export and twins use; nothing here changes that. This module
 * only decides which symbol shape is drawn and what is written under it.
 *
 * With `canvasSettings.symbolsShow` "gender" (the default), a person with a
 * recorded gender identity is drawn with that gender's symbol (square for a
 * man, circle for a woman, diamond for non-binary) and, unless the gender
 * matches their sex, the sex assigned at birth is written under the symbol:
 * AMAB, AFAB or UAAB (unknown). Everyone else draws as before. Pregnancies
 * and losses have no gender identity. "sex" draws biological sex throughout.
 *
 * Framework-free and shared by the canvas, the legend, both SVG
 * exporters and the lints.
 */

import type { GenderIdentity, Individual, Pedigree, Sex, SymbolsShowMode } from "@pedigree-editor/layout-engine";

export const GENDER_IDENTITY_OPTIONS: { value: GenderIdentity; label: string }[] = [
  { value: "man",       label: "Man / boy" },
  { value: "woman",     label: "Woman / girl" },
  { value: "nonbinary", label: "Non-binary / gender diverse" },
];

const SHAPE_OF_GENDER: Record<GenderIdentity, Sex> = { man: "male", woman: "female", nonbinary: "unknown" };

const ASSIGNED_AT_BIRTH: Record<Sex, string> = { male: "AMAB", female: "AFAB", unknown: "UAAB" };

/** The pedigree's symbol setting; anything absent or unrecognised is "gender". */
export function symbolsShowMode(pedigree: Pick<Pedigree, "canvasSettings">): SymbolsShowMode {
  return pedigree?.canvasSettings?.symbolsShow === "sex" ? "sex" : "gender";
}

/** The gender identity that counts for drawing: none for a pregnancy or loss, or an unknown value. */
export function genderIdentityOf(ind: Pick<Individual, "genderIdentity" | "lifeStatus">): GenderIdentity | undefined {
  if (ind.lifeStatus) return undefined;
  const g = ind.genderIdentity;
  return g && g in SHAPE_OF_GENDER ? g : undefined;
}

/** True when the symbol is drawn from the gender identity rather than the sex. */
export function drawsGender(ind: Pick<Individual, "genderIdentity" | "lifeStatus">, pedigree: Pick<Pedigree, "canvasSettings">): boolean {
  return symbolsShowMode(pedigree) === "gender" && genderIdentityOf(ind) !== undefined;
}

/** The shape to draw: square for "male", circle for "female", diamond for "unknown". */
export function symbolSex(ind: Pick<Individual, "sex" | "genderIdentity" | "lifeStatus">, pedigree: Pick<Pedigree, "canvasSettings">): Sex {
  const g = genderIdentityOf(ind);
  return g && symbolsShowMode(pedigree) === "gender" ? SHAPE_OF_GENDER[g] : ind.sex;
}

/**
 * The sex assigned at birth written under a symbol drawn by gender ("AMAB",
 * "AFAB", "UAAB"), or undefined when nothing is written: gender not drawn,
 * or a man who is male or a woman who is female. A non-binary person always
 * gets one, since the diamond alone does not say their sex.
 */
export function assignedAtBirthText(ind: Pick<Individual, "sex" | "genderIdentity" | "lifeStatus">, pedigree: Pick<Pedigree, "canvasSettings">): string | undefined {
  if (!drawsGender(ind, pedigree)) return undefined;
  const g = genderIdentityOf(ind)!;
  if (g !== "nonbinary" && SHAPE_OF_GENDER[g] === ind.sex) return undefined;
  return ASSIGNED_AT_BIRTH[ind.sex];
}

/** Legend wording for each code. */
const ASSIGNED_AT_BIRTH_LABEL: Record<string, string> = {
  AMAB: "Assigned male at birth",
  AFAB: "Assigned female at birth",
  UAAB: "Unassigned or unknown sex at birth",
};

/** The codes written under someone in `pedigree`, in AMAB, AFAB, UAAB order, with their legend labels. */
export function assignedAtBirthInUse(pedigree: Pedigree): { code: string; label: string }[] {
  const used = new Set<string>();
  for (const ind of pedigree.individuals) {
    const t = assignedAtBirthText(ind, pedigree);
    if (t) used.add(t);
  }
  return ["AMAB", "AFAB", "UAAB"].filter(c => used.has(c)).map(c => ({ code: c, label: ASSIGNED_AT_BIRTH_LABEL[c]! }));
}

/** True when anyone in `pedigree` is drawn with their gender identity's symbol. */
export function anyDrawnByGender(pedigree: Pedigree): boolean {
  return pedigree.individuals.some(i => drawsGender(i, pedigree));
}
