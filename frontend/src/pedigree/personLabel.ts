import type { Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { capitalised } from "../utils/text";

/**
 * How the editor's words for someone unnamed are chosen:
 *  - "this person": the one person a sentence is about ("this person is a
 *    pregnancy and cannot have a partner").
 *  - "unnamed": one of several in a list or a pair, "unnamed male",
 *    "unnamed female", "unnamed person".
 *  - `{ partner: n }`: someone's nth partner, "partner 2 (male)"; the
 *    numbers come from `personCouples` in `partners.ts`.
 */
export type PersonLabelStyle = "this person" | "unnamed" | { partner: number };

/**
 * What a menu, a notice or a list calls a person: their name, else the
 * words for `style`. `start` capitalises those words (never a name), for the
 * start of a sentence or a label standing on its own.
 */
export function personLabel(pedigree: Pedigree, id: string, style: PersonLabelStyle, { start = false }: { start?: boolean } = {}): string {
  const ind = pedigree.individuals.find(i => i.id === id);
  const name = ind?.name?.trim();
  if (name) return name;
  const words = style === "this person" ? "this person"
    : style === "unnamed" ? `unnamed ${ind?.sex === "male" || ind?.sex === "female" ? ind.sex : "person"}`
    : `partner ${style.partner} (${sexWords(ind?.sex)})`;
  return start ? capitalised(words) : words;
}

function sexWords(sex: Sex | undefined): string {
  return sex === "male" || sex === "female" ? sex : "unknown sex";
}
