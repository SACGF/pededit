import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE, DECEASED_OVERHANG } from "../../pedigree/constants";
import { titleWidth, TITLE_GAP } from "../../pedigree/labels";
import { buildScene, type Scene } from "../../pedigree/scene";
import type { SibshipEnd } from "../../pedigree/lineGeometry";
import { deidentify } from "./deidentify";
import { drawnPedigree } from "../../pedigree/collapse";
import { renderExportKeySvg } from "../../pedigree/exportKey";
import { PersonMarks } from "../../pedigree/chart/PersonSymbol";
import { TextUnderSymbol, ProbandMarkerDef } from "../../pedigree/chart/symbols";
import { CoupleLine, CoupleText } from "../../pedigree/chart/CoupleLine";
import { SibshipLines } from "../../pedigree/chart/SibshipLines";
import { AssistedLine } from "../../pedigree/chart/AssistedLine";
import { DuplicateArc } from "../../pedigree/chart/DuplicateArc";
import { ChartTitle } from "../../pedigree/chart/ChartTitle";
import type { SvgExportOptions } from "./types";

/*
 * The standard figure export: the scene the canvas draws (`buildScene`),
 * drawn with the canvas's own components (`pedigree/chart/`) rendered to
 * markup (#139). Nothing here draws a symbol, a line or a piece of text
 * itself: it places the components, groups them for the export lint
 * (`exportLint.ts` reads the group classes) and adds the title and key.
 */

/** SVG markup for some SVG elements. Rendered inside an `<svg>` root, which React needs for SVG children. */
function markup(children: ReactNode): string {
  const html = renderToStaticMarkup(<svg>{children}</svg>);
  return html.slice("<svg>".length, -"</svg>".length);
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
  const scene = buildScene(working, { compact: options.compact });
  const duplicates = scene.duplicates.length > 0;
  const { offsetX, offsetY, width, height } = computeBounds(working, scene, options, duplicates);
  const padding = options.padding ?? 40;

  const byId = new Map(scene.people.map(p => [p.id, p]));
  const at = (id: string) => byId.get(id)?.position;
  const end = (id: string): SibshipEnd | undefined => byId.get(id);
  const half = NODE_SIZE / 2;
  const couples = scene.couples.flatMap(e => {
    const left = at(e.source), right = at(e.target);
    return left && right ? [{ e, left, right }] : [];
  });

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    `<defs>${markup(<ProbandMarkerDef />)}</defs>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];

  // The title is outside the drawing's groups: it is not a label.
  if (options.title) lines.push(`<g class="chart-title">${markup(<ChartTitle title={options.title} x={width / 2} y={padding + 16} />)}</g>`);

  lines.push(`<g transform="translate(${offsetX} ${offsetY})">`);
  // The group classes are what the export lint (exportLint.ts) reads.
  const group = (cls: string, body: ReactNode) => {
    const inner = markup(body);
    lines.push(`<g class="${cls}">`, ...(inner ? [inner] : []), `</g>`);
  };
  group("couple-lines", couples.map(({ e, left, right }) => <CoupleLine key={e.id} data={e.data} double={e.double} left={left} right={right} />));
  group("sibship-lines", scene.sibships.map(e => <SibshipLines key={e.id} data={e.data} nodeAt={end} />));
  group("assisted-lines", scene.assisted.map(e => <AssistedLine key={e.id} line={e} nodeAt={end} />));
  group("duplicate-arcs", scene.duplicates.map(e => {
    const a = at(e.source), b = at(e.target);
    return a && b ? <DuplicateArc key={e.id} a={a} b={b} data={e.data} /> : null;
  }));
  // One group per symbol, translated to its centre (the lint finds symbols by it).
  group("symbols", scene.people.map(p => (
    <g key={p.id} transform={`translate(${p.position.x} ${p.position.y})`}>
      <g transform={`translate(${-half} ${-half})`}><PersonMarks glyph={p.glyph} clipId={`symbol-clip-${p.id}`} /></g>
    </g>
  )));
  // Text goes under every copy of someone drawn more than once, as on the
  // canvas: a copy with no name can only be told by following its dashed arc.
  // Names are always wrapped in a file, which cannot be hovered.
  group("labels", scene.people.map(p => (
    <g key={p.id} transform={`translate(${p.position.x - half} ${p.position.y - half})`}>
      <TextUnderSymbol glyph={p.glyph} nameLines={p.glyph.figureNameLines} size={NODE_SIZE} fullName={p.glyph.name} />
    </g>
  )));
  group("consanguinity-labels", couples.map(({ e, left, right }) => e.double ? <CoupleText key={e.id} data={e.data} left={left} right={right} /> : null));
  lines.push(`</g>`);

  const legend = options.key === false ? { height: 0, markup: [] } : renderExportKeySvg(working, padding, 0, { duplicates });
  if (legend.height > 0) {
    lines.push(`<g class="pedigree-key" transform="translate(0 ${height - padding - legend.height})">`);
    lines.push(...legend.markup);
    lines.push(`</g>`);
  }
  lines.push(`</svg>`);

  return lines.join("\n");
}
