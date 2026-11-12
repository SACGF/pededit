import type { ClinicalDetails, Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Clinical key fields (#102): what the NSGC nomenclature (2008, Fig. 1
 * instructions) asks a clinical pedigree's key to record besides the symbols.
 * The edit panel, the in-app legend and the export key all read this list, so
 * the order and wording are the same everywhere.
 */

export type ClinicalDetailField = keyof ClinicalDetails;

export interface ClinicalDetailOption {
  field: ClinicalDetailField;
  /** Label in the edit panel and in the key. */
  label: string;
  placeholder: string;
  /** Edited with a date picker; any other text already stored is shown as is. */
  date?: boolean;
  /** Edited in a two-line text area. */
  long?: boolean;
}

export const CLINICAL_DETAIL_OPTIONS: readonly ClinicalDetailOption[] = [
  { field: "referralReason",   label: "Reason for referral", placeholder: "e.g. Family history of breast cancer", long: true },
  { field: "maternalAncestry", label: "Maternal ancestry",   placeholder: "e.g. Ashkenazi Jewish" },
  { field: "paternalAncestry", label: "Paternal ancestry",   placeholder: "e.g. Irish, Italian" },
  { field: "historian",        label: "Historian",           placeholder: "Who gave the history" },
  { field: "recordedBy",       label: "Recorded by",         placeholder: "Name, role" },
  { field: "recordedOn",       label: "Date",                placeholder: "Intake or update", date: true },
];

export const CLINICAL_DETAIL_FIELDS: readonly ClinicalDetailField[] = CLINICAL_DETAIL_OPTIONS.map(o => o.field);

export interface ClinicalDetailLine {
  field: ClinicalDetailField;
  label: string;
  value: string;
}

/** The filled fields, trimmed, in display order. Empty when none is filled. */
export function clinicalDetailLines(pedigree: Pick<Pedigree, "clinicalDetails">): ClinicalDetailLine[] {
  const details = pedigree.clinicalDetails;
  if (!details) return [];
  const lines: ClinicalDetailLine[] = [];
  for (const o of CLINICAL_DETAIL_OPTIONS) {
    const raw = details[o.field];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) lines.push({ field: o.field, label: o.label, value });
  }
  return lines;
}

/**
 * Split text into lines of at most `max` characters, at spaces where
 * possible, for the export key, where SVG text does not wrap by itself.
 */
export function wrapText(text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > max) {
      if (line) { out.push(line); line = ""; }
      out.push(w.slice(0, max));
      w = w.slice(max);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= max) line += " " + w;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}
