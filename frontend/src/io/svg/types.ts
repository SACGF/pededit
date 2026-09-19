export interface SvgExportOptions {
  /**
   * Replace names/DOB/notes with NSGC generation-individual notation
   * (I-1, I-2, II-1 …) before rendering. The data model is NOT mutated.
   */
  deidentify?: boolean;

  /**
   * When deidentify=true: instead of omitting ages entirely, bucket the
   * computed age into a clinical range (infant / child / teen / 20s / 30s …).
   * Has no effect when deidentify=false.
   */
  ageBuckets?: boolean;

  /** Padding (px) added on all four sides. Default: 40. */
  padding?: number;

  /** Optional title line rendered above the pedigree. Default: none. */
  title?: string;

  /** Render as U-shape (horseshoe) layout instead of standard top-down. */
  uShape?: boolean;

  /** Show the parametric spine as a red dashed overlay (development aid). */
  debugSpine?: boolean;
}
