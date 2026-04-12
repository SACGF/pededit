import type { Pedigree } from "@pedigree-editor/layout-engine";

export interface ExportOptions {
  familyId?: string;         // default "1"
  includeHeader?: boolean;   // default false (PLINK-compatible)
}

export function exportPed(pedigree: Pedigree, options: ExportOptions = {}): string {
  const fid = options.familyId ?? "1";
  const header = options.includeHeader
    ? "#FID\tIID\tPAT\tMAT\tSEX\tPHENO\n"
    : "";

  // Build child→(father,mother) lookup from partnerships + parentOf
  const parentLookup = new Map<string, { father: string; mother: string }>();
  for (const partnership of pedigree.partnerships) {
    const children = pedigree.parentOf[partnership.id] ?? [];
    for (const childId of children) {
      parentLookup.set(childId, {
        father: partnership.individual1,
        mother: partnership.individual2,
      });
    }
  }

  const lines: string[] = [];
  for (const ind of pedigree.individuals) {
    const parents = parentLookup.get(ind.id);
    const pat = parents?.father ?? "0";
    const mat = parents?.mother ?? "0";
    const sex = ind.sex === "male" ? "1" : ind.sex === "female" ? "2" : "0";
    const pheno = ind.affected ? "2" : "1";
    lines.push([fid, ind.id, pat, mat, sex, pheno].join("\t"));
  }

  return header + lines.join("\n") + "\n";
}
