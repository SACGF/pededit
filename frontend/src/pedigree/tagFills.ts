import type { Pedigree, Tag, TagFill, TagFillMode } from "@pedigree-editor/layout-engine";

/**
 * Pattern fills for tag sectors (#67), and the monochrome setting.
 *
 * A pattern is plain geometry (one stroked path of lines, or one filled path
 * of small dots) in the tag's colour over a white base, clipped to the region
 * it fills. No SVG <pattern> element is used: React, the string exporters,
 * the PNG rasteriser and svg2pdf (PDF export) all draw paths and clip paths
 * the same way, and a pattern tile would be one more thing each of them has
 * to support.
 *
 * The textures are fine (4px apart on a 40px symbol) so they read as a fill,
 * not as a mark: a single vertical line through a symbol is the
 * presymptomatic carrier (#101), a centre dot the carrier (NSGC 2008), and a
 * "\" slash deceased, which is why the diagonal hatch runs the other way.
 *
 * `renderRegionFillSvg` / `fillLayers` are the reusable entry points: fill a
 * region (any SVG path, normally a sector from `sectorPath`) with pattern P
 * in colour C. The canvas (`RegionFill` in nodes/symbols.tsx), the legend and
 * both exporters call them; per-condition carrier fills (#115) should too.
 */

export interface TagFillOption {
  value: TagFill;
  label: string;
}

/** Fills offered in the tags dialog, in menu order. */
export const TAG_FILL_OPTIONS: readonly TagFillOption[] = [
  { value: "solid", label: "Solid" },
  { value: "diagonal", label: "Hatched" },
  { value: "horizontal", label: "Horizontal lines" },
  { value: "vertical", label: "Vertical lines" },
  { value: "crosshatch", label: "Cross-hatched" },
  { value: "dots", label: "Dotted" },
  { value: "shade", label: "Light shade" },
];

const FILL_VALUES = new Set<string>(TAG_FILL_OPTIONS.map(o => o.value));

export function isTagFill(v: unknown): v is TagFill {
  return typeof v === "string" && FILL_VALUES.has(v);
}

/**
 * Patterns handed out in monochrome mode to quadrant tags whose own fill is
 * solid, in quadrant order, skipping any a tag already has. Vertical lines go
 * last because they are the closest to the presymptomatic line.
 */
export const MONOCHROME_PATTERN_ORDER: readonly TagFill[] = [
  "diagonal", "horizontal", "dots", "crosshatch", "shade", "vertical",
];

/** Colour of every tag in monochrome mode. Not "black": see `PedigreeCanvas`'s minimap CSS. */
export const MONOCHROME_COLOR = "#000000";

export const TAG_FILL_MODE_OPTIONS: { value: TagFillMode; label: string }[] = [
  { value: "color", label: "Colour" },
  { value: "monochrome", label: "Black and white patterns" },
];

export function tagFillMode(pedigree: Pick<Pedigree, "canvasSettings"> | undefined): TagFillMode {
  return pedigree?.canvasSettings?.tagFills === "monochrome" ? "monochrome" : "color";
}

/** How a tag is drawn: its colour and, for a quadrant tag, its fill. */
export interface TagPaint {
  color: string;
  fill: TagFill;
}

const paintCache = new WeakMap<Pedigree, Map<string, TagPaint>>();

function paintsOf(pedigree: Pedigree): Map<string, TagPaint> {
  const cached = paintCache.get(pedigree);
  if (cached) return cached;
  const tags = pedigree.tags ?? [];
  const map = new Map<string, TagPaint>();
  if (tagFillMode(pedigree) === "color") {
    for (const t of tags) map.set(t.id, { color: t.color, fill: t.style === "quadrant" ? (t.fill ?? "solid") : "solid" });
  } else {
    const quads = tags.filter(t => t.style === "quadrant");
    const own = (t: Tag): TagFill | undefined => (t.fill && t.fill !== "solid" ? t.fill : undefined);
    const taken = new Set<TagFill>();
    for (const q of quads) { const f = own(q); if (f) taken.add(f); }
    let next = 0;
    for (const t of tags) {
      let fill: TagFill = "solid";
      if (t.style === "quadrant") {
        const mine = own(t);
        if (mine) fill = mine;
        else {
          // First pattern nobody has; once all are used, cycle through them.
          const free = MONOCHROME_PATTERN_ORDER.find(p => !taken.has(p));
          fill = free ?? MONOCHROME_PATTERN_ORDER[next++ % MONOCHROME_PATTERN_ORDER.length]!;
          taken.add(fill);
        }
      }
      map.set(t.id, { color: MONOCHROME_COLOR, fill });
    }
  }
  paintCache.set(pedigree, map);
  return map;
}

/**
 * The colour and fill a tag is drawn with in this pedigree. Every renderer
 * (symbol sectors, dots, text, legend swatches) reads tags through this, so
 * the monochrome setting reaches them all. Cached per pedigree object.
 */
export function tagPaint(tag: Tag, pedigree: Pedigree): TagPaint {
  return paintsOf(pedigree).get(tag.id)
    ?? { color: tagFillMode(pedigree) === "monochrome" ? MONOCHROME_COLOR : tag.color, fill: tag.style === "quadrant" ? (tag.fill ?? "solid") : "solid" };
}

// ── Geometry ──────────────────────────────────────────────────────────────────

/** Square area a pattern covers: the symbol's bounding box. Patterns line up across its sectors. */
export interface FillBox {
  x: number;
  y: number;
  size: number;
}

/** Distance between pattern lines or dots for a symbol of this size (4 at 40px, 2.5 at a 16px swatch). */
export function patternSpacing(size: number): number {
  // Finer on a 16px legend swatch, so its quarter still shows three repeats.
  return Math.max(2.5, size / 10);
}

export function patternLineWidth(size: number): number {
  return Math.max(0.6, size / 40);
}

/** Mix a #rgb / #rrggbb colour with white; `amount` is how much of the colour is kept. */
export function tint(color: string, amount = 0.25): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return "#cccccc";
  let hex = m[1]!;
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const mix = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(c * amount + 255 * (1 - amount)).toString(16).padStart(2, "0");
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

function n(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/**
 * Path data for a line pattern covering the box (extending past it, so the
 * clip shapes it). "diagonal" runs "/", lower left to upper right.
 */
export function patternLinesD(fill: TagFill, box: FillBox): string {
  const { x, y, size } = box;
  const s = patternSpacing(size);
  const segs: string[] = [];
  const horizontal = () => {
    for (let v = s / 2; v < size; v += s) segs.push(`M${n(x)} ${n(y + v)}H${n(x + size)}`);
  };
  const vertical = () => {
    for (let v = s / 2; v < size; v += s) segs.push(`M${n(x + v)} ${n(y)}V${n(y + size)}`);
  };
  // Diagonals at 45 degrees, `gap` apart measured square to the lines.
  const diagonals = (dir: 1 | -1, gap: number) => {
    const step = gap * Math.SQRT2;
    for (let d = -size + step / 2; d < size; d += step) {
      if (dir === 1) segs.push(`M${n(x + d)} ${n(y + size)}L${n(x + d + size)} ${n(y)}`);
      else segs.push(`M${n(x + d)} ${n(y)}L${n(x + d + size)} ${n(y + size)}`);
    }
  };
  if (fill === "horizontal") horizontal();
  else if (fill === "vertical") vertical();
  else if (fill === "diagonal") diagonals(1, s);
  else if (fill === "crosshatch") { diagonals(1, s * 1.5); diagonals(-1, s * 1.5); }
  return segs.join("");
}

/** Path data for the dot pattern: a staggered grid of small filled circles. */
export function patternDotsD(box: FillBox): string {
  const { x, y, size } = box;
  const s = patternSpacing(size);
  const r = s / 4;
  const parts: string[] = [];
  let row = 0;
  for (let cy = s / 2; cy < size; cy += s, row++) {
    for (let cx = row % 2 ? s : s / 2; cx < size; cx += s) {
      const px = x + cx, py = y + cy;
      parts.push(`M${n(px - r)} ${n(py)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`);
    }
  }
  return parts.join("");
}

/**
 * One drawn element of a fill. `clip` says whether it is clipped to the
 * region itself (pattern marks are; the region-shaped base is not, it has the
 * region's shape already).
 */
export interface FillLayer {
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  clip: boolean;
}

/**
 * The layers that fill `regionD` with `fill` in `color`, bottom first. Solid
 * and shade are one region-shaped path; patterns are a white region and then
 * the marks, which the caller clips to the region.
 */
export function fillLayers(fill: TagFill, color: string, regionD: string, box: FillBox): FillLayer[] {
  // Anything unknown (a newer file, a hand-built sector) draws solid.
  if (fill === "solid" || !FILL_VALUES.has(fill)) return [{ d: regionD, fill: color, clip: false }];
  if (fill === "shade") return [{ d: regionD, fill: tint(color), clip: false }];
  const base: FillLayer = { d: regionD, fill: "white", clip: false };
  if (fill === "dots") return [base, { d: patternDotsD(box), fill: color, clip: true }];
  return [base, { d: patternLinesD(fill, box), fill: "none", stroke: color, strokeWidth: patternLineWidth(box.size), clip: true }];
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Fill a region with pattern `fill` in `color`, as SVG markup. `regionClipId`
 * is a fresh id this call uses for the region's own <clipPath>; `outerClipId`,
 * when given, is a clip the caller already emitted (the symbol outline) that
 * everything is clipped to as well, as tag sectors are.
 */
export function renderRegionFillSvg(
  fill: TagFill, color: string, regionD: string, box: FillBox,
  regionClipId: string, outerClipId?: string,
): string {
  const outer = outerClipId ? ` clip-path="url(#${outerClipId})"` : "";
  const layers = fillLayers(fill, color, regionD, box);
  const out: string[] = [];
  if (layers.some(l => l.clip)) out.push(`<clipPath id="${regionClipId}"><path d="${regionD}"/></clipPath>`);
  for (const l of layers) {
    const paint = `fill="${escapeAttr(l.fill)}"` + (l.stroke ? ` stroke="${escapeAttr(l.stroke)}" stroke-width="${n(l.strokeWidth ?? 1)}"` : "");
    if (!l.clip) out.push(`<path d="${l.d}" ${paint}${outer}/>`);
    else if (outerClipId) out.push(`<g${outer}><path d="${l.d}" ${paint} clip-path="url(#${regionClipId})"/></g>`);
    else out.push(`<path d="${l.d}" ${paint} clip-path="url(#${regionClipId})"/>`);
  }
  return out.join("");
}
