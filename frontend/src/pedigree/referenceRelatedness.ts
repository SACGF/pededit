import type { KinshipCoefficients, Pedigree } from "@pedigree-editor/layout-engine";
import { formatCoefficient, kinshipOf, kinshipXOf } from "./relatedness";
import { relationshipTermFor } from "./relationship";

/**
 * How one person is related to the proband and the consultand (#134), for
 * the edit panel's Relatedness section: one short line per reference person,
 * "Proband's first cousin" with "Kinship 1/16 (0.0625), X-linked 0" under it.
 * Read-only and never drawn. Framework-free.
 *
 * The reference people are every proband, then every consultand who is not
 * also a proband, so with no proband it is the consultands alone, as the
 * family filters fall back (`referencePeople` in `viewFilters.ts`). Nothing
 * is said about a reference person to themselves. Someone not related by
 * blood gets one line saying so, so that a missing line never has to be read
 * as "unrelated".
 */

export type ReferenceRole = "proband" | "consultand";

export interface ReferenceLine {
  referenceId: string;
  role: ReferenceRole;
  /** "Proband's first cousin", "Related to the consultand in more than one way". */
  text: string;
  /** "Kinship 1/16 (0.0625), X-linked 1/16 (0.0625)"; null when not related. */
  detail: string | null;
}

/** The probands, then the consultands who are not probands, each with the role they are named by. */
export function referencePeopleWithRoles(pedigree: Pedigree): { id: string; role: ReferenceRole }[] {
  return [
    ...pedigree.individuals.filter(i => i.proband).map(i => ({ id: i.id, role: "proband" as const })),
    ...pedigree.individuals.filter(i => i.consultand && !i.proband).map(i => ({ id: i.id, role: "consultand" as const })),
  ];
}

export function referenceRelatedness(
  pedigree: Pedigree,
  personId: string,
  coefficients: KinshipCoefficients = kinshipOf(pedigree),
  xCoefficients: KinshipCoefficients = kinshipXOf(pedigree),
): ReferenceLine[] {
  const references = referencePeopleWithRoles(pedigree);
  const count = { proband: 0, consultand: 0 };
  for (const r of references) count[r.role]++;
  const seen = { proband: 0, consultand: 0 };

  const lines: ReferenceLine[] = [];
  for (const { id, role } of references) {
    seen[role]++;
    if (id === personId) continue;
    // With one of a role, "the proband" is enough; with several, say which.
    const name = pedigree.individuals.find(i => i.id === id)?.name?.trim();
    const which = count[role] > 1 ? ` ${name || seen[role]}` : "";
    const possessive = `${role === "proband" ? "Proband" : "Consultand"}${which}'s`;
    const object = count[role] > 1 ? `${role}${which}` : `the ${role}`;

    const kinship = coefficients.kinship(personId, id);
    if (!(kinship > 0)) {
      lines.push({ referenceId: id, role, text: `Not related to ${object} through anyone drawn`, detail: null });
      continue;
    }
    const kinshipX = xCoefficients.kinship(personId, id);
    const term = relationshipTermFor(pedigree, personId, id, kinship);
    lines.push({
      referenceId: id,
      role,
      text: term ? `${possessive} ${term}` : `Related to ${object} in more than one way`,
      detail: `Kinship ${formatCoefficient(kinship)}, X-linked ${Number.isNaN(kinshipX) ? "unknown (a sex is not recorded)" : formatCoefficient(kinshipX)}`,
    });
  }
  return lines;
}
