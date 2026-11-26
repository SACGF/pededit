import type { Individual, Pedigree, Tag, TagStyle } from "@pedigree-editor/layout-engine";
import { drawnPedigree } from "./collapse";
import { drawsPresymptomatic } from "./evaluation";
import { notationOf } from "./notation";
import { tagPaint, carrierPaintFrom, tagFillMode, tint, isTagFill, CARRIER_TINT, MONOCHROME_COLOR, PLAIN_CARRIER_PAINT } from "./tagFills";
import type { TagPaint } from "./tagFills";
import { affectedControlOn, carrierConditions, isConditionTag, plainAffected, plainCarrier } from "./conditions";
import type { TagFill } from "@pedigree-editor/layout-engine";

/**
 * Tag helpers shared by the canvas renderer, the SVG exporters and the legend.
 *
 * Everything here is framework-free. The symbol components in
 * chart/symbols.tsx draw from it for the canvas and the exports alike, so
 * the canvas and the exported figure agree.
 */

// ── Palette ───────────────────────────────────────────────────────────────────

/**
 * Default swatches offered in the tag manager. Chosen to stay distinguishable
 * for the common forms of colour-vision deficiency and to print acceptably in
 * greyscale when combined with the quadrant position. Black is last: a new
 * tag takes the first unused colour, and a black quarter is invisible on an
 * affected person and reads as affected shading on anyone else.
 */
export const TAG_PALETTE: readonly string[] = [
  "#d62728", // red
  "#1f77b4", // blue
  "#f2c80f", // yellow
  "#2ca02c", // green
  "#ff7f0e", // orange
  "#9467bd", // purple
  "#17becf", // cyan
  "#8c564b", // brown
  "#7f7f7f", // grey
  "#000000", // black
];

/** First palette colour not already used by an existing tag. */
export function nextTagColor(existing: readonly Tag[]): string {
  const used = new Set(existing.map(t => t.color.toLowerCase()));
  return TAG_PALETTE.find(c => !used.has(c)) ?? TAG_PALETTE[existing.length % TAG_PALETTE.length]!;
}

export const TAG_STYLE_LABELS: Record<TagStyle, string> = {
  quadrant: "Fill a section of the symbol",
  dot: "Coloured dot under the symbol",
  text: "Short text under the symbol",
};

// ── Lookup ────────────────────────────────────────────────────────────────────

/** Tags of a pedigree in display order (empty when none are defined). */
export function pedigreeTags(pedigree: Pedigree): Tag[] {
  return pedigree.tags ?? [];
}

/** Quadrant-style tags in order. Index in this list decides the sector. */
export function quadrantTags(pedigree: Pedigree): Tag[] {
  return pedigreeTags(pedigree).filter(t => t.style === "quadrant");
}

/** Resolved tags applied to an individual, in pedigree tag order. Unknown ids are ignored. */
export function tagsOf(individual: Individual, pedigree: Pedigree): Tag[] {
  const ids = individual.tags;
  if (!ids || ids.length === 0) return [];
  const set = new Set(ids);
  return pedigreeTags(pedigree).filter(t => set.has(t.id));
}

/** Tags that at least one individual carries, in pedigree tag order. Used by legends. */
export function tagsInUse(pedigree: Pedigree): Tag[] {
  const used = new Set<string>();
  for (const ind of pedigree.individuals) for (const id of ind.tags ?? []) used.add(id);
  return pedigreeTags(pedigree).filter(t => used.has(t.id));
}

export function tagCanvasText(tag: Tag): string {
  return (tag.abbrev && tag.abbrev.trim()) || tag.label;
}

// ── Sector geometry ───────────────────────────────────────────────────────────

/**
 * One filled region of a symbol: a sector of the circle centred on the symbol,
 * clipped to the symbol outline by the caller. Angles are degrees clockwise
 * from 12 o'clock.
 */
export interface Sector {
  tag: Tag;
  start: number;
  end: number;
  /** Colour and fill drawn, after the monochrome setting (`tagPaint`, or `carrierPaintFrom`). */
  color: string;
  fill: TagFill;
  /** A carrier of this condition, drawn with the carrier pattern; or the plain carrier half (`PLAIN_CARRIER_TAG`). */
  carrier?: boolean;
}

/**
 * Stand-in tag for the half symbol of a carrier with no condition recorded
 * in NSGC 2022, so it goes through the same sector renderers. Never
 * stored in a pedigree.
 */
export const PLAIN_CARRIER_TAG: Tag = { id: "__plain-carrier", label: "Carrier", color: PLAIN_CARRIER_PAINT.color, style: "quadrant" };

/** Right half, so a condition in the upper or lower left quarter stays clear of it. */
export const PLAIN_CARRIER_ANGLES: readonly [number, number] = [0, 180];

/**
 * Fixed quarter positions for the first four quadrant tags. Each tag owns a
 * quarter in every symbol (the "slot" model used by kinship2, Madeline and
 * Progeny), so position alone identifies the condition and a quarter stays
 * put when other tags are added. The NSGC standard requires a key but fixes
 * no order, so we read like a page: upper left first, then clockwise. This is
 * Madeline's convention and the one in most published multi-condition
 * pedigrees.
 *
 * In NSGC 2022 (`sectionLayout`) the number of sections follows the number
 * of conditions in use (`sectionConditions`), as NSGC partitions the symbol
 * only for several conditions: one fills the whole symbol, two take the left
 * and right halves (the 2022 paper's HEXA and CFTR carrier), three or four
 * these quarters, each in pedigree tag order among the conditions in use.
 * NSGC 2008 and pedigrees with no notation saved keep a quarter per defined
 * condition.
 *
 * A fifth or later quadrant tag has no quarter of its own. Someone who carries
 * one gets equal pie slices for the quadrant tags they carry, from 12
 * o'clock, identified by colour. Everyone else keeps the fixed quarters, so
 * adding a fifth tag never splits the symbols of people who do not have it.
 */
const QUADRANT_ANGLES: readonly [number, number][] = [
  [270, 360], // upper left
  [0, 90],    // upper right
  [90, 180],  // lower right
  [180, 270], // lower left
];

/** NSGC 2022 with two conditions: left half, then right half. */
const HALF_ANGLES: readonly [number, number][] = [
  [180, 360], // left half
  [0, 180],   // right half
];

const WHOLE: [number, number] = [0, 360];

export const QUADRANT_NAMES = ["upper left", "upper right", "lower right", "lower left"] as const;

/** Number of quadrant tags that have a fixed quarter. */
export const FIXED_QUADRANTS = QUADRANT_ANGLES.length;

/**
 * How a pedigree divides its symbols among conditions: "quarters" (NSGC
 * 2008, and NSGC 2022 with three or more conditions in use), "halves" (NSGC
 * 2022, two in use) or "whole" (NSGC 2022, one in use).
 */
export type SectionLayout = "whole" | "halves" | "quarters";

interface SectionInfo {
  /** Conditions that own a section, in pedigree tag order. */
  conditions: Tag[];
  /** Someone drawn is affected with no condition recorded (a solid black fill). */
  plainBlack: boolean;
}

const sectionCache = new WeakMap<Pedigree, SectionInfo>();

/**
 * The conditions that own a section of the symbol. NSGC 2008 (and no
 * notation saved): every quadrant tag defined, as #3 always did, so old
 * pedigrees keep their look. NSGC 2022: only the conditions in use, that is
 * someone on the chart is affected with or a carrier of them, or has the
 * trait (a trait takes a section like a condition), counted on the
 * drawn pedigree (`drawnPedigree`: people in a collapsed branch or
 * left out by a view filter do not count), since NSGC divides the
 * symbol by what the chart shows. Defining a second condition no one has yet
 * changes nothing. Cached per pedigree object; the full pedigree and its
 * drawn copy give the same answer.
 */
function sectionInfo(pedigree: Pedigree): SectionInfo {
  const cached = sectionCache.get(pedigree);
  if (cached) return cached;
  const all = quadrantTags(pedigree);
  let info: SectionInfo;
  if (notationOf(pedigree) === "nsgc2008" || all.length === 0) {
    info = { conditions: all, plainBlack: false };
  } else {
    const drawn = drawnPedigree(pedigree);
    const used = new Set<string>();
    let plainBlack = false;
    for (const i of drawn.individuals) {
      // Affected conditions and traits alike; `all` keeps only quadrant tags.
      for (const id of i.tags ?? []) used.add(id);
      const carried = carrierConditions(i, drawn);
      for (const t of carried) used.add(t.id);
      if (plainAffected(i, drawn) && carried.length === 0) plainBlack = true;
    }
    info = { conditions: all.filter(t => used.has(t.id)), plainBlack };
  }
  sectionCache.set(pedigree, info);
  return info;
}

/** The conditions that own a section (see `sectionInfo`), in pedigree tag order. */
export function sectionConditions(pedigree: Pedigree): Tag[] {
  return sectionInfo(pedigree).conditions;
}

function layoutFor(pedigree: Pedigree, count: number): SectionLayout {
  if (notationOf(pedigree) === "nsgc2008") return "quarters";
  return count === 1 ? "whole" : count === 2 ? "halves" : "quarters";
}

export function sectionLayout(pedigree: Pedigree): SectionLayout {
  return layoutFor(pedigree, sectionConditions(pedigree).length);
}

function anglesIn(layout: SectionLayout, index: number): [number, number] {
  const table = layout === "whole" ? [WHOLE] : layout === "halves" ? HALF_ANGLES : QUADRANT_ANGLES;
  const a = index >= 0 ? table[index] : undefined;
  return a ? [a[0], a[1]] : [...WHOLE];
}

/**
 * Angle range of the fixed section for the condition at `index` in
 * `sectionConditions(pedigree)` (`sectionLayout`), or the whole symbol for a
 * fifth or later one (which has no fixed position; legends show it as a full
 * swatch). Without a pedigree, the quarters.
 */
export function sectorAngles(index: number, pedigree?: Pedigree): [number, number] {
  return anglesIn(pedigree ? sectionLayout(pedigree) : "quarters", index);
}

/**
 * Where a condition is drawn. A condition not in use yet (NSGC 2022) has no
 * section; this gives the one it would take once someone has it, for its
 * legend swatch and the tags dialog. `index` is its place among the
 * sectioned conditions, -1 for a non-quadrant tag.
 */
export interface ConditionSection {
  index: number;
  angles: [number, number];
  layout: SectionLayout;
  inUse: boolean;
}

export function conditionSection(tag: Tag, pedigree: Pedigree): ConditionSection {
  const used = sectionConditions(pedigree);
  const inUse = used.some(t => t.id === tag.id);
  const list = inUse || tag.style !== "quadrant" ? used : quadrantTags(pedigree).filter(t => t.id === tag.id || used.includes(t));
  const index = list.findIndex(t => t.id === tag.id);
  const layout = layoutFor(pedigree, list.length);
  return { index, angles: anglesIn(layout, index), layout, inUse };
}

/** Where a quadrant tag is drawn, for the tags dialog: "left half", and a note when no one has it yet. */
export function sectionName(tag: Tag, pedigree: Pedigree): { name: string; title: string } {
  const { index, layout, inUse } = conditionSection(tag, pedigree);
  const name = layout === "whole" ? (index === 0 ? "whole symbol" : "shared slice")
    : layout === "halves" ? (index === 0 ? "left half" : index === 1 ? "right half" : "shared slice")
    : QUADRANT_NAMES[index] ?? "shared slice";
  return {
    name,
    title: inUse ? `Drawn as the ${name}` : `No one has it yet: drawn as the ${name} once someone does`,
  };
}

/**
 * The paint of a condition's affected section: `tagPaint`,
 * except that in NSGC 2022 black and white mode a pedigree with a single
 * condition in use draws it solid black, the classic NSGC shading, keyed
 * with the condition's name. A pattern chosen for the tag itself is kept,
 * and so is the hatch when someone drawn is affected with no condition
 * recorded, whose solid black fill would otherwise look the same. A tag not
 * in use is painted as it would be once someone has it.
 */
export function conditionPaint(tag: Tag, pedigree: Pedigree): TagPaint {
  const paint = tagPaint(tag, pedigree);
  // A trait is never the solid black of NSGC affected shading.
  if (!isConditionTag(tag) || tagFillMode(pedigree) !== "monochrome" || notationOf(pedigree) === "nsgc2008") return paint;
  if (tag.fill && tag.fill !== "solid") return paint;
  const { layout } = conditionSection(tag, pedigree);
  if (layout !== "whole" || sectionInfo(pedigree).plainBlack) return paint;
  return { color: MONOCHROME_COLOR, fill: "solid" };
}

const samePaint = (a: TagPaint, b: TagPaint) => a.fill === b.fill && a.color.toLowerCase() === b.color.toLowerCase();

/**
 * What a carrier of `tag` drawn with its chosen `carrierFill` in the
 * condition's colour would look the same as: a section of someone affected
 * (this condition, or another condition or trait, as drawn now, so in black
 * and white any section with that pattern), the solid black of affected
 * with no condition recorded, or the plain carrier's dots. Null when it
 * differs from all of them, or no carrier fill is chosen.
 */
export type CarrierFillClash = { kind: "section"; tag: Tag } | { kind: "affected" } | { kind: "carrier" };

export function carrierFillClash(tag: Tag, pedigree: Pedigree): CarrierFillClash | null {
  if (!isConditionTag(tag) || !isTagFill(tag.carrierFill)) return null;
  const chosen: TagPaint = { color: conditionPaint(tag, pedigree).color, fill: tag.carrierFill };
  for (const other of quadrantTags(pedigree)) {
    if (samePaint(chosen, conditionPaint(other, pedigree))) return { kind: "section", tag: other };
  }
  if (samePaint(chosen, { color: MONOCHROME_COLOR, fill: "solid" })) return { kind: "affected" };
  if (samePaint(chosen, PLAIN_CARRIER_PAINT)) return { kind: "carrier" };
  return null;
}

/**
 * The paint of a condition's carrier section: its chosen `carrierFill` in
 * its colour, or in the lighter carrier tint when that would look like
 * something else (`carrierFillClash`), so a carrier is never drawn as an
 * affected person. With no carrier fill chosen, `carrierPaintFrom` of
 * `conditionPaint`.
 */
export function conditionCarrierPaint(tag: Tag, pedigree: Pedigree): TagPaint {
  const affected = conditionPaint(tag, pedigree);
  if (!isConditionTag(tag) || !isTagFill(tag.carrierFill)) return carrierPaintFrom(affected);
  const color = carrierFillClash(tag, pedigree) ? tint(affected.color, CARRIER_TINT) : affected.color;
  return { color, fill: tag.carrierFill };
}

/**
 * Condition sectors on an individual's symbol, in pedigree tag order:
 * affected conditions in `conditionPaint`, carrier conditions in
 * `conditionCarrierPaint`, each in the condition's own section
 * (`sectionConditions`, `sectorAngles`).
 */
export function conditionSectorsFor(individual: Individual, pedigree: Pedigree): Sector[] {
  const all = quadrantTags(pedigree);
  if (all.length === 0) return [];
  const mine = new Set(individual.tags ?? []);
  const carrierOf = new Set(carrierConditions(individual, pedigree).map(t => t.id));
  const sectioned = sectionConditions(pedigree);
  const carried = all
    .map(tag => ({ tag, index: sectioned.indexOf(tag), carrier: !mine.has(tag.id) && carrierOf.has(tag.id) }))
    .filter(({ tag, carrier }) => mine.has(tag.id) || carrier);
  if (carried.length === 0) return [];
  const paint = (tag: Tag, carrier: boolean) =>
    carrier ? { ...conditionCarrierPaint(tag, pedigree), carrier: true } : conditionPaint(tag, pedigree);
  // A person left out of the drawing may have a condition no one drawn has (index -1).
  if (carried.every(c => c.index >= 0 && c.index < FIXED_QUADRANTS)) {
    return carried.map(({ tag, index, carrier }) => {
      const [start, end] = sectorAngles(index, pedigree);
      return { tag, start, end, ...paint(tag, carrier) };
    });
  }
  const span = 360 / carried.length;
  return carried.map(({ tag, carrier }, i) => ({ tag, start: i * span, end: (i + 1) * span, ...paint(tag, carrier) }));
}

/** True when the sectors together cover the angle range [start, end]. */
function covers(sectors: readonly Sector[], start: number, end: number): boolean {
  const spans = sectors.map(s => [Math.max(s.start, start), Math.min(s.end, end)] as const)
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  let reached = start;
  for (const [a, b] of spans) {
    if (a > reached) return false;
    reached = Math.max(reached, b);
  }
  return reached >= end;
}

/**
 * Everything filled on a symbol beyond its outline, decided once
 * so the canvas, legend and both exporters agree:
 * - `sectors`: condition sectors, under them (NSGC 2022) the plain carrier's
 *   dotted right half;
 * - `base`: "black" for a solid affected fill, else white;
 * - `core`: the black centre over the sectors;
 * - `dot`: the 2008 carrier dot.
 *
 * NSGC 2008 (and pedigrees saved before the setting, `notation.ts`): the
 * plain Affected control (`affectedControlOn`: the flag, or the one
 * condition) is a black fill, with the black centre over any sectors. With
 * two or more conditions, someone affected only with recorded conditions has
 * their quarters on white, as NSGC 2008 shades a quadrant per condition. A
 * carrier with no condition recorded has the dot, not drawn on a black fill.
 *
 * NSGC 2022: there is no dot. A recorded affected condition is its sector
 * alone, so the person is not filled black. The plain flag
 * (`plainAffected`: affected with something not recorded) is the black
 * fill with any sectors drawn over it and the black centre on top, so it
 * still reads as affected when the sectors cover the symbol or are black.
 * A carrier with no condition recorded is the right half dotted, unless the
 * symbol is filled black or the person's affected conditions cover that half
 * (`sectionLayout`: one condition in use is the whole symbol, the second of
 * two the right half). Condition sections follow the number of conditions in
 * use (`sectionConditions`), and a single one in black and white is solid
 * black (`conditionPaint`).
 */
export interface SymbolPaint {
  sectors: Sector[];
  base: "black" | "white";
  core: boolean;
  dot: boolean;
  /** The presymptomatic vertical line (`drawsPresymptomatic`). */
  line?: boolean;
}

export function symbolPaint(individual: Individual, pedigree: Pedigree): SymbolPaint {
  const conditions = conditionSectorsFor(individual, pedigree);
  const plainCarrierFlag = plainCarrier(individual, pedigree);
  if (notationOf(pedigree) === "nsgc2008") {
    const black = affectedControlOn(individual, pedigree);
    return {
      sectors: conditions,
      base: black ? "black" : "white",
      core: black && conditions.length > 0,
      dot: plainCarrierFlag && !black,
      line: drawsPresymptomatic(individual, pedigree),
    };
  }
  const black = plainAffected(individual, pedigree);
  // The dotted half goes under the conditions; where they cover it (one
  // condition's whole symbol, or the right half) it is left off, as the 2008
  // dot is on an affected fill, and the edit panel says so.
  const [halfStart, halfEnd] = PLAIN_CARRIER_ANGLES;
  const sectors = !black && plainCarrierFlag && !covers(conditions, halfStart, halfEnd)
    ? [{ tag: PLAIN_CARRIER_TAG, start: PLAIN_CARRIER_ANGLES[0], end: PLAIN_CARRIER_ANGLES[1], ...PLAIN_CARRIER_PAINT, carrier: true }, ...conditions]
    : conditions;
  return {
    sectors,
    base: black ? "black" : "white",
    core: black && sectors.length > 0,
    dot: false,
    line: drawsPresymptomatic(individual, pedigree),
  };
}

// ── Affected core ─────────────────────────────────────────────────────────────

/**
 * A black-filled symbol (`symbolPaint`) that also carries sectors keeps a
 * solid black centre: the symbol's own outline scaled by this factor, drawn
 * over the sectors with a white rim. Without it, four quarters (or one
 * section covering the whole symbol) would hide the black fill and the
 * person would read as unaffected. A black symbol with no sectors is
 * filled black as usual.
 */
export const AFFECTED_CORE_SCALE = 0.55;
/** White rim around the core, in symbol pixels (after scaling). */
export const AFFECTED_CORE_RIM = 1.5;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

export function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * SVG path for a pie sector centred on (cx, cy). The radius should exceed the
 * symbol's half-diagonal so that clipping to the symbol outline leaves a clean
 * quarter of a square as well as of a circle.
 */
export function sectorPath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= 360) {
    return `M ${fmt(cx - r)} ${fmt(cy)} A ${r} ${r} 0 1 1 ${fmt(cx + r)} ${fmt(cy)} A ${r} ${r} 0 1 1 ${fmt(cx - r)} ${fmt(cy)} Z`;
  }
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${fmt(cx)} ${fmt(cy)} L ${fmt(x1)} ${fmt(y1)} A ${r} ${r} 0 ${large} 1 ${fmt(x2)} ${fmt(y2)} Z`;
}

// ── Annotation row (dots and text under the symbol) ───────────────────────────

/** Vertical space the annotation row takes below the symbol, pushing the name down. */
export const ANNOTATION_ROW_HEIGHT = 12;
/** Centre line of the row, measured from the symbol's bottom edge. */
export const ANNOTATION_Y = 7;
export const ANNOTATION_DOT_RADIUS = 3.5;
export const ANNOTATION_FONT_SIZE = 9;
const ANNOTATION_CHAR_WIDTH = 5.2; // rough sans-serif advance at ANNOTATION_FONT_SIZE
const ANNOTATION_GAP = 4;

export interface AnnotationItem {
  tag: Tag;
  /** Colour drawn, after the monochrome setting. */
  color: string;
  /** x of the item's centre relative to the symbol's horizontal centre. */
  x: number;
  width: number;
}

/**
 * Dot and text tags of an individual laid out as a centred row. The proband
 * arrow comes in from below-left to the symbol's bottom-left corner, so for a
 * proband the row starts no further left than the symbol's left edge.
 * `size` is the symbol size (NODE_SIZE on the canvas and in the exporters).
 */
export function annotationRow(individual: Individual, pedigree: Pedigree, size = 40): AnnotationItem[] {
  const tags = tagsOf(individual, pedigree).filter(t => t.style !== "quadrant");
  if (tags.length === 0) return [];
  const widths = tags.map(t =>
    t.style === "dot" ? ANNOTATION_DOT_RADIUS * 2 : tagCanvasText(t).length * ANNOTATION_CHAR_WIDTH,
  );
  const total = widths.reduce((a, b) => a + b, 0) + ANNOTATION_GAP * (tags.length - 1);
  let x = individual.proband ? Math.max(-total / 2, -size / 2 + 2) : -total / 2;
  return tags.map((tag, i) => {
    const width = widths[i]!;
    const item = { tag, x: x + width / 2, width, color: tagPaint(tag, pedigree).color };
    x += width + ANNOTATION_GAP;
    return item;
  });
}

// ── Legend ────────────────────────────────────────────────────────────────────

export const LEGEND_SWATCH = 16;
export const LEGEND_FONT_SIZE = 10;

/** Rough width of a text tag drawn at ANNOTATION_FONT_SIZE bold. */
export function tagTextWidth(tag: Tag): number {
  return tagCanvasText(tag).length * ANNOTATION_BOLD_CHAR_WIDTH;
}
const ANNOTATION_BOLD_CHAR_WIDTH = 6;
export const LEGEND_LABEL_GAP = 8;
export const LEGEND_CHAR_WIDTH = 6;

/** Width of the swatch column: a square, or wider for long text tags. */
export function swatchColumnWidth(tags: readonly Tag[]): number {
  return Math.max(LEGEND_SWATCH, ...tags.filter(t => t.style === "text").map(tagTextWidth));
}

export interface TagLegendBlock {
  /** SVG markup lines; empty when no tag is in use. */
  markup: string[];
  width: number;
  height: number;
}

// ── Built-in suggestions ──────────────────────────────────────────────────────

/**
 * Tags offered in the tag manager to everyone, signed in or not. Gene test
 * results are written under the symbol as text, in the common "+/-" shorthand
 * (+ for the familial variant): "+/-" heterozygous, "+/+" homozygous, "-/-"
 * tested negative. They complement the carrier dot.
 */
export const BUILTIN_TAG_SUGGESTIONS: readonly Omit<Tag, "id">[] = [
  { label: "Gene result +/-", abbrev: "+/-", color: "#000000", style: "text" },
  { label: "Gene result +/+", abbrev: "+/+", color: "#000000", style: "text" },
  { label: "Gene result -/-", abbrev: "-/-", color: "#000000", style: "text" },
];

/** Built-in suggestions not already in the pedigree (same label and style). */
export function unusedTagSuggestions(pedigree: Pedigree): Omit<Tag, "id">[] {
  const tags = pedigreeTags(pedigree);
  return BUILTIN_TAG_SUGGESTIONS.filter(s => !tags.some(t => t.label === s.label && t.style === s.style));
}
