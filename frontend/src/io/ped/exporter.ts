import type { Pedigree } from "@pedigree-editor/layout-engine";

export interface ExportOptions {
  familyId?: string;         // default "1"
  includeHeader?: boolean;   // default false (PLINK-compatible); always on for "r"
  /**
   * "plink" (default): FID IID PAT MAT SEX PHENO, no header.
   * "r": id fid mid sex [aff] with a header line, as read by pedtools and
   * kinship2. Tab separated; the family ID column is optional.
   */
  dialect?: "plink" | "r";
  includeFamilyId?: boolean;   // "r" only, default false
  includeAffection?: boolean;  // "r" only, default true
}

export function exportPed(pedigree: Pedigree, options: ExportOptions = {}): string {
  const fid = options.familyId ?? "1";
  const rDialect = options.dialect === "r";
  const withFamily = !rDialect || (options.includeFamilyId ?? false);
  const withAffection = !rDialect || (options.includeAffection ?? true);

  let header = "";
  if (rDialect) {
    const names = [...(withFamily ? ["famid"] : []), "id", "fid", "mid", "sex", ...(withAffection ? ["aff"] : [])];
    header = names.join("\t") + "\n";
  } else if (options.includeHeader) {
    header = "#FID\tIID\tPAT\tMAT\tSEX\tPHENO\n";
  }

  const sexOf = new Map(pedigree.individuals.map(i => [i.id, i.sex]));

  // Build child→(father,mother) lookup from partnerships + parentOf.
  // Partnership members are unordered, so put the male partner in PAT: a
  // female in PAT makes every other PED reader warn or reject the file.
  // When neither partner is male the original order is kept.
  const parentLookup = new Map<string, { father: string; mother: string }>();
  for (const partnership of pedigree.partnerships) {
    const { individual1, individual2 } = partnership;
    const swap = sexOf.get(individual1) !== "male" && sexOf.get(individual2) === "male";
    const father = swap ? individual2 : individual1;
    const mother = swap ? individual1 : individual2;
    const children = pedigree.parentOf[partnership.id] ?? [];
    for (const childId of children) {
      parentLookup.set(childId, { father, mother });
    }
  }

  const lines: string[] = [];
  for (const ind of pedigree.individuals) {
    const parents = parentLookup.get(ind.id);
    const pat = parents?.father ?? "0";
    const mat = parents?.mother ?? "0";
    const sex = ind.sex === "male" ? "1" : ind.sex === "female" ? "2" : "0";
    const pheno = ind.affected ? "2" : "1";
    const cells = [...(withFamily ? [fid] : []), ind.id, pat, mat, sex, ...(withAffection ? [pheno] : [])];
    lines.push(cells.join("\t"));
  }

  return header + lines.join("\n") + "\n";
}

/**
 * Individuals PED cannot represent: pregnancies and pregnancy losses
 * (`lifeStatus`). exportPed writes them as ordinary children, so the UI warns
 * before exporting and points at JSON, which keeps them.
 */
export function pedLostLifeStatus(pedigree: Pedigree): Pedigree["individuals"] {
  return pedigree.individuals.filter(i => !!i.lifeStatus);
}
