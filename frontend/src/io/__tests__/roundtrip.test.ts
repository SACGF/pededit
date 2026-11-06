import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { importPed, exportPed, ValidationIssueCode } from "../ped/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA = join(__dirname, "../../../../test-data/ped");

function readPed(relPath: string): string {
  return readFileSync(join(TEST_DATA, relPath), "utf-8");
}

// ── simple/ ────────────────────────────────────────────────────────────────────

describe("roundtrip: simple/", () => {
  it("nuclear_family.ped imports cleanly", () => {
    const result = importPed(readPed("simple/nuclear_family.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees).toHaveLength(1);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.individuals).toHaveLength(4);
    expect(ped.partnerships).toHaveLength(1);
    const p = ped.partnerships[0]!;
    expect(ped.parentOf[p.id]).toHaveLength(2);
  });

  it("three_generation.ped imports cleanly with 2 partnerships", () => {
    const result = importPed(readPed("simple/three_generation.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.individuals.length).toBeGreaterThanOrEqual(10);
    expect(ped.partnerships.length).toBeGreaterThanOrEqual(3);
  });

  it("single_individual.ped imports cleanly", () => {
    const result = importPed(readPed("simple/single_individual.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.individuals).toHaveLength(1);
    expect(ped.partnerships).toHaveLength(0);
  });

  it("founders_only.ped imports cleanly", () => {
    const result = importPed(readPed("simple/founders_only.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.partnerships).toHaveLength(0);
  });

  it("unknown_sex.ped imports cleanly with unknown-sex individuals", () => {
    const result = importPed(readPed("simple/unknown_sex.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    const unknowns = ped.individuals.filter(i => i.sex === "unknown");
    expect(unknowns.length).toBeGreaterThan(0);
  });

  it("nuclear_family.ped: export → reimport preserves structure", () => {
    const text = readPed("simple/nuclear_family.ped");
    const first = importPed(text);
    expect(first.hasErrors).toBe(false);
    const ped = first.pedigrees[0]!.pedigree;

    const exported = exportPed(ped);
    const second = importPed(exported);
    expect(second.hasErrors).toBe(false);
    const ped2 = second.pedigrees[0]!.pedigree;

    expect(ped2.individuals).toHaveLength(ped.individuals.length);
    expect(ped2.partnerships).toHaveLength(ped.partnerships.length);
  });
});

// ── consanguineous/ ────────────────────────────────────────────────────────────

describe("roundtrip: consanguineous/", () => {
  it("sibling_mating.ped: consanguineous flag set on sibling partnership", () => {
    const result = importPed(readPed("consanguineous/sibling_mating.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    const consPships = ped.partnerships.filter(p => p.consanguineous);
    expect(consPships.length).toBeGreaterThan(0);
  });

  it("first_cousin.ped: consanguineous flag set on cousin partnership", () => {
    const result = importPed(readPed("consanguineous/first_cousin.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.partnerships.some(p => p.consanguineous)).toBe(true);
  });

  it("double_first_cousin.ped: consanguineous detected", () => {
    const result = importPed(readPed("consanguineous/double_first_cousin.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.partnerships.some(p => p.consanguineous)).toBe(true);
  });

  it("uncle_niece.ped: consanguineous detected", () => {
    const result = importPed(readPed("consanguineous/uncle_niece.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.partnerships.some(p => p.consanguineous)).toBe(true);
  });

  it("half_sibling_mating.ped: consanguineous detected", () => {
    const result = importPed(readPed("consanguineous/half_sibling_mating.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.partnerships.some(p => p.consanguineous)).toBe(true);
  });
});

// ── large/ ─────────────────────────────────────────────────────────────────────

describe("roundtrip: large/", () => {
  it("kinship2_sample.ped imports with 2 families", () => {
    const result = importPed(readPed("large/kinship2_sample.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees).toHaveLength(2);
    const total = result.pedigrees.reduce((s, f) => s + f.pedigree.individuals.length, 0);
    expect(total).toBeGreaterThanOrEqual(50);
    const issue = result.issues.find(i => i.code === ValidationIssueCode.MULTIPLE_FAMILIES);
    expect(issue).toBeDefined();
  });

  it("multi_family.ped imports with 3 families", () => {
    const result = importPed(readPed("large/multi_family.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees).toHaveLength(3);
  });
});

// ── edge_cases/ ────────────────────────────────────────────────────────────────

describe("roundtrip: edge_cases/", () => {
  it("phantom_parents.ped: imports with PHANTOM_PARENT warnings, creates phantom individuals", () => {
    const result = importPed(readPed("edge_cases/phantom_parents.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.PHANTOM_PARENT)).toBe(true);
    const ped = result.pedigrees[0]!.pedigree;
    // 3 explicit (3, 4, 5) + 2 phantom parents (1, 2)
    expect(ped.individuals).toHaveLength(5);
  });

  it("single_parent.ped: imports with SINGLE_PARENT warnings", () => {
    const result = importPed(readPed("edge_cases/single_parent.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.SINGLE_PARENT)).toBe(true);
  });

  it("half_siblings.ped: imports cleanly", () => {
    const result = importPed(readPed("edge_cases/half_siblings.ped"));
    expect(result.hasErrors).toBe(false);
  });

  it("multiple_partnerships.ped: imports cleanly with 2 partnerships", () => {
    const result = importPed(readPed("edge_cases/multiple_partnerships.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.partnerships).toHaveLength(2);
  });

  it("sex_mismatch.ped: imports with SEX_MISMATCH warning", () => {
    const result = importPed(readPed("edge_cases/sex_mismatch.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.SEX_MISMATCH)).toBe(true);
  });

  it("extra_columns.ped: imports with EXTRA_COLUMNS_IGNORED info", () => {
    const result = importPed(readPed("edge_cases/extra_columns.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.EXTRA_COLUMNS_IGNORED)).toBe(true);
  });

  it("header_line.ped: imports cleanly (header skipped)", () => {
    const result = importPed(readPed("edge_cases/header_line.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees[0]!.pedigree.individuals.length).toBeGreaterThan(0);
  });

  it("comment_lines.ped: imports cleanly (comments skipped)", () => {
    const result = importPed(readPed("edge_cases/comment_lines.ped"));
    expect(result.hasErrors).toBe(false);
  });

  it("zero_iid.ped: imports with ZERO_IID warning", () => {
    const result = importPed(readPed("edge_cases/zero_iid.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.ZERO_IID)).toBe(true);
  });

  it("windows_crlf.ped: imports cleanly (CRLF normalised)", () => {
    const result = importPed(readPed("edge_cases/windows_crlf.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees[0]!.pedigree.individuals.length).toBeGreaterThan(0);
  });

  it("bom.ped: imports cleanly (BOM stripped)", () => {
    const result = importPed(readPed("edge_cases/bom.ped"));
    expect(result.hasErrors).toBe(false);
  });

  it("mixed_whitespace.ped: imports cleanly", () => {
    const result = importPed(readPed("edge_cases/mixed_whitespace.ped"));
    expect(result.hasErrors).toBe(false);
  });

  it("non_numeric_sex.ped: M/F/U read as male/female/unknown without warnings", () => {
    const result = importPed(readPed("edge_cases/non_numeric_sex.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.UNKNOWN_SEX_CODE)).toBe(false);
    expect(result.pedigrees[0]!.pedigree.individuals.map(i => i.sex)).toEqual(["male", "female", "male", "unknown"]);
  });

  it("leading_trailing_spaces.ped: imports cleanly", () => {
    const result = importPed(readPed("edge_cases/leading_trailing_spaces.ped"));
    expect(result.hasErrors).toBe(false);
  });
});

// ── variants/ (id fid mid sex [aff] dialect) ───────────────────────────────────

describe("roundtrip: variants/", () => {
  function ids(result: ReturnType<typeof importPed>): string[] {
    return result.pedigrees.flatMap(f => f.pedigree.individuals.map(i => i.id));
  }
  function affectedIds(result: ReturnType<typeof importPed>): string[] {
    return result.pedigrees.flatMap(f => f.pedigree.individuals.filter(i => i.affected).map(i => i.id));
  }

  it("na_parents_tab.ped: NA parents are missing, no NA individual or NA = NA couple", () => {
    const result = importPed(readPed("variants/na_parents_tab.ped"));
    expect(result.hasErrors).toBe(false);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.individuals.some(i => i.id === "NA")).toBe(false);
    // 1, 2, 3, 4 plus the phantom mother of 4 (father 1 only)
    expect(ped.individuals.filter(i => !i.id.startsWith("__phantom_")).map(i => i.id)).toEqual(["1", "2", "3", "4"]);
    expect(ped.partnerships.some(p => p.individual1 === p.individual2)).toBe(false);
    const couple = ped.partnerships.find(p => p.individual1 === "1" && p.individual2 === "2")!;
    expect(ped.parentOf[couple.id]).toEqual(["3"]);
    expect(couple.consanguineous).toBeUndefined();
    expect(result.issues.filter(i => i.severity === "warning").map(i => i.code)).toEqual([ValidationIssueCode.SINGLE_PARENT]);
  });

  it("kinship2_names.ped: id dadid momid sex affected, kinship2 0/1 affection coding", () => {
    const result = importPed(readPed("variants/kinship2_names.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.filter(i => i.severity !== "info")).toHaveLength(0);
    expect(result.issues.some(i => i.code === ValidationIssueCode.AFFECTION_RECODED)).toBe(true);
    expect(ids(result)).toEqual(["1", "2", "3", "4", "5"]);
    expect(affectedIds(result)).toEqual(["2", "3"]);
    expect(result.pedigrees[0]!.pedigree.partnerships).toHaveLength(1);
  });

  it("four_col_header_tab.ped: 7 individuals, one family, nobody affected", () => {
    const result = importPed(readPed("variants/four_col_header_tab.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.pedigrees).toHaveLength(1);
    expect(ids(result)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(affectedIds(result)).toEqual([]);
    expect(result.pedigrees[0]!.pedigree.partnerships).toHaveLength(2);
  });

  it("five_col_aff_header_tab.ped: 7 individuals, 2, 4 and 6 affected", () => {
    const result = importPed(readPed("variants/five_col_aff_header_tab.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.pedigrees).toHaveLength(1);
    expect(ids(result)).toHaveLength(7);
    expect(affectedIds(result)).toEqual(["2", "4", "6"]);
  });

  it("four_col_no_header_space.ped: 6 individuals, space separated, no header", () => {
    const result = importPed(readPed("variants/four_col_no_header_space.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.pedigrees).toHaveLength(1);
    expect(ids(result)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(result.pedigrees[0]!.pedigree.partnerships).toHaveLength(2);
  });

  it("famid_header_tab.ped: header is not read as a data row", () => {
    const result = importPed(readPed("variants/famid_header_tab.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.pedigrees).toHaveLength(1);
    expect(result.pedigrees[0]!.familyId).toBe("F1");
    expect(ids(result)).toEqual(["1", "2", "3", "4"]);
    expect(ids(result)).not.toContain("id");
    expect(affectedIds(result)).toEqual(["3"]);
  });

  it("uppercase_header_tab.ped: header detection is case-insensitive", () => {
    const result = importPed(readPed("variants/uppercase_header_tab.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(ids(result)).toEqual(["1", "2", "3", "4"]);
    expect(affectedIds(result)).toEqual(["3"]);
  });

  it("names_with_spaces_tab.ped: IDs with spaces survive tab splitting", () => {
    const result = importPed(readPed("variants/names_with_spaces_tab.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(ids(result)).toEqual([
      "Alice Able", "Bob Baker", "Carol Able Baker", "Dan Able Baker", "Erin Ferris", "Fay Baker Ferris",
    ]);
    expect(affectedIds(result)).toEqual(["Carol Able Baker", "Fay Baker Ferris"]);
    const ped = result.pedigrees[0]!.pedigree;
    expect(ped.partnerships).toHaveLength(2);
    const parents = ped.partnerships.find(p => (ped.parentOf[p.id] ?? []).includes("Carol Able Baker"))!;
    expect([parents.individual1, parents.individual2]).toEqual(["Bob Baker", "Alice Able"]);
  });

  it("missing_founders_four_col.ped: omitted founders 1, 2 and 5 become phantom parents", () => {
    const result = importPed(readPed("variants/missing_founders_four_col.ped"));
    expect(result.hasErrors).toBe(false);
    const phantoms = result.issues.filter(i => i.code === ValidationIssueCode.PHANTOM_PARENT);
    expect(phantoms.length).toBeGreaterThan(0);
    expect(new Set(phantoms.flatMap(i => i.affectedIds ?? []))).toEqual(new Set(["1:1", "1:2", "1:5"]));
    expect(ids(result).sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(result.pedigrees[0]!.pedigree.partnerships).toHaveLength(2);
  });

  it("famid_no_header_repeat.ped: repeated first column is a family ID", () => {
    const result = importPed(readPed("variants/famid_no_header_repeat.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.pedigrees).toHaveLength(1);
    expect(result.pedigrees[0]!.familyId).toBe("FAM1");
    expect(ids(result)).toEqual(["1", "2", "3", "4"]);
    expect(result.pedigrees[0]!.pedigree.partnerships).toHaveLength(1);
  });

  it("two_families_no_famid.ped: one pedigree with two components", () => {
    const result = importPed(readPed("variants/two_families_no_famid.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.pedigrees).toHaveLength(1);
    expect(ids(result)).toEqual(["1", "2", "3", "4", "X1", "X2", "X3"]);
    expect(affectedIds(result)).toEqual(["X2"]);
    expect(result.pedigrees[0]!.pedigree.partnerships).toHaveLength(2);
  });

  it("variants round-trip through the r-dialect exporter", () => {
    for (const file of ["variants/names_with_spaces_tab.ped", "variants/five_col_aff_header_tab.ped"]) {
      const first = importPed(readPed(file));
      const ped = first.pedigrees[0]!.pedigree;
      const second = importPed(exportPed(ped, { dialect: "r" }));
      expect(second.hasErrors).toBe(false);
      const ped2 = second.pedigrees[0]!.pedigree;
      expect(ped2.individuals.map(i => [i.id, i.sex, i.affected])).toEqual(ped.individuals.map(i => [i.id, i.sex, i.affected]));
      expect(ped2.partnerships).toHaveLength(ped.partnerships.length);
    }
  });
});

// ── malformed/ ─────────────────────────────────────────────────────────────────

describe("roundtrip: malformed/", () => {
  it("empty.ped → hasErrors: true, EMPTY_FILE", () => {
    const result = importPed(readPed("malformed/empty.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.some(i => i.code === ValidationIssueCode.EMPTY_FILE)).toBe(true);
  });

  it("only_comments.ped → hasErrors: true, EMPTY_FILE", () => {
    const result = importPed(readPed("malformed/only_comments.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.some(i => i.code === ValidationIssueCode.EMPTY_FILE)).toBe(true);
  });

  it("missing_columns.ped → hasErrors: true, TOO_FEW_COLUMNS", () => {
    const result = importPed(readPed("malformed/missing_columns.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.some(i => i.code === ValidationIssueCode.TOO_FEW_COLUMNS)).toBe(true);
  });

  it("invalid_sex_code.ped → hasErrors: false (warnings only)", () => {
    const result = importPed(readPed("malformed/invalid_sex_code.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.UNKNOWN_SEX_CODE)).toBe(true);
  });

  it("invalid_pheno_code.ped → hasErrors: false (warnings only)", () => {
    const result = importPed(readPed("malformed/invalid_pheno_code.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.UNKNOWN_PHENO_CODE)).toBe(true);
  });

  it("self_as_parent.ped → hasErrors: true, SELF_AS_PARENT", () => {
    const result = importPed(readPed("malformed/self_as_parent.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.some(i => i.code === ValidationIssueCode.SELF_AS_PARENT)).toBe(true);
  });

  it("circular_ancestry.ped → hasErrors: true, CIRCULAR_ANCESTRY", () => {
    const result = importPed(readPed("malformed/circular_ancestry.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.some(i => i.code === ValidationIssueCode.CIRCULAR_ANCESTRY)).toBe(true);
  });

  it("duplicate_iid.ped → hasErrors: true, DUPLICATE_INDIVIDUAL", () => {
    const result = importPed(readPed("malformed/duplicate_iid.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.some(i => i.code === ValidationIssueCode.DUPLICATE_INDIVIDUAL)).toBe(true);
  });

  it("mixed_delimiters.ped (space header, tab rows with spaces in IDs) → COLUMN_COUNT_MISMATCH, nothing imported", () => {
    const result = importPed(readPed("malformed/mixed_delimiters.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.pedigrees).toHaveLength(0);
    const errs = result.issues.filter(i => i.code === ValidationIssueCode.COLUMN_COUNT_MISMATCH);
    expect(errs.map(e => e.lineNumbers![0])).toEqual([2, 3, 4]);
    expect(errs[0]!.message).toContain("contains tabs but the header is separated by spaces");
  });

  it("spaces_in_ids_no_tabs.ped → COLUMN_COUNT_MISMATCH, nothing imported", () => {
    const result = importPed(readPed("malformed/spaces_in_ids_no_tabs.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.pedigrees).toHaveLength(0);
    const errs = result.issues.filter(i => i.code === ValidationIssueCode.COLUMN_COUNT_MISMATCH);
    expect(errs).toHaveLength(3);
    expect(errs[0]!.message).toContain("IDs cannot contain spaces");
  });

  it("parent_both_sexes.ped → hasErrors: true, PARENT_BOTH_SEXES", () => {
    const result = importPed(readPed("malformed/parent_both_sexes.ped"));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.some(i => i.code === ValidationIssueCode.PARENT_BOTH_SEXES)).toBe(true);
  });
});
