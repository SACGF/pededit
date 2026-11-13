// ---- Public (application-facing) model ----

export type Sex = "male" | "female" | "unknown";

/**
 * Gender identity (#26, NSGC 2022). Recorded alongside `Individual.sex`,
 * never instead of it: sex stays what layout, kinship and every genetic
 * calculation use. "nonbinary" covers non-binary and gender diverse.
 */
export type GenderIdentity = "man" | "woman" | "nonbinary";

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

/**
 * Assisted reproduction (NSGC 2008 Fig. 3, #45): the letter drawn inside the
 * symbol. "donor" (D) gave the sperm or egg; "surrogate" (S) carried a
 * pregnancy she is not the genetic mother of. A woman who is both egg donor
 * and carrier is a donor only.
 */
export type ReproductiveRole = "donor" | "surrogate";

export interface Individual {
  id: string;
  /** Biological sex (sex assigned at birth). Drives layout, kinship, PED and twins. */
  sex: Sex;
  /**
   * Gender identity (#26). Only changes the symbol drawn, when
   * `canvasSettings.symbolsShow` is "gender" (the default), with the sex
   * assigned at birth written under it. Ignored for pregnancies and losses.
   */
  genderIdentity?: GenderIdentity;
  affected: boolean;
  deceased?: boolean;
  /**
   * Carrier with no condition recorded: the centre dot (NSGC 2008) or half
   * the symbol patterned (NSGC 2022, #115). A carrier of a named condition
   * is in `carrierTags` instead, and the editor clears this flag when one is
   * recorded.
   */
  carrier?: boolean;
  /**
   * Asymptomatic or presymptomatic carrier (#101, NSGC 2008 Fig. 4):
   * clinically unaffected now but may develop the condition, drawn as a
   * vertical line through the symbol. The editor keeps it and `carrier`
   * exclusive (one "carrier status" choice); absent means false.
   */
  presymptomatic?: boolean;
  /**
   * Evaluations and test results (#101, NSGC 2008 Fig. 4), written under
   * the symbol as "BRCA1 c.5266dupC +" (NSGC 2022 dropped the "E", #114).
   * A documented one puts a "*" at the symbol's lower right.
   */
  evaluations?: Evaluation[];
  proband?: boolean;
  /** Consultand (#99): the person seeking counselling, drawn with an arrow without the proband's "P". */
  consultand?: boolean;
  /** Family history not known (#100): a "?" above the symbol. */
  familyHistoryUnknown?: boolean;
  sibOrder: number;      // 0-indexed position within sibling group
  name?: string;         // display name
  dob?: string;          // ISO date string "YYYY-MM-DD"
  /**
   * Date of death (#103): "YYYY-MM-DD", or "YYYY-MM" / "YYYY" when only
   * part is known. Implies `deceased`, which alone means deceased with the
   * date unknown; the editor sets `deceased` with it and clears it when
   * `deceased` is unticked. Drawn as the age at death ("d. 72y") with a
   * full DOB, else the year ("d. 2007").
   */
  dod?: string;
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
  /** Gamete donor "D" or surrogate "S" inside the symbol (#45). */
  reproductiveRole?: ReproductiveRole;
  /**
   * Assisted reproduction (#45): the woman who carried this pregnancy when
   * she is not the genetic mother (a surrogate, or the mother of a child
   * conceived with a donor egg). Drawn as a solid line from her to the
   * child, since a pregnancy is a biological relationship (teratogens), but
   * she is not a parent for kinship or PED. The genetic parents are the
   * partnership in `parentOf`.
   */
  carriedBy?: string;
  /**
   * Assisted reproduction (#45): parents of this child who are not its
   * genetic parents, such as the intended father when donor sperm is used.
   * Drawn as a dashed line of descent; not parents for kinship or PED.
   */
  socialParents?: string[];
  tags?: string[];       // Tag.id values from Pedigree.tags applied to this individual
  /**
   * Conditions (quadrant tags) this person is a carrier of (#115): the
   * condition's sector is drawn with its carrier pattern, keyed "<condition>
   * carrier". A quadrant tag in `tags` means affected with that condition;
   * the editor keeps a tag in at most one of the two lists. Ids of other
   * tag styles are ignored. Absent means none.
   */
  carrierTags?: string[];
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
  /**
   * Made automatically as the second parent when someone was given a single
   * parent (#107, frontend `pedigree/placeholders.ts`). While nothing is
   * recorded about them, they are removed with their couple line when the
   * couple loses its last child. Cleared when the user sets their sex.
   */
  placeholder?: boolean;
}

/** Result of an evaluation (#101): "+", "-" or "u" after the detail. Absent: no result recorded. */
export type EvaluationResult = "positive" | "negative" | "uninformative";

export interface Evaluation {
  result?: EvaluationResult;
  /** Short text shown before the result, e.g. "BRCA1 c.5266dupC" or "echo". */
  detail?: string;
  /** Examined by your team, or an outside result reviewed and verified: "*" by the symbol. */
  documented?: boolean;
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

/**
 * How a quadrant tag fills its sector (#67): "solid" in the tag's colour, or a
 * pattern drawn in the tag's colour on white (a black pattern is monochrome).
 * "shade" is a light tint of the colour (light grey for black).
 */
export type TagFill = "solid" | "horizontal" | "vertical" | "diagonal" | "crosshatch" | "dots" | "shade";

/**
 * Tag fills for the whole pedigree (#67): "color" draws each tag as set;
 * "monochrome" draws every tag in black, each quadrant tag with a pattern
 * (its own, or one assigned automatically when its fill is solid).
 */
export type TagFillMode = "color" | "monochrome";

export interface Tag {
  id: string;
  /** Full name shown in the legend and tag manager. */
  label: string;
  /** CSS colour, normally "#rrggbb". */
  color: string;
  style: TagStyle;
  /** Short canvas text for "text" style tags. Defaults to label. */
  abbrev?: string;
  /** Fill of a quadrant tag's sector (#67). Absent means "solid". Ignored for dot and text tags. */
  fill?: TagFill;
  /**
   * What a quadrant tag means (#118). Absent or "condition": a condition,
   * affected with it (`Individual.tags`) or a carrier (`carrierTags`), #115.
   * "trait": only a coloured section, saying nothing about affected status
   * (a biobank sample, a cohort, a trait of the family); PED, CSV, filters
   * and warnings ignore it. Opt-in, beyond NSGC, where shading is a
   * condition; the key names it. Ignored for dot and text tags.
   */
  kind?: TagKind;
}

export type TagKind = "condition" | "trait";

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
  /**
   * Text written above the double line (#97), e.g. "third cousins": the
   * degree of relationship when the drawing does not show it. Only drawn
   * when the line is double.
   */
  consanguinityLabel?: string;
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
  /**
   * Assisted reproduction (#45): the children were conceived with a donated
   * sperm or egg, so the partners are their genetic parents but not a
   * couple. No relationship line is drawn between them (NSGC 2008 Fig. 3);
   * each partner's line of descent runs to the children instead. Kinship
   * and the layout treat them as ordinary parents.
   */
  donorConception?: boolean;
  /**
   * The partner drawn on the left of this couple (#106): the id of
   * `individual1` or `individual2`. Absent means the layout chooses (kinship2:
   * the man on the left unless merging someone's copies needs otherwise).
   * Fed to kinship2 as a spouse hint, so it never pins anyone.
   */
  leftPartner?: string;
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
  /**
   * Write the relationship ("first cousins") above every consanguineous
   * couple's double line that can be named and has no text of its own
   * (#97). Absent means false.
   */
  relationshipLabels?: boolean;
  /**
   * What the symbol shapes show (#26): "gender" draws a person with a
   * recorded gender identity with that gender's symbol and writes AMAB /
   * AFAB / UAAB under it (NSGC 2022); "sex" draws biological sex for
   * everyone. Absent means "gender".
   */
  symbolsShow?: SymbolsShowMode;
  /**
   * Edition of the NSGC nomenclature drawn: "nsgc2008" writes evaluation
   * results as "E+ (detail)", numbered E1, E2, and draws a carrier with no
   * condition as the centre dot; "nsgc2022" writes "detail +" (#114) and
   * draws that carrier as half the symbol patterned (#115). Absent means
   * "nsgc2008", so pedigrees saved before the setting existed keep their
   * look; every new pedigree, PED import and built-in example is written
   * with "nsgc2022".
   */
  notation?: NotationEdition;
  /**
   * Tag fills (#67): "monochrome" draws every tag in black, quadrant tags
   * with patterns, on the canvas and in exports, for print and journals.
   * Absent means "color".
   */
  tagFills?: TagFillMode;
}

export type SymbolsShowMode = "gender" | "sex";
export type NotationEdition = "nsgc2022" | "nsgc2008";

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
  /**
   * What NSGC asks a clinical pedigree's key to record besides the symbols
   * (#102): why it was taken, who took it and when, who gave the history,
   * and the ancestry of both sides. Shown in the legend and the export key
   * when filled; de-identified export drops all of it.
   */
  clinicalDetails?: ClinicalDetails;
  /**
   * View filters (#4): simplify what is drawn without changing the data. The
   * canvas, legend, pedigree numbers and SVG / PNG / PDF exports draw the
   * filtered pedigree; JSON, PED and CSV keep everyone. See the frontend's
   * `pedigree/viewFilters.ts`. Absent means no filter.
   */
  filters?: ViewFilters;
}

/** View filters (#4). Each is off when absent. */
export interface ViewFilters {
  /**
   * Draw only affected people, carriers, people with a condition tag and the
   * proband (and consultand), with their ancestors. Each drawn sibship's other
   * children become one numbered group symbol.
   */
  affectedOnly?: boolean;
}

/** Free-text clinical key fields (#102). Absent or empty means not recorded. */
export interface ClinicalDetails {
  /** Reason for taking the pedigree, e.g. "Family history of breast cancer". */
  referralReason?: string;
  /** Who drew the pedigree. */
  recordedBy?: string;
  /** Date of intake or last update, as typed (ISO "2026-11-12" from the date picker). */
  recordedOn?: string;
  /** Who gave the history, e.g. "Proband and her mother". */
  historian?: string;
  /** Ancestry of the maternal side, relative to the proband. */
  maternalAncestry?: string;
  /** Ancestry of the paternal side, relative to the proband. */
  paternalAncestry?: string;
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
