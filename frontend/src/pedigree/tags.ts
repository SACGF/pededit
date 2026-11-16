import type { Individual, Pedigree, Tag, TagStyle } from "@pedigree-editor/layout-engine";
import { drawnPedigree } from "./collapse";
import { drawsPresymptomatic } from "./evaluation";
import { notationOf } from "./notation";
import { tagPaint, carrierPaintFrom, renderRegionFillSvg, tagFillMode, MONOCHROME_COLOR, PLAIN_CARRIER_PAINT } from "./tagFills";
import type { TagPaint } from "./tagFills";
import { affectedControlOn, carrierConditions, isConditionTag, carrierLabel, plainAffected, plainCarrier, plainStatusLabel } from "./conditions";
import type { TagFill } from "@pedigree-editor/layout-engine";

/**
 * Tag helpers shared by the canvas renderer, the SVG exporters and the legend.
 *
 * Everything here is framework-free. The React renderer in nodes/symbols.tsx
 * and the string-based exporters both call into the same geometry so the
 * canvas and the exported figure agree.
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
  /** Colour and fill drawn, after the monochrome setting (#67, `tagPaint`, or `carrierPaintFrom`). */
  color: string;
  fill: TagFill;
  /** A carrier of this condition (#115), drawn with the carrier pattern; or the plain carrier half (`PLAIN_CARRIER_TAG`). */
  carrier?: boolean;
}

/**
 * Stand-in tag for the half symbol of a carrier with no condition recorded
 * in NSGC 2022 (#115), so it goes through the same sector renderers. Never
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
 * condition (#3).
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
 * How a pedigree divides its symbols among conditions: "quarters" (#3, NSGC
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
 * The conditions that own a section of the symbol (#115). NSGC 2008 (and no
 * notation saved): every quadrant tag defined, as #3 always did, so old
 * pedigrees keep their look. NSGC 2022: only the conditions in use, that is
 * someone on the chart is affected with or a carrier of them, or has the
 * trait (#118: a trait takes a section like a condition), counted on the
 * drawn pedigree (`drawnPedigree`: people in a collapsed branch, #94, or
 * left out by a view filter, #4, do not count), since NSGC divides the
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
      // Affected conditions and traits alike (#118); `all` keeps only quadrant tags.
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
 * The paint of a condition's affected section (#67, #115): `tagPaint`,
 * except that in NSGC 2022 black and white mode a pedigree with a single
 * condition in use draws it solid black, the classic NSGC shading, keyed
 * with the condition's name. A pattern chosen for the tag itself is kept,
 * and so is the hatch when someone drawn is affected with no condition
 * recorded, whose solid black fill would otherwise look the same. A tag not
 * in use is painted as it would be once someone has it.
 */
export function conditionPaint(tag: Tag, pedigree: Pedigree): TagPaint {
  const paint = tagPaint(tag, pedigree);
  // A trait (#118) is never the solid black of NSGC affected shading.
  if (!isConditionTag(tag) || tagFillMode(pedigree) !== "monochrome" || notationOf(pedigree) === "nsgc2008") return paint;
  if (tag.fill && tag.fill !== "solid") return paint;
  const { layout } = conditionSection(tag, pedigree);
  if (layout !== "whole" || sectionInfo(pedigree).plainBlack) return paint;
  return { color: MONOCHROME_COLOR, fill: "solid" };
}

/** The paint of a condition's carrier section (`carrierPaintFrom` of `conditionPaint`). */
export function conditionCarrierPaint(tag: Tag, pedigree: Pedigree): TagPaint {
  return carrierPaintFrom(conditionPaint(tag, pedigree));
}

/**
 * Condition sectors on an individual's symbol, in pedigree tag order:
 * affected conditions in `conditionPaint`, carrier conditions (#115) in
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
 * Everything filled on a symbol beyond its outline (#3, #115), decided once
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
 * (`plainAffected`: affected with something not recorded, #118) is the black
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
  /** The presymptomatic vertical line (#101, `drawsPresymptomatic`). */
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
 * person would read as unaffected (#118). A black symbol with no sectors is
 * filled black as usual.
 */
export const AFFECTED_CORE_SCALE = 0.55;
/** White rim around the core, in symbol pixels (after scaling). */
export const AFFECTED_CORE_RIM = 1.5;

/**
 * The core as SVG markup for a symbol centred on (0, 0). `geom` is the
 * unpainted, unclosed outline element the exporters build (for example
 * `<rect x=".." y=".." width=".." height=".."`).
 */
export function renderAffectedCoreSvg(geom: string): string {
  const k = AFFECTED_CORE_SCALE;
  return `<g transform="scale(${k})">${geom} fill="black" stroke="white" stroke-width="${fmt((AFFECTED_CORE_RIM * 2) / k)}"/></g>`
    + `<g transform="scale(${k})">${geom} fill="black" stroke="none"/></g>`;
}

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
  /** Colour drawn, after the monochrome setting (#67). */
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

export function hasAnnotationRow(individual: Individual, pedigree: Pedigree): boolean {
  return tagsOf(individual, pedigree).some(t => t.style !== "quadrant");
}

// ── String SVG rendering (exporters) ──────────────────────────────────────────

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Sector fills (`SymbolPaint.sectors`) for a symbol centred on (0, 0) of the
 * given size, as SVG markup. `clipId` must be the id of a <clipPath> matching
 * the symbol outline that the caller has already emitted.
 */
export function renderSectorListSvg(sectors: Sector[], size: number, clipId: string): string {
  if (sectors.length === 0) return "";
  const r = size; // beyond the half-diagonal, so the clip does the shaping
  const box = { x: -size / 2, y: -size / 2, size };
  return sectors
    .map((s, i) => renderRegionFillSvg(s.fill, s.color, sectorPath(0, 0, r, s.start, s.end), box, `${clipId}-s${i}`, clipId))
    .join("");
}

/**
 * Annotation row (the items of `annotationRow`) for a symbol centred on
 * (0, 0), as SVG markup. `offsetY` moves the row down, e.g. past an "SB" /
 * "ECT" caption.
 */
export function renderAnnotationItemsSvg(items: AnnotationItem[], size: number, offsetY = 0): string {
  if (items.length === 0) return "";
  const cy = size / 2 + ANNOTATION_Y + offsetY;
  return items
    .map(({ tag, x, color }) =>
      tag.style === "dot"
        ? `<circle cx="${fmt(x)}" cy="${fmt(cy)}" r="${ANNOTATION_DOT_RADIUS}" fill="${escapeXml(color)}"/>`
        : `<text x="${fmt(x)}" y="${fmt(cy + ANNOTATION_FONT_SIZE / 2 - 1)}" text-anchor="middle" font-family="sans-serif" font-size="${ANNOTATION_FONT_SIZE}" font-weight="bold" fill="${escapeXml(color)}">${escapeXml(tagCanvasText(tag))}</text>`,
    )
    .join("");
}

// ── Legend ────────────────────────────────────────────────────────────────────

export const LEGEND_SWATCH = 16;
export const LEGEND_ROW_HEIGHT = 20;
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

/**
 * A legend entry for a tag: a swatch showing how the tag is drawn (quarter
 * fill, dot, or coloured text) followed by the label. Drawn with the swatch's
 * top-left at (x, y); the label starts `labelOffset` to the right, past the
 * widest swatch in the key, so text tags never run into their label.
 */
export function renderTagLegendRowSvg(
  tag: Tag, pedigree: Pedigree, x: number, y: number,
  labelOffset = swatchColumnWidth([tag]) + LEGEND_LABEL_GAP,
  carrier = false,
): string {
  const s = LEGEND_SWATCH;
  const cx = x + s / 2, cy = y + s / 2;
  const parts: string[] = [];
  const paint = carrier ? conditionCarrierPaint(tag, pedigree) : conditionPaint(tag, pedigree);
  if (tag.style === "quadrant") {
    const [start, end] = conditionSection(tag, pedigree).angles;
    const clipId = `legend-clip-${tag.id}${carrier ? "-carrier" : ""}`;
    parts.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${s}" height="${s}"/></clipPath>`);
    parts.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="white" stroke="black" stroke-width="1.5"/>`);
    parts.push(renderRegionFillSvg(paint.fill, paint.color, sectorPath(cx, cy, s, start, end), { x, y, size: s }, `${clipId}-fill`, clipId));
    parts.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="none" stroke="black" stroke-width="1.5"/>`);
  } else if (tag.style === "dot") {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${ANNOTATION_DOT_RADIUS}" fill="${escapeXml(paint.color)}"/>`);
  } else {
    parts.push(`<text x="${x}" y="${cy + ANNOTATION_FONT_SIZE / 2 - 1}" font-family="sans-serif" font-size="${ANNOTATION_FONT_SIZE}" font-weight="bold" fill="${escapeXml(paint.color)}">${escapeXml(tagCanvasText(tag))}</text>`);
  }
  parts.push(legendLabelSvg(carrier ? carrierLabel(tag) : tag.label, x + labelOffset, cy));
  return parts.join("");
}

/** One key row for a tag: the tag itself, or (#115) a condition's carriers. */
export interface KeyTagRow {
  tag: Tag;
  carrier: boolean;
  label: string;
}

/**
 * The tag rows of a key, in pedigree tag order: each tag someone has, and
 * right after a condition the "<condition> carrier" row when someone is a
 * carrier of it (#115). A condition with carriers only lists just that row.
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

export function legendLabelSvg(label: string, x: number, cy: number): string {
  return `<text x="${fmt(x)}" y="${cy + LEGEND_FONT_SIZE / 2 - 1}" font-family="sans-serif" font-size="${LEGEND_FONT_SIZE}" fill="black">${escapeXml(label)}</text>`;
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
 * tested negative. They complement the carrier dot (#14).
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

// ── Key rows: affected and carrier ────────────────────────────────────────────

/**
 * The Affected / Carrier rows of a key (#115), shared by the in-app legend
 * and the export key: who each row's swatch is drawn for (its shape), and its
 * label. Follows what is drawn (`symbolPaint`):
 * - NSGC 2008: "Affected" for a black fill, "Affected, with conditions (black
 *   centre)", "Carrier" for the dot, as before;
 * - NSGC 2022: "Affected" only for a solid black fill (affected with no
 *   condition recorded), "Affected, condition not recorded (black centre)"
 *   for the black fill under sectors (#118), "Carrier" for the dotted half.
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
