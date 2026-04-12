import type { PedRow, ValidationIssue } from "./types.js";
import { ValidationIssueCode } from "./types.js";

export interface ParseOutput {
  rows: PedRow[];
  issues: ValidationIssue[];
}

/**
 * Known header patterns — skip these lines rather than treating as data.
 * Matches lines starting with "#" or the literal header "FID IID PAT MAT SEX PHENO".
 */
const HEADER_PATTERN = /^\s*#|^FID\s+IID\s+PAT\s+MAT\s+SEX\s+PHENO/i;

export function parsePed(text: string): ParseOutput {
  const rows: PedRow[] = [];
  const issues: ValidationIssue[] = [];

  // Strip UTF-8 BOM if present
  const cleaned = text.startsWith("\uFEFF") ? text.slice(1) : text;

  // Normalise line endings
  const lines = cleaned.split(/\r?\n/);

  let dataLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNumber = i + 1;
    const trimmed = raw.trim();

    if (trimmed === "" || HEADER_PATTERN.test(trimmed)) continue;

    // Split on any whitespace run
    const cols = trimmed.split(/\s+/);

    if (cols.length < 6) {
      issues.push({
        severity: "error",
        code: ValidationIssueCode.TOO_FEW_COLUMNS,
        message: `Line ${lineNumber}: expected ≥6 columns, got ${cols.length}`,
        lineNumbers: [lineNumber],
      });
      continue;  // skip row but keep parsing
    }

    dataLineCount++;

    const [familyId, individualId, fatherId, motherId, sex, affection, ...extraColumns] = cols as [
      string, string, string, string, string, string, ...string[]
    ];

    // Emit info if extra genotype columns present (once only)
    if (extraColumns.length > 0 && dataLineCount === 1) {
      issues.push({
        severity: "info",
        code: ValidationIssueCode.EXTRA_COLUMNS_IGNORED,
        message: `File has ${extraColumns.length} columns beyond PHENO; genotype data will be ignored`,
      });
    }

    rows.push({
      familyId,
      individualId,
      fatherId,
      motherId,
      sex,
      affection,
      lineNumber,
      extraColumns,
    });
  }

  if (rows.length === 0 && issues.filter(i => i.severity === "error").length === 0) {
    issues.push({
      severity: "error",
      code: ValidationIssueCode.EMPTY_FILE,
      message: "File contains no data rows",
    });
  }

  return { rows, issues };
}
