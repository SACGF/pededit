// ---- Public (application-facing) model ----

export type Sex = "male" | "female" | "unknown";

/**
 * Pregnancy and pregnancy-loss status (NSGC 2008, Bennett et al.). Absent means
 * a born individual, living or deceased. Layout treats these as ordinary sibs;
 * only the symbol changes.
 */
export type LifeStatus = "pregnancy" | "miscarriage" | "termination" | "stillbirth" | "ectopic";

/**
 * Adoption (NSGC 2008): brackets around the symbol. "in" is adopted into the
 * family shown (dashed line to the adoptive parents), "out" is a biological
 * child placed for adoption (solid line to the biological parents).
 */
export type Adoption = "in" | "out";

export interface Individual {
  id: string;
  sex: Sex;
  affected: boolean;
  deceased?: boolean;
  carrier?: boolean;
  proband?: boolean;
  sibOrder: number;      // 0-indexed position within sibling group
  name?: string;         // display name
  dob?: string;          // ISO date string "YYYY-MM-DD"
  /**
   * The individual's age as free text, shown under the symbol in place of
   * the DOB (#20): "50s", "d. 72", "34 y". For an approximate age, or one
   * known without a date. Not an age of onset.
   */
  age?: string;
  notes?: string;        // free text clinical notes
  hpoTerms?: string[];   // HPO term codes, e.g. ["HP:0001250"] — UI in Phase 7
  lifeStatus?: LifeStatus; // pregnancy / miscarriage / termination / stillbirth / ectopic; absent = born
  adopted?: Adoption;    // brackets round the symbol; "in" also dashes the line from the parents
  tags?: string[];       // Tag.id values from Pedigree.tags applied to this individual
  /**
   * Age of onset of the affected status (#93), free text such as "45y",
   * "40s" or "childhood". Used only while `affected` is true.
   */
  onset?: string;
  /**
   * Age of onset per condition (#93): Tag.id of a quadrant tag this
   * individual carries, to free text as for `onset`.
   */
  tagOnset?: Record<string, string>;
  /**
   * Everyone below this person is left out of the drawing (#94): the canvas,
   * the layout and the exports all work from the drawn subset (see the
   * frontend's `pedigree/collapse.ts`). Nothing is deleted; clearing the flag
   * brings the branch back.
   */
  descendantsHidden?: boolean;
}

/**
 * How a tag is drawn on the symbols of the individuals that carry it.
 *
 *  - "quadrant": fills one sector of the symbol with the tag colour. The sector
 *    is assigned by the tag's position among the pedigree's quadrant tags
 *    (NSGC multi-condition convention: up to four quarters, more become equal
 *    pie slices). Use for conditions / phenotypes.
 *  - "dot": a small coloured dot in the annotation row below the symbol. Use
 *    for sample / workflow status such as "DNA available" or "sequenced".
 *  - "text": short coloured text in the annotation row below the symbol
 *    (abbrev, falling back to label). Use for genotypes such as "exp/+".
 */
export type TagStyle = "quadrant" | "dot" | "text";

export interface Tag {
  id: string;
  /** Full name shown in the legend and tag manager. */
  label: string;
  /** CSS colour, normally "#rrggbb". */
  color: string;
  style: TagStyle;
  /** Short canvas text for "text" style tags. Defaults to label. */
  abbrev?: string;
}

/**
 * Why a couple has no children (NSGC 2008): drawn under the couple line as a
 * short vertical with one bar (no children by choice) or two bars
 * (infertility). Only meaningful on a partnership with no children.
 */
export type ChildlessStatus = "infertility" | "byChoice";

export type Zygosity = "monozygotic" | "dizygotic" | "unknown";

/**
 * Twins (or triplets, ...) among one partnership's children (#11). Members are
 * child ids of that partnership, at least two, each in at most one set.
 * Monozygotic members have the same sex. Drawn as a shared fork from the
 * sibship bar, a bar across the fork for monozygotic, "?" for unknown.
 */
export interface TwinSet {
  members: string[];
  zygosity: Zygosity;
}

/** A partnership (union) between two individuals. Children attach here, not to parents. */
export interface Partnership {
  id: string;
  individual1: string;
  individual2: string;
  /**
   * Override: the couple are related although the pedigree does not show
   * how, so their line is drawn double. A couple the pedigree does show to
   * be related needs no flag (the editor tests kinship above 0, #85).
   */
  consanguineous?: boolean;
  /** Childless couple mark. Cleared when a child is added. */
  childless?: ChildlessStatus;
  /** Optional reason shown under the mark, e.g. "vasectomy". */
  childlessReason?: string;
  /** Twin sets among this partnership's children. */
  twins?: TwinSet[];
  /**
   * The relationship no longer exists (separated, divorced): two short
   * strokes across the couple line (NSGC 2008, #98). Absent means false.
   */
  ended?: boolean;
}

export type SiblingOrderMode = "insertion" | "manual" | "birthDate";

export interface SiblingOrderSettings {
  mode: SiblingOrderMode;
  affectedFirst: boolean;
}

export interface CanvasSettings {
  /** When true all nodes are draggable without individual unlock. Default false. */
  nodesMoveable: boolean;
  snapToGrid: boolean;
  snapGridSize: number;
  /**
   * How a name too long for its slot is shown on the canvas (#68): "wrap"
   * onto two lines, or "truncate" to one line. Absent means "wrap".
   */
  nameLabels?: NameLabelMode;
  /**
   * How wide the automatic layout may be (#82): "minimal" keeps it to the
   * widest generation (the kinship2 default), "relaxed" lets it use a little
   * more so children sit more directly under their parents. Absent means
   * "minimal".
   */
  layoutWidth?: LayoutWidthMode;
  /**
   * Draw each person's pedigree number ("II-3", #8) before their name, on the
   * canvas and in exports. The numbers are computed from the layout, never
   * stored. Absent means false.
   */
  showNumbers?: boolean;
}

export type NameLabelMode = "wrap" | "truncate";

export type LayoutWidthMode = "minimal" | "relaxed";

export interface Pedigree {
  individuals: Individual[];
  partnerships: Partnership[];
  /** parentOf[partnershipId] = string[] of Individual.id children */
  parentOf: Record<string, string[]>;
  siblingOrder: SiblingOrderSettings;
  /** Manual drag overrides: individualId → canvas pixel position */
  pinnedPositions?: Record<string, { x: number; y: number }>;
  /** Canvas / drag / snap settings. Absent = all defaults (locked, no snap). */
  canvasSettings?: CanvasSettings;
  /** Individual IDs unlocked for dragging when canvasSettings.nodesMoveable is false. */
  unlockedIndividuals?: string[];
  /**
   * Tag definitions for this pedigree, in display order. Quadrant tags take
   * their sector from their order here. Individuals reference tags by id.
   */
  tags?: Tag[];
  /**
   * Title drawn above the chart on the canvas and in exports (#20). Absent
   * means the pedigree's name (unless it is the default "Untitled pedigree");
   * an empty string means no title.
   */
  chartTitle?: string;
}

// ---- Internal layout representation (1-based, mirrors kinship2 internals) ----

/** Flat representation used by the layout algorithm. Indices are 1-based (R convention). */
export interface LayoutInput {
  n: number;
  /** 1-based parent indices; 0 = no parent */
  findex: Int32Array;
  mindex: Int32Array;
  sex: Uint8Array; // 1=male, 2=female, 3=unknown
  /**
   * Partnerships with no children, as flat [fatherRole, motherRole] pairs
   * (1-based). kinship2 only learns about couples from findex/mindex, so these
   * are fed to kindepth's spouse alignment and to the spouselist separately.
   * Absent or empty for input read from a PED file.
   */
  childlessCouples?: Int32Array;
}

/** Hints produced by autohint and consumed by alignPedigree. */
export interface Hints {
  /** 1-based; relative left-to-right order within each generation */
  order: Float64Array;
  /** Rows: [husbandIdx(1-based), wifeIdx(1-based), anchor(0|1|2)] */
  spouse: Int32Array | null; // null if no explicit hints; shape (nHints × 3)
}

// ---- Internal working matrices (1-based rows and columns) ----

/** State passed between alignped1–alignped3. All matrices 1-based; [0,*] and [*,0] unused. */
export interface AlignState {
  n: Int32Array;
  nid: Float64Array[]; // nid[lev][col] = individual index + optional 0.5 for spouse copies
  pos: Float64Array[]; // pos[lev][col] = horizontal position
  fam: Int32Array[];   // fam[lev][col] = left-parent column in level above (0 = no parent)
}

// ---- Public output ----

export interface LayoutResult {
  /** Number of individuals rendered at each generation level (0-based levels). */
  n: number[];
  /** nid[level][slot] = 1-based individual index, or index+0.5 for spouse copies. */
  nid: number[][];
  /** pos[level][slot] = horizontal position. */
  pos: number[][];
  /**
   * fam[level][slot] = 1-based column of LEFT parent in level-1, or 0 for no parent.
   * Parents are at fam[level][slot] and fam[level][slot]+1 in the row above.
   */
  fam: number[][];
  /**
   * spouse[level][slot]:
   *   0 = not a spouse pair marker
   *   1 = individual to immediate right is a spouse
   *   2 = individual to immediate right is a consanguineous spouse
   */
  spouse: number[][];
}
