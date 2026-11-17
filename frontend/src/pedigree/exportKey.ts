/**
 * The key of the SVG, PNG and PDF exports (NSGC's word for the legend of a
 * figure): what each symbol, mark and line on the chart means, the
 * conditions and tags in use, and the clinical details.
 *
 * Which rows there are, in what order and with what label comes from
 * `keyRows(pedigree, "export")`, the list the in-app legend also
 * draws from. This module only draws each row's swatch, through a switch on
 * the row's kind that TypeScript checks for completeness. Framework-free:
 * strings only.
 */
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";
import { endedMarkSegments } from "./ended";
import { lossTrianglePoints, lossSlashEnds, usesLossTriangle } from "./lifeStatus";
import { adoptionBracketSegments } from "./adoption";
import { clinicalDetailLines, wrapText } from "./clinicalDetails";
import { renderArrowKeySwatchSvg } from "./proband";
import { renderRegionFillSvg, PLAIN_CARRIER_PAINT } from "./tagFills";
import {
  fmt, escapeXml, sectorPath, legendLabelSvg, swatchColumnWidth, renderTagLegendRowSvg,
  AFFECTED_CORE_SCALE, AFFECTED_CORE_RIM, PLAIN_CARRIER_ANGLES,
  LEGEND_SWATCH, LEGEND_ROW_HEIGHT, LEGEND_FONT_SIZE, LEGEND_LABEL_GAP, LEGEND_CHAR_WIDTH,
  type TagLegendBlock,
} from "./tags";
import { keyRows, type KeyRow } from "./keyRows";

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

/** Key swatch for the NSGC 2022 carrier with no condition recorded: the right half dotted. */
export function renderPlainCarrierSwatchSvg(sex: Individual["sex"], x: number, y: number): string {
  const s = LEGEND_SWATCH;
  const geom = swatchGeom(sex, x, y, s);
  const clipId = `legend-plain-carrier-${sex}`;
  const [start, end] = PLAIN_CARRIER_ANGLES;
  return `<clipPath id="${clipId}">${geom}/></clipPath>`
    + `${geom} fill="white" stroke="none"/>`
    + renderRegionFillSvg(PLAIN_CARRIER_PAINT.fill, PLAIN_CARRIER_PAINT.color, sectorPath(x + s / 2, y + s / 2, s, start, end), { x, y, size: s }, `${clipId}-fill`, clipId)
    + `${geom} fill="none" stroke="black" stroke-width="1.5"/>`;
}

/** A status or relationship row: every kind but a tag (drawn by `renderTagLegendRowSvg`) and a clinical detail (text). */
type SwatchRow = Exclude<KeyRow, { kind: "tag" | "clinicalDetail" | "sex" | "couple" }>;

/**
 * The swatch of one row, top-left at (x, sy). One case for each kind of row:
 * a new kind in `KeyRow` does not compile until it is drawn here.
 */
function renderKeySwatchSvg(row: SwatchRow, x: number, sy: number): string {
  const s = LEGEND_SWATCH;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="black" stroke-width="1.5"/>`;
  switch (row.kind) {
    case "affected": return renderStatusSwatchSvg("affected", row.shape, false, x, sy);
    case "affectedCore": return renderStatusSwatchSvg("affected", row.shape, true, x, sy);
    case "carrier": return row.half ? renderPlainCarrierSwatchSvg(row.shape, x, sy) : renderStatusSwatchSvg("carrier", row.shape, false, x, sy);
    case "presymptomatic":
      return `${swatchGeom(row.shape, x, sy, s)} fill="white" stroke="black" stroke-width="1.5"/>`
        + `<line x1="${fmt(x + s / 2)}" y1="${fmt(sy + 1)}" x2="${fmt(x + s / 2)}" y2="${fmt(sy + s - 1)}" stroke="black" stroke-width="1.5"/>`;
    case "deceased": return renderStatusSwatchSvg("deceased", row.shape, false, x, sy);
    // Sex assigned at birth under a symbol drawn by gender identity.
    case "assignedAtBirth":
      return `<text x="${fmt(x)}" y="${fmt(sy + s / 2 + 3)}" font-family="sans-serif" font-size="7" textLength="${s}" lengthAdjust="spacingAndGlyphs" fill="black">${row.code}</text>`;
    // Proband and consultand arrows.
    case "proband":
    case "consultand": return renderArrowKeySwatchSvg(row.kind, x, sy, s);
    // Family history not known: a "?" over a small symbol.
    case "familyHistoryUnknown": {
      const k = s * 0.6, ox = x + (s - k) / 2, oy = sy + s - k;
      return `${swatchGeom(row.shape, ox, oy, k)} fill="white" stroke="black" stroke-width="1.5"/>`
        + `<text x="${fmt(x + s / 2)}" y="${fmt(oy - 1)}" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="black">?</text>`;
    }
    case "evaluation":
      return `<text x="${fmt(x + s / 2)}" y="${fmt(sy + s / 2 + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="black">${row.mark}</text>`;
    // The letters the coefficients are written with.
    case "inbreeding":
    case "kinship":
      return `<text x="${fmt(x + s / 2)}" y="${fmt(sy + s / 2 + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="black">${row.kind === "inbreeding" ? "F" : "φ"}</text>`;
    case "documented": {
      const k = s * 0.6, ox = x + (s - k) / 2 - 2, oy = sy + (s - k) / 2;
      return `${swatchGeom(row.shape, ox, oy, k)} fill="white" stroke="black" stroke-width="1.5"/>`
        + `<text x="${fmt(ox + k + 0.5)}" y="${fmt(oy + k + 5)}" font-family="sans-serif" font-size="11" fill="black">*</text>`;
    }
    case "lifeStatus": return renderLifeStatusSwatchSvg(row.status, row.shape, x, sy);
    // Adoption brackets, drawn a little smaller so they fit the swatch column.
    case "adopted": {
      const k = s * 0.7, ox = x + (s - k) / 2, oy = sy + (s - k) / 2;
      const geom = swatchGeom(row.shape, ox, oy, k);
      const brackets = adoptionBracketSegments(k, ox, oy)
        .map(([x1, y1, x2, y2]) => `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="black" stroke-width="1.5"/>`)
        .join("");
      return brackets + `${geom} fill="white" stroke="black" stroke-width="1.5"/>`;
    }
    // Assisted reproduction: the symbol with its "D" or "S".
    case "role":
      return `${swatchGeom(row.shape, x, sy, s)} fill="white" stroke="black" stroke-width="1.5"/>`
        + `<text x="${fmt(x + s / 2)}" y="${fmt(sy + s / 2 + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="black">${row.letter}</text>`;
    // Collapsed branches: a diamond with "n" in it.
    case "collapsedBranch":
      return `${swatchGeom("unknown", x, sy, s)} fill="white" stroke="black" stroke-width="1.5"/>`
        + `<text x="${fmt(x + s / 2)}" y="${fmt(sy + s / 2 + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="10" font-style="italic" fill="black">n</text>`;
    case "consanguineous": {
      const cy = sy + s / 2;
      const flat = (y: number) => `<line x1="${fmt(x)}" y1="${fmt(y)}" x2="${fmt(x + s)}" y2="${fmt(y)}" stroke="black" stroke-width="1.5"/>`;
      return flat(cy - 2) + flat(cy + 2);
    }
    // Ended relationship: a couple line with the two strokes across it.
    case "ended": {
      const cy = sy + s / 2;
      return line(x, cy, x + s, cy)
        + endedMarkSegments(x + s / 2, cy, 0.7).map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2)).join("");
    }
    // Childless couple marks: a short couple line with the mark under it.
    case "childless": {
      const cx = x + s / 2, top = sy + 2, bar = sy + s - 2;
      let out = line(x, top, x + s, top) + line(cx, top, cx, bar) + line(cx - 4, bar, cx + 4, bar);
      if (row.status === "infertility") out += line(cx - 4, bar - 3, cx + 4, bar - 3);
      return out;
    }
    // Twin forks.
    case "twins": {
      const cx = x + s / 2, top = sy + 1, bottom = sy + s;
      let out = line(x + 2, top, x + s - 2, top) + line(cx, top, x + 1, bottom) + line(cx, top, x + s - 1, bottom);
      const my = (top + bottom) / 2;
      if (row.zygosity === "monozygotic") out += line(cx - 4, my, cx + 4, my);
      if (row.zygosity === "unknown") out += `<text x="${fmt(cx)}" y="${fmt(my + 3.5)}" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="bold" fill="black">?</text>`;
      return out;
    }
    // Lines of assisted reproduction: a slanting line, dashed for a social parent.
    case "assistedLine":
      return `<line x1="${fmt(x + 2)}" y1="${fmt(sy + 1)}" x2="${fmt(x + s - 2)}" y2="${fmt(sy + s - 1)}" stroke="black" stroke-width="1.5"${row.line === "social" ? ` stroke-dasharray="4 2"` : ""}/>`;
    // Someone drawn more than once: a dashed arc, as between the copies.
    case "duplicate":
      return `<path d="M ${fmt(x + 1)} ${fmt(sy + s - 2)} Q ${fmt(x + s / 2)} ${fmt(sy - 4)} ${fmt(x + s - 1)} ${fmt(sy + s - 2)}" fill="none" stroke="black" stroke-width="1.5" stroke-dasharray="3 2"/>`;
    default: {
      const unhandled: never = row;
      return unhandled;
    }
  }
}

/**
 * The full export key: the status and relationship rows the drawn pedigree
 * needs, then one row per tag in use, then the clinical details. Top-left at
 * (x, y); empty when there is nothing to explain. Exporters reserve `height`
 * below the pedigree and at least `width` across. Each swatch uses the shape
 * of the first person with the status, as the in-app legend does.
 */
export function renderExportKeySvg(
  pedigree: Pedigree, x: number, y: number,
  /** The drawing joins two copies of someone with a dashed arc; the exporter knows from its layout. */
  { duplicates = false }: { duplicates?: boolean } = {},
): TagLegendBlock {
  const key = keyRows(pedigree, "export", { duplicates });
  // "sex" and "couple" rows are the legend's only, so the export list has none.
  const rows = [...key.symbols, ...key.relationships] as SwatchRow[];
  const tagRows = key.tags.flatMap(r => (r.kind === "tag" ? [r] : []));
  const tags = tagRows.map(r => r.tag);
  const details = renderClinicalDetailsSvg(pedigree, x, 0);
  if (rows.length === 0 && tagRows.length === 0 && details.height === 0) return { markup: [], width: 0, height: 0 };

  const labelOffset = swatchColumnWidth(tags) + LEGEND_LABEL_GAP;
  const rowY = (i: number) => y + i * LEGEND_ROW_HEIGHT + (LEGEND_ROW_HEIGHT - LEGEND_SWATCH) / 2;
  const markup = rows.map((r, i) =>
    renderKeySwatchSvg(r, x, rowY(i)) + legendLabelSvg(r.label, x + labelOffset, rowY(i) + LEGEND_SWATCH / 2),
  );
  tagRows.forEach((r, j) => markup.push(renderTagLegendRowSvg(r.tag, key.pedigree, x, rowY(rows.length + j), labelOffset, r.carrier)));

  const longest = Math.max(0, ...rows.map(r => r.label.length), ...tagRows.map(r => r.label.length));
  const symbolsHeight = (rows.length + tagRows.length) * LEGEND_ROW_HEIGHT;
  // The clinical details go under the symbol rows, a half row apart.
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
 * The filled clinical key fields as "Label: value" text lines, top-left
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
