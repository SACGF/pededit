import { svgMarkup } from "../../pedigree/svgMarkup";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { DECEASED_OVERHANG } from "../../pedigree/constants";
import { titleWidth, TITLE_GAP } from "../../pedigree/labels";
import { buildScene, type Scene } from "../../pedigree/scene";
import { deidentify } from "./deidentify";
import { drawnPedigree } from "../../pedigree/collapse";
import { exportKeyMarkup } from "../../pedigree/exportKey";
import { ProbandMarkerDef } from "../../pedigree/chart/symbols";
import { Chart } from "../../pedigree/chart/Chart";
import { ChartTitle } from "../../pedigree/chart/ChartTitle";
import type { SvgExportOptions } from "./types";

/*
 * The standard figure export: the scene the canvas draws (`buildScene`),
 * drawn by `Chart` with the canvas's own components (`pedigree/chart/`)
 * rendered to markup (#139). Nothing here draws a symbol, a line or a piece
 * of text itself: it places the drawing in the figure and adds the title
 * and key, each in a group the export lint reads (`exportLint.ts`).
 */

// ── Bounds ────────────────────────────────────────────────────────────────────

interface CanvasBounds {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** Where the drawing sits in the figure, and the figure's size, from the scene's bounds. */
function computeBounds(scene: Scene, options: SvgExportOptions, legend: { width: number; height: number }): CanvasBounds {
  const padding = options.padding ?? 40;
  // The title's baseline is at padding + 16, TITLE_GAP above the top row of
  // symbols plus room for a deceased slash, which reaches DECEASED_OVERHANG
  // above the row.
  const titleHeight = options.title ? 16 + TITLE_GAP + DECEASED_OVERHANG : 0;
  const b = scene.bounds!;

  // The tag key sits under the pedigree, bottom-left, inside the padding.
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
  const padding = options.padding ?? 40;
  const legend = options.key === false ? { width: 0, height: 0, markup: [] } : exportKeyMarkup(working, padding, 0, { duplicates: scene.duplicates.length > 0 });
  const { offsetX, offsetY, width, height } = computeBounds(scene, options, legend);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    `<defs>${svgMarkup(<ProbandMarkerDef />)}</defs>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];

  // The title is outside the drawing's groups: it is not a label.
  if (options.title) lines.push(`<g class="chart-title">${svgMarkup(<ChartTitle title={options.title} x={width / 2} y={padding + 16} />)}</g>`);
  // Names are always wrapped in a file, which cannot be hovered.
  lines.push(`<g transform="translate(${offsetX} ${offsetY})">`, svgMarkup(<Chart scene={scene} figure />), `</g>`);

  if (legend.height > 0) {
    lines.push(`<g class="pedigree-key" transform="translate(0 ${height - padding - legend.height})">`);
    lines.push(...legend.markup);
    lines.push(`</g>`);
  }
  lines.push(`</svg>`);

  return lines.join("\n");
}
