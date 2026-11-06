import type { Pedigree } from "@pedigree-editor/layout-engine";
import type { IssueSeverity } from "../ped/types.js";

/** Value of the `format` field in the JSON envelope. */
export const JSON_FORMAT = "pededit-pedigree";
/** Current envelope version written by the exporter. */
export const JSON_VERSION = 1;

/** Top-level document written by exportJson and accepted by importJson. */
export interface PedigreeJsonEnvelope {
  format: typeof JSON_FORMAT;
  version: number;
  /** ISO 8601 timestamp of the export. */
  exportedAt: string;
  title: string;
  pedigree: Pedigree;
}

export enum JsonIssueCode {
  // Errors (block import)
  INVALID_JSON             = "INVALID_JSON",
  NOT_AN_OBJECT            = "NOT_AN_OBJECT",
  UNKNOWN_FORMAT           = "UNKNOWN_FORMAT",
  MISSING_FIELD            = "MISSING_FIELD",
  WRONG_TYPE               = "WRONG_TYPE",
  INVALID_VALUE            = "INVALID_VALUE",
  DUPLICATE_ID             = "DUPLICATE_ID",
  UNKNOWN_INDIVIDUAL       = "UNKNOWN_INDIVIDUAL",
  UNKNOWN_PARTNERSHIP      = "UNKNOWN_PARTNERSHIP",
  SELF_PARTNERSHIP         = "SELF_PARTNERSHIP",
  CHILD_OF_OWN_PARTNERSHIP = "CHILD_OF_OWN_PARTNERSHIP",
  MULTIPLE_PARENT_SETS     = "MULTIPLE_PARENT_SETS",
  CIRCULAR_ANCESTRY        = "CIRCULAR_ANCESTRY",

  // Warnings (allow import with notice)
  NEWER_VERSION            = "NEWER_VERSION",
  DEFAULT_APPLIED          = "DEFAULT_APPLIED",
  DANGLING_REFERENCE       = "DANGLING_REFERENCE",

  // Info
  BARE_PEDIGREE            = "BARE_PEDIGREE",
}

export interface JsonValidationIssue {
  severity: IssueSeverity;
  code: JsonIssueCode;
  message: string;
  /** Dotted path into the document, e.g. "pedigree.individuals[2].sex". */
  path?: string;
  affectedIds?: string[];
}

export interface JsonImportResult {
  /** The validated pedigree, or null when hasErrors is true. */
  pedigree: Pedigree | null;
  /** Title from the envelope, or null for a bare pedigree document. */
  title: string | null;
  issues: JsonValidationIssue[];
  /** True if any issue has severity="error". */
  hasErrors: boolean;
}
