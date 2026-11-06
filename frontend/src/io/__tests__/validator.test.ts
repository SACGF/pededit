import { describe, it, expect } from "vitest";
import { validatePedRows } from "../ped/validator.js";
import { ValidationIssueCode } from "../ped/types.js";
import type { PedRow } from "../ped/types.js";

function makeRow(overrides: Partial<PedRow> & { individualId: string }): PedRow {
  return {
    familyId: "1",
    individualId: overrides.individualId,
    fatherId: overrides.fatherId ?? "0",
    motherId: overrides.motherId ?? "0",
    sex: overrides.sex ?? "1",
    affection: overrides.affection ?? "1",
    lineNumber: overrides.lineNumber ?? 1,
    extraColumns: overrides.extraColumns ?? [],
  };
}

describe("validatePedRows", () => {
  it("returns no issues for a clean nuclear family", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1", lineNumber: 1 }),
      makeRow({ individualId: "2", sex: "2", lineNumber: 2 }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2", sex: "1", lineNumber: 3 }),
      makeRow({ individualId: "4", fatherId: "1", motherId: "2", sex: "2", lineNumber: 4 }),
    ];
    const issues = validatePedRows(rows);
    expect(issues).toHaveLength(0);
  });

  it("detects duplicate IID within same family", () => {
    const rows = [
      makeRow({ individualId: "1", lineNumber: 1 }),
      makeRow({ individualId: "2", lineNumber: 2 }),
      makeRow({ individualId: "1", fatherId: "1", motherId: "2", lineNumber: 3 }),
    ];
    const issues = validatePedRows(rows);
    const dup = issues.filter(i => i.code === ValidationIssueCode.DUPLICATE_INDIVIDUAL);
    expect(dup).toHaveLength(1);
    expect(dup[0]!.severity).toBe("error");
    expect(dup[0]!.lineNumbers).toEqual([1, 3]);
  });

  it("does not flag same IID in different families", () => {
    const rows = [
      makeRow({ familyId: "1", individualId: "1" }),
      { ...makeRow({ familyId: "2", individualId: "1" }), familyId: "2" },
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.DUPLICATE_INDIVIDUAL)).toBe(false);
  });

  it("detects self-as-father", () => {
    const rows = [
      makeRow({ individualId: "1" }),
      makeRow({ individualId: "2" }),
      makeRow({ individualId: "3", fatherId: "3", motherId: "2", lineNumber: 3 }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.SELF_AS_PARENT)).toBe(true);
  });

  it("detects self-as-mother", () => {
    const rows = [
      makeRow({ individualId: "1" }),
      makeRow({ individualId: "2", fatherId: "1", motherId: "2" }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.SELF_AS_PARENT)).toBe(true);
  });

  it("does not flag IID='0' with PAT/MAT='0' as self-as-parent", () => {
    // '0' in PAT/MAT means 'no parent', not 'parent is individual 0'
    const rows = [makeRow({ individualId: "0", fatherId: "0", motherId: "0" })];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.SELF_AS_PARENT)).toBe(false);
  });

  it("emits PHANTOM_PARENT warning for undefined father", () => {
    const rows = [
      makeRow({ individualId: "3", fatherId: "1", motherId: "2" }),
    ];
    const issues = validatePedRows(rows);
    const phantoms = issues.filter(i => i.code === ValidationIssueCode.PHANTOM_PARENT);
    expect(phantoms.length).toBeGreaterThanOrEqual(2); // both 1 and 2 are phantoms
  });

  it("emits PHANTOM_PARENT warning for undefined mother", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "99" }),
    ];
    const issues = validatePedRows(rows);
    const phantom = issues.find(i =>
      i.code === ValidationIssueCode.PHANTOM_PARENT && i.affectedIds?.includes("1:99")
    );
    expect(phantom).toBeDefined();
  });

  it("emits SINGLE_PARENT warning when father only", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "0" }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.SINGLE_PARENT)).toBe(true);
  });

  it("emits SINGLE_PARENT warning when mother only", () => {
    const rows = [
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "4", fatherId: "0", motherId: "2" }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.SINGLE_PARENT)).toBe(true);
  });

  it("emits SEX_MISMATCH when PAT is female (SEX=2)", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "2" }),  // female listed as father
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2" }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.SEX_MISMATCH)).toBe(true);
  });

  it("emits SEX_MISMATCH when MAT is male (SEX=1)", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "1" }),  // male listed as mother
      makeRow({ individualId: "3", fatherId: "1", motherId: "2" }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.SEX_MISMATCH)).toBe(true);
  });

  it("emits one SEX_MISMATCH per swapped couple, not per child or per parent", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "2" }),  // female listed as father
      makeRow({ individualId: "2", sex: "1" }),  // male listed as mother
      makeRow({ individualId: "3", fatherId: "1", motherId: "2" }),
      makeRow({ individualId: "4", fatherId: "1", motherId: "2" }),
      makeRow({ individualId: "5", fatherId: "1", motherId: "2" }),
    ];
    const mismatches = validatePedRows(rows).filter(i => i.code === ValidationIssueCode.SEX_MISMATCH);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toMatch(/swapped PAT\/MAT.*3 children/);
    expect(mismatches[0].affectedIds).toEqual(["1:1", "1:2"]);
  });

  it("accepts the sex codes the converter understands (M, F, male, female, U)", () => {
    for (const sex of ["M", "F", "m", "f", "male", "Female", "U", "unknown"]) {
      const issues = validatePedRows([makeRow({ individualId: "1", sex })]);
      expect(issues.filter(i => i.code === ValidationIssueCode.UNKNOWN_SEX_CODE), sex).toHaveLength(0);
    }
  });

  it("emits SEX_MISMATCH for a letter-coded female father", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "F" }),
      makeRow({ individualId: "2", sex: "F" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2" }),
    ];
    expect(validatePedRows(rows).some(i => i.code === ValidationIssueCode.SEX_MISMATCH)).toBe(true);
  });

  it("emits UNKNOWN_SEX_CODE for '5'", () => {
    const rows = [makeRow({ individualId: "1", sex: "5" })];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.UNKNOWN_SEX_CODE)).toBe(true);
  });

  it("emits UNKNOWN_PHENO_CODE for '99'", () => {
    const rows = [makeRow({ individualId: "1", affection: "99" })];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.UNKNOWN_PHENO_CODE)).toBe(true);
  });

  it("accepts valid pheno codes without warning", () => {
    for (const code of ["0", "1", "2", "-9"]) {
      const rows = [makeRow({ individualId: "1", affection: code })];
      const issues = validatePedRows(rows);
      expect(issues.some(i => i.code === ValidationIssueCode.UNKNOWN_PHENO_CODE)).toBe(false);
    }
  });

  it("emits ZERO_IID warning for IID='0'", () => {
    const rows = [makeRow({ individualId: "0" })];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.ZERO_IID)).toBe(true);
  });

  it("detects circular ancestry A→B→A (2-cycle)", () => {
    const rows = [
      makeRow({ individualId: "1", fatherId: "2" }),
      makeRow({ individualId: "2", fatherId: "1" }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.CIRCULAR_ANCESTRY)).toBe(true);
  });

  it("detects circular ancestry A→B→C→A (3-cycle)", () => {
    const rows = [
      makeRow({ individualId: "1", fatherId: "3" }),
      makeRow({ individualId: "2", fatherId: "1" }),
      makeRow({ individualId: "3", fatherId: "2" }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.CIRCULAR_ANCESTRY)).toBe(true);
  });

  it("does not flag linear chain as circular", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1", lineNumber: 1 }),
      makeRow({ individualId: "2", sex: "2", lineNumber: 2 }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2", sex: "1", lineNumber: 3 }),
      makeRow({ individualId: "4", sex: "2", lineNumber: 4 }),
      makeRow({ individualId: "5", fatherId: "3", motherId: "4", sex: "1", lineNumber: 5 }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.CIRCULAR_ANCESTRY)).toBe(false);
  });

  it("emits MULTIPLE_FAMILIES info when multiple FIDs present", () => {
    const rows = [
      makeRow({ familyId: "1", individualId: "1" }),
      { ...makeRow({ familyId: "2", individualId: "1" }), familyId: "2" },
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.MULTIPLE_FAMILIES)).toBe(true);
  });

  it("does not emit MULTIPLE_FAMILIES for single family", () => {
    const rows = [
      makeRow({ individualId: "1" }),
      makeRow({ individualId: "2" }),
    ];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.MULTIPLE_FAMILIES)).toBe(false);
  });
});

describe("validatePedRows: one person as both parents", () => {
  it("errors when the same ID is father and mother of one child", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", fatherId: "1", motherId: "1", lineNumber: 2 }),
    ];
    const err = validatePedRows(rows).find(i => i.code === ValidationIssueCode.PARENT_BOTH_SEXES);
    expect(err?.severity).toBe("error");
    expect(err?.message).toContain("both father and mother of '2'");
  });

  it("errors when an ID is a father in one row and a mother in another", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", sex: "2" }),
      makeRow({ individualId: "4", fatherId: "1", motherId: "2", lineNumber: 4 }),
      makeRow({ individualId: "5", fatherId: "3", motherId: "1", lineNumber: 5 }),
    ];
    const err = validatePedRows(rows).find(i => i.code === ValidationIssueCode.PARENT_BOTH_SEXES);
    expect(err?.severity).toBe("error");
    expect(err?.lineNumbers).toEqual([4, 5]);
  });

  it("does not confuse the same ID in different families", () => {
    const rows = [
      makeRow({ individualId: "c", fatherId: "x", motherId: "y" }),
      { ...makeRow({ individualId: "c", fatherId: "z", motherId: "x" }), familyId: "2" },
    ];
    expect(validatePedRows(rows).some(i => i.code === ValidationIssueCode.PARENT_BOTH_SEXES)).toBe(false);
  });
});
