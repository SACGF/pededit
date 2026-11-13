export interface SvgExportOptions {
  /**
   * Replace names/DOB/age/notes with NSGC generation-individual notation
   * (I-1, I-2, II-1 …) before rendering. The data model is NOT mutated.
   */
  deidentify?: boolean;

  /**
   * When deidentify=true: instead of omitting ages entirely, bucket the
   * computed age into a clinical range (infant / child / teen / 20s / 30s …).
   * Has no effect when deidentify=false.
   */
  ageBuckets?: boolean;

  /**
   * When deidentify=true: which free text the de-identified copy keeps
   * (#111). Missing keys take `DEIDENTIFY_KEEP_DEFAULTS`. Names, dates, the
   * free-text age, notes, the chart title and the clinical key fields always
   * go.
   */
  deidentifyKeep?: Partial<DeidentifyKeep>;

  /** Padding (px) added on all four sides. Default: 40. */
  padding?: number;

  /**
   * Optional title line rendered above the pedigree. Default: none. Callers
   * pass `chartTitle(pedigree, name)` from `pedigree/labels.ts` (#20).
   */
  title?: string;

  /**
   * Compact layout: 70% row height and 85% slot width, matching the canvas
   * compact mode. Standard top-down layout only. Default: false.
   */
  compact?: boolean;

  /** Render as U-shape (horseshoe) layout instead of standard top-down. */
  uShape?: boolean;

  /**
   * U-shape only: draw married-in partners beside their blood partner.
   * Default: true. When false only blood descendants of the founders are drawn.
   */
  uShapePartners?: boolean;

  /** Show the parametric spine as a red dashed overlay (development aid). */
  debugSpine?: boolean;
}

/** The free text a de-identified export can keep or drop (#111). */
export interface DeidentifyKeep {
  /** Evaluation detail text, "BRCA1 c.5266dupC" in "BRCA1 c.5266dupC +" (#101, #114). */
  evaluationDetail: boolean;
  /**
   * With the detail dropped: keep each evaluation's result mark ("+", "E1-")
   * and the documented "*". False drops the evaluations entirely. Ignored
   * while `evaluationDetail` is true.
   */
  evaluationMarks: boolean;
  /** Ages of onset under the symbol (#93, `onset` and `tagOnset`). */
  onset: boolean;
  /** Text above a double line (#97): `consanguinityLabel` and the named relationship. */
  consanguinityLabels: boolean;
  /** Text-style tags (#3), such as a genotype, under the symbol and in the key. */
  textTags: boolean;
}

/** The maintainer's defaults on #111: drop evaluation detail and onset, keep the rest. */
export const DEIDENTIFY_KEEP_DEFAULTS: DeidentifyKeep = {
  evaluationDetail: false,
  evaluationMarks: true,
  onset: false,
  consanguinityLabels: true,
  textTags: true,
};
