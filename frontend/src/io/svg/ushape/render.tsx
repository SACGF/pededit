/**
 * U-shape export, step 4: the figure. Symbols and the text beside them, the
 * consanguinity labels, title and key, assembled into the SVG.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type Pedigree } from "@pedigree-editor/layout-engine";
import { deidentify } from "../deidentify";
import { drawnPedigree } from "../../../pedigree/collapse";
import { exportKeyMarkup } from "../../../pedigree/exportKey";
import type { SvgExportOptions } from "../types";
import { titleWidth } from "../../../pedigree/labels";
import { CONSANGUINITY_LABEL_FONT_SIZE } from "../../../pedigree/consanguinityLabel";
import { PersonMarks } from "../../../pedigree/chart/PersonSymbol";
import { TextUnderSymbol, ProbandMarkerDef } from "../../../pedigree/chart/symbols";
import { ChartTitle } from "../../../pedigree/chart/ChartTitle";
import { NODE_SIZE } from "../../../pedigree/constants";
import { LABEL_LINE_HEIGHT } from "../../../pedigree/labels";
import { HALF, PROBAND_TAIL, r, escapeXml } from "./constants";
import { walk } from "./tree";
import { build, nodeAt, toLayout, glyphOf, outlineRotation, type UShapeLayout, type UShapeCoupleLabel, type Built } from "./layout";
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

/** SVG markup for some SVG elements, rendered inside an `<svg>` root as React needs. */
function markup(children: ReactNode): string {
  return renderToStaticMarkup(<svg>{children}</svg>).slice("<svg>".length, -"</svg>".length);
}

/**
 * Each person as the standard figure and the canvas draw them
 * (`PersonMarks` and `TextUnderSymbol`, #139), turned along the track:
 * slashes and text turn with the symbol (that is the design), letters and
 * numbers are turned back upright, and a square's or diamond's outline turns only by
 * the nearest multiple of 90 degrees (`outlineRotation`). For anyone with a sibship hanging from the
 * symbol itself (by partners who are not drawn), the line runs down through
 * the text, so it gets a white backing.
 */
export function renderSymbols(pedigree: Pedigree, b: Built, personIds = false): string[] {
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const out: string[] = [];
  let seq = 0;
  walk(b.root, n => {
    const solo = n.unions.some(w => w.kind === "solo" && w.kids.length > 0);
    n.members.forEach((m, i) => {
      const ind = byId.get(m.id);
      if (!ind) return;
      const pos = nodeAt(n, i, b.geom);
      const clipId = `symbol-clip-${seq++}`;
      // What is drawn for the person, as the standard figure and the canvas have it.
      const glyph = glyphOf(ind, pedigree);
      const backed = solo && m.id === n.blood;
      const id = personIds ? ` ${m.dup ? "data-dup-of" : "data-id"}="${escapeXml(m.id)}"` : "";
      out.push(
        `<g${id} transform="translate(${r(pos.x)} ${r(pos.y)}) rotate(${r(pos.rotation)})">` +
        markup(
          <g transform={`translate(${-HALF} ${-HALF})`}>
            <TextUnderSymbol
              glyph={backed ? { ...glyph, labelsBacked: true } : glyph} nameLines={glyph.figureNameLines} size={NODE_SIZE}
              fullName={glyph.name}
            />
            <PersonMarks glyph={glyph} clipId={clipId} upright={r(-pos.rotation)}
              outlineTurn={r(outlineRotation(glyph, pos.rotation) - pos.rotation)}
            />
          </g>,
        ) +
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
  const legend = options.key === false ? { width: 0, height: 0, markup: [] } : exportKeyMarkup(working, padding, 0, { duplicates: layout.duplicates.length > 0 });
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
    `<defs>${markup(<ProbandMarkerDef />)}</defs>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];
  if (options.title) out.push(`<g class="chart-title">${markup(<ChartTitle title={options.title} x={width / 2} y={padding / 2 + 14} />)}</g>`);
  out.push(`<g transform="translate(${r(margin - minX + shiftX)} ${r(margin - minY + titleH)})">`);
  if (options.debugSpine) out.push(...renderDebugTracks(b, layout));
  out.push(...renderConnectors(b, layout, working));
  out.push(...renderSymbols(working, b, options.personIds));
  out.push(`<g class="consanguinity-labels">`, ...renderCoupleLabels(layout.coupleLabels), `</g>`);
  out.push(`</g>`);
  if (legend.height > 0) {
    out.push(`<g class="pedigree-key" transform="translate(0 ${height - padding - legend.height})">`, ...legend.markup, `</g>`);
  }
  out.push(`</svg>`);
  return { svg: out.join("\n"), layout };
}
