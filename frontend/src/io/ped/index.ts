import { parsePed } from "./parser.js";
import { validatePedRows } from "./validator.js";
import { convertFamily } from "./converter.js";
import { exportPed, type ExportOptions } from "./exporter.js";
import type { ImportResult, PedRow } from "./types.js";
import { ValidationIssueCode } from "./types.js";
import { withCurrentNotation } from "../../pedigree/notation";

export { exportPed };
export type { ExportOptions, ImportResult };
export { ValidationIssueCode };
export type { IssueSeverity } from "./types.js";

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

  return importPedRows(rows, parseIssues);
}

/**
 * Validate and convert rows already read from a file: PED, or a PED-shaped
 * format such as a Phenopackets pedigree. `earlier` are the reader's own issues.
 */
export function importPedRows(rows: PedRow[], earlier: ImportResult["issues"] = []): ImportResult {
  const validateIssues = validatePedRows(rows);
  const allIssues = [...earlier, ...validateIssues];
  const hasErrors = allIssues.some(i => i.severity === "error");

  if (hasErrors) {
    return { pedigrees: [], issues: allIssues, hasErrors: true };
  }

  // Group rows by family
  const familyIds = [...new Set(rows.map(r => r.familyId))];
  const pedigrees = familyIds.map(fid => ({
    familyId: fid,
    // A PED file has no settings: it is made now, so it gets the current NSGC edition.
    pedigree: withCurrentNotation(convertFamily(rows.filter(r => r.familyId === fid))),
  }));

  return { pedigrees, issues: allIssues, hasErrors: false };
}
