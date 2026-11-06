import type { PedRow, ValidationIssue } from "./types.js";
import { ValidationIssueCode } from "./types.js";
import { recogniseSex } from "./converter.js";

/** PED affection codes; "NA" is how R writes missing. */
const PHENO_CODES = new Set(["0", "1", "2", "-9", "NA"]);

export function validatePedRows(rows: PedRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Index for fast lookup: "FID:IID" → row
  const rowIndex = new Map<string, PedRow>();

  for (const row of rows) {
    const key = `${row.familyId}:${row.individualId}`;
    if (rowIndex.has(key)) {
      issues.push({
        severity: "error",
        code: ValidationIssueCode.DUPLICATE_INDIVIDUAL,
        message: `Duplicate individual '${row.individualId}' in family '${row.familyId}'`,
        affectedIds: [key],
        lineNumbers: [rowIndex.get(key)!.lineNumber, row.lineNumber],
      });
    } else {
      rowIndex.set(key, row);
    }
  }

  // Check sex codes
  for (const row of rows) {
    if (recogniseSex(row.sex) === null) {
      issues.push({
        severity: "warning",
        code: ValidationIssueCode.UNKNOWN_SEX_CODE,
        message: `Individual '${row.individualId}': unrecognised SEX value '${row.sex}'; will be treated as unknown`,
        affectedIds: [`${row.familyId}:${row.individualId}`],
        lineNumbers: [row.lineNumber],
      });
    }
  }

  // Check pheno codes
  for (const row of rows) {
    if (!PHENO_CODES.has(row.affection)) {
      issues.push({
        severity: "warning",
        code: ValidationIssueCode.UNKNOWN_PHENO_CODE,
        message: `Individual '${row.individualId}': unrecognised PHENO value '${row.affection}'; will be treated as missing`,
        affectedIds: [`${row.familyId}:${row.individualId}`],
        lineNumbers: [row.lineNumber],
      });
    }
  }

  // Self-as-parent
  // Note: "0" in PAT/MAT means "no parent" in PED format, not "parent is individual 0".
  // Only flag when the non-zero parent ID matches the individual's own ID.
  for (const row of rows) {
    if ((row.fatherId !== "0" && row.fatherId === row.individualId) ||
        (row.motherId !== "0" && row.motherId === row.individualId)) {
      issues.push({
        severity: "error",
        code: ValidationIssueCode.SELF_AS_PARENT,
        message: `Individual '${row.individualId}' lists itself as a parent`,
        affectedIds: [`${row.familyId}:${row.individualId}`],
        lineNumbers: [row.lineNumber],
      });
    }
  }

  // One ID used as a father and as a mother (in one row or across rows) would
  // become a partnership of that person with themselves.
  const fathers = new Map<string, PedRow>();
  const mothers = new Map<string, PedRow>();
  for (const row of rows) {
    if (row.fatherId !== "0" && !fathers.has(`${row.familyId}:${row.fatherId}`)) fathers.set(`${row.familyId}:${row.fatherId}`, row);
    if (row.motherId !== "0" && !mothers.has(`${row.familyId}:${row.motherId}`)) mothers.set(`${row.familyId}:${row.motherId}`, row);
  }
  for (const [key, asFather] of fathers) {
    const asMother = mothers.get(key);
    if (!asMother) continue;
    const parentId = key.slice(key.indexOf(":") + 1);
    const where = asFather === asMother
      ? `as both father and mother of '${asFather.individualId}'`
      : `as father of '${asFather.individualId}' and as mother of '${asMother.individualId}'`;
    issues.push({
      severity: "error",
      code: ValidationIssueCode.PARENT_BOTH_SEXES,
      message: `'${parentId}' is listed ${where}; one person cannot be both parents`,
      affectedIds: [key],
      lineNumbers: [...new Set([asFather.lineNumber, asMother.lineNumber])],
    });
  }

  // Zero IID warning
  for (const row of rows) {
    if (row.individualId === "0") {
      issues.push({
        severity: "warning",
        code: ValidationIssueCode.ZERO_IID,
        message: `Individual ID '0' at line ${row.lineNumber}: the value '0' means "missing" for parent IDs; using it as an individual ID is valid but confusing`,
        lineNumbers: [row.lineNumber],
      });
    }
  }

  // Phantom parents (referenced in PAT/MAT but no row defined)
  for (const row of rows) {
    if (row.fatherId !== "0") {
      const key = `${row.familyId}:${row.fatherId}`;
      if (!rowIndex.has(key)) {
        issues.push({
          severity: "warning",
          code: ValidationIssueCode.PHANTOM_PARENT,
          message: `Father '${row.fatherId}' of individual '${row.individualId}' is not defined; will be created as unknown founder`,
          affectedIds: [key],
          lineNumbers: [row.lineNumber],
        });
      }
    }
    if (row.motherId !== "0") {
      const key = `${row.familyId}:${row.motherId}`;
      if (!rowIndex.has(key)) {
        issues.push({
          severity: "warning",
          code: ValidationIssueCode.PHANTOM_PARENT,
          message: `Mother '${row.motherId}' of individual '${row.individualId}' is not defined; will be created as unknown founder`,
          affectedIds: [key],
          lineNumbers: [row.lineNumber],
        });
      }
    }
  }

  // Single parent (one 0, one non-0)
  for (const row of rows) {
    const hasFather = row.fatherId !== "0";
    const hasMother = row.motherId !== "0";
    if (hasFather !== hasMother) {
      const knownParent = hasFather ? row.fatherId : row.motherId;
      const role = hasFather ? "father" : "mother";
      issues.push({
        severity: "warning",
        code: ValidationIssueCode.SINGLE_PARENT,
        message: `Individual '${row.individualId}' has only one parent ('${knownParent}' as ${role}); a phantom unknown partner will be created`,
        affectedIds: [`${row.familyId}:${row.individualId}`],
        lineNumbers: [row.lineNumber],
      });
    }
  }

  // Sex mismatch: PAT points to female, MAT points to male
  for (const row of rows) {
    if (row.fatherId !== "0") {
      const fatherRow = rowIndex.get(`${row.familyId}:${row.fatherId}`);
      if (fatherRow && recogniseSex(fatherRow.sex) === "female") {
        issues.push({
          severity: "warning",
          code: ValidationIssueCode.SEX_MISMATCH,
          message: `Individual '${row.individualId}': PAT '${row.fatherId}' has SEX='${fatherRow.sex}' (female)`,
          affectedIds: [`${row.familyId}:${row.fatherId}`],
          lineNumbers: [row.lineNumber],
        });
      }
    }
    if (row.motherId !== "0") {
      const motherRow = rowIndex.get(`${row.familyId}:${row.motherId}`);
      if (motherRow && recogniseSex(motherRow.sex) === "male") {
        issues.push({
          severity: "warning",
          code: ValidationIssueCode.SEX_MISMATCH,
          message: `Individual '${row.individualId}': MAT '${row.motherId}' has SEX='${motherRow.sex}' (male)`,
          affectedIds: [`${row.familyId}:${row.motherId}`],
          lineNumbers: [row.lineNumber],
        });
      }
    }
  }

  // Circular ancestry detection (DFS cycle check)
  const familyIds = [...new Set(rows.map(r => r.familyId))];
  for (const fid of familyIds) {
    const familyRows = rows.filter(r => r.familyId === fid);
    const parentMap = new Map<string, string[]>(); // iid → [fatherIid, motherIid] (non-zero)
    for (const row of familyRows) {
      const parents: string[] = [];
      if (row.fatherId !== "0") parents.push(row.fatherId);
      if (row.motherId !== "0") parents.push(row.motherId);
      parentMap.set(row.individualId, parents);
    }

    const hasCycle = detectCycle(parentMap);
    if (hasCycle.length > 0) {
      issues.push({
        severity: "error",
        code: ValidationIssueCode.CIRCULAR_ANCESTRY,
        message: `Circular ancestry detected in family '${fid}': ${hasCycle.join(" → ")}`,
        affectedIds: hasCycle.map(id => `${fid}:${id}`),
      });
    }
  }

  // Multiple families info
  const uniqueFamilies = [...new Set(rows.map(r => r.familyId))];
  if (uniqueFamilies.length > 1) {
    issues.push({
      severity: "info",
      code: ValidationIssueCode.MULTIPLE_FAMILIES,
      message: `File contains ${uniqueFamilies.length} families (${uniqueFamilies.join(", ")}); each will be imported as a separate pedigree`,
      affectedIds: uniqueFamilies,
    });
  }

  return issues;
}

/**
 * DFS cycle detection on parent graph.
 * Returns cycle path if found (first one), empty array if none.
 */
function detectCycle(parentMap: Map<string, string[]>): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const path: string[] = [];

  for (const id of parentMap.keys()) color.set(id, WHITE);

  function dfs(id: string): string[] {
    color.set(id, GRAY);
    path.push(id);
    for (const parentId of (parentMap.get(id) ?? [])) {
      const c = color.get(parentId);
      if (c === GRAY) {
        // Found cycle — return path from parentId to current
        const cycleStart = path.indexOf(parentId);
        return [...path.slice(cycleStart), parentId];
      }
      if (c === WHITE || c === undefined) {
        const cycle = dfs(parentId);
        if (cycle.length > 0) return cycle;
      }
    }
    path.pop();
    color.set(id, BLACK);
    return [];
  }

  for (const id of parentMap.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      const cycle = dfs(id);
      if (cycle.length > 0) return cycle;
    }
  }
  return [];
}
