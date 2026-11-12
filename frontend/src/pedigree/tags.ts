import type { Individual, Pedigree, Tag, TagStyle } from "@pedigree-editor/layout-engine";
import { consanguinityTest } from "./consanguinity";
import { ENDED_LABEL, endedMarkSegments, hasEndedPartnership } from "./ended";
import { LIFE_STATUS_OPTIONS, lossTrianglePoints, lossSlashEnds, usesLossTriangle } from "./lifeStatus";
import { CHILDLESS_OPTIONS, childlessPartnerships } from "./childless";
import { ADOPTION_OPTIONS, adoptionLegendLabel, adoptionBracketSegments } from "./adoption";
import { ZYGOSITY_OPTIONS, twinLegendLabel, zygositiesInUse } from "./twins";
import { COLLAPSED_BRANCH_LABEL, collapseInfo } from "./collapse";
import { clinicalDetailLines, wrapText } from "./clinicalDetails";
import { arrowKind, renderArrowKeySwatchSvg, ARROW_LEGEND_LABEL } from "./proband";
import { FAMILY_HISTORY_LEGEND_LABEL } from "./familyHistory";

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
  quadrant: "Fill a quarter of the symbol",
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
}

/**
 * Fixed quarter positions for the first four quadrant tags. Each tag owns a
 * quarter in every symbol (the "slot" model used by kinship2, Madeline and
 * Progeny), so position alone identifies the condition and a quarter stays
 * put when other tags are added. The NSGC standard requires a key but fixes
 * no order, so we read like a page: upper left first, then clockwise. This is
 * Madeline's convention and the one in most published multi-condition
 * pedigrees.
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

export const QUADRANT_NAMES = ["upper left", "upper right", "lower right", "lower left"] as const;

/** Number of quadrant tags that have a fixed quarter. */
export const FIXED_QUADRANTS = QUADRANT_ANGLES.length;

/**
 * Angle range of the fixed quarter for the quadrant tag at `index` in the
 * pedigree's quadrant tags, or the whole symbol for a fifth or later tag
 * (which has no fixed position; legends show it as a full swatch).
 */
export function sectorAngles(index: number): [number, number] {
  return QUADRANT_ANGLES[index] ?? [0, 360];
}

/** Sectors to paint on an individual's symbol, in pedigree tag order. */
export function sectorsFor(individual: Individual, pedigree: Pedigree): Sector[] {
  const all = quadrantTags(pedigree);
  if (all.length === 0) return [];
  const mine = new Set(individual.tags ?? []);
  const carried = all
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => mine.has(tag.id));
  if (carried.length === 0) return [];
  if (carried.every(c => c.index < FIXED_QUADRANTS)) {
    return carried.map(({ tag, index }) => {
      const [start, end] = QUADRANT_ANGLES[index]!;
      return { tag, start, end };
    });
  }
  const span = 360 / carried.length;
  return carried.map(({ tag }, i) => ({ tag, start: i * span, end: (i + 1) * span }));
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

/** True when the symbol needs the black centre described above. */
export function needsAffectedCore(individual: Individual, sectors: readonly Sector[]): boolean {
  return !!individual.affected && sectors.length > 0;
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
    const item = { tag, x: x + width / 2, width };
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
  const sectors = sectorsFor(individual, pedigree);
  if (sectors.length === 0) return "";
  const r = size; // beyond the half-diagonal, so the clip does the shaping
  return sectors
    .map(s => `<path d="${sectorPath(0, 0, r, s.start, s.end)}" fill="${escapeXml(s.tag.color)}" clip-path="url(#${clipId})"/>`)
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
    .map(({ tag, x }) =>
      tag.style === "dot"
        ? `<circle cx="${fmt(x)}" cy="${fmt(cy)}" r="${ANNOTATION_DOT_RADIUS}" fill="${escapeXml(tag.color)}"/>`
        : `<text x="${fmt(x)}" y="${fmt(cy + ANNOTATION_FONT_SIZE / 2 - 1)}" text-anchor="middle" font-family="sans-serif" font-size="${ANNOTATION_FONT_SIZE}" font-weight="bold" fill="${escapeXml(tag.color)}">${escapeXml(tagCanvasText(tag))}</text>`,
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
): string {
  const s = LEGEND_SWATCH;
  const cx = x + s / 2, cy = y + s / 2;
  const parts: string[] = [];
  if (tag.style === "quadrant") {
    const idx = quadrantTags(pedigree).findIndex(t => t.id === tag.id);
    const [start, end] = sectorAngles(Math.max(idx, 0));
    const clipId = `legend-clip-${tag.id}`;
    parts.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${s}" height="${s}"/></clipPath>`);
    parts.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="white" stroke="black" stroke-width="1.5"/>`);
    parts.push(`<path d="${sectorPath(cx, cy, s, start, end)}" fill="${escapeXml(tag.color)}" clip-path="url(#${clipId})"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="none" stroke="black" stroke-width="1.5"/>`);
  } else if (tag.style === "dot") {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${ANNOTATION_DOT_RADIUS}" fill="${escapeXml(tag.color)}"/>`);
  } else {
    parts.push(`<text x="${x}" y="${cy + ANNOTATION_FONT_SIZE / 2 - 1}" font-family="sans-serif" font-size="${ANNOTATION_FONT_SIZE}" font-weight="bold" fill="${escapeXml(tag.color)}">${escapeXml(tagCanvasText(tag))}</text>`);
  }
  parts.push(legendLabelSvg(tag.label, x + labelOffset, cy));
  return parts.join("");
}

function legendLabelSvg(label: string, x: number, cy: number): string {
  return `<text x="${fmt(x)}" y="${cy + LEGEND_FONT_SIZE / 2 - 1}" font-family="sans-serif" font-size="${LEGEND_FONT_SIZE}" fill="black">${escapeXml(label)}</text>`;
}

/** Width needed by the widest legend row, for sizing the export canvas. */
export function tagLegendWidth(tags: readonly Tag[]): number {
  const longest = Math.max(0, ...tags.map(t => t.label.length));
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
  const tags = tagsInUse(pedigree);
  if (tags.length === 0) return { markup: [], width: 0, height: 0 };
  const labelOffset = swatchColumnWidth(tags) + LEGEND_LABEL_GAP;
  const markup = tags.map((tag, i) =>
    renderTagLegendRowSvg(tag, pedigree, x, y + i * LEGEND_ROW_HEIGHT + (LEGEND_ROW_HEIGHT - LEGEND_SWATCH) / 2, labelOffset),
  );
  return { markup, width: tagLegendWidth(tags), height: tags.length * LEGEND_ROW_HEIGHT };
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
  const affected = inds.find(i => i.affected);
  if (affected) {
    rows.push({ label: "Affected", swatch: sy => renderStatusSwatchSvg("affected", affected.sex, false, x, sy) });
    if (inds.some(i => needsAffectedCore(i, sectorsFor(i, pedigree)))) {
      rows.push({
        label: "Affected, with tags (black centre)",
        swatch: sy => renderStatusSwatchSvg("affected", affected.sex, true, x, sy),
      });
    }
  }
  // The dot is drawn on every unaffected carrier, pregnancies and losses included (#14).
  const carrier = inds.find(i => i.carrier && !i.affected);
  if (carrier) rows.push({ label: "Carrier", swatch: sy => renderStatusSwatchSvg("carrier", carrier.sex, false, x, sy) });
  const deceased = inds.find(i => i.deceased);
  if (deceased) rows.push({ label: "Deceased", swatch: sy => renderStatusSwatchSvg("deceased", deceased.sex, false, x, sy) });
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
        return `${swatchGeom(history.sex, ox, oy, s)} fill="white" stroke="black" stroke-width="1.5"/>`
          + `<text x="${fmt(x + LEGEND_SWATCH / 2)}" y="${fmt(oy - 1)}" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="black">?</text>`;
      },
    });
  }
  // Pregnancies and losses, in the in-app legend's order and wording.
  for (const o of LIFE_STATUS_OPTIONS) {
    const ind = inds.find(i => i.lifeStatus === o.value);
    if (!ind) continue;
    const label = o.value === "stillbirth" ? "Stillbirth (SB)" : o.value === "ectopic" ? "Ectopic pregnancy (ECT)" : o.label;
    rows.push({ label, swatch: sy => renderLifeStatusSwatchSvg(o.value, ind.sex, x, sy) });
  }
  // Adoption brackets (#12), drawn a little smaller so they fit the swatch column.
  for (const o of ADOPTION_OPTIONS) {
    const ind = inds.find(i => i.adopted === o.value);
    if (!ind) continue;
    rows.push({
      label: adoptionLegendLabel(o.value),
      swatch: sy => {
        const s = LEGEND_SWATCH * 0.7, ox = x + (LEGEND_SWATCH - s) / 2, oy = sy + (LEGEND_SWATCH - s) / 2;
        const geom = swatchGeom(ind.sex, ox, oy, s);
        const brackets = adoptionBracketSegments(s, ox, oy)
          .map(([x1, y1, x2, y2]) => `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="black" stroke-width="1.5"/>`)
          .join("");
        return brackets + `${geom} fill="white" stroke="black" stroke-width="1.5"/>`;
      },
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

  const tags = tagsInUse(pedigree);
  const details = renderClinicalDetailsSvg(pedigree, x, 0);
  if (rows.length === 0 && tags.length === 0 && details.height === 0) return { markup: [], width: 0, height: 0 };

  const labelOffset = swatchColumnWidth(tags) + LEGEND_LABEL_GAP;
  const rowY = (i: number) => y + i * LEGEND_ROW_HEIGHT + (LEGEND_ROW_HEIGHT - LEGEND_SWATCH) / 2;
  const markup = rows.map((r, i) =>
    r.swatch(rowY(i)) + legendLabelSvg(r.label, x + labelOffset, rowY(i) + LEGEND_SWATCH / 2),
  );
  tags.forEach((tag, j) => markup.push(renderTagLegendRowSvg(tag, pedigree, x, rowY(rows.length + j), labelOffset)));

  const longest = Math.max(0, ...rows.map(r => r.label.length), ...tags.map(t => t.label.length));
  const symbolsHeight = (rows.length + tags.length) * LEGEND_ROW_HEIGHT;
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
