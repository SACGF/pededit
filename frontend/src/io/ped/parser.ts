import type { PedRow, ValidationIssue } from "./types.js";
import { ValidationIssueCode } from "./types.js";

export interface ParseOutput {
  rows: PedRow[];
  issues: ValidationIssue[];
}

/**
 * Two layouts are accepted:
 *
 *   PLINK:   FID IID PAT MAT SEX PHENO [genotypes...]   (6+ columns, no header)
 *   R-style: [famid] id fid mid sex [aff]               (4 or 5 columns, usually
 *            with a header line; pedtools, kinship2 data frames, hand-written files)
 *
 * Delimiter: if the first non-comment line contains a tab, cells are split on
 * tabs only (so IDs may contain spaces); otherwise on whitespace runs.
 *
 * Header: the first non-comment line is a header when it names an id column and
 * a sex column, or matches "FID IID PAT MAT SEX PHENO". Columns are then mapped
 * by name. Without a header the column count decides: 6+ is PLINK, 4 is
 * "id fid mid sex", 5 is "id fid mid sex aff" unless the first column holds the
 * same value in every row, in which case it is "famid id fid mid sex".
 */

/** Family ID used when the file has no family column. Matches the exporter's default. */
export const DEFAULT_FAMILY_ID = "1";

/** Affection value used when the file has no affection column (PED "missing"). */
const MISSING_AFFECTION = "0";

/** Fewest columns any layout can have (id fid mid sex). */
const MIN_COLUMNS = 4;

/** Matches the literal PLINK header "FID IID PAT MAT SEX PHENO" (optionally after "#"). */
const PLINK_HEADER_PATTERN = /^#?\s*FID\s+IID\s+PAT\s+MAT\s+SEX\s+PHENO/i;

const ID_NAMES = new Set(["id", "iid", "ind", "individual"]);
const FAMILY_NAMES = new Set(["famid", "fam", "family"]);
const FATHER_NAMES = new Set(["pat", "father", "dad"]);
const MOTHER_NAMES = new Set(["mid", "mat", "mother", "mum", "mom"]);
const SEX_NAMES = new Set(["sex"]);
const AFFECTION_NAMES = new Set(["aff", "affected", "affection", "pheno", "phenotype"]);

/** Column index of each field, or -1 when the file has no such column. */
interface ColumnMap {
  family: number;
  id: number;
  father: number;
  mother: number;
  sex: number;
  affection: number;
  /** Number of columns a row must have to fill every mapped field. */
  required: number;
  /** Number of columns the layout describes; cells beyond this are extra. */
  width: number;
  /** Column indices below `width` that carry no known field. */
  extra: number[];
}

interface Line {
  lineNumber: number;
  cells: string[];
}

export function parsePed(text: string): ParseOutput {
  const rows: PedRow[] = [];
  const issues: ValidationIssue[] = [];

  // Strip UTF-8 BOM if present
  const cleaned = text.startsWith("\uFEFF") ? text.slice(1) : text;

  // Normalise line endings
  const rawLines = cleaned.split(/\r?\n/);

  // Collect candidate lines: non-empty, and not a comment unless it is the
  // first line and reads as a header (e.g. "#FID IID PAT MAT SEX PHENO").
  let headerText: string | null = null;
  let headerLineNumber = 0;
  const dataLines: Array<{ lineNumber: number; text: string }> = [];
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i]!.trim();
    if (trimmed === "") continue;
    const isComment = trimmed.startsWith("#");
    if (headerText === null && dataLines.length === 0 && isHeaderLine(trimmed)) {
      const candidate = trimmed.replace(/^#\s*/, "");
      // A "#" line that names id and sex but cannot be mapped is just a comment.
      if (!isComment || mapHeaderColumns(chooseSplitter(candidate)(candidate)) !== null) {
        headerText = candidate;
        headerLineNumber = i + 1;
        continue;
      }
    }
    if (isComment) continue;
    dataLines.push({ lineNumber: i + 1, text: trimmed });
  }

  const firstText = headerText ?? dataLines[0]?.text ?? "";
  const splitCells = chooseSplitter(firstText);
  const header = headerText === null ? null : splitCells(headerText);
  const lines: Line[] = dataLines.map(l => ({ lineNumber: l.lineNumber, cells: splitCells(l.text) }));

  const columns = header ? mapHeaderColumns(header) : mapPositionalColumns(lines);

  if (columns === null) {
    // Header present but it does not name the columns we need.
    issues.push({
      severity: "error",
      code: ValidationIssueCode.TOO_FEW_COLUMNS,
      message: `Line ${headerLineNumber}: header does not name father and mother columns (expected fid/pat/father and mid/mat/mother)`,
      lineNumbers: [headerLineNumber],
    });
    return { rows, issues };
  }

  let dataLineCount = 0;

  for (const line of lines) {
    const { cells, lineNumber } = line;

    if (cells.length < columns.required) {
      issues.push({
        severity: "error",
        code: ValidationIssueCode.TOO_FEW_COLUMNS,
        message: `Line ${lineNumber}: expected ≥${columns.required} columns, got ${cells.length}`,
        lineNumbers: [lineNumber],
      });
      continue;  // skip row but keep parsing
    }

    dataLineCount++;

    const extraColumns = [
      ...columns.extra.filter(i => i < cells.length).map(i => cells[i]!),
      ...cells.slice(columns.width),
    ];

    // Emit info if extra genotype columns present (once only)
    if (extraColumns.length > 0 && dataLineCount === 1) {
      issues.push({
        severity: "info",
        code: ValidationIssueCode.EXTRA_COLUMNS_IGNORED,
        message: `File has ${extraColumns.length} columns beyond those recognised; extra data will be ignored`,
      });
    }

    rows.push({
      familyId: columns.family >= 0 ? cells[columns.family]! : DEFAULT_FAMILY_ID,
      individualId: cells[columns.id]!,
      fatherId: cells[columns.father]!,
      motherId: cells[columns.mother]!,
      sex: cells[columns.sex]!,
      affection: columns.affection >= 0 ? cells[columns.affection]! : MISSING_AFFECTION,
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

// ── Delimiter ──────────────────────────────────────────────────────────────────

/**
 * Tab-delimited when the first line contains a tab and tab-splitting yields a
 * usable number of cells; otherwise whitespace runs. The fallback keeps files
 * that mix tabs and spaces between columns working.
 */
function chooseSplitter(firstLine: string): (line: string) => string[] {
  if (firstLine.includes("\t")) {
    const cells = splitOnTabs(firstLine);
    if (cells.length >= MIN_COLUMNS) return splitOnTabs;
  }
  return splitOnWhitespace;
}

function splitOnTabs(line: string): string[] {
  return line.split("\t").map(c => c.trim());
}

function splitOnWhitespace(line: string): string[] {
  return line.split(/\s+/);
}

// ── Header detection and column mapping ────────────────────────────────────────

function normaliseName(cell: string): string {
  return cell.trim().toLowerCase();
}

/** True when the line names columns: an id column plus a sex column, or the PLINK header. */
function isHeaderLine(line: string): boolean {
  if (PLINK_HEADER_PATTERN.test(line)) return true;
  const names = line.replace(/^#\s*/, "").split(/\s+/).map(normaliseName);
  return names.some(n => ID_NAMES.has(n)) && names.some(n => SEX_NAMES.has(n));
}

/**
 * Map columns by header name. "fid" is ambiguous: family ID in PLINK, father ID
 * in the R dialect. It is the family column when a separate father column
 * exists or when it comes before the id column; otherwise it is the father.
 * Returns null when no father or mother column can be found.
 */
function mapHeaderColumns(header: string[]): ColumnMap | null {
  const names = header.map(normaliseName);
  const find = (set: Set<string>): number => names.findIndex(n => set.has(n));

  const id = find(ID_NAMES);
  const sex = find(SEX_NAMES);
  let family = find(FAMILY_NAMES);
  let father = find(FATHER_NAMES);
  const mother = find(MOTHER_NAMES);
  const affection = find(AFFECTION_NAMES);

  const fid = names.indexOf("fid");
  if (fid >= 0) {
    if (father >= 0 || fid < id) {
      if (family < 0) family = fid;
    } else {
      father = fid;
    }
  }

  if (id < 0 || sex < 0 || father < 0 || mother < 0) return null;

  const used = new Set([family, id, father, mother, sex, affection].filter(i => i >= 0));
  const extra = names.map((_, i) => i).filter(i => !used.has(i));
  const required = Math.max(...[...used]) + 1;

  return { family, id, father, mother, sex, affection, required, width: names.length, extra };
}

/** Map columns by count when there is no header. */
function mapPositionalColumns(lines: Line[]): ColumnMap {
  const width = lines.reduce((w, l) => Math.max(w, l.cells.length), 0);

  if (width >= 6) {
    // PLINK: FID IID PAT MAT SEX PHENO [genotypes...]
    return { family: 0, id: 1, father: 2, mother: 3, sex: 4, affection: 5, required: 6, width: 6, extra: [] };
  }

  if (width === 5) {
    const firstCells = lines.filter(l => l.cells.length >= 5).map(l => l.cells[0]!);
    const sameFamily = firstCells.every(c => c === firstCells[0]);
    return sameFamily
      ? { family: 0, id: 1, father: 2, mother: 3, sex: 4, affection: -1, required: 5, width: 5, extra: [] }
      : { family: -1, id: 0, father: 1, mother: 2, sex: 3, affection: 4, required: 5, width: 5, extra: [] };
  }

  // id fid mid sex (lines narrower than this are reported as TOO_FEW_COLUMNS)
  return { family: -1, id: 0, father: 1, mother: 2, sex: 3, affection: -1, required: MIN_COLUMNS, width: MIN_COLUMNS, extra: [] };
}
