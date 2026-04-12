import type { Pedigree } from "@pedigree-editor/layout-engine";

export function exportCsv(pedigree: Pedigree, familyId = "FAM001"): string {
  const header = "family_id,id,name,sex,dob,affected,deceased,carrier,proband,father_id,mother_id,notes";

  // Build parent lookup: childId → { f: fatherId, m: motherId }
  const parents = new Map<string, { f: string; m: string }>();
  for (const p of pedigree.partnerships) {
    const children = pedigree.parentOf[p.id] ?? [];
    const ind1 = pedigree.individuals.find(i => i.id === p.individual1)!;
    const ind2 = pedigree.individuals.find(i => i.id === p.individual2)!;
    const [father, mother] = ind1.sex === "male" ? [ind1, ind2] : [ind2, ind1];
    for (const childId of children) {
      parents.set(childId, { f: father.id, m: mother.id });
    }
  }

  const rows = pedigree.individuals.map(ind => {
    const p = parents.get(ind.id);
    return [
      familyId,
      ind.id,
      ind.name ?? "",
      ind.sex,
      ind.dob ?? "",
      ind.affected ? "1" : "0",
      ind.deceased ? "1" : "0",
      ind.carrier ? "1" : "0",
      ind.proband ? "1" : "0",
      p?.f ?? "",
      p?.m ?? "",
      (ind.notes ?? "").replace(/,/g, ";"), // escape commas in notes
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  return [header, ...rows].join("\n");
}
