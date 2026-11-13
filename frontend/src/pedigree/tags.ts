import type { Individual, Pedigree, Tag, TagStyle } from "@pedigree-editor/layout-engine";
import { consanguinityTest } from "./consanguinity";
import { ENDED_LABEL, endedMarkSegments, hasEndedPartnership } from "./ended";
import { LIFE_STATUS_OPTIONS, lossTrianglePoints, lossSlashEnds, usesLossTriangle } from "./lifeStatus";
import { CHILDLESS_OPTIONS, childlessPartnerships } from "./childless";
import { REPRODUCTIVE_ROLE_OPTIONS, roleLegendLabel, symbolLetter, assistedLinks, CARRIER_LINE_LEGEND, SOCIAL_LINE_LEGEND } from "./assisted";
import { ADOPTION_OPTIONS, adoptionLegendLabel, adoptionBracketSegments } from "./adoption";
import { ZYGOSITY_OPTIONS, twinLegendLabel, zygositiesInUse } from "./twins";
import { COLLAPSED_BRANCH_LABEL, collapseInfo } from "./collapse";
import { clinicalDetailLines, wrapText } from "./clinicalDetails";
import { arrowKind, renderArrowKeySwatchSvg, ARROW_LEGEND_LABEL } from "./proband";
import { FAMILY_HISTORY_LEGEND_LABEL } from "./familyHistory";
import { evaluationKeyInfo, evaluationLegend, PRESYMPTOMATIC_LEGEND_LABEL, DOCUMENTED_LEGEND_LABEL } from "./evaluation";
import { notationOf } from "./notation";
import { symbolSex, assignedAtBirthInUse } from "./gender";
import { tagPaint, carrierPaint, renderRegionFillSvg, PLAIN_CARRIER_PAINT } from "./tagFills";
import { carrierConditions, carrierLabel, plainAffected, plainCarrier, plainStatusLabel } from "./conditions";
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
  /** Colour and fill drawn, after the monochrome setting (#67, `tagPaint`, or `carrierPaint`). */
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
 * of conditions, as NSGC partitions the symbol only for several conditions:
 * one condition fills the whole symbol, two take the left and right halves
 * (the 2022 paper's HEXA and CFTR carrier), three or four these quarters.
 * NSGC 2008 and pedigrees with no notation saved keep the quarters (#3).
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
 * 2008, and NSGC 2022 with three or more conditions), "halves" (NSGC 2022,
 * two conditions) or "whole" (NSGC 2022, one condition).
 */
export type SectionLayout = "whole" | "halves" | "quarters";

export function sectionLayout(pedigree: Pick<Pedigree, "tags" | "canvasSettings">): SectionLayout {
  if (notationOf(pedigree) === "nsgc2008") return "quarters";
  const n = (pedigree.tags ?? []).filter(t => t.style === "quadrant").length;
  return n === 1 ? "whole" : n === 2 ? "halves" : "quarters";
}

/**
 * Angle range of the fixed section for the quadrant tag at `index` in the
 * pedigree's quadrant tags (`sectionLayout`), or the whole symbol for a fifth
 * or later tag (which has no fixed position; legends show it as a full
 * swatch). Without a pedigree, the quarters.
 */
export function sectorAngles(index: number, pedigree?: Pick<Pedigree, "tags" | "canvasSettings">): [number, number] {
  const layout = pedigree ? sectionLayout(pedigree) : "quarters";
  const table = layout === "whole" ? [WHOLE] : layout === "halves" ? HALF_ANGLES : QUADRANT_ANGLES;
  const a = table[index];
  return a ? [a[0], a[1]] : [...WHOLE];
}

/** Where the quadrant tag at `index` is drawn, for the tags dialog. */
export function sectionName(index: number, pedigree: Pick<Pedigree, "tags" | "canvasSettings">): string {
  const layout = sectionLayout(pedigree);
  if (layout === "whole") return index === 0 ? "whole symbol" : "shared slice";
  if (layout === "halves") return index === 0 ? "left half" : index === 1 ? "right half" : "shared slice";
  return QUADRANT_NAMES[index] ?? "shared slice";
}

/**
 * Condition sectors on an individual's symbol, in pedigree tag order:
 * affected conditions in the tag's paint, carrier conditions (#115) in its
 * carrier paint, each in the condition's own section (`sectorAngles`).
 */
export function conditionSectorsFor(individual: Individual, pedigree: Pedigree): Sector[] {
  const all = quadrantTags(pedigree);
  if (all.length === 0) return [];
  const mine = new Set(individual.tags ?? []);
  const carrierOf = new Set(carrierConditions(individual, pedigree).map(t => t.id));
  const carried = all
    .map((tag, index) => ({ tag, index, carrier: !mine.has(tag.id) && carrierOf.has(tag.id) }))
    .filter(({ tag, carrier }) => mine.has(tag.id) || carrier);
  if (carried.length === 0) return [];
  const paint = (tag: Tag, carrier: boolean) =>
    carrier ? { ...carrierPaint(tag, pedigree), carrier: true } : tagPaint(tag, pedigree);
  if (carried.every(c => c.index < FIXED_QUADRANTS)) {
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
 * so the canvas, minimap, legend and both exporters agree:
 * - `sectors`: condition sectors, under them (NSGC 2022) the plain carrier's
 *   dotted right half;
 * - `base`: "black" for a solid affected fill, else white;
 * - `core`: the black centre over the sectors;
 * - `dot`: the 2008 carrier dot.
 *
 * NSGC 2008 (and pedigrees saved before the setting, `notation.ts`), as
 * before: affected is a black fill, with the black centre when there are
 * sectors; a carrier with no condition recorded has the dot, not drawn on an
 * affected fill.
 *
 * NSGC 2022: there is no dot. A recorded affected condition is its sector
 * alone, so the person is not filled black. Affected with no condition
 * recorded is the black fill, or the black centre over any carrier sectors.
 * A carrier with no condition recorded is the right half dotted, unless the
 * symbol is filled black or the person's affected conditions cover that half
 * (`sectionLayout`: one condition is the whole symbol, the second of two the
 * right half). Condition sections follow the number of conditions
 * (`sectorAngles`).
 */
export interface SymbolPaint {
  sectors: Sector[];
  base: "black" | "white";
  core: boolean;
  dot: boolean;
}

export function symbolPaint(individual: Individual, pedigree: Pedigree): SymbolPaint {
  const conditions = conditionSectorsFor(individual, pedigree);
  const affected = !!individual.affected;
  const plainCarrierFlag = plainCarrier(individual, pedigree);
  if (notationOf(pedigree) === "nsgc2008") {
    return {
      sectors: conditions,
      base: affected ? "black" : "white",
      core: affected && conditions.length > 0,
      dot: plainCarrierFlag && !affected,
    };
  }
  const recordedAffected = conditions.some(s => !s.carrier);
  const plainAff = affected && !recordedAffected;
  const black = plainAff && conditions.length === 0;
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
    core: plainAff && sectors.length > 0,
    dot: false,
  };
}

/** Sectors to paint on an individual's symbol (see `symbolPaint`). */
export function sectorsFor(individual: Individual, pedigree: Pedigree): Sector[] {
  return symbolPaint(individual, pedigree).sectors;
}

// ── Affected core ─────────────────────────────────────────────────────────────

/**
 * An affected person whose symbol carries quadrant tags keeps a solid black
 * centre: the symbol's own outline scaled by this factor, drawn over the
 * sectors with a white rim. Without it, four tagged quarters (or a pie of
 * tags) would cover the black fill and the person would read as unaffected.
 * An affected person with no quadrant tags is filled black as usual.
 */
export const AFFECTED_CORE_SCALE = 0.55;
/** White rim around the core, in symbol pixels (after scaling). */
export const AFFECTED_CORE_RIM = 1.5;

/** True when the symbol needs the black centre described above (`symbolPaint`). */
export function needsAffectedCore(individual: Individual, pedigree: Pedigree): boolean {
  return symbolPaint(individual, pedigree).core;
}

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

function fmt(n: number): string {
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Sector fills for a symbol centred on (0, 0) of the given size, as SVG
 * markup. `clipId` must be the id of a <clipPath> matching the symbol outline
 * that the caller has already emitted.
 */
export function renderSectorsSvg(individual: Individual, pedigree: Pedigree, size: number, clipId: string): string {
  const sectors = symbolPaint(individual, pedigree).sectors;
  if (sectors.length === 0) return "";
  const r = size; // beyond the half-diagonal, so the clip does the shaping
  const box = { x: -size / 2, y: -size / 2, size };
  return sectors
    .map((s, i) => renderRegionFillSvg(s.fill, s.color, sectorPath(0, 0, r, s.start, s.end), box, `${clipId}-s${i}`, clipId))
    .join("");
}

/**
 * Annotation row for a symbol centred on (0, 0), as SVG markup. `offsetY`
 * moves the row down, e.g. past an "SB" / "ECT" caption.
 */
export function renderAnnotationRowSvg(individual: Individual, pedigree: Pedigree, size: number, offsetY = 0): string {
  const items = annotationRow(individual, pedigree);
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
const LEGEND_LABEL_GAP = 8;
const LEGEND_CHAR_WIDTH = 6;

/** Width of the swatch column: a square, or wider for long text tags. */
function swatchColumnWidth(tags: readonly Tag[]): number {
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
  const paint = carrier ? carrierPaint(tag, pedigree) : tagPaint(tag, pedigree);
  if (tag.style === "quadrant") {
    const idx = quadrantTags(pedigree).findIndex(t => t.id === tag.id);
    const [start, end] = sectorAngles(Math.max(idx, 0), pedigree);
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

function legendLabelSvg(label: string, x: number, cy: number): string {
  return `<text x="${fmt(x)}" y="${cy + LEGEND_FONT_SIZE / 2 - 1}" font-family="sans-serif" font-size="${LEGEND_FONT_SIZE}" fill="black">${escapeXml(label)}</text>`;
}

/** Width needed by the widest legend row, for sizing the export canvas. */
export function tagLegendWidth(tags: readonly Tag[], labels: readonly string[] = tags.map(t => t.label)): number {
  const longest = Math.max(0, ...labels.map(l => l.length));
  return swatchColumnWidth(tags) + LEGEND_LABEL_GAP + longest * LEGEND_CHAR_WIDTH;
}

export interface TagLegendBlock {
  /** SVG markup lines; empty when no tag is in use. */
  markup: string[];
  width: number;
  height: number;
}

/**
 * The key for every tag applied to at least one individual, one row per tag,
 * with its top-left corner at (x, y). Exporters use renderExportKeySvg, which
 * adds status rows above these.
 */
export function renderTagLegendSvg(pedigree: Pedigree, x: number, y: number): TagLegendBlock {
  const rows = keyTagRows(pedigree);
  if (rows.length === 0) return { markup: [], width: 0, height: 0 };
  const tags = rows.map(r => r.tag);
  const labelOffset = swatchColumnWidth(tags) + LEGEND_LABEL_GAP;
  const markup = rows.map((r, i) =>
    renderTagLegendRowSvg(r.tag, pedigree, x, y + i * LEGEND_ROW_HEIGHT + (LEGEND_ROW_HEIGHT - LEGEND_SWATCH) / 2, labelOffset, r.carrier),
  );
  return { markup, width: tagLegendWidth(tags, rows.map(r => r.label)), height: rows.length * LEGEND_ROW_HEIGHT };
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

// ── Export key: status rows plus tags ─────────────────────────────────────────

type KeyStatus = "affected" | "carrier" | "deceased";

/** Unpainted, unclosed outline of a legend swatch symbol with top-left (x, y). */
function swatchGeom(sex: Individual["sex"], x: number, y: number, s: number): string {
  const c = s / 2;
  if (sex === "female") return `<circle cx="${fmt(x + c)}" cy="${fmt(y + c)}" r="${fmt(c)}"`;
  if (sex === "unknown") {
    return `<polygon points="${fmt(x + c)},${fmt(y)} ${fmt(x + s)},${fmt(y + c)} ${fmt(x + c)},${fmt(y + s)} ${fmt(x)},${fmt(y + c)}"`;
  }
  return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${s}" height="${s}"`;
}

function renderStatusSwatchSvg(status: KeyStatus, sex: Individual["sex"], withCore: boolean, x: number, y: number): string {
  const s = LEGEND_SWATCH;
  const geom = swatchGeom(sex, x, y, s);
  const stroke = `stroke="black" stroke-width="1.5"`;
  const cx = x + s / 2, cy = y + s / 2;
  if (status === "affected") {
    if (!withCore) return `${geom} fill="black" ${stroke}/>`;
    // A tagged affected person: light grey stands for any tag colours, round the black centre.
    const k = AFFECTED_CORE_SCALE;
    const scaled = `translate(${fmt(cx)} ${fmt(cy)}) scale(${k}) translate(${fmt(-cx)} ${fmt(-cy)})`;
    return `${geom} fill="#bdbdbd" ${stroke}/>`
      + `<g transform="${scaled}">${geom} fill="black" stroke="white" stroke-width="${fmt((AFFECTED_CORE_RIM * 2) / k)}"/>${geom} fill="black" stroke="none"/></g>`;
  }
  if (status === "carrier") {
    return `${geom} fill="white" ${stroke}/><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(s * 0.15)}" fill="black"/>`;
  }
  const o = 3;
  return `${geom} fill="white" ${stroke}/><line x1="${x - o}" y1="${y - o}" x2="${x + s + o}" y2="${y + s + o}" stroke="black" stroke-width="1.5"/>`;
}

/** Key swatch for a pregnancy or loss, drawn like the symbol (NSGC). */
function renderLifeStatusSwatchSvg(status: NonNullable<Individual["lifeStatus"]>, sex: Individual["sex"], x: number, y: number): string {
  const s = LEGEND_SWATCH;
  const stroke = `stroke="black" stroke-width="1.5"`;
  if (usesLossTriangle(status)) {
    const tri = `<polygon points="${lossTrianglePoints(s, x, y)}" fill="white" ${stroke}/>`;
    if (status !== "termination") return tri;
    const e = lossSlashEnds(s, x, y);
    return tri + `<line x1="${fmt(e.x1)}" y1="${fmt(e.y1)}" x2="${fmt(e.x2)}" y2="${fmt(e.y2)}" ${stroke}/>`;
  }
  const geom = swatchGeom(sex, x, y, s);
  if (status === "pregnancy") {
    return `${geom} fill="white" ${stroke}/><text x="${fmt(x + s / 2)}" y="${fmt(y + s / 2 + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="black">P</text>`;
  }
  // Stillbirth: the symbol with a slash, as for deceased.
  const o = 3;
  return `${geom} fill="white" ${stroke}/><line x1="${x - o}" y1="${y - o}" x2="${x + s + o}" y2="${y + s + o}" ${stroke}/>`;
}

/**
 * The Affected / Carrier rows of a key (#115), shared by the in-app legend
 * and the export key: who each row's swatch is drawn for (its shape), and its
 * label. Follows what is drawn (`symbolPaint`):
 * - NSGC 2008: "Affected" for anyone affected, "Affected, with tags (black
 *   centre)", "Carrier" for the dot, as before;
 * - NSGC 2022: "Affected" only for a solid black fill (affected with no
 *   condition recorded), "Affected, condition not recorded (black centre)"
 *   over carrier sectors, "Carrier" for the dotted half.
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
      affected: inds.find(i => i.affected),
      affectedLabel: anyPlainAffected ? plainStatusLabel("Affected", pedigree) : "Affected",
      core: paints.find(({ p }) => p.core)?.i,
      coreLabel: "Affected, with tags (black centre)",
      carrier: paints.find(({ p }) => p.dot)?.i,
      carrierLabel: plainStatusLabel("Carrier", pedigree),
      carrierHalf: false,
    };
  }
  return {
    affected: paints.find(({ p }) => p.base === "black")?.i,
    affectedLabel: plainStatusLabel("Affected", pedigree),
    core: paints.find(({ p }) => p.core)?.i,
    coreLabel: "Affected, condition not recorded (black centre)",
    carrier: paints.find(({ p }) => p.sectors.some(s => s.tag === PLAIN_CARRIER_TAG))?.i,
    carrierLabel: plainStatusLabel("Carrier", pedigree),
    carrierHalf: true,
  };
}

/** Key swatch for the NSGC 2022 carrier with no condition recorded: the right half dotted. */
export function renderPlainCarrierSwatchSvg(sex: Individual["sex"], x: number, y: number): string {
  const s = LEGEND_SWATCH;
  const geom = swatchGeom(sex, x, y, s);
  const clipId = `legend-plain-carrier-${sex}`;
  const [start, end] = PLAIN_CARRIER_ANGLES;
  return `<clipPath id="${clipId}">${geom}/></clipPath>`
    + `${geom} fill="white" stroke="none"/>`
    + renderRegionFillSvg(PLAIN_CARRIER_PAINT.fill, PLAIN_CARRIER_PAINT.color, sectorPath(x + s / 2, y + s / 2, s, start, end), { x, y, size: s }, `${clipId}-fill`, clipId)
    + `${geom} fill="none" stroke="black" stroke-width="1.5"/>`;
}

/**
 * The full export key: Affected, Carrier and Deceased rows when anyone in the
 * pedigree has that status, then one row per tag in use. Same contract as
 * renderTagLegendSvg (top-left at (x, y), empty when there is nothing to
 * explain); exporters reserve `height` below the pedigree and at least
 * `width` across. Each swatch uses the sex of the first person with the
 * status, as the in-app legend does.
 */
export function renderExportKeySvg(pedigree: Pedigree, x: number, y: number): TagLegendBlock {
  const rows: { label: string; swatch: (sy: number) => string }[] = [];
  const inds = pedigree.individuals;
  // Swatches use the shape drawn, the gender identity's when shown (#26).
  const shape = (i: Individual) => symbolSex(i, pedigree);
  // Affected and carrier with no condition recorded, as drawn (`symbolPaint`, #115).
  const st = statusKeyRows(pedigree, inds);
  if (st.affected) {
    const ind = st.affected;
    rows.push({ label: st.affectedLabel, swatch: sy => renderStatusSwatchSvg("affected", shape(ind), false, x, sy) });
  }
  if (st.core) {
    const ind = st.core;
    rows.push({ label: st.coreLabel, swatch: sy => renderStatusSwatchSvg("affected", shape(ind), true, x, sy) });
  }
  if (st.carrier) {
    const ind = st.carrier;
    rows.push({
      label: st.carrierLabel,
      swatch: sy => st.carrierHalf ? renderPlainCarrierSwatchSvg(shape(ind), x, sy) : renderStatusSwatchSvg("carrier", shape(ind), false, x, sy),
    });
  }
  // Presymptomatic carrier and evaluation notation (#101).
  const ev = evaluationKeyInfo(inds, notationOf(pedigree));
  const evLegend = evaluationLegend(notationOf(pedigree));
  if (ev.presymptomatic) {
    const sex = shape(ev.presymptomatic);
    rows.push({
      label: PRESYMPTOMATIC_LEGEND_LABEL,
      swatch: sy => `${swatchGeom(sex, x, sy, LEGEND_SWATCH)} fill="white" stroke="black" stroke-width="1.5"/>`
        + `<line x1="${fmt(x + LEGEND_SWATCH / 2)}" y1="${fmt(sy + 1)}" x2="${fmt(x + LEGEND_SWATCH / 2)}" y2="${fmt(sy + LEGEND_SWATCH - 1)}" stroke="black" stroke-width="1.5"/>`,
    });
  }
  const deceased = inds.find(i => i.deceased);
  if (deceased) rows.push({ label: "Deceased", swatch: sy => renderStatusSwatchSvg("deceased", shape(deceased), false, x, sy) });
  // Sex assigned at birth under a symbol drawn by gender identity (#26).
  for (const { code, label } of assignedAtBirthInUse(pedigree)) {
    rows.push({
      label,
      swatch: sy => `<text x="${fmt(x)}" y="${fmt(sy + LEGEND_SWATCH / 2 + 3)}" font-family="sans-serif" font-size="7" textLength="${LEGEND_SWATCH}" lengthAdjust="spacingAndGlyphs" fill="black">${code}</text>`,
    });
  }
  // Proband and consultand arrows (#99).
  for (const kind of ["proband", "consultand"] as const) {
    if (inds.some(i => arrowKind(i) === kind)) {
      rows.push({ label: ARROW_LEGEND_LABEL[kind], swatch: sy => renderArrowKeySwatchSvg(kind, x, sy, LEGEND_SWATCH) });
    }
  }
  // Family history not known (#100): a "?" over a small symbol.
  const history = inds.find(i => i.familyHistoryUnknown);
  if (history) {
    rows.push({
      label: FAMILY_HISTORY_LEGEND_LABEL,
      swatch: sy => {
        const s = LEGEND_SWATCH * 0.6, ox = x + (LEGEND_SWATCH - s) / 2, oy = sy + LEGEND_SWATCH - s;
        return `${swatchGeom(shape(history), ox, oy, s)} fill="white" stroke="black" stroke-width="1.5"/>`
          + `<text x="${fmt(x + LEGEND_SWATCH / 2)}" y="${fmt(oy - 1)}" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="black">?</text>`;
      },
    });
  }
  if (ev.evaluated) {
    rows.push({
      label: evLegend.label,
      swatch: sy => `<text x="${fmt(x + LEGEND_SWATCH / 2)}" y="${fmt(sy + LEGEND_SWATCH / 2 + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="black">${evLegend.mark}</text>`,
    });
  }
  if (ev.documented) {
    const sex = shape(ev.documented);
    rows.push({
      label: DOCUMENTED_LEGEND_LABEL,
      swatch: sy => {
        const s = LEGEND_SWATCH * 0.6, ox = x + (LEGEND_SWATCH - s) / 2 - 2, oy = sy + (LEGEND_SWATCH - s) / 2;
        return `${swatchGeom(sex, ox, oy, s)} fill="white" stroke="black" stroke-width="1.5"/>`
          + `<text x="${fmt(ox + s + 0.5)}" y="${fmt(oy + s + 5)}" font-family="sans-serif" font-size="11" fill="black">*</text>`;
      },
    });
  }
  // Pregnancies and losses, in the in-app legend's order and wording.
  for (const o of LIFE_STATUS_OPTIONS) {
    const ind = inds.find(i => i.lifeStatus === o.value);
    if (!ind) continue;
    const label = o.value === "stillbirth" ? "Stillbirth (SB)" : o.value === "ectopic" ? "Ectopic pregnancy (ECT)" : o.label;
    rows.push({ label, swatch: sy => renderLifeStatusSwatchSvg(o.value, shape(ind), x, sy) });
  }
  // Adoption brackets (#12), drawn a little smaller so they fit the swatch column.
  for (const o of ADOPTION_OPTIONS) {
    const ind = inds.find(i => i.adopted === o.value);
    if (!ind) continue;
    rows.push({
      label: adoptionLegendLabel(o.value),
      swatch: sy => {
        const s = LEGEND_SWATCH * 0.7, ox = x + (LEGEND_SWATCH - s) / 2, oy = sy + (LEGEND_SWATCH - s) / 2;
        const geom = swatchGeom(shape(ind), ox, oy, s);
        const brackets = adoptionBracketSegments(s, ox, oy)
          .map(([x1, y1, x2, y2]) => `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="black" stroke-width="1.5"/>`)
          .join("");
        return brackets + `${geom} fill="white" stroke="black" stroke-width="1.5"/>`;
      },
    });
  }
  // Assisted reproduction (#45): the symbol with its "D" or "S".
  for (const o of REPRODUCTIVE_ROLE_OPTIONS) {
    const ind = inds.find(i => symbolLetter(i) === o.letter);
    if (!ind) continue;
    rows.push({
      label: roleLegendLabel(o.value),
      swatch: sy => `${swatchGeom(shape(ind), x, sy, LEGEND_SWATCH)} fill="white" stroke="black" stroke-width="1.5"/>`
        + `<text x="${fmt(x + LEGEND_SWATCH / 2)}" y="${fmt(sy + LEGEND_SWATCH / 2 + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="black">${o.letter}</text>`,
    });
  }
  // Collapsed branches (#1): a diamond with "n" in it.
  if (collapseInfo(pedigree).placeholders.size > 0) {
    rows.push({
      label: COLLAPSED_BRANCH_LABEL,
      swatch: sy => `${swatchGeom("unknown", x, sy, LEGEND_SWATCH)} fill="white" stroke="black" stroke-width="1.5"/>`
        + `<text x="${fmt(x + LEGEND_SWATCH / 2)}" y="${fmt(sy + LEGEND_SWATCH / 2 + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="10" font-style="italic" fill="black">n</text>`,
    });
  }
  // Double couple line, by the same rule the canvas and exporter draw it with.
  const related = consanguinityTest(pedigree);
  if (pedigree.partnerships.some(p => related(p.individual1, p.individual2))) {
    rows.push({
      label: "Consanguineous couple",
      swatch: sy => {
        const cy = sy + LEGEND_SWATCH / 2;
        const line = (y: number) => `<line x1="${fmt(x)}" y1="${fmt(y)}" x2="${fmt(x + LEGEND_SWATCH)}" y2="${fmt(y)}" stroke="black" stroke-width="1.5"/>`;
        return line(cy - 2) + line(cy + 2);
      },
    });
  }

  // Ended relationship (#98): a couple line with the two strokes across it.
  if (hasEndedPartnership(pedigree)) {
    rows.push({
      label: ENDED_LABEL,
      swatch: sy => {
        const cy = sy + LEGEND_SWATCH / 2;
        const line = (x1: number, y1: number, x2: number, y2: number) =>
          `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="black" stroke-width="1.5"/>`;
        return line(x, cy, x + LEGEND_SWATCH, cy)
          + endedMarkSegments(x + LEGEND_SWATCH / 2, cy, 0.7).map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2)).join("");
      },
    });
  }

  // Childless couple marks (#15): a short couple line with the mark under it.
  const childless = new Set(childlessPartnerships(pedigree).map(p => p.childless!));
  for (const o of CHILDLESS_OPTIONS) {
    if (!childless.has(o.value)) continue;
    rows.push({
      label: o.label,
      swatch: sy => {
        const s = LEGEND_SWATCH, cx = x + s / 2, top = sy + 2, bar = sy + s - 2;
        const line = (x1: number, y1: number, x2: number, y2: number) =>
          `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="black" stroke-width="1.5"/>`;
        let out = line(x, top, x + s, top) + line(cx, top, cx, bar) + line(cx - 4, bar, cx + 4, bar);
        if (o.value === "infertility") out += line(cx - 4, bar - 3, cx + 4, bar - 3);
        return out;
      },
    });
  }

  // Twin forks (#11).
  const zygosities = zygositiesInUse(pedigree);
  for (const o of ZYGOSITY_OPTIONS) {
    if (!zygosities.has(o.value)) continue;
    rows.push({
      label: twinLegendLabel(o.value),
      swatch: sy => {
        const s = LEGEND_SWATCH, cx = x + s / 2, top = sy + 1, bottom = sy + s;
        const line = (x1: number, y1: number, x2: number, y2: number) =>
          `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="black" stroke-width="1.5"/>`;
        let out = line(x + 2, top, x + s - 2, top) + line(cx, top, x + 1, bottom) + line(cx, top, x + s - 1, bottom);
        const my = (top + bottom) / 2;
        if (o.value === "monozygotic") out += line(cx - 4, my, cx + 4, my);
        if (o.value === "unknown") out += `<text x="${fmt(cx)}" y="${fmt(my + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="bold" fill="black">?</text>`;
        return out;
      },
    });
  }

  // Lines of assisted reproduction (#45): a slanting line, dashed for a social parent.
  const linkKinds = new Set(assistedLinks(pedigree).map(l => l.kind));
  for (const kind of ["carrier", "social"] as const) {
    if (!linkKinds.has(kind)) continue;
    rows.push({
      label: kind === "carrier" ? CARRIER_LINE_LEGEND : SOCIAL_LINE_LEGEND,
      swatch: sy => `<line x1="${fmt(x + 2)}" y1="${fmt(sy + 1)}" x2="${fmt(x + LEGEND_SWATCH - 2)}" y2="${fmt(sy + LEGEND_SWATCH - 1)}" stroke="black" stroke-width="1.5"${kind === "social" ? ` stroke-dasharray="4 2"` : ""}/>`,
    });
  }

  const tagRows = keyTagRows(pedigree);
  const tags = tagRows.map(r => r.tag);
  const details = renderClinicalDetailsSvg(pedigree, x, 0);
  if (rows.length === 0 && tagRows.length === 0 && details.height === 0) return { markup: [], width: 0, height: 0 };

  const labelOffset = swatchColumnWidth(tags) + LEGEND_LABEL_GAP;
  const rowY = (i: number) => y + i * LEGEND_ROW_HEIGHT + (LEGEND_ROW_HEIGHT - LEGEND_SWATCH) / 2;
  const markup = rows.map((r, i) =>
    r.swatch(rowY(i)) + legendLabelSvg(r.label, x + labelOffset, rowY(i) + LEGEND_SWATCH / 2),
  );
  tagRows.forEach((r, j) => markup.push(renderTagLegendRowSvg(r.tag, pedigree, x, rowY(rows.length + j), labelOffset, r.carrier)));

  const longest = Math.max(0, ...rows.map(r => r.label.length), ...tagRows.map(r => r.label.length));
  const symbolsHeight = (rows.length + tagRows.length) * LEGEND_ROW_HEIGHT;
  // The clinical details (#102) go under the symbol rows, a half row apart.
  const gap = symbolsHeight > 0 && details.height > 0 ? LEGEND_ROW_HEIGHT / 2 : 0;
  if (details.height > 0) {
    markup.push(`<g class="clinical-details" transform="translate(0 ${fmt(y + symbolsHeight + gap)})">`, ...details.markup, `</g>`);
  }
  return {
    markup,
    width: Math.max(symbolsHeight > 0 ? labelOffset + longest * LEGEND_CHAR_WIDTH : 0, details.width),
    height: symbolsHeight + gap + details.height,
  };
}

/** Characters per line of a clinical detail in the export key before it wraps. */
const DETAIL_WRAP = 70;
const DETAIL_LINE_HEIGHT = 14;
const DETAIL_INDENT = 12;

/**
 * The filled clinical key fields (#102) as "Label: value" text lines, top-left
 * at (x, y), long values wrapped. Empty when none is filled.
 */
export function renderClinicalDetailsSvg(pedigree: Pedigree, x: number, y: number): TagLegendBlock {
  const lines = clinicalDetailLines(pedigree);
  if (lines.length === 0) return { markup: [], width: 0, height: 0 };
  const markup: string[] = [];
  let widest = 0;
  let row = 0;
  for (const { label, value } of lines) {
    const head = `${label}: `;
    const wrapped = wrapText(value, DETAIL_WRAP - head.length);
    wrapped.forEach((text, i) => {
      const baseline = y + row * DETAIL_LINE_HEIGHT + LEGEND_FONT_SIZE;
      const body = i === 0
        ? `<tspan font-weight="bold">${escapeXml(label)}:</tspan> ${escapeXml(text)}`
        : escapeXml(text);
      // A hanging indent: the bold label's real width is not known here.
      const indent = i === 0 ? 0 : DETAIL_INDENT;
      markup.push(`<text x="${fmt(x + indent)}" y="${fmt(baseline)}" font-family="sans-serif" font-size="${LEGEND_FONT_SIZE}" fill="black">${body}</text>`);
      widest = Math.max(widest, i === 0 ? head.length + text.length : DETAIL_INDENT / LEGEND_CHAR_WIDTH + text.length);
      row++;
    });
  }
  return { markup, width: widest * LEGEND_CHAR_WIDTH, height: row * DETAIL_LINE_HEIGHT };
}
