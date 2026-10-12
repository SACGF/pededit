import type { Individual, Pedigree, Tag, TagStyle } from "@pedigree-editor/layout-engine";

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
 * greyscale when combined with the quadrant position.
 */
export const TAG_PALETTE: readonly string[] = [
  "#000000", // black
  "#d62728", // red
  "#1f77b4", // blue
  "#f2c80f", // yellow
  "#2ca02c", // green
  "#ff7f0e", // orange
  "#9467bd", // purple
  "#17becf", // cyan
  "#8c564b", // brown
  "#7f7f7f", // grey
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
 * Fixed quarter positions for up to four quadrant tags. Each tag owns a
 * quarter in every symbol (the "slot" model used by kinship2, Madeline and
 * Progeny), so position alone identifies the condition and a quarter stays
 * put when other tags are added. The NSGC standard requires a key but fixes
 * no order, so we read like a page: upper left first, then clockwise. This is
 * Madeline's convention and the one in most published multi-condition
 * pedigrees. With more than four quadrant tags the symbol is split into equal
 * pie slices instead, starting at 12 o'clock.
 */
const QUADRANT_ANGLES: readonly [number, number][] = [
  [270, 360], // upper left
  [0, 90],    // upper right
  [90, 180],  // lower right
  [180, 270], // lower left
];

export const QUADRANT_NAMES = ["upper left", "upper right", "lower right", "lower left"] as const;

/** Angle range for the quadrant tag at `index` when the pedigree has `count` quadrant tags. */
export function sectorAngles(index: number, count: number): [number, number] {
  if (count <= QUADRANT_ANGLES.length) return QUADRANT_ANGLES[index]!;
  const span = 360 / count;
  return [index * span, (index + 1) * span];
}

/** Sectors to paint on an individual's symbol, in pedigree tag order. */
export function sectorsFor(individual: Individual, pedigree: Pedigree): Sector[] {
  const all = quadrantTags(pedigree);
  if (all.length === 0) return [];
  const mine = new Set(individual.tags ?? []);
  const out: Sector[] = [];
  all.forEach((tag, i) => {
    if (!mine.has(tag.id)) return;
    const [start, end] = sectorAngles(i, all.length);
    out.push({ tag, start, end });
  });
  return out;
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

/** Dot and text tags of an individual laid out as a centred row. */
export function annotationRow(individual: Individual, pedigree: Pedigree): AnnotationItem[] {
  const tags = tagsOf(individual, pedigree).filter(t => t.style !== "quadrant");
  if (tags.length === 0) return [];
  const widths = tags.map(t =>
    t.style === "dot" ? ANNOTATION_DOT_RADIUS * 2 : tagCanvasText(t).length * ANNOTATION_CHAR_WIDTH,
  );
  const total = widths.reduce((a, b) => a + b, 0) + ANNOTATION_GAP * (tags.length - 1);
  let x = -total / 2;
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

/** Annotation row for a symbol centred on (0, 0), as SVG markup. */
export function renderAnnotationRowSvg(individual: Individual, pedigree: Pedigree, size: number): string {
  const items = annotationRow(individual, pedigree);
  if (items.length === 0) return "";
  const cy = size / 2 + ANNOTATION_Y;
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

/**
 * A legend entry for a tag: a small square swatch showing how the tag is
 * drawn (quarter fill, dot, or coloured text) followed by the label. Drawn
 * with the swatch's top-left at (x, y).
 */
export function renderTagLegendRowSvg(tag: Tag, pedigree: Pedigree, x: number, y: number): string {
  const s = LEGEND_SWATCH;
  const cx = x + s / 2, cy = y + s / 2;
  const parts: string[] = [];
  if (tag.style === "quadrant") {
    const all = quadrantTags(pedigree);
    const idx = all.findIndex(t => t.id === tag.id);
    const [start, end] = sectorAngles(Math.max(idx, 0), Math.max(all.length, 1));
    const clipId = `legend-clip-${tag.id}`;
    parts.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${s}" height="${s}"/></clipPath>`);
    parts.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="white" stroke="black" stroke-width="1.5"/>`);
    parts.push(`<path d="${sectorPath(cx, cy, s, start, end)}" fill="${escapeXml(tag.color)}" clip-path="url(#${clipId})"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="none" stroke="black" stroke-width="1.5"/>`);
  } else if (tag.style === "dot") {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${ANNOTATION_DOT_RADIUS}" fill="${escapeXml(tag.color)}"/>`);
  } else {
    parts.push(`<text x="${cx}" y="${cy + ANNOTATION_FONT_SIZE / 2 - 1}" text-anchor="middle" font-family="sans-serif" font-size="${ANNOTATION_FONT_SIZE}" font-weight="bold" fill="${escapeXml(tag.color)}">${escapeXml(tagCanvasText(tag))}</text>`);
  }
  parts.push(`<text x="${x + s + 8}" y="${cy + LEGEND_FONT_SIZE / 2 - 1}" font-family="sans-serif" font-size="${LEGEND_FONT_SIZE}" fill="black">${escapeXml(tag.label)}</text>`);
  return parts.join("");
}

/** Width needed by the widest legend row, for sizing the export canvas. */
export function tagLegendWidth(tags: readonly Tag[]): number {
  const longest = Math.max(0, ...tags.map(t => t.label.length));
  return LEGEND_SWATCH + 8 + longest * 6;
}

export interface TagLegendBlock {
  /** SVG markup lines; empty when no tag is in use. */
  markup: string[];
  width: number;
  height: number;
}

/**
 * The key for every tag applied to at least one individual, one row per tag,
 * with its top-left corner at (x, y). Exporters reserve `height` below the
 * pedigree and at least `width` across.
 */
export function renderTagLegendSvg(pedigree: Pedigree, x: number, y: number): TagLegendBlock {
  const tags = tagsInUse(pedigree);
  if (tags.length === 0) return { markup: [], width: 0, height: 0 };
  const markup = tags.map((tag, i) =>
    renderTagLegendRowSvg(tag, pedigree, x, y + i * LEGEND_ROW_HEIGHT + (LEGEND_ROW_HEIGHT - LEGEND_SWATCH) / 2),
  );
  return { markup, width: tagLegendWidth(tags), height: tags.length * LEGEND_ROW_HEIGHT };
}
