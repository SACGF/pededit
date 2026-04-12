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

  it("non_numeric_sex.ped: imports with UNKNOWN_SEX_CODE warnings", () => {
    const result = importPed(readPed("edge_cases/non_numeric_sex.ped"));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some(i => i.code === ValidationIssueCode.UNKNOWN_SEX_CODE)).toBe(true);
  });

  it("leading_trailing_spaces.ped: imports cleanly", () => {
    const result = importPed(readPed("edge_cases/leading_trailing_spaces.ped"));
    expect(result.hasErrors).toBe(false);
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
});
