import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";
import { twinMembership, twinSetOf } from "../../pedigree/twins";
import { onsetsOf, onsetSubject } from "../../pedigree/onset";
import { pedigreeNumbers } from "../../pedigree/scene";
import { evaluationsCsv } from "../../pedigree/evaluation";
import { notationOf } from "../../pedigree/notation";
import { genderIdentityOf } from "../../pedigree/gender";
import { carrierConditions, isAffected, isCarrier } from "../../pedigree/conditions";
import { kinshipOf } from "../../pedigree/relatedness";
import { childrenOf, parentRoles } from "../../pedigree/graph";

/** What a cell is computed from: the person, the pedigree and the lookups `exportCsv` builds once. */
interface RowContext {
  pedigree: Pedigree;
  familyId: string;
  parents: { f: string; m: string } | undefined;
  twins: ReturnType<typeof twinMembership>;
  numbers: ReturnType<typeof pedigreeNumbers>;
  coefficients: ReturnType<typeof kinshipOf>;
  tagLabels: Map<string, string>;
}

const flag = (v: boolean | undefined) => (v ? "1" : "0");

/**
 * The columns in file order. A new column goes at the end, so earlier
 * columns keep their positions for anyone reading them by index.
 */
const COLUMNS: { header: string; value: (ind: Individual, c: RowContext) => string }[] = [
  { header: "family_id", value: (_, c) => c.familyId },
  { header: "id", value: ind => ind.id },
  { header: "name", value: ind => ind.name ?? "" },
  { header: "sex", value: ind => ind.sex },
  { header: "dob", value: ind => ind.dob ?? "" },
  { header: "age", value: ind => ind.age ?? "" },
  { header: "affected", value: (ind, c) => flag(isAffected(ind, c.pedigree)) },
  { header: "deceased", value: ind => flag(ind.deceased) },
  // Any carrier: no condition recorded, or the conditions in carrier_of.
  { header: "carrier", value: (ind, c) => flag(isCarrier(ind, c.pedigree)) },
  { header: "proband", value: ind => flag(ind.proband) },
  { header: "father_id", value: (_, c) => c.parents?.f ?? "" },
  { header: "mother_id", value: (_, c) => c.parents?.m ?? "" },
  { header: "notes", value: ind => ind.notes ?? "" },
  { header: "hpo_terms", value: ind => (ind.hpoTerms ?? []).join(";") },
  { header: "tags", value: (ind, c) => (ind.tags ?? []).map(id => c.tagLabels.get(id) ?? id).join(";") },
  { header: "life_status", value: ind => ind.lifeStatus ?? "" },
  { header: "adopted", value: ind => ind.adopted ?? "" },
  { header: "zygosity", value: (ind, c) => c.twins.get(ind.id)?.zygosity ?? "" },
  {
    header: "twin_ids",
    value: (ind, c) => (c.twins.has(ind.id) ? (twinSetOf(c.pedigree, ind.id)?.set.members ?? []).filter(m => m !== ind.id).join(";") : ""),
  },
  // Age of onset: "Affected: 45y;Breast cancer: 52y"
  { header: "onset", value: (ind, c) => onsetsOf(ind, c.pedigree).map(o => `${onsetSubject(o)}: ${o.onset}`).join(";") },
  { header: "pedigree_number", value: (ind, c) => c.numbers.get(ind.id) ?? "" },
  { header: "consultand", value: ind => flag(ind.consultand) },
  { header: "family_history_unknown", value: ind => flag(ind.familyHistoryUnknown) },
  { header: "presymptomatic", value: ind => flag(ind.presymptomatic) },
  // "BRCA1 c.5266dupC + *; echo -", as under the symbol, " *" for documented.
  { header: "evaluations", value: (ind, c) => evaluationsCsv(ind, notationOf(c.pedigree)) },
  // Gender identity; sex stays in its own column and drives father/mother.
  { header: "gender_identity", value: ind => genderIdentityOf(ind) ?? "" },
  // Assisted reproduction; father_id and mother_id are the genetic parents.
  { header: "reproductive_role", value: ind => ind.reproductiveRole ?? "" },
  { header: "carried_by", value: ind => ind.carriedBy ?? "" },
  { header: "social_parent_ids", value: ind => (ind.socialParents ?? []).join(";") },
  { header: "dod", value: ind => ind.dod ?? "" },
  // Conditions carried, by label like tags: "Cystic fibrosis;Tay-Sachs".
  { header: "carrier_of", value: (ind, c) => carrierConditions(ind, c.pedigree).map(t => t.label).join(";") },
  // Inbreeding coefficient F from the pedigree, as a decimal; 0 when the parents are unrelated or not recorded.
  { header: "inbreeding_coefficient", value: (ind, c) => String(Number(c.coefficients.inbreeding(ind.id).toPrecision(6))) },
];

export function exportCsv(pedigree: Pedigree, familyId = "FAM001"): string {
  const twins = twinMembership(pedigree);

  // Parent lookup: childId → { f: fatherId, m: motherId }. A parent who is
  // not in the pedigree is left blank rather than written as a dangling id.
  const present = new Set(pedigree.individuals.map(i => i.id));
  const parents = new Map<string, { f: string; m: string }>();
  for (const p of pedigree.partnerships) {
    const { father, mother } = parentRoles(pedigree, p);
    const known = (id: string) => (present.has(id) ? id : "");
    for (const childId of childrenOf(pedigree, p.id)) {
      parents.set(childId, { f: known(father), m: known(mother) });
    }
  }

  // Pedigree numbers link the figure back to these rows, whether or not
  // the figure shows them. People hidden under a collapsed branch are
  // not drawn, so they have none.
  const numbers = pedigreeNumbers(pedigree);
  const coefficients = kinshipOf(pedigree);
  const tagLabels = new Map((pedigree.tags ?? []).map(t => [t.id, t.label]));

  const rows = pedigree.individuals.map(ind => {
    const c: RowContext = { pedigree, familyId, parents: parents.get(ind.id), twins, numbers, coefficients, tagLabels };
    return COLUMNS.map(col => `"${col.value(ind, c).replace(/"/g, '""')}"`).join(",");
  });

  return [COLUMNS.map(col => col.header).join(","), ...rows].join("\n");
}
