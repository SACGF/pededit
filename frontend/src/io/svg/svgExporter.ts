import type { Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "../../pedigree/constants";
import { duplicateArcD } from "../../pedigree/couplePath";
import { coupleLineGeometry, sibshipLineGeometry } from "../../pedigree/lineGeometry";
import { TWIN_QUESTION_FONT_SIZE } from "../../pedigree/twins";
import { titleWidth, LABEL_FONT_SIZE, TITLE_FONT_SIZE, TITLE_GAP } from "../../pedigree/labels";
import { assistedEdgeSegment } from "../../pedigree/assisted";
import { CHILDLESS_REASON_FONT_SIZE } from "../../pedigree/childless";
import {
  CONSANGUINITY_LABEL_FONT_SIZE, consanguinityLabelBacking, consanguinityLabelBaselines, consanguinityLabelPlacements,
} from "../../pedigree/consanguinityLabel";
import { CAPTION_SHIFT, COPY_NUMBER_FONT_SIZE, copyNumberAt, textUnder, type TextBacking } from "../../pedigree/labelBlock";
import { buildScene, type Scene } from "../../pedigree/scene";
import { deidentify } from "./deidentify";
import { drawnPedigree, renderBranchCountSvg } from "../../pedigree/collapse";
import { renderFamilyHistorySvg } from "../../pedigree/familyHistory";
import { renderDocumentedMarkSvg } from "../../pedigree/evaluation";
import { renderExportKeySvg } from "../../pedigree/exportKey";
import {
  STROKE, DECEASED_OVERHANG, seg, renderPersonShapeSvg, renderDeceasedSlashSvg, renderProbandArrowSvg, renderLifeStatusCaption,
} from "./symbolSvg";
import type { SvgExportOptions } from "./types";

// ── Slot positions ────────────────────────────────────────────────────────────

type SlotPos = Map<string, { x: number; y: number }>;

/**
 * Map from "level-slot" to canvas pixel position, taken from the canvas's own
 * buildScene so the export matches it: pins applied (to the nearest copy of
 * someone drawn twice), and copies with no line left out. A slot missing from
 * the map is not drawn.
 */
function buildSlotPositions(scene: Scene): SlotPos {
  return new Map(scene.people.map(n => [n.id, n.position]));
}

/** Dashed arcs joining the copies of anyone drawn more than once. */
function renderDuplicateArcs(scene: Scene, slotPos: SlotPos): string[] {
  const half = NODE_SIZE / 2;
  return scene.duplicates.map(e => {
    const a = slotPos.get(e.source)!, b = slotPos.get(e.target)!;
    const d = duplicateArcD(a.x, a.y, b.x, b.y, e.data?.bulge ?? 28, half, e.data?.legDx);
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

/** Where the drawing sits in the figure, and the figure's size, from the scene's bounds. */
function computeBounds(pedigree: Pedigree, scene: Scene, options: SvgExportOptions, duplicates: boolean): CanvasBounds {
  const padding = options.padding ?? 40;
  // The title's baseline is at padding + 16, TITLE_GAP above the top row of
  // symbols plus room for a deceased slash, which reaches DECEASED_OVERHANG
  // above the row.
  const titleHeight = options.title ? 16 + TITLE_GAP + DECEASED_OVERHANG : 0;
  const b = scene.bounds!;

  // The tag key sits under the pedigree, bottom-left, inside the padding.
  const legend = options.key === false ? { width: 0, height: 0 } : renderExportKeySvg(pedigree, 0, 0, { duplicates });
  const legendExtra = legend.height > 0 ? legend.height + padding / 2 : 0;

  // A title wider than the drawing widens the figure; the drawing is then
  // centred under it.
  const innerW = Math.max(b.width, legend.width, options.title ? titleWidth(options.title) : 0);
  return {
    offsetX: padding + (innerW - Math.max(b.width, legend.width)) / 2 - b.left,
    offsetY: padding + titleHeight - b.top,
    width:  Math.ceil(innerW + 2 * padding),
    height: Math.ceil(b.height + 2 * padding + titleHeight + legendExtra),
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
 * Couple lines, from the edges the canvas draws: the same geometry
 * (`coupleLineGeometry`), so a line, its hop and the marks on it are where
 * the canvas has them.
 */
function renderCoupleLines(scene: Scene, slotPos: SlotPos): string[] {
  const lines: string[] = [];
  const path = (d: string) => `<path d="${d}" stroke="black" stroke-width="${STROKE}" fill="none"/>`;
  for (const edge of scene.couples) {
    const left = slotPos.get(edge.source), right = slotPos.get(edge.target);
    if (!left || !right) continue;
    const line = coupleLineGeometry(edge.data, edge.double, left, right);
    for (const d of line.paths) lines.push(path(d));
    // Ended relationship: two strokes across the line.
    for (const [x1, y1, x2, y2] of line.ended ?? []) lines.push(seg(x1, y1, x2, y2, false, true));
    // Childless couple mark, hung from the middle of the line.
    if (line.childless) {
      for (const [x1, y1, x2, y2] of line.childless.segments) lines.push(seg(x1, y1, x2, y2, false, true));
      if (line.childless.reason) {
        lines.push(`<text x="${line.childless.cx}" y="${line.childless.reasonY}" text-anchor="middle" font-family="sans-serif" font-size="${CHILDLESS_REASON_FONT_SIZE}" fill="black">${escapeXml(line.childless.reason)}</text>`);
      }
    }
  }
  return lines;
}

/** Degree of relationship above double couple lines, placed as on the canvas. */
function renderConsanguinityLabels(scene: Scene): string[] {
  return consanguinityLabelPlacements(scene).flatMap(({ x, cy, hop, dy, lines, backed }) => {
    const baselines = consanguinityLabelBaselines(cy, hop, lines.length, dy);
    // On a dashed arc between two copies: the arc passes behind it.
    const b = backed ? consanguinityLabelBacking(x, baselines, lines) : null;
    return [...(b ? [`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="white"/>`] : []), ...lines.map((line, i) =>
      `<text x="${x}" y="${baselines[i]}" text-anchor="middle" font-family="sans-serif" font-size="${CONSANGUINITY_LABEL_FONT_SIZE}" fill="black">${escapeXml(line)}</text>`)];
  });
}

// ── Sibship lines ─────────────────────────────────────────────────────────────

/** Lines of descent, from the edges the canvas draws (`sibshipLineGeometry`). */
function renderSibshipLines(scene: Scene, slotPos: SlotPos): string[] {
  const lines: string[] = [];
  const nodeById = new Map(scene.people.map(n => [n.id, n]));
  for (const edge of scene.sibships) {
    const geometry = edge.data && sibshipLineGeometry(edge.data, id => {
      const position = slotPos.get(id);
      const person = nodeById.get(id);
      return position && { position, glyph: person?.glyph, twinSet: person?.twinSet, zygosity: person?.zygosity };
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

/** Lines of assisted reproduction, from the same edges the canvas draws. */
function renderAssistedLines(scene: Scene, slotPos: SlotPos): string[] {
  const nodeById = new Map(scene.people.map(n => [n.id, n]));
  return scene.assisted.flatMap(e => {
    const s = assistedEdgeSegment(e, id => {
      const p = slotPos.get(id);
      return p && { position: p, glyph: nodeById.get(id)?.glyph };
    });
    return s ? [seg(s[0], s[1], s[2], s[3], e.data?.kind === "social")] : [];
  });
}

// ── Symbols ───────────────────────────────────────────────────────────────────

/** Copy number of someone drawn more than once, top right, as `CopyNumber` on the canvas. */
function renderDuplicateMark(index: number): string {
  const at = copyNumberAt();
  return `<text x="${at.x}" y="${at.y}" font-family="sans-serif" font-size="${COPY_NUMBER_FONT_SIZE}" fill="black">${index}</text>`;
}

function renderSymbols(slotPos: SlotPos, scene: Scene): string[] {
  const elems: string[] = [];

  // One symbol for each node the canvas draws, in its order (row by row),
  // from the node's glyph: nothing here asks the pedigree what to draw.
  for (const node of scene.people) {
    const pos = slotPos.get(node.id);
    if (!pos) continue;
    const glyph = node.glyph;
    const { x: cx, y: cy } = pos;

    elems.push(`<g transform="translate(${cx} ${cy})">`);
    elems.push(renderPersonShapeSvg(glyph, `symbol-clip-${node.id}`, { captionShift: CAPTION_SHIFT }));
    if (glyph.deceased) elems.push(renderDeceasedSlashSvg());
    if (glyph.arrow) elems.push(renderProbandArrowSvg(glyph.arrow));
    if (glyph.familyHistoryUnknown) elems.push(renderFamilyHistorySvg(NODE_SIZE, glyph.hasParents, -NODE_SIZE / 2, -NODE_SIZE / 2));
    if (glyph.documented) elems.push(renderDocumentedMarkSvg(NODE_SIZE, !!glyph.adopted, -NODE_SIZE / 2, -NODE_SIZE / 2));
    // Every drawn copy is numbered 1, 2, ... as on the canvas.
    if (glyph.copy !== undefined) elems.push(renderDuplicateMark(glyph.copy));
    if (glyph.groupCount !== undefined) elems.push(renderBranchCountSvg(glyph.groupCount, NODE_SIZE)); // collapsed branch
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

function renderLabels(slotPos: SlotPos, scene: Scene): string[] {
  const elems: string[] = [];
  const rect = (cx: number, cy: number, b: TextBacking) =>
    `<rect x="${cx + b.x}" y="${cy + b.y}" width="${b.width}" height="${b.height}" fill="white"/>`;
  const text = (x: number, y: number, body: string) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${body}</text>`;

  // Text goes under every copy of someone drawn more than once, as on the
  // canvas: a copy with no name can only be told by following its dashed arc.
  for (const node of scene.people) {
    const pos = slotPos.get(node.id);
    if (!pos) continue;
    const glyph = node.glyph;
    const { x: cx, y: cy } = pos;
    // Under the symbol, top to bottom: "SB" / "ECT" caption, tag annotation
    // row, name, then the detail lines in NSGC order (age, onset, number),
    // placed as on the canvas (`textUnder`).
    const lines = glyph.figureNameLines;
    const at = textUnder(glyph, lines);
    if (glyph.caption && at.captionY !== undefined) elems.push(renderLifeStatusCaption(glyph.caption, cx, cy + at.captionY));
    // A line of descent runs down through this person's labels: white backing.
    if (at.nameBacking) elems.push(rect(cx, cy, at.nameBacking));
    // The name wraps to the slot width; the full text is kept as a <title>.
    lines.forEach((line, k) => {
      const title = k === 0 && line !== glyph.name ? `<title>${escapeXml(glyph.name!)}</title>` : "";
      elems.push(text(cx, cy + at.nameY[k]!, `${title}${escapeXml(line)}`));
    });
    // Past the age line the details can reach the sibship bar of the
    // person's children, so they get a white backing then.
    if (at.detailBacking) elems.push(rect(cx, cy, at.detailBacking));
    glyph.detailLines.forEach((line, k) => elems.push(text(cx, cy + at.detailY[k]!, escapeXml(line))));
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

  // What the canvas draws: hidden descendants left out.
  // The one layout: everything below is drawn from what the canvas draws (#143).
  const working = options.deidentify ? deidentify(pedigree, options) : drawnPedigree(pedigree);
  const scene    = buildScene(working, { compact: options.compact });
  const slotPos = buildSlotPositions(scene);
  const duplicates = scene.duplicates.length > 0;
  const bounds  = computeBounds(working, scene, options, duplicates);
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
  group("couple-lines", renderCoupleLines(scene, slotPos));
  group("sibship-lines", renderSibshipLines(scene, slotPos));
  group("assisted-lines", renderAssistedLines(scene, slotPos));
  group("duplicate-arcs", renderDuplicateArcs(scene, slotPos));
  group("symbols", renderSymbols(slotPos, scene));
  group("labels", renderLabels(slotPos, scene));
  group("consanguinity-labels", renderConsanguinityLabels(scene));
  lines.push(`</g>`);

  const padding = options.padding ?? 40;
  const legend = options.key === false ? { height: 0, markup: [] } : renderExportKeySvg(working, padding, 0, { duplicates });
  if (legend.height > 0) {
    lines.push(`<g class="pedigree-key" transform="translate(0 ${height - padding - legend.height})">`);
    lines.push(...legend.markup);
    lines.push(`</g>`);
  }
  lines.push(`</svg>`);

  return lines.join("\n");
}
