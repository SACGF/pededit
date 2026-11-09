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
  const pedId = exportIds(pedigree, rDialect);

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
    const pat = parents ? pedId.get(parents.father)! : "0";
    const mat = parents ? pedId.get(parents.mother)! : "0";
    const sex = ind.sex === "male" ? "1" : ind.sex === "female" ? "2" : "0";
    const pheno = ind.affected ? "2" : "1";
    const cells = [...(withFamily ? [fid] : []), pedId.get(ind.id)!, pat, mat, sex, ...(withAffection ? [pheno] : [])];
    lines.push(cells.join("\t"));
  }

  return header + lines.join("\n") + "\n";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** IDs a PED reader takes to mean "no parent", so no individual may use them. */
const RESERVED_IDS = new Set(["0", "NA"]);

/**
 * The ID each individual gets in the file (#66). People are identified by the
 * name shown on the canvas when they have one; otherwise by their internal ID,
 * unless that is a generated UUID, which means nothing outside PedEdit and is
 * replaced by a short sequential one. IDs are unique within the file: a
 * repeated name gets a "_2", "_3" suffix. The R dialect is tab separated, so
 * spaces inside names are kept; PLINK readers split on any whitespace, so
 * there spaces become underscores.
 */
export function exportIds(pedigree: Pedigree, rDialect = false): Map<string, string> {
  const clean = (s: string) => {
    const t = s.trim().replace(rDialect ? /[\t\r\n]+/g : /\s+/g, rDialect ? " " : "_");
    return RESERVED_IDS.has(t) ? "" : t;
  };
  const wanted = pedigree.individuals.map(ind => {
    const fromName = clean(ind.name ?? "");
    if (fromName) return fromName;
    return UUID_PATTERN.test(ind.id) ? "" : clean(ind.id);
  });

  const used = new Set(wanted.filter(Boolean));
  const taken = new Set<string>();
  const result = new Map<string, string>();
  let next = 1;
  pedigree.individuals.forEach((ind, i) => {
    let id = wanted[i]!;
    if (!id) {
      do id = `ind${next++}`; while (used.has(id) || taken.has(id));
    } else if (taken.has(id)) {
      let n = 2;
      while (used.has(`${id}_${n}`) || taken.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    taken.add(id);
    result.set(ind.id, id);
  });
  return result;
}

/**
 * Individuals PED cannot represent: pregnancies and pregnancy losses
 * (`lifeStatus`). exportPed writes them as ordinary children, so the UI warns
 * before exporting and points at JSON, which keeps them.
 */
export function pedLostLifeStatus(pedigree: Pedigree): Pedigree["individuals"] {
  return pedigree.individuals.filter(i => !!i.lifeStatus);
}

/** Individuals whose adoption brackets (#12) PED cannot carry. */
export function pedLostAdoption(pedigree: Pedigree): Pedigree["individuals"] {
  return pedigree.individuals.filter(i => !!i.adopted);
}

/** Partnerships whose childless mark (#15) PED cannot carry. */
export function pedLostChildless(pedigree: Pedigree): Pedigree["partnerships"] {
  return pedigree.partnerships.filter(p => !!p.childless && (pedigree.parentOf[p.id] ?? []).length === 0);
}
