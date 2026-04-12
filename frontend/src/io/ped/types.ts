import type { Pedigree } from "@pedigree-editor/layout-engine";

/** A single parsed row from a PED file, before validation. */
export interface PedRow {
  familyId: string;
  individualId: string;
  fatherId: string;    // "0" = no father
  motherId: string;    // "0" = no mother
  sex: string;         // raw: "0","1","2" or non-standard
  affection: string;   // raw: "0","1","2","-9" or non-standard
  lineNumber: number;
  extraColumns: string[];  // genotype columns and anything else beyond col 6
}

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: ValidationIssueCode;
  message: string;
  affectedIds?: string[];  // FID:IID pairs for context
  lineNumbers?: number[];
}

export enum ValidationIssueCode {
  // Errors (block import)
  EMPTY_FILE              = "EMPTY_FILE",
  TOO_FEW_COLUMNS         = "TOO_FEW_COLUMNS",
  DUPLICATE_INDIVIDUAL    = "DUPLICATE_INDIVIDUAL",
  SELF_AS_PARENT          = "SELF_AS_PARENT",
  CIRCULAR_ANCESTRY       = "CIRCULAR_ANCESTRY",

  // Warnings (allow import with notice)
  PHANTOM_PARENT          = "PHANTOM_PARENT",
  SINGLE_PARENT           = "SINGLE_PARENT",
  SEX_MISMATCH            = "SEX_MISMATCH",      // PAT=female or MAT=male
  UNKNOWN_SEX_CODE        = "UNKNOWN_SEX_CODE",
  UNKNOWN_PHENO_CODE      = "UNKNOWN_PHENO_CODE",
  ZERO_IID                = "ZERO_IID",           // IID = "0" (valid but confusing)

  // Info
  MULTIPLE_FAMILIES       = "MULTIPLE_FAMILIES",
  EXTRA_COLUMNS_IGNORED   = "EXTRA_COLUMNS_IGNORED",
  CONSANGUINITY_DETECTED  = "CONSANGUINITY_DETECTED",
}

/** Result of parse+validate+convert pipeline. */
export interface ImportResult {
  /** One Pedigree per unique FID. Usually length=1. */
  pedigrees: Array<{
    familyId: string;
    pedigree: Pedigree;
  }>;
  issues: ValidationIssue[];
  /** True if any issue has severity="error" (pedigrees may be empty). */
  hasErrors: boolean;
}
