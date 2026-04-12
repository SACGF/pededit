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

  it("emits UNKNOWN_SEX_CODE for 'M'", () => {
    const rows = [makeRow({ individualId: "1", sex: "M" })];
    const issues = validatePedRows(rows);
    expect(issues.some(i => i.code === ValidationIssueCode.UNKNOWN_SEX_CODE)).toBe(true);
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
