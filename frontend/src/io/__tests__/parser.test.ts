import { describe, it, expect } from "vitest";
import { parsePed } from "../ped/parser.js";
import { ValidationIssueCode } from "../ped/types.js";

describe("parsePed", () => {
  it("parses basic 6-column space-separated rows", () => {
    const text = "1 1 0 0 1 1\n1 2 0 0 2 1\n1 3 1 2 1 2\n";
    const { rows, issues } = parsePed(text);
    expect(rows).toHaveLength(3);
    expect(issues).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      familyId: "1", individualId: "1",
      fatherId: "0", motherId: "0",
      sex: "1", affection: "1",
      lineNumber: 1,
    });
    expect(rows[2]).toMatchObject({
      familyId: "1", individualId: "3",
      fatherId: "1", motherId: "2",
      sex: "1", affection: "2",
      lineNumber: 3,
    });
  });

  it("parses tab-separated rows", () => {
    const text = "1\t1\t0\t0\t1\t1\n1\t2\t0\t0\t2\t1\n";
    const { rows, issues } = parsePed(text);
    expect(rows).toHaveLength(2);
    expect(issues).toHaveLength(0);
  });

  it("parses mixed whitespace (tabs and spaces)", () => {
    const text = "1  1\t0  0\t1  1\n";
    const { rows, issues } = parsePed(text);
    expect(rows).toHaveLength(1);
    expect(issues).toHaveLength(0);
    expect(rows[0]).toMatchObject({ familyId: "1", individualId: "1" });
  });

  it("handles Windows line endings (CRLF)", () => {
    const text = "1 1 0 0 1 1\r\n1 2 0 0 2 1\r\n";
    const { rows } = parsePed(text);
    expect(rows).toHaveLength(2);
  });

  it("strips UTF-8 BOM", () => {
    const text = "\uFEFF1 1 0 0 1 1\n";
    const { rows, issues } = parsePed(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.familyId).toBe("1");
    expect(issues).toHaveLength(0);
  });

  it("skips # comment lines", () => {
    const text = "# This is a comment\n1 1 0 0 1 1\n# Another comment\n1 2 0 0 2 1\n";
    const { rows } = parsePed(text);
    expect(rows).toHaveLength(2);
  });

  it("skips #FID header line", () => {
    const text = "#FID IID PAT MAT SEX PHENO\n1 1 0 0 1 1\n";
    const { rows } = parsePed(text);
    expect(rows).toHaveLength(1);
  });

  it("skips literal FID header line", () => {
    const text = "FID IID PAT MAT SEX PHENO\n1 1 0 0 1 1\n";
    const { rows } = parsePed(text);
    expect(rows).toHaveLength(1);
  });

  it("captures extra columns beyond 6 in extraColumns", () => {
    const text = "1 1 0 0 1 1 A1 A2 B1 B2\n";
    const { rows, issues } = parsePed(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.extraColumns).toEqual(["A1", "A2", "B1", "B2"]);
    expect(issues.some(i => i.code === ValidationIssueCode.EXTRA_COLUMNS_IGNORED)).toBe(true);
  });

  it("emits EXTRA_COLUMNS_IGNORED only once even with multiple rows", () => {
    const text = "1 1 0 0 1 1 A B\n1 2 0 0 2 1 C D\n";
    const { issues } = parsePed(text);
    const extraIssues = issues.filter(i => i.code === ValidationIssueCode.EXTRA_COLUMNS_IGNORED);
    expect(extraIssues).toHaveLength(1);
  });

  it("emits TOO_FEW_COLUMNS error and skips row with < 6 columns", () => {
    const text = "1 1 0 0 1\n1 2 0 0 2 1\n";
    const { rows, issues } = parsePed(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.individualId).toBe("2");
    const err = issues.find(i => i.code === ValidationIssueCode.TOO_FEW_COLUMNS);
    expect(err).toBeDefined();
    expect(err!.severity).toBe("error");
    expect(err!.lineNumbers).toEqual([1]);
  });

  it("emits EMPTY_FILE error for empty file", () => {
    const { rows, issues } = parsePed("");
    expect(rows).toHaveLength(0);
    expect(issues.some(i => i.code === ValidationIssueCode.EMPTY_FILE)).toBe(true);
  });

  it("emits EMPTY_FILE error for file with only comments", () => {
    const text = "# comment 1\n# comment 2\n";
    const { rows, issues } = parsePed(text);
    expect(rows).toHaveLength(0);
    expect(issues.some(i => i.code === ValidationIssueCode.EMPTY_FILE)).toBe(true);
  });

  it("emits EMPTY_FILE error for BOM-only file", () => {
    const { rows, issues } = parsePed("\uFEFF");
    expect(rows).toHaveLength(0);
    expect(issues.some(i => i.code === ValidationIssueCode.EMPTY_FILE)).toBe(true);
  });

  it("trims leading/trailing whitespace from lines", () => {
    const text = "   1 1 0 0 1 1   \n";
    const { rows } = parsePed(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ familyId: "1", individualId: "1" });
  });

  it("assigns correct lineNumbers (1-based)", () => {
    const text = "# skip\n1 1 0 0 1 1\n1 2 0 0 2 1\n";
    const { rows } = parsePed(text);
    expect(rows[0]!.lineNumber).toBe(2);
    expect(rows[1]!.lineNumber).toBe(3);
  });

  it("does not emit EMPTY_FILE when all rows have TOO_FEW_COLUMNS errors", () => {
    const text = "1 1 0 0\n1 2 0\n";
    const { issues } = parsePed(text);
    expect(issues.some(i => i.code === ValidationIssueCode.TOO_FEW_COLUMNS)).toBe(true);
    // EMPTY_FILE should NOT fire when there are TOO_FEW_COLUMNS errors
    expect(issues.some(i => i.code === ValidationIssueCode.EMPTY_FILE)).toBe(false);
  });
});
