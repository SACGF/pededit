// ---- Public (application-facing) model ----

export type Sex = "male" | "female" | "unknown";

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
  notes?: string;        // free text clinical notes
  hpoTerms?: string[];   // HPO term codes, e.g. ["HP:0001250"] — UI in Phase 7
}

/** A partnership (union) between two individuals. Children attach here, not to parents. */
export interface Partnership {
  id: string;
  individual1: string;
  individual2: string;
  consanguineous?: boolean;
}

export type SiblingOrderMode = "insertion" | "manual" | "birthDate";

export interface SiblingOrderSettings {
  mode: SiblingOrderMode;
  affectedFirst: boolean;
}

export interface Pedigree {
  individuals: Individual[];
  partnerships: Partnership[];
  /** parentOf[partnershipId] = string[] of Individual.id children */
  parentOf: Record<string, string[]>;
  siblingOrder: SiblingOrderSettings;
}

// ---- Internal layout representation (1-based, mirrors kinship2 internals) ----

/** Flat representation used by the layout algorithm. Indices are 1-based (R convention). */
export interface LayoutInput {
  n: number;
  /** 1-based parent indices; 0 = no parent */
  findex: Int32Array;
  mindex: Int32Array;
  sex: Uint8Array; // 1=male, 2=female, 3=unknown
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
