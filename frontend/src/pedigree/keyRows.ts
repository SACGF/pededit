/**
 * The rows of the chart's key, as plain data: which rows, in what
 * order, with what label, and what each swatch shows. The legend on the
 * Pedigree tab (`components/Legend.tsx`) and the key of the SVG, PNG and PDF
 * exports (`exportKey.ts`) both draw from this list, each through a switch on
 * `KeyRow["kind"]` that TypeScript checks for completeness: a new kind of row
 * does not compile until both draw it.
 *
 * The two are not the same list. Every difference is here, in
 * `SYMBOL_ORDER`, `RELATIONSHIP_ORDER` and the lines marked "Legend only" /
 * "Export only", and in `KEY_DIFFERENCES`, which a test holds the rows to.
 * Framework-free.
 */
import type {
  Adoption, ChildlessStatus, Individual, LifeStatus, Pedigree, ReproductiveRole, Sex, Tag, Zygosity,
} from "@pedigree-editor/layout-engine";
import { collapseInfo, isBranchPlaceholderId, COLLAPSED_BRANCH_LABEL } from "./collapse";
import { symbolSex, anyDrawnByGender, assignedAtBirthInUse } from "./gender";
import { pedigreeTags, symbolPaint, tagsInUse, PLAIN_CARRIER_TAG } from "./tags";
import { carrierConditions, carrierLabel, plainAffected, plainStatusLabel } from "./conditions";
import { inbreedingLabel, kinshipLabel } from "./relatedness";
import { evaluationKeyInfo, evaluationLegend, PRESYMPTOMATIC_LEGEND_LABEL, DOCUMENTED_LEGEND_LABEL } from "./evaluation";
import { notationOf } from "./notation";
import { arrowKind, ARROW_LEGEND_LABEL } from "./proband";
import { FAMILY_HISTORY_LEGEND_LABEL } from "./familyHistory";
import { LIFE_STATUS_OPTIONS } from "./lifeStatus";
import { ADOPTION_OPTIONS, adoptionLegendLabel } from "./adoption";
import { REPRODUCTIVE_ROLE_OPTIONS, roleLegendLabel, symbolLetter, assistedLinks, CARRIER_LINE_LEGEND, SOCIAL_LINE_LEGEND } from "./assisted";
import { consanguinityTest } from "./consanguinity";
import { ENDED_LABEL, hasEndedPartnership } from "./ended";
import { CHILDLESS_OPTIONS, childlessPartnerships } from "./childless";
import { ZYGOSITY_OPTIONS, twinLegendLabel, zygositiesInUse } from "./twins";
import { drawsDuplicates } from "./duplicates";
import { DUPLICATE_LEGEND_LABEL } from "./constants";
import { clinicalDetailLines } from "./clinicalDetails";

export type KeyTarget = "legend" | "export";

/**
 * One row of the key. `shape` is the outline of the first person drawn with
 * what the row explains, so the swatch looks like someone on the chart.
 */
export type KeyRow =
  | { kind: "sex"; shape: Sex; label: string }
  | { kind: "assignedAtBirth"; code: string; label: string }
  | { kind: "affected"; shape: Sex; label: string }
  | { kind: "affectedCore"; shape: Sex; label: string }
  | { kind: "carrier"; shape: Sex; /** The 2022 dotted half, not the 2008 dot. */ half: boolean; label: string }
  | { kind: "presymptomatic"; shape: Sex; label: string }
  | { kind: "deceased"; shape: Sex; label: string }
  | { kind: "proband"; shape: Sex; label: string }
  | { kind: "consultand"; shape: Sex; label: string }
  | { kind: "familyHistoryUnknown"; shape: Sex; label: string }
  | { kind: "evaluation"; /** "+/-" (2022) or "E" (2008). */ mark: string; label: string }
  | { kind: "documented"; shape: Sex; label: string }
  | { kind: "inbreeding"; label: string }
  | { kind: "lifeStatus"; status: LifeStatus; shape: Sex; label: string }
  | { kind: "adopted"; adopted: Adoption; shape: Sex; label: string }
  | { kind: "role"; role: ReproductiveRole; letter: string; shape: Sex; label: string }
  | { kind: "collapsedBranch"; label: string }
  | { kind: "couple"; label: string }
  | { kind: "consanguineous"; label: string }
  | { kind: "kinship"; label: string }
  | { kind: "ended"; label: string }
  | { kind: "childless"; status: ChildlessStatus; label: string }
  | { kind: "twins"; zygosity: Zygosity; label: string }
  | { kind: "assistedLine"; line: "carrier" | "social"; label: string }
  | { kind: "duplicate"; label: string }
  | { kind: "tag"; tag: Tag; /** The "<condition> carrier" row. */ carrier: boolean; /** Someone drawn has it. */ inUse: boolean; label: string }
  | { kind: "clinicalDetail"; field: string; label: string; value: string };

export type KeyRowKind = KeyRow["kind"];

/** What the "F" under a symbol and the "φ" above a double line stand for. */
export const INBREEDING_LEGEND_LABEL = "Inbreeding coefficient";
export const KINSHIP_LEGEND_LABEL = "Kinship coefficient of the couple";

export interface KeyRows {
  /** The pedigree as drawn (hidden people left out), which tag swatches are painted from. */
  pedigree: Pedigree;
  /** Conditions and tags. */
  tags: KeyRow[];
  /** What a symbol and the marks on it mean. */
  symbols: KeyRow[];
  /** Lines between people. */
  relationships: KeyRow[];
  /** Clinical details: text, not swatches. */
  details: KeyRow[];
}

/**
 * How the legend and the export key differ, on purpose. A test
 * checks that these are the only differences, so a new one has to be written
 * down here.
 */
export const KEY_DIFFERENCES = {
  /** The legend explains the plain shapes and the plain couple line; a figure's key does not. */
  legendOnly: ["sex", "couple"] as KeyRowKind[],
  /** The legend lists every defined condition and tag, an unused one in grey; the export key lists those in use. */
  legendListsUnusedTags: true,
  /** A stillbirth and an ectopic pregnancy name their caption in the export key ("Stillbirth (SB)"). */
  exportLabels: { stillbirth: "Stillbirth (SB)", ectopic: "Ectopic pregnancy (ECT)" } as Partial<Record<LifeStatus, string>>,
  /** The symbol rows keep one order, after the legend's shapes, and so do the relationship rows. */
  symbolOrderDiffers: false,
};

/**
 * Order of the symbol rows, the same for both: status first, then the
 * two arrows together, then family history, as NSGC's own key reads. The
 * legend begins with the shapes.
 */
const EXPORT_SYMBOL_ORDER: KeyRowKind[] = [
  "affected", "affectedCore", "carrier", "presymptomatic", "deceased", "assignedAtBirth",
  "proband", "consultand", "familyHistoryUnknown", "evaluation", "documented", "inbreeding",
  "lifeStatus", "adopted", "role", "collapsedBranch",
];
const SYMBOL_ORDER: Record<KeyTarget, KeyRowKind[]> = {
  legend: ["sex", ...EXPORT_SYMBOL_ORDER],
  export: EXPORT_SYMBOL_ORDER,
};

const RELATIONSHIP_ORDER: Record<KeyTarget, KeyRowKind[]> = {
  legend: ["couple", "consanguineous", "kinship", "ended", "childless", "twins", "assistedLine", "duplicate"],
  export: ["consanguineous", "kinship", "ended", "childless", "twins", "assistedLine", "duplicate"],
};

export interface KeyRowsOptions {
  /**
   * The drawing joins two copies of someone with a dashed arc. An
   * exporter knows from its own layout (the U-shape draws different copies);
   * left out, it is worked out from the standard layout.
   */
  duplicates?: boolean;
}

/**
 * The key's rows for a pedigree. `pedigree` is the one being edited (the
 * legend) or the one being drawn into a file, de-identified or not (the
 * export); hidden descendants and filtered people add no rows.
 */
export function keyRows(pedigree: Pedigree, target: KeyTarget, options: KeyRowsOptions = {}): KeyRows {
  // Only what is drawn: hidden descendants add no entries, and the
  // group symbols standing for collapsed siblings have their own row.
  const { drawn, placeholders } = collapseInfo(pedigree);
  const individuals = drawn.individuals.filter(i => !isBranchPlaceholderId(i.id));
  // Swatches use the shape drawn, which is the gender identity's when shown.
  const shape = (i: Individual) => symbolSex(i, drawn);
  const found: Partial<Record<KeyRowKind, KeyRow[]>> = {};
  const add = (row: KeyRow) => { (found[row.kind] ??= []).push(row); };

  // ── Symbols ────────────────────────────────────────────────────────────────
  const byGender = anyDrawnByGender(drawn);
  const sexLabels: Record<Sex, string> = byGender
    ? { male: "Man / male", female: "Woman / female", unknown: "Non-binary / unknown sex" }
    : { male: "Male", female: "Female", unknown: "Unknown sex" };
  for (const sex of ["male", "female", "unknown"] as const) {
    if (individuals.some(i => shape(i) === sex)) add({ kind: "sex", shape: sex, label: sexLabels[sex] });
  }
  // Sex assigned at birth under a symbol drawn by gender identity.
  for (const { code, label } of assignedAtBirthInUse(drawn)) add({ kind: "assignedAtBirth", code, label });

  // Affected and carrier with no condition recorded, as drawn (`statusKeyRows`).
  const status = statusKeyRows(drawn, individuals);
  if (status.affected) add({ kind: "affected", shape: shape(status.affected), label: status.affectedLabel });
  if (status.core) add({ kind: "affectedCore", shape: shape(status.core), label: status.coreLabel });
  if (status.carrier) add({ kind: "carrier", shape: shape(status.carrier), half: status.carrierHalf, label: status.carrierLabel });

  // Presymptomatic carrier and evaluation notation.
  const notation = notationOf(drawn);
  const ev = evaluationKeyInfo(individuals, drawn, notation);
  const evLegend = evaluationLegend(notation);
  if (ev.presymptomatic) add({ kind: "presymptomatic", shape: shape(ev.presymptomatic), label: PRESYMPTOMATIC_LEGEND_LABEL });
  const deceased = individuals.find(i => i.deceased);
  if (deceased) add({ kind: "deceased", shape: shape(deceased), label: "Deceased" });
  // Proband and consultand arrows.
  for (const kind of ["proband", "consultand"] as const) {
    const ind = individuals.find(i => arrowKind(i) === kind);
    if (ind) add({ kind, shape: shape(ind), label: ARROW_LEGEND_LABEL[kind] });
  }
  // Family history not known.
  const history = individuals.find(i => i.familyHistoryUnknown);
  if (history) add({ kind: "familyHistoryUnknown", shape: shape(history), label: FAMILY_HISTORY_LEGEND_LABEL });
  if (ev.evaluated) add({ kind: "evaluation", mark: evLegend.mark, label: evLegend.label });
  if (ev.documented) add({ kind: "documented", shape: shape(ev.documented), label: DOCUMENTED_LEGEND_LABEL });
  // Pregnancies and losses.
  for (const o of LIFE_STATUS_OPTIONS) {
    const ind = individuals.find(i => i.lifeStatus === o.value);
    if (!ind) continue;
    const label = target === "export" ? KEY_DIFFERENCES.exportLabels[o.value] ?? o.label : o.label;
    add({ kind: "lifeStatus", status: o.value, shape: shape(ind), label });
  }
  // Adoption brackets.
  for (const o of ADOPTION_OPTIONS) {
    const ind = individuals.find(i => i.adopted === o.value);
    if (ind) add({ kind: "adopted", adopted: o.value, shape: shape(ind), label: adoptionLegendLabel(o.value) });
  }
  // Assisted reproduction: the symbol with its "D" or "S".
  for (const o of REPRODUCTIVE_ROLE_OPTIONS) {
    const ind = individuals.find(i => symbolLetter(i) === o.letter);
    if (ind) add({ kind: "role", role: o.value, letter: o.letter, shape: shape(ind), label: roleLegendLabel(o.value) });
  }
  // Collapsed branches: the group symbol with a number in it.
  if (placeholders.size > 0) add({ kind: "collapsedBranch", label: COLLAPSED_BRANCH_LABEL });

  // ── Relationships ──────────────────────────────────────────────────────────
  // A donor pair has no couple line.
  if (drawn.partnerships.some(p => !p.donorConception)) add({ kind: "couple", label: "Couple" });
  // Double couple line, by the same rule the canvas and exporter draw it with.
  const related = consanguinityTest(drawn);
  if (drawn.partnerships.some(p => related(p.individual1, p.individual2))) add({ kind: "consanguineous", label: "Consanguineous couple" });
  // The coefficients, where the pedigree draws them and someone has one.
  if (drawn.partnerships.some(p => related(p.individual1, p.individual2) && kinshipLabel(drawn, p.individual1, p.individual2))) {
    add({ kind: "kinship", label: KINSHIP_LEGEND_LABEL });
  }
  if (individuals.some(i => inbreedingLabel(drawn, i.id))) add({ kind: "inbreeding", label: INBREEDING_LEGEND_LABEL });
  // Ended relationship.
  if (hasEndedPartnership(drawn)) add({ kind: "ended", label: ENDED_LABEL });
  // Childless couple marks.
  const childless = new Set(childlessPartnerships(drawn).map(p => p.childless!));
  for (const o of CHILDLESS_OPTIONS) if (childless.has(o.value)) add({ kind: "childless", status: o.value, label: o.label });
  // Twin forks.
  const zygosities = zygositiesInUse(drawn);
  for (const o of ZYGOSITY_OPTIONS) if (zygosities.has(o.value)) add({ kind: "twins", zygosity: o.value, label: twinLegendLabel(o.value) });
  // Lines of assisted reproduction.
  const linkKinds = new Set(assistedLinks(drawn).map(l => l.kind));
  if (linkKinds.has("carrier")) add({ kind: "assistedLine", line: "carrier", label: CARRIER_LINE_LEGEND });
  if (linkKinds.has("social")) add({ kind: "assistedLine", line: "social", label: SOCIAL_LINE_LEGEND });
  // Someone drawn more than once.
  if (options.duplicates ?? drawsDuplicates(pedigree)) add({ kind: "duplicate", label: DUPLICATE_LEGEND_LABEL });

  // ── Conditions and tags ────────────────────────────────────────────────────
  const used = new Set(tagsInUse(drawn).map(t => t.id));
  const inKey = keyTagRows(drawn);
  const tags: KeyRow[] = [];
  if (target === "legend") {
    // Legend only: every defined tag, so an unused one can still be ticked. A
    // condition with carriers gets its "<condition> carrier" row after it.
    const carriersOf = new Set(inKey.filter(r => r.carrier).map(r => r.tag.id));
    for (const tag of pedigreeTags(drawn)) {
      tags.push({ kind: "tag", tag, carrier: false, inUse: used.has(tag.id), label: tag.label });
      if (carriersOf.has(tag.id)) tags.push({ kind: "tag", tag, carrier: true, inUse: true, label: carrierLabel(tag) });
    }
  } else {
    // Export only: the tags someone has, and the carrier rows.
    for (const r of inKey) tags.push({ kind: "tag", tag: r.tag, carrier: r.carrier, inUse: true, label: r.label });
  }

  const ordered = (order: KeyRowKind[]) => order.flatMap(kind => found[kind] ?? []);
  return {
    pedigree: drawn,
    tags,
    symbols: ordered(SYMBOL_ORDER[target]),
    relationships: ordered(RELATIONSHIP_ORDER[target]),
    details: clinicalDetailLines(pedigree).map(d => ({ kind: "clinicalDetail" as const, field: d.field, label: d.label, value: d.value })),
  };
}

// ── Tag rows ──────────────────────────────────────────────────────────────────

/** One key row for a tag: the tag itself, or a condition's carriers. */
export interface KeyTagRow {
  tag: Tag;
  carrier: boolean;
  label: string;
}

/**
 * The tag rows of a key, in pedigree tag order: each tag someone has, and
 * right after a condition the "<condition> carrier" row when someone is a
 * carrier of it. A condition with carriers only lists just that row.
 */
export function keyTagRows(pedigree: Pedigree): KeyTagRow[] {
  const affected = new Set(tagsInUse(pedigree).map(t => t.id));
  const carriers = new Set<string>();
  for (const ind of pedigree.individuals) for (const t of carrierConditions(ind, pedigree)) carriers.add(t.id);
  const rows: KeyTagRow[] = [];
  for (const tag of pedigreeTags(pedigree)) {
    if (affected.has(tag.id)) rows.push({ tag, carrier: false, label: tag.label });
    if (carriers.has(tag.id)) rows.push({ tag, carrier: true, label: carrierLabel(tag) });
  }
  return rows;
}

// ── Affected and carrier rows ─────────────────────────────────────────────────

/**
 * The Affected / Carrier rows of a key, shared by the in-app legend
 * and the export key: who each row's swatch is drawn for (its shape), and its
 * label. Follows what is drawn (`symbolPaint`):
 * - NSGC 2008: "Affected" for a black fill, "Affected, with conditions (black
 *   centre)", "Carrier" for the dot;
 * - NSGC 2022: "Affected" only for a solid black fill (affected with no
 *   condition recorded), "Affected, condition not recorded (black centre)"
 *   for the black fill under sectors, "Carrier" for the dotted half.
 * With two or more conditions a plain flag's label adds "(condition not
 * recorded)" (`plainStatusLabel`).
 */
export interface StatusKeyRows {
  affected?: Individual;
  affectedLabel: string;
  core?: Individual;
  coreLabel: string;
  carrier?: Individual;
  carrierLabel: string;
  /** The carrier row is the 2022 dotted half, not the dot. */
  carrierHalf: boolean;
}

export function statusKeyRows(pedigree: Pedigree, inds: readonly Individual[] = pedigree.individuals): StatusKeyRows {
  const paints = inds.map(i => ({ i, p: symbolPaint(i, pedigree) }));
  const y2008 = notationOf(pedigree) === "nsgc2008";
  const anyPlainAffected = inds.some(i => plainAffected(i, pedigree));
  if (y2008) {
    return {
      affected: paints.find(({ p }) => p.base === "black")?.i,
      affectedLabel: anyPlainAffected ? plainStatusLabel("Affected", pedigree) : "Affected",
      core: paints.find(({ p }) => p.core)?.i,
      coreLabel: "Affected, with conditions (black centre)",
      carrier: paints.find(({ p }) => p.dot)?.i,
      carrierLabel: plainStatusLabel("Carrier", pedigree),
      carrierHalf: false,
    };
  }
  return {
    affected: paints.find(({ p }) => p.base === "black" && p.sectors.length === 0)?.i,
    affectedLabel: plainStatusLabel("Affected", pedigree),
    core: paints.find(({ p }) => p.core)?.i,
    coreLabel: "Affected, condition not recorded (black centre)",
    carrier: paints.find(({ p }) => p.sectors.some(s => s.tag === PLAIN_CARRIER_TAG))?.i,
    carrierLabel: plainStatusLabel("Carrier", pedigree),
    carrierHalf: true,
  };
}
