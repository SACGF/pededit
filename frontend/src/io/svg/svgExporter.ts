import type { Pedigree, Individual } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "../../pedigree/constants";
import { duplicateArcD } from "../../pedigree/couplePath";
import { coupleLineGeometry, sibshipLineGeometry } from "../../pedigree/lineGeometry";
import { TWIN_QUESTION_FONT_SIZE } from "../../pedigree/twins";
import { linesWidth, titleWidth, LABEL_FONT_SIZE, TITLE_FONT_SIZE, TITLE_GAP } from "../../pedigree/labels";
import { adoptionBracketSegments, ADOPTION_DASH } from "../../pedigree/adoption";
import { symbolLetter, roleLetterFontSize, roleLetterBaselineY, roleLetterFill, assistedEdgeSegment } from "../../pedigree/assisted";
import { CHILDLESS_REASON_FONT_SIZE } from "../../pedigree/childless";
import { layoutToFlow } from "../../pedigree/layoutToFlow";
import type { PersonGlyph } from "../../pedigree/personGlyph";
import {
  CONSANGUINITY_LABEL_FONT_SIZE, consanguinityLabelBacking, consanguinityLabelBaselines, consanguinityLabelPlacements, highestConsanguinityLabel,
} from "../../pedigree/consanguinityLabel";
import { EXPORT_LABEL_LINE_HEIGHT, EXPORT_LABEL_OFFSET_Y, EXPORT_ANNOTATION_SHIFT, EXPORT_CAPTION_SHIFT } from "../../pedigree/labelBlock";
import type { FlowData } from "../../pedigree/layoutToFlow";
import { deidentify } from "./deidentify";
import { drawnPedigree, renderBranchCountSvg } from "../../pedigree/collapse";
import { renderFamilyHistorySvg } from "../../pedigree/familyHistory";
import { renderPresymptomaticLineSvg, renderDocumentedMarkSvg } from "../../pedigree/evaluation";
import { renderArrowSvg, ARROW_TAIL, PROBAND_LETTER_SIZE, type ArrowKind } from "../../pedigree/proband";
import { renderExportKeySvg } from "../../pedigree/exportKey";
import type { SvgExportOptions } from "./types";
import {
  renderSectorListSvg, renderAnnotationItemsSvg, 
  renderAffectedCoreSvg, type SymbolPaint,
} from "../../pedigree/tags";
import {
  usesLossTriangle, CAPTION_FONT_SIZE,
  lossTrianglePoints, lossSlashEnds, pregnancyFontSize, pregnancyBaselineY,
  carrierDot, symbolTopInset, CARRIER_RIM,
} from "../../pedigree/lifeStatus";

const STROKE = 2;
const DECEASED_OVERHANG = 4; // matches DeceasedSlash in symbols.tsx
const PROBAND_TAIL = ARROW_TAIL + PROBAND_LETTER_SIZE; // arrow plus its "P" (proband.ts)
// Where the text under a symbol goes (pedigree/labelBlock.ts, shared with
// the couple label placement, #109). The first baseline leaves a gap between
// the symbol edge and the cap height of a 10px label.
const LABEL_LINE_HEIGHT = EXPORT_LABEL_LINE_HEIGHT;
const LABEL_OFFSET_Y = EXPORT_LABEL_OFFSET_Y;
const ANNOTATION_SHIFT = EXPORT_ANNOTATION_SHIFT;
const CAPTION_SHIFT = EXPORT_CAPTION_SHIFT;

// ── Slot positions ────────────────────────────────────────────────────────────

type SlotPos = Map<string, { x: number; y: number }>;

/**
 * Map from "level-slot" to canvas pixel position, taken from the canvas's own
 * layoutToFlow so the export matches it: pins applied (to the nearest copy of
 * someone drawn twice), and copies with no line left out. A slot missing from
 * the map is not drawn.
 */
function buildSlotPositions(flow: FlowData): SlotPos {
  return new Map(flow.nodes.map(n => [n.id, n.position]));
}

/** Dashed arcs joining the copies of anyone drawn more than once. */
function renderDuplicateArcs(flow: FlowData, slotPos: SlotPos): string[] {
  const half = NODE_SIZE / 2;
  return flow.duplicateEdges.map(e => {
    const a = slotPos.get(e.source)!, b = slotPos.get(e.target)!;
    const d = duplicateArcD(a.x, a.y, b.x, b.y, e.data?.bulge ?? 28, half);
    return `<path d="${d}" stroke="black" stroke-width="1.5" stroke-dasharray="6 4" fill="none"/>`;
  });
}

// ── Bounds ────────────────────────────────────────────────────────────────────

interface CanvasBounds {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

function computeBounds(
  pedigree: Pedigree,
  glyphs: PersonGlyph[],
  slotPos: SlotPos,
  options: SvgExportOptions,
  aboveTop = Infinity,
  duplicates = false,
): CanvasBounds {
  const padding = options.padding ?? 40;
  // The title's baseline is at padding + 16, TITLE_GAP above the top row of
  // symbols plus room for a deceased slash, which reaches DECEASED_OVERHANG
  // above the row.
  const titleHeight = options.title ? 16 + TITLE_GAP + DECEASED_OVERHANG : 0;

  let rawMinX = Infinity, rawMaxX = -Infinity;
  let rawMinY = Infinity, rawMaxY = -Infinity;
  for (const { x, y } of slotPos.values()) {
    if (x < rawMinX) rawMinX = x;
    if (x > rawMaxX) rawMaxX = x;
    if (y < rawMinY) rawMinY = y;
    if (y > rawMaxY) rawMaxY = y;
  }

  const hasProband = glyphs.some(g => g.arrow);
  const probandExtra = hasProband ? PROBAND_TAIL + 4 : 0;

  const hasAnnotations = glyphs.some(g => g.annotations.length > 0);
  const hasCaption = glyphs.some(g => g.caption);
  // Names wrap to the slot width (#68), the age or DOB takes a line (#20), so
  // does each age of onset (#93) and the pedigree number (#8), so allow for
  // the most lines anyone takes.
  const textLines = Math.max(1, ...glyphs.map(g => g.figureNameLines.length + g.detailLines.length));
  const labelHeight = LABEL_OFFSET_Y + textLines * LABEL_LINE_HEIGHT
    + (hasAnnotations ? ANNOTATION_SHIFT : 0) + (hasCaption ? CAPTION_SHIFT : 0);

  // Consanguinity labels (#97) over the top row reach above the symbols.
  const aboveExtra = Math.max(0, Math.ceil(rawMinY - NODE_SIZE / 2 - aboveTop));
  const contentW = rawMaxX - rawMinX + NODE_SIZE + probandExtra;
  const contentH = rawMaxY - rawMinY + NODE_SIZE + labelHeight + probandExtra + aboveExtra;

  // The tag key sits under the pedigree, bottom-left, inside the padding.
  const legend = renderExportKeySvg(pedigree, 0, 0, { duplicates });
  const legendExtra = legend.height > 0 ? legend.height + padding / 2 : 0;

  // A title wider than the drawing widens the figure; the drawing is then
  // centred under it.
  const innerW = Math.max(contentW, legend.width, options.title ? titleWidth(options.title) : 0);
  const offsetX = padding + (innerW - Math.max(contentW, legend.width)) / 2 + NODE_SIZE / 2 + probandExtra - rawMinX;
  const offsetY = padding + NODE_SIZE / 2 + titleHeight + aboveExtra - rawMinY;

  return {
    offsetX,
    offsetY,
    width:  Math.ceil(innerW + 2 * padding),
    height: Math.ceil(contentH + 2 * padding + titleHeight + legendExtra),
  };
}

// ── SVG defs ──────────────────────────────────────────────────────────────────

function svgDefs(): string {
  return `<defs>
  <marker id="proband-arrowhead" markerWidth="6" markerHeight="6"
          refX="6" refY="3" orient="auto">
    <path d="M 0 0 L 6 3 L 0 6 Z" fill="black"/>
  </marker>
</defs>`;
}

// ── Couple lines ──────────────────────────────────────────────────────────────

/**
 * Couple lines, from the edges the canvas draws (#143): the same geometry
 * (`coupleLineGeometry`), so a line, its hop and the marks on it are where
 * the canvas has them.
 */
function renderCoupleLines(flow: FlowData, slotPos: SlotPos): string[] {
  const lines: string[] = [];
  const path = (d: string) => `<path d="${d}" stroke="black" stroke-width="${STROKE}" fill="none"/>`;
  for (const edge of flow.coupleEdges) {
    const left = slotPos.get(edge.source), right = slotPos.get(edge.target);
    if (!left || !right) continue;
    const line = coupleLineGeometry(edge.data, edge.type === "consanguineousEdge", left, right);
    for (const d of line.paths) lines.push(path(d));
    // Ended relationship (#98): two strokes across the line.
    for (const [x1, y1, x2, y2] of line.ended ?? []) lines.push(seg(x1, y1, x2, y2, false, true));
    // Childless couple mark (#15), hung from the middle of the line.
    if (line.childless) {
      for (const [x1, y1, x2, y2] of line.childless.segments) lines.push(seg(x1, y1, x2, y2, false, true));
      if (line.childless.reason) {
        lines.push(`<text x="${line.childless.cx}" y="${line.childless.reasonY}" text-anchor="middle" font-family="sans-serif" font-size="${CHILDLESS_REASON_FONT_SIZE}" fill="black">${escapeXml(line.childless.reason)}</text>`);
      }
    }
  }
  return lines;
}

/** Degree of relationship above double couple lines (#97), placed as on the canvas. */
function renderConsanguinityLabels(flow: FlowData): string[] {
  return consanguinityLabelPlacements(flow).flatMap(({ x, cy, hop, dy, lines, backed }) => {
    const baselines = consanguinityLabelBaselines(cy, hop, lines.length, dy);
    // On a dashed arc between two copies (#109): the arc passes behind it.
    const b = backed ? consanguinityLabelBacking(x, baselines, lines) : null;
    return [...(b ? [`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="white"/>`] : []), ...lines.map((line, i) =>
      `<text x="${x}" y="${baselines[i]}" text-anchor="middle" font-family="sans-serif" font-size="${CONSANGUINITY_LABEL_FONT_SIZE}" fill="black">${escapeXml(line)}</text>`)];
  });
}

// ── Sibship lines ─────────────────────────────────────────────────────────────

/**
 * A straight line. `mark` tags a childless or twin mark, which is not a line
 * joining people, so the export lint (exportLint.ts) leaves it out.
 */
function seg(x1: number, y1: number, x2: number, y2: number, dashed = false, mark = false): string {
  const dash = dashed ? ` stroke-dasharray="${ADOPTION_DASH}"` : "";
  return `<line${mark ? ` class="mark"` : ""} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${STROKE}"${dash}/>`;
}

/** Brackets round an adopted individual's symbol, centred on the origin. Shared with the U-shape exporter. */
export function renderAdoptionBrackets(ind: Individual): string {
  if (!ind.adopted) return "";
  const half = NODE_SIZE / 2;
  return `<g data-adopted="${ind.adopted}">` + adoptionBracketSegments(NODE_SIZE, -half, -half).map(([x1, y1, x2, y2]) => seg(x1, y1, x2, y2)).join("") + `</g>`;
}

/** Lines of descent, from the edges the canvas draws (#143, `sibshipLineGeometry`). */
function renderSibshipLines(flow: FlowData, slotPos: SlotPos): string[] {
  const lines: string[] = [];
  const nodeById = new Map(flow.nodes.map(n => [n.id, n]));
  for (const edge of flow.sibshipEdges) {
    const geometry = edge.data && sibshipLineGeometry(edge.data, id => {
      const position = slotPos.get(id);
      return position && { position, data: nodeById.get(id)?.data };
    });
    if (!geometry) continue;
    for (const [x1, y1, x2, y2] of geometry.solid) lines.push(seg(x1, y1, x2, y2));
    for (const [x1, y1, x2, y2] of geometry.dashed) lines.push(seg(x1, y1, x2, y2, true));
    for (const m of geometry.marks) {
      if (m.kind === "bar") lines.push(seg(m.segment[0], m.segment[1], m.segment[2], m.segment[3], false, true));
      else lines.push(`<text x="${m.x}" y="${m.y + TWIN_QUESTION_FONT_SIZE * 0.35}" text-anchor="middle" font-family="sans-serif" font-size="${TWIN_QUESTION_FONT_SIZE}" font-weight="bold" fill="black">?</text>`);
    }
  }
  return lines;
}

/** Lines of assisted reproduction (#45), from the same edges the canvas draws. */
function renderAssistedLines(flow: FlowData, slotPos: SlotPos): string[] {
  const nodeById = new Map(flow.nodes.map(n => [n.id, n]));
  return flow.assistedEdges.flatMap(e => {
    const s = assistedEdgeSegment(e, id => {
      const p = slotPos.get(id);
      return p && { position: p, individual: nodeById.get(id)?.data.individual, shape: nodeById.get(id)?.data.shape };
    });
    return s ? [seg(s[0], s[1], s[2], s[3], e.data?.kind === "social")] : [];
  });
}

/** "D" or "S" inside the symbol (#45), centred on the origin. Shared with the U-shape exporter. */
export function renderRoleLetterSvg(ind: Individual, halo = false, base: "black" | "white" = "white"): string {
  const letter = symbolLetter(ind);
  if (!letter) return "";
  const half = NODE_SIZE / 2;
  const h = halo ? ` stroke="white" stroke-width="3" paint-order="stroke"` : "";
  return `<text x="0" y="${roleLetterBaselineY(NODE_SIZE, -half)}" text-anchor="middle" font-family="sans-serif" font-size="${roleLetterFontSize(NODE_SIZE)}" font-weight="bold" fill="${roleLetterFill(base)}"${h}>${letter}</text>`;
}

// ── Symbols ───────────────────────────────────────────────────────────────────

function renderShape(ind: Individual, glyph: PersonGlyph, clipId: string): string {
  const half = NODE_SIZE / 2;
  // What fills the symbol, by the notation (#115), as decided for the canvas (#144).
  const paint = glyph.paint;
  const fill = paint.base;

  // Geometry without paint, reused for the clipPath, the filled base and the
  // re-stroked outline that keeps the border crisp over tag sectors.
  const triangle = lossTriangleGeom(ind);
  let geom: string;
  if (triangle) {
    geom = triangle;
  } else if (glyph.shape === "male") {
    geom = `<rect x="${-half}" y="${-half}" width="${NODE_SIZE}" height="${NODE_SIZE}"`;
  } else if (glyph.shape === "female") {
    geom = `<circle cx="0" cy="0" r="${half - 1}"`;
  } else {
    const pts = `0,${-(half - 1)} ${half - 1},0 0,${half - 1} ${-(half - 1)},0`;
    geom = `<polygon points="${pts}"`;
  }
  const stroke = `stroke="black" stroke-width="${STROKE}"`;

  let shape = `${geom} ${stroke} fill="${fill}"/>`;
  const sectors = paint.sectors;
  if (sectors.length > 0) {
    shape = `<clipPath id="${clipId}">${geom}/></clipPath>` + shape
      + renderSectorListSvg(sectors, NODE_SIZE, clipId)
      + (paint.core ? renderAffectedCoreSvg(geom) : "")
      + `${geom} ${stroke} fill="none"/>`;
  }

  return renderAdoptionBrackets(ind) + shape + renderCarrierDot(ind, sectors.length > 0, paint.dot) + renderRoleLetterSvg(ind, sectors.length > 0, paint.base)
    + (paint.line ? renderPresymptomaticLineSvg(glyph.lifeStatus, NODE_SIZE, -half, -half, sectors.length > 0) : "") + renderLifeStatusMarks(ind, geom, clipId, paint)
    + renderAnnotationItemsSvg(glyph.annotations, NODE_SIZE, glyph.caption ? CAPTION_SHIFT : 0);
}

/**
 * Carrier dot (NSGC 2008), centred on the origin's symbol; `show` is
 * `symbolPaint(...).dot`, which leaves it off an affected fill and off a
 * carrier whose condition is recorded (#115). With `rim` (tag colours behind
 * it) it gets a white rim, as on the canvas. Shared with the U-shape exporter.
 */
export function renderCarrierDot(ind: Individual, rim: boolean, show: boolean): string {
  if (!show) return "";
  const half = NODE_SIZE / 2;
  const d = carrierDot(ind.lifeStatus, NODE_SIZE, -half, -half);
  return rim
    ? `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r + CARRIER_RIM / 2}" fill="black" stroke="white" stroke-width="${CARRIER_RIM}"/>`
    : `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="black"/>`;
}

/**
 * Where a sibship drop meets the child: the top of the symbol box, lowered to
 * the apex for a loss triangle. Relative to the symbol centre.
 */
export function childDropEndOffset(ind: Individual | undefined): number {
  return -NODE_SIZE / 2 + symbolTopInset(ind?.lifeStatus, NODE_SIZE);
}

/*
 * Pregnancy / pregnancy-loss symbols (NSGC 2008), centred on the origin.
 * Mirror SymbolShape in symbols.tsx and are shared with the U-shape exporter.
 * The "SB" / "ECT" caption is a label line, see lifeStatusCaption.
 */

/**
 * Unpainted outline of the small loss triangle (miscarriage, termination,
 * ectopic), in the same open-tag form as the sex symbol geometry so callers
 * can reuse it for the clipPath and the outline. Null when the individual is
 * drawn with their sex symbol.
 */
export function lossTriangleGeom(ind: Individual): string | null {
  if (!usesLossTriangle(ind.lifeStatus)) return null;
  const half = NODE_SIZE / 2;
  return `<polygon points="${lossTrianglePoints(NODE_SIZE, -half, -half)}"`;
}

/**
 * "P", the termination slash or the stillbirth slash drawn over the symbol.
 * Empty when born. `geom` is the unpainted symbol outline (see renderShape):
 * on an affected symbol the part of a slash inside it is redrawn in white,
 * clipped to that outline, so the slash does not vanish into the fill.
 */
export function renderLifeStatusMarks(ind: Individual, geom: string, clipId: string, paint: Pick<SymbolPaint, "base" | "dot">): string {
  const status = ind.lifeStatus;
  if (!status) return "";
  const filled = paint.base === "black";
  const half = NODE_SIZE / 2;
  const slash = (s: { x1: number; y1: number; x2: number; y2: number }) => {
    const attrs = `x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke-width="${STROKE}"`;
    let out = `<line ${attrs} stroke="black"/>`;
    if (filled) {
      const id = `${clipId}-slash`;
      out += `<clipPath id="${id}">${geom}/></clipPath><line ${attrs} stroke="white" clip-path="url(#${id})"/>`;
    }
    return out;
  };
  if (status === "termination") return slash(lossSlashEnds(NODE_SIZE, -half, -half));
  if (status === "pregnancy") {
    const textFill = filled ? "white" : "black";
    const carrier = paint.dot;
    return `<text x="0" y="${pregnancyBaselineY(NODE_SIZE, -half, carrier)}" text-anchor="middle" font-family="sans-serif" font-size="${pregnancyFontSize(NODE_SIZE, carrier)}" font-weight="bold" fill="${textFill}">P</text>`;
  }
  if (status === "stillbirth") {
    const o = half + DECEASED_OVERHANG;
    return slash({ x1: -o, y1: -o, x2: o, y2: o });
  }
  return "";
}

/** "SB" / "ECT" caption as a label line at the given baseline, centred on cx. */
export function renderLifeStatusCaption(caption: string, cx: number, y: number): string {
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${CAPTION_FONT_SIZE}" fill="black">${caption}</text>`;
}

function renderDeceasedSlash(): string {
  const o = DECEASED_OVERHANG;
  const half = NODE_SIZE / 2;
  return `<line x1="${-half - o}" y1="${-half - o}" x2="${half + o}" y2="${half + o}" stroke="black" stroke-width="${STROKE}"/>`;
}

/** Proband arrow with its "P", or the consultand's arrow without (#99). */
function renderProbandArrow(kind: ArrowKind): string {
  const half = NODE_SIZE / 2;
  return renderArrowSvg(kind, NODE_SIZE, -half, -half, { stroke: STROKE, markerId: "proband-arrowhead" });
}

/** Copy number of someone drawn more than once, top right, as DuplicateSuperscript on the canvas. */
function renderDuplicateMark(index: number): string {
  const half = NODE_SIZE / 2;
  return `<text x="${half + 2}" y="${-half + 2}" font-family="sans-serif" font-size="10" fill="black">${index}</text>`;
}

function renderSymbols(slotPos: SlotPos, flow: FlowData): string[] {
  const elems: string[] = [];

  // One symbol for each node the canvas draws, in its order (row by row),
  // from the node's glyph (#144): nothing here asks the pedigree what to draw.
  for (const node of flow.nodes) {
    const pos = slotPos.get(node.id);
    if (!pos) continue;
    const ind = node.data.individual;
    const glyph = node.data.glyph;
    const { x: cx, y: cy } = pos;

    elems.push(`<g transform="translate(${cx} ${cy})">`);
    elems.push(renderShape(ind, glyph, `symbol-clip-${node.id}`));
    if (glyph.deceased) elems.push(renderDeceasedSlash());
    if (glyph.arrow) elems.push(renderProbandArrow(glyph.arrow));
    if (glyph.familyHistoryUnknown) elems.push(renderFamilyHistorySvg(NODE_SIZE, glyph.hasParents, -NODE_SIZE / 2, -NODE_SIZE / 2));
    if (glyph.documented) elems.push(renderDocumentedMarkSvg(NODE_SIZE, !!glyph.adopted, -NODE_SIZE / 2, -NODE_SIZE / 2));
    // Every drawn copy is numbered 1, 2, ... as on the canvas.
    if (glyph.copy !== undefined) elems.push(renderDuplicateMark(glyph.copy));
    if (glyph.groupCount !== undefined) elems.push(renderBranchCountSvg(glyph.groupCount, NODE_SIZE)); // collapsed branch (#1)
    elems.push(`</g>`);
  }
  return elems;
}

// ── Labels ────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderLabels(slotPos: SlotPos, flow: FlowData): string[] {
  const elems: string[] = [];
  const seen = new Set<string>();

  // Text goes under the first drawn copy of each person only.
  for (const node of flow.nodes) {
    const pos = slotPos.get(node.id);
    const ind = node.data.individual;
    if (!pos || seen.has(ind.id)) continue;
    seen.add(ind.id);
    const glyph = node.data.glyph;

    const { x: cx, y: cy } = pos;
    // Under the symbol, top to bottom: "SB" / "ECT" caption, tag annotation
    // row, name, then the detail lines in NSGC order (age, onset, number).
    if (glyph.caption) elems.push(renderLifeStatusCaption(glyph.caption, cx, cy + LABEL_OFFSET_Y));
    const labelBaseY = cy + LABEL_OFFSET_Y + (glyph.caption ? CAPTION_SHIFT : 0)
      + (glyph.annotations.length > 0 ? ANNOTATION_SHIFT : 0);

    // The name wraps to the slot width (#68); the full text is kept as a <title>.
    const text = glyph.name;
    const lines = glyph.figureNameLines;
    // A line of descent runs down through this person's labels (#45): white backing, as on the canvas.
    if (glyph.labelsBacked && lines.length > 0) {
      const w = linesWidth(lines) + 4;
      elems.push(`<rect x="${cx - w / 2}" y="${labelBaseY - LABEL_FONT_SIZE}" width="${w}" height="${lines.length * LABEL_LINE_HEIGHT}" fill="white"/>`);
    }
    lines.forEach((line, k) => {
      const title = k === 0 && line !== text ? `<title>${escapeXml(text!)}</title>` : "";
      elems.push(`<text x="${cx}" y="${labelBaseY + k * LABEL_LINE_HEIGHT}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${title}${escapeXml(line)}</text>`);
    });
    // Age or DOB (#20), ages of onset (#93), pedigree number (#8). Past the
    // age line the block can reach the sibship bar of the person's
    // children, so it gets a white backing then, as on the canvas.
    const details = glyph.detailLines;
    if (details.length > 0 && (glyph.labelsBacked || glyph.detailsBacked)) {
      const w = linesWidth(details) + 4;
      const top = labelBaseY + lines.length * LABEL_LINE_HEIGHT - LABEL_FONT_SIZE;
      elems.push(`<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${details.length * LABEL_LINE_HEIGHT}" fill="white"/>`);
    }
    details.forEach((line, k) => {
      const y = labelBaseY + (lines.length + k) * LABEL_LINE_HEIGHT;
      elems.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(line)}</text>`);
    });
  }
  return elems;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function exportSvg(pedigree: Pedigree, options: SvgExportOptions = {}): string {
  if (pedigree.individuals.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="white"/>
</svg>`;
  }

  // What the canvas draws: hidden descendants (#94) left out.
  // The one layout: everything below is drawn from what the canvas draws (#143).
  const working = options.deidentify ? deidentify(pedigree, options) : drawnPedigree(pedigree);
  const flow    = layoutToFlow(working, { compact: options.compact });
  const slotPos = buildSlotPositions(flow);
  const duplicates = flow.duplicateEdges.length > 0;
  const bounds  = computeBounds(working, flow.nodes.map(n => n.data.glyph), slotPos, options, highestConsanguinityLabel(flow), duplicates);
  const { offsetX, offsetY, width, height } = bounds;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    svgDefs(),
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];

  if (options.title) {
    const padding = options.padding ?? 40;
    lines.push(
      `<text class="chart-title" x="${width / 2}" y="${padding + 16}" text-anchor="middle" font-family="sans-serif" font-size="${TITLE_FONT_SIZE}" font-weight="bold" fill="black">${escapeXml(options.title)}</text>`,
    );
  }

  lines.push(`<g transform="translate(${offsetX} ${offsetY})">`);
  // The group classes are what the export lint (exportLint.ts) reads.
  const group = (cls: string, body: string[]) => lines.push(`<g class="${cls}">`, ...body, `</g>`);
  group("couple-lines", renderCoupleLines(flow, slotPos));
  group("sibship-lines", renderSibshipLines(flow, slotPos));
  group("assisted-lines", renderAssistedLines(flow, slotPos));
  group("duplicate-arcs", renderDuplicateArcs(flow, slotPos));
  group("symbols", renderSymbols(slotPos, flow));
  group("labels", renderLabels(slotPos, flow));
  group("consanguinity-labels", renderConsanguinityLabels(flow));
  lines.push(`</g>`);

  const padding = options.padding ?? 40;
  const legend = renderExportKeySvg(working, padding, 0, { duplicates });
  if (legend.height > 0) {
    lines.push(`<g class="pedigree-key" transform="translate(0 ${height - padding - legend.height})">`);
    lines.push(...legend.markup);
    lines.push(`</g>`);
  }
  lines.push(`</svg>`);

  return lines.join("\n");
}
