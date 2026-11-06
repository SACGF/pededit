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

// ── 4/5-column "id fid mid sex [aff]" dialect ──────────────────────────────────

describe("parsePed: id fid mid sex dialect", () => {
  it("never imports a header line as an individual (famid id fid mid sex aff)", () => {
    const text = "famid\tid\tfid\tmid\tsex\taff\nF1\t1\t0\t0\t1\t1\nF1\t2\t0\t0\t2\t1\n";
    const { rows, issues } = parsePed(text);
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.individualId)).toEqual(["1", "2"]);
    expect(rows.some(r => r.familyId === "famid" || r.individualId === "id")).toBe(false);
    expect(rows[0]).toMatchObject({ familyId: "F1", fatherId: "0", motherId: "0", sex: "1", affection: "1", lineNumber: 2 });
  });

  it("maps a 4-column header with no family or affection column", () => {
    const text = "id\tfid\tmid\tsex\n1\t0\t0\t1\n2\t0\t0\t2\n3\t1\t2\t1\n";
    const { rows, issues } = parsePed(text);
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({
      familyId: "1", individualId: "3", fatherId: "1", motherId: "2", sex: "1", affection: "0",
    });
  });

  it("maps a 5-column header with aff", () => {
    const text = "id fid mid sex aff\n1 0 0 1 1\n2 0 0 2 2\n";
    const { rows } = parsePed(text);
    expect(rows.map(r => r.affection)).toEqual(["1", "2"]);
  });

  it("header detection is case-insensitive", () => {
    const text = "ID\tFID\tMID\tSEX\tAFF\n1\t0\t0\t1\t2\n";
    const { rows, issues } = parsePed(text);
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ individualId: "1", affection: "2" });
  });

  it("reads fid as the family column in a PLINK header and as father in the R dialect", () => {
    const plink = parsePed("FID\tIID\tPAT\tMAT\tSEX\tPHENO\nF9\t1\t0\t0\t1\t1\n").rows[0]!;
    expect(plink).toMatchObject({ familyId: "F9", individualId: "1", fatherId: "0" });
    const r = parsePed("id\tfid\tmid\tsex\n3\t1\t2\t1\n").rows[0]!;
    expect(r).toMatchObject({ familyId: "1", individualId: "3", fatherId: "1", motherId: "2" });
  });

  it("maps a # header line by name", () => {
    const text = "#famid id fid mid sex\nF2 1 0 0 1\n";
    const { rows, issues } = parsePed(text);
    expect(issues).toHaveLength(0);
    expect(rows[0]).toMatchObject({ familyId: "F2", individualId: "1", sex: "1", affection: "0" });
  });

  it("treats a # line that mentions id and sex but is not a header as a comment", () => {
    const text = "# id and sex of each person\n1 1 0 0 1 1\n";
    const { rows, issues } = parsePed(text);
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ familyId: "1", individualId: "1" });
  });

  it("splits on tabs only when the first line is tab-delimited", () => {
    const text = "id\tfid\tmid\tsex\nBob Baker\t0\t0\t1\nCarol Able Baker\tBob Baker\t0\t2\n";
    const { rows, issues } = parsePed(text);
    expect(issues).toHaveLength(0);
    expect(rows.map(r => r.individualId)).toEqual(["Bob Baker", "Carol Able Baker"]);
    expect(rows[1]!.fatherId).toBe("Bob Baker");
  });

  it("without a header, 4 columns is id fid mid sex", () => {
    const { rows, issues } = parsePed("1 0 0 1\n2 0 0 2\n3 1 2 1\n");
    expect(issues).toHaveLength(0);
    expect(rows[2]).toMatchObject({ familyId: "1", individualId: "3", fatherId: "1", motherId: "2", sex: "1", affection: "0" });
  });

  it("without a header, 5 columns is id fid mid sex aff when the first column varies", () => {
    const { rows } = parsePed("1 0 0 1 1\n2 0 0 2 2\n3 1 2 1 2\n");
    expect(rows[2]).toMatchObject({ familyId: "1", individualId: "3", fatherId: "1", motherId: "2", sex: "1", affection: "2" });
  });

  it("without a header, 5 columns is famid id fid mid sex when the first column repeats", () => {
    const { rows } = parsePed("FAM1 1 0 0 1\nFAM1 2 0 0 2\nFAM1 3 1 2 1\n");
    expect(rows[2]).toMatchObject({ familyId: "FAM1", individualId: "3", fatherId: "1", motherId: "2", sex: "1", affection: "0" });
  });

  it("reports a short line in a whitespace file as TOO_FEW_COLUMNS", () => {
    const { rows, issues } = parsePed("1 0 0 1\n2 0 0\n3 1 2 1\n");
    expect(rows.map(r => r.individualId)).toEqual(["1", "3"]);
    const err = issues.find(i => i.code === ValidationIssueCode.TOO_FEW_COLUMNS);
    expect(err).toBeDefined();
    expect(err!.lineNumbers).toEqual([2]);
  });

  it("reports a short line under a header as TOO_FEW_COLUMNS", () => {
    const { rows, issues } = parsePed("id\tfid\tmid\tsex\taff\n1\t0\t0\t1\n");
    expect(rows).toHaveLength(0);
    expect(issues.some(i => i.code === ValidationIssueCode.TOO_FEW_COLUMNS)).toBe(true);
  });

  it("rejects a header without parent columns", () => {
    const { rows, issues } = parsePed("id\tsex\n1\t1\n");
    expect(rows).toHaveLength(0);
    expect(issues.some(i => i.code === ValidationIssueCode.TOO_FEW_COLUMNS && i.severity === "error")).toBe(true);
  });

  it("records unmapped header columns as extraColumns", () => {
    const { rows, issues } = parsePed("id\tfid\tmid\tsex\tnotes\n1\t0\t0\t1\thello\n");
    expect(rows[0]!.extraColumns).toEqual(["hello"]);
    expect(issues.some(i => i.code === ValidationIssueCode.EXTRA_COLUMNS_IGNORED)).toBe(true);
  });
});

describe("parsePed: issue #31 rework", () => {
  it("reads NA parents as missing (pedtools and kinship2 write NA)", () => {
    const { rows, issues } = parsePed("id\tfid\tmid\tsex\n1\tNA\tNA\t1\n2\tNA\tNA\t2\n3\t1\t2\t1\n");
    expect(issues).toHaveLength(0);
    expect(rows.map(r => [r.fatherId, r.motherId])).toEqual([["0", "0"], ["0", "0"], ["1", "2"]]);
  });

  it("reads an empty parent cell in a tab-separated file as missing", () => {
    const { rows } = parsePed("id\tfid\tmid\tsex\n1\t\t\t1\n");
    expect(rows[0]).toMatchObject({ fatherId: "0", motherId: "0" });
  });

  it("keeps other tokens as real parent IDs", () => {
    const { rows } = parsePed("id fid mid sex\n3 na - 1\n");
    expect(rows[0]).toMatchObject({ fatherId: "na", motherId: "-" });
  });

  it("errors on a space-separated header with tab-separated rows containing spaces", () => {
    const text = "id fid mid sex\nAlice Able\t0\t0\t2\nBob Baker\t0\t0\t1\nCarol B\tBob Baker\tAlice Able\t2\n";
    const { rows, issues } = parsePed(text);
    expect(rows).toHaveLength(0);
    const errs = issues.filter(i => i.code === ValidationIssueCode.COLUMN_COUNT_MISMATCH);
    expect(errs).toHaveLength(3);
    expect(errs.every(e => e.severity === "error")).toBe(true);
    expect(errs[0]!.message).toMatch(/Line 2: splits into 5 columns but the header has 4/);
  });

  it("errors on a row with more cells than the header", () => {
    const { rows, issues } = parsePed("id\tfid\tmid\tsex\n1\t0\t0\t1\n2\t0\t0\t2\tx\n");
    expect(rows.map(r => r.individualId)).toEqual(["1"]);
    expect(issues.find(i => i.code === ValidationIssueCode.COLUMN_COUNT_MISMATCH)?.lineNumbers).toEqual([3]);
  });

  it("explains a row without tabs in a tab-separated file", () => {
    const { issues } = parsePed("id\tfid\tmid\tsex\n1 0 0 1\n");
    expect(issues[0]!.message).toContain("tab-separated but this row has no tabs");
  });

  it("still accepts mixed tabs and spaces between columns when every row splits evenly", () => {
    const { rows, issues } = parsePed("1 1 0 0 1 1\n1\t2\t0\t0\t2\t1\n1   3   1   2   1   2\n");
    expect(rows).toHaveLength(3);
    expect(issues).toHaveLength(0);
  });

  it("errors on a headerless PLINK row with a different number of genotype cells", () => {
    const { issues } = parsePed("1 1 0 0 1 1 A B\n1 2 0 0 2 1 C\n");
    expect(issues.find(i => i.code === ValidationIssueCode.COLUMN_COUNT_MISMATCH)?.lineNumbers).toEqual([2]);
  });

  it("allows genotype columns after a PLINK header", () => {
    const { rows, issues } = parsePed("#FID IID PAT MAT SEX PHENO\n1 1 0 0 1 1 A B\n1 2 0 0 2 1 C D\n");
    expect(rows).toHaveLength(2);
    expect(issues.every(i => i.severity !== "error")).toBe(true);
  });

  it("accepts kinship2 column names (dadid, momid) and father/mother", () => {
    for (const header of ["id dadid momid sex", "id father mother sex", "ID DADID MOMID SEX"]) {
      const { rows, issues } = parsePed(`${header}\n1 0 0 1\n2 0 0 2\n3 1 2 1\n`);
      expect(issues, header).toHaveLength(0);
      expect(rows[2], header).toMatchObject({ individualId: "3", fatherId: "1", motherId: "2" });
    }
  });

  it("recodes kinship2 affected (0/1/NA) only when the header uses kinship2 names", () => {
    const k2 = parsePed("id dadid momid sex affected\n1 0 0 1 0\n2 0 0 2 1\n3 1 2 1 NA\n");
    expect(k2.rows.map(r => r.affection)).toEqual(["1", "2", "0"]);
    expect(k2.issues.map(i => i.code)).toEqual([ValidationIssueCode.AFFECTION_RECODED]);

    // Already PED-coded (has a 2): left alone.
    const ped = parsePed("id dadid momid sex affected\n1 0 0 1 1\n2 0 0 2 2\n");
    expect(ped.rows.map(r => r.affection)).toEqual(["1", "2"]);

    // pedtools-style names: PED coding.
    const pt = parsePed("id fid mid sex affected\n1 0 0 1 1\n2 0 0 2 0\n");
    expect(pt.rows.map(r => r.affection)).toEqual(["1", "0"]);
  });

  it("does not read a single 5-column row as famid id fid mid sex", () => {
    const { rows } = parsePed("X 1 0 0 1\n");
    expect(rows[0]).toMatchObject({ familyId: "1", individualId: "X", fatherId: "1", motherId: "0", sex: "0", affection: "1" });
  });
});
