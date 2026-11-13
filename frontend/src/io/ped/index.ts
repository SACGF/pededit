import { parsePed } from "./parser.js";
import { validatePedRows } from "./validator.js";
import { convertFamily } from "./converter.js";
import { exportPed, type ExportOptions } from "./exporter.js";
import type { ImportResult } from "./types.js";
import { ValidationIssueCode } from "./types.js";
import { withCurrentNotation } from "../../pedigree/notation";

export { exportPed };
export type { ExportOptions, ImportResult };
export { ValidationIssueCode };
export type { ValidationIssue, IssueSeverity } from "./types.js";

/**
 * Full import pipeline: parse → validate → convert → return per-family pedigrees.
 * Does not throw — all errors are in result.issues.
 */
export function importPed(text: string): ImportResult {
  const { rows, issues: parseIssues } = parsePed(text);

  const hasParseErrors = parseIssues.some(i => i.severity === "error");
  if (hasParseErrors) {
    return { pedigrees: [], issues: parseIssues, hasErrors: true };
  }

  const validateIssues = validatePedRows(rows);
  const allIssues = [...parseIssues, ...validateIssues];
  const hasErrors = allIssues.some(i => i.severity === "error");

  if (hasErrors) {
    return { pedigrees: [], issues: allIssues, hasErrors: true };
  }

  // Group rows by family
  const familyIds = [...new Set(rows.map(r => r.familyId))];
  const pedigrees = familyIds.map(fid => ({
    familyId: fid,
    // A PED file has no settings: it is made now, so it gets the current NSGC edition (#115).
    pedigree: withCurrentNotation(convertFamily(rows.filter(r => r.familyId === fid))),
  }));

  return { pedigrees, issues: allIssues, hasErrors: false };
}
