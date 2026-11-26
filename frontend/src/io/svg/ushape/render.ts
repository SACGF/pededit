/**
 * U-shape export, step 4: the figure. Symbols and the text beside them, the
 * consanguinity labels, title and key, assembled into the SVG.
 */
import { type Pedigree } from "@pedigree-editor/layout-engine";
import { deidentify } from "../deidentify";
import { drawnPedigree, renderBranchCountSvg } from "../../../pedigree/collapse";
import { type PersonGlyph } from "../../../pedigree/personGlyph";
import { ANNOTATION_ROW_HEIGHT } from "../../../pedigree/tags";
import { renderExportKeySvg } from "../../../pedigree/exportKey";
import type { SvgExportOptions } from "../types";
import { renderPersonShapeSvg, renderDeceasedSlashSvg, renderProbandArrowSvg } from "../symbolSvg";
import { titleWidth, LABEL_CHAR_WIDTH, TITLE_FONT_SIZE } from "../../../pedigree/labels";
import { renderFamilyHistorySvg } from "../../../pedigree/familyHistory";
import { renderDocumentedMarkSvg } from "../../../pedigree/evaluation";
import { CONSANGUINITY_LABEL_FONT_SIZE } from "../../../pedigree/consanguinityLabel";
import { NODE_SIZE, HALF, PROBAND_TAIL, LABEL_FONT_SIZE, LABEL_LINE_HEIGHT, r, escapeXml } from "./constants";
import { walk } from "./tree";
import { build, nodeAt, toLayout, glyphOf, type UShapeLayout, type UShapeCoupleLabel, type Built } from "./layout";
import { trackPath, renderConnectors } from "./connectors";

export function renderCoupleLabels(labels: UShapeCoupleLabel[]): string[] {
  return labels.map(l =>
    `<g transform="translate(${r(l.x)} ${r(l.y)}) rotate(${r(l.rotation)})">` +
    (l.backed
      // Just the text's box (cap height to descenders), so it hides nothing but the link.
      ? `<rect x="${r(-l.width / 2 - 1)}" y="${r(Math.min(...l.baselines) - 8)}" width="${r(l.width + 2)}" height="${r(Math.max(...l.baselines) - Math.min(...l.baselines) + 10.5)}" fill="white"/>`
      : "") +
    l.lines.map((line, i) =>
      `<text x="0" y="${r(l.baselines[i]!)}" text-anchor="middle" font-family="sans-serif" font-size="${CONSANGUINITY_LABEL_FONT_SIZE}" fill="black">${escapeXml(line)}</text>`).join("") +
    `</g>`);
}

/**
 * Labels sit on the outward side of the symbol, rotated with it. For anyone
 * with children the descent line runs through that spot, so the text gets a
 * white backing to stay readable.
 */
export function renderLabel(glyph: PersonGlyph, hasDescent: boolean): string {
  // Top to bottom: "SB" / "ECT" caption, gap for the tag annotation row (drawn
  // by the symbol renderer, over the white backing), name, then the detail lines in
  // NSGC order (age, onset, pedigree number).
  const caption = glyph.caption;
  // The pedigree number is the one the standard figure shows, so the
  // two exports agree, even though it need not read left to right here.
  const below = [...glyph.figureNameLines, ...glyph.detailLines];
  const lines = caption ? [caption, ...below] : below;
  if (lines.length === 0) return "";
  const out: string[] = [];
  const top = HALF + 3;
  const annotationGap = glyph.annotations.length > 0 ? ANNOTATION_ROW_HEIGHT : 0;
  const lineY = (i: number) =>
    top + LABEL_FONT_SIZE + i * LABEL_LINE_HEIGHT + (caption && i === 0 ? 0 : annotationGap);
  if (hasDescent) {
    const w = Math.max(...lines.map(l => l.length)) * LABEL_CHAR_WIDTH + 4;
    const h = lines.length * LABEL_LINE_HEIGHT + (below.length > 0 ? annotationGap : 0);
    const y = caption ? top : top + annotationGap;
    out.push(`<rect x="${r(-w / 2)}" y="${y}" width="${r(w)}" height="${h}" fill="white"/>`);
  }
  lines.forEach((text, i) => {
    out.push(`<text x="0" y="${lineY(i)}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(text)}</text>`);
  });
  return out.join("");
}

export function renderSymbols(pedigree: Pedigree, b: Built): string[] {
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const out: string[] = [];
  let seq = 0;
  walk(b.root, n => {
    // A sibship by partners who are not drawn descends from the symbol itself,
    // straight through the label.
    const solo = n.unions.some(w => w.kind === "solo" && w.kids.length > 0);
    n.members.forEach((m, i) => {
      const ind = byId.get(m.id);
      if (!ind) return;
      const pos = nodeAt(n, i, b.geom);
      const clipId = `symbol-clip-${seq++}`;
      // What is drawn for the person, as the standard figure and the canvas have it.
      const glyph = glyphOf(ind, pedigree);
      out.push(
        `<g ${m.dup ? "data-dup-of" : "data-id"}="${escapeXml(m.id)}" transform="translate(${r(pos.x)} ${r(pos.y)}) rotate(${r(pos.rotation)})">` +
        renderLabel(glyph, solo && m.id === n.blood) +
        // The symbol is the standard figure's (io/svg/symbolSvg.ts), turned with the track.
        renderPersonShapeSvg(ind, glyph, clipId, { rotation: pos.rotation, captionShift: glyph.caption ? LABEL_LINE_HEIGHT : 0 }) +
        (glyph.deceased ? renderDeceasedSlashSvg() : "") +
        (glyph.arrow ? renderProbandArrowSvg(glyph.arrow, pos.rotation) : "") +
        (glyph.familyHistoryUnknown ? renderFamilyHistorySvg(NODE_SIZE, glyph.hasParents, -HALF, -HALF, -pos.rotation) : "") +
        (glyph.documented ? renderDocumentedMarkSvg(NODE_SIZE, !!glyph.adopted, -HALF, -HALF, -pos.rotation) : "") +
        // The count in a collapsed-branch diamond, kept upright.
        (glyph.groupCount !== undefined ? `<g transform="rotate(${r(-pos.rotation)})">${renderBranchCountSvg(glyph.groupCount, NODE_SIZE)}</g>` : "") +
        `</g>`,
      );
    });
  });
  return out;
}

export function renderDebugTracks(b: Built, layout: UShapeLayout): string[] {
  let lo = 0, hi = 0;
  for (const n of [...layout.nodes.values(), ...layout.duplicates]) { lo = Math.min(lo, n.u); hi = Math.max(hi, n.u); }
  const attrs = `fill="none" stroke="red" stroke-width="0.75" stroke-dasharray="4 3"`;
  const out: string[] = [];
  for (let d = 0; d <= b.maxDepth; d++) out.push(trackPath(lo, hi, d * b.geom.ringGap, b.geom, attrs));
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportUShapeSvg(pedigree: Pedigree, options: SvgExportOptions = {}): string {
  return renderUShape(pedigree, options).svg;
}

/**
 * The figure and the layout it was drawn from, from one layout pass: the
 * editor's U-shape view (#220) needs both, to count who is drawn. `layout`
 * is null, and the SVG an empty white box, when there is nobody to descend from.
 */
export function renderUShape(pedigree: Pedigree, options: SvgExportOptions = {}): { svg: string; layout: UShapeLayout | null } {
  const working = options.deidentify ? deidentify(pedigree, options) : drawnPedigree(pedigree);
  const b = build(working, { partners: options.uShapePartners });
  if (!b) {
    return { layout: null, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="white"/>
</svg>` };
  }
  const layout = toLayout(working, b);

  // Everything hangs off the symbols, so the bounds are the symbol centres plus
  // room for the furthest thing attached to one: the label or the proband arrow.
  const reach = Math.max(
    HALF + 6 + b.labelLines * LABEL_LINE_HEIGHT,
    (HALF + PROBAND_TAIL) * Math.SQRT2,
  );
  const padding = options.padding ?? 40;
  const margin = reach + padding;
  const titleH = options.title ? 28 : 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of [...layout.nodes.values(), ...layout.duplicates]) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  const legend = options.key === false ? { width: 0, height: 0, markup: [] } : renderExportKeySvg(working, padding, 0, { duplicates: layout.duplicates.length > 0 });
  const legendExtra = legend.height > 0 ? legend.height + padding / 2 : 0;
  const titleW = options.title ? titleWidth(options.title) + 2 * padding : 0;
  const drawingW = Math.max(maxX - minX + 2 * margin, legend.width + 2 * padding);
  const width = Math.ceil(Math.max(drawingW, titleW));
  // A title wider than the drawing widens the figure; the drawing is centred under it.
  const shiftX = (width - drawingW) / 2;
  const height = Math.ceil(maxY - minY + 2 * margin + titleH + legendExtra);

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    `<defs>
  <marker id="proband-arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
    <path d="M 0 0 L 6 3 L 0 6 Z" fill="black"/>
  </marker>
</defs>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];
  if (options.title) {
    out.push(
      `<text class="chart-title" x="${width / 2}" y="${padding / 2 + 14}" text-anchor="middle" font-family="sans-serif" ` +
      `font-size="${TITLE_FONT_SIZE}" font-weight="bold" fill="black">${escapeXml(options.title)}</text>`,
    );
  }
  out.push(`<g transform="translate(${r(margin - minX + shiftX)} ${r(margin - minY + titleH)})">`);
  if (options.debugSpine) out.push(...renderDebugTracks(b, layout));
  out.push(...renderConnectors(b, layout, working));
  out.push(...renderSymbols(working, b));
  out.push(`<g class="consanguinity-labels">`, ...renderCoupleLabels(layout.coupleLabels), `</g>`);
  out.push(`</g>`);
  if (legend.height > 0) {
    out.push(`<g class="pedigree-key" transform="translate(0 ${height - padding - legend.height})">`, ...legend.markup, `</g>`);
  }
  out.push(`</svg>`);
  return { svg: out.join("\n"), layout };
}
