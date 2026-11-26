/**
 * The key of the SVG, PNG and PDF exports (NSGC's word for the legend of a
 * figure): what each symbol, mark and line on the chart means, the
 * conditions and tags in use, and the clinical details.
 *
 * Which rows there are, in what order and with what label comes from
 * `keyRows(pedigree, "export")`, the list the in-app legend also draws
 * from, and each row's swatch is the legend's own (`chart/keySwatches.tsx`),
 * scaled from the legend's 24px symbols to the key's 16px. This module only
 * lays the rows out.
 */
import type { ReactNode } from "react";
import { svgMarkup } from "./svgMarkup";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { clinicalDetailLines, wrapText } from "./clinicalDetails";
import {
  fmt, swatchColumnWidth, LEGEND_SWATCH, LEGEND_FONT_SIZE, LEGEND_LABEL_GAP, LEGEND_CHAR_WIDTH,
  type TagLegendBlock,
} from "./tags";
import { keyRows } from "./keyRows";
import { KeySwatch, TagSwatchSvg, LEGEND_SYMBOL_SIZE, LEGEND_ICON_WIDTH, type SwatchRow } from "./chart/keySwatches";

/** Height (px) of a row of the key: the swatches, scaled, fit in it. */
const KEY_ROW_HEIGHT = 24;
/** The legend's swatches are drawn for 24px symbols; the key's are 16px. */
const SCALE = LEGEND_SWATCH / LEGEND_SYMBOL_SIZE;

/** A swatch (one `<svg>` with its own width and height) scaled by `scale` and centred on (cx, cy). */
function placed(swatch: ReactNode, cx: number, cy: number, scale: number): string {
  const svg = svgMarkup(swatch);
  const w = Number(/^<svg[^>]* width="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  const h = Number(/^<svg[^>]* height="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  return `<g transform="translate(${fmt(cx)} ${fmt(cy)}) scale(${fmt(scale)}) translate(${fmt(-w / 2)} ${fmt(-h / 2)})">${svg}</g>`;
}

/** A row's label, its middle on `cy`. */
function KeyLabel({ label, x, cy }: { label: string; x: number; cy: number }) {
  return <text x={fmt(x)} y={cy + LEGEND_FONT_SIZE / 2 - 1} fontFamily="sans-serif" fontSize={LEGEND_FONT_SIZE} fill="black">{label}</text>;
}

/**
 * The full export key: the status and relationship rows the drawn pedigree
 * needs, then one row per tag in use, then the clinical details. Top-left at
 * (x, y); empty when there is nothing to explain. Exporters reserve `height`
 * below the pedigree and at least `width` across. Each swatch uses the shape
 * of the first person with the status, as the in-app legend does.
 */
export function exportKeyMarkup(
  pedigree: Pedigree, x: number, y: number,
  /** The drawing joins two copies of someone with a dashed arc; the exporter knows from its layout. */
  { duplicates = false }: { duplicates?: boolean } = {},
): TagLegendBlock {
  const key = keyRows(pedigree, "export", { duplicates });
  // "sex" and "couple" rows are the legend's only, so the export list has none.
  const rows = [...key.symbols, ...key.relationships] as SwatchRow[];
  const tagRows = key.tags.flatMap(r => (r.kind === "tag" ? [r] : []));
  const tags = tagRows.map(r => r.tag);
  const details = clinicalDetailsMarkup(pedigree, x, 0);
  if (rows.length === 0 && tagRows.length === 0 && details.height === 0) return { markup: [], width: 0, height: 0 };

  // The swatch column is as wide as the legend's, scaled, or a wide text tag.
  const column = Math.max(LEGEND_ICON_WIDTH * SCALE, swatchColumnWidth(tags));
  const labelOffset = column + LEGEND_LABEL_GAP;
  const middle = (i: number) => y + i * KEY_ROW_HEIGHT + KEY_ROW_HEIGHT / 2;
  const row = (swatch: ReactNode, scale: number, label: string, i: number) =>
    placed(swatch, x + column / 2, middle(i), scale) + svgMarkup(<KeyLabel label={label} x={x + labelOffset} cy={middle(i)} />);
  const out = rows.map((r, i) => row(<KeySwatch row={r} />, SCALE, r.label, i));
  // The legend draws tag swatches at the key's own size already.
  tagRows.forEach((r, j) => out.push(row(<TagSwatchSvg tag={r.tag} pedigree={key.pedigree} carrier={r.carrier} />, 1, r.label, rows.length + j)));

  const longest = Math.max(0, ...rows.map(r => r.label.length), ...tagRows.map(r => r.label.length));
  const symbolsHeight = (rows.length + tagRows.length) * KEY_ROW_HEIGHT;
  // The clinical details go under the symbol rows, half a row apart.
  const gap = symbolsHeight > 0 && details.height > 0 ? KEY_ROW_HEIGHT / 2 : 0;
  if (details.height > 0) {
    out.push(`<g class="clinical-details" transform="translate(0 ${fmt(y + symbolsHeight + gap)})">`, ...details.markup, `</g>`);
  }
  return {
    markup: out,
    width: Math.max(symbolsHeight > 0 ? labelOffset + longest * LEGEND_CHAR_WIDTH : 0, details.width),
    height: symbolsHeight + gap + details.height,
  };
}

/** Characters per line of a clinical detail in the export key before it wraps. */
const DETAIL_WRAP = 70;
const DETAIL_LINE_HEIGHT = 14;
const DETAIL_INDENT = 12;

/**
 * The filled clinical key fields as "Label: value" text lines, top-left
 * at (x, y), long values wrapped. Empty when none is filled.
 */
export function clinicalDetailsMarkup(pedigree: Pedigree, x: number, y: number): TagLegendBlock {
  const lines = clinicalDetailLines(pedigree);
  if (lines.length === 0) return { markup: [], width: 0, height: 0 };
  const out: string[] = [];
  let widest = 0;
  let row = 0;
  for (const { label, value } of lines) {
    const head = `${label}: `;
    const wrapped = wrapText(value, DETAIL_WRAP - head.length);
    wrapped.forEach((text, i) => {
      const baseline = y + row * DETAIL_LINE_HEIGHT + LEGEND_FONT_SIZE;
      // A hanging indent: the bold label's real width is not known here.
      const indent = i === 0 ? 0 : DETAIL_INDENT;
      out.push(svgMarkup(
        <text x={fmt(x + indent)} y={fmt(baseline)} fontFamily="sans-serif" fontSize={LEGEND_FONT_SIZE} fill="black">
          {i === 0 && <tspan fontWeight="bold">{label}:</tspan>}{i === 0 ? ` ${text}` : text}
        </text>,
      ));
      widest = Math.max(widest, i === 0 ? head.length + text.length : DETAIL_INDENT / LEGEND_CHAR_WIDTH + text.length);
      row++;
    });
  }
  return { markup: out, width: widest * LEGEND_CHAR_WIDTH, height: row * DETAIL_LINE_HEIGHT };
}
