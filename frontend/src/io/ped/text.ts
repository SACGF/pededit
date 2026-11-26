import type { Pedigree } from "@pedigree-editor/layout-engine";
import { importPed } from "./index.js";
import { ValidationIssueCode } from "./types.js";

/**
 * PED text typed or pasted into the text box (#218), read the way a file is
 * (`importPed`), for a live drawing. Text mode is about one family: when the
 * text has several, the first is drawn and `note` says the rest are left out.
 */
export interface PedTextReading {
  /** What to draw: this text's family, or while the text has errors the last good one. */
  pedigree: Pedigree | null;
  /** True when `pedigree` comes from this text, not from the last good one. */
  current: boolean;
  familyId: string | null;
  errors: string[];
  warnings: string[];
  note: string | null;
}

export function readPedText(text: string, lastGood: Pedigree | null = null): PedTextReading {
  const empty = { familyId: null, errors: [], warnings: [], note: null };
  if (text.trim() === "") return { ...empty, pedigree: null, current: true };
  const result = importPed(text);
  const errors = result.issues.filter(i => i.severity === "error").map(i => i.message);
  const warnings = result.issues
    .filter(i => i.severity === "warning" && i.code !== ValidationIssueCode.MULTIPLE_FAMILIES)
    .map(i => i.message);
  if (result.hasErrors || result.pedigrees.length === 0) {
    return { ...empty, pedigree: lastGood, current: false, errors: errors.length ? errors : ["No rows to read."], warnings };
  }
  const [first, ...rest] = result.pedigrees;
  const note = rest.length === 0 ? null
    : `The text has ${result.pedigrees.length} families. Only the first, ${first.familyId}, is drawn: text mode takes one family. Save the text as a .ped file and import it to get them all.`;
  return { pedigree: first.pedigree, current: true, familyId: first.familyId, errors: [], warnings, note };
}
