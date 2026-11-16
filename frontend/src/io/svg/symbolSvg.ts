/**
 * A person's symbol as SVG markup, for both figure exports (#149): the
 * standard export draws it upright, the U-shape turned along its track. It
 * used to be written twice, the U-shape's copy differing by a rotation, so
 * the U-shape was the place a symbol change was most often missed.
 *
 * Everything here draws from the person's glyph (`pedigree/personGlyph.ts`,
 * #144) and mirrors `SymbolShape` in `pedigree/nodes/symbols.tsx`, which
 * draws the same on the canvas. Framework-free: strings only.
 */
import type { Individual } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "../../pedigree/constants";
import { adoptionBracketSegments, ADOPTION_DASH } from "../../pedigree/adoption";
import { symbolLetter, roleLetterFontSize, roleLetterBaselineY, roleLetterFill } from "../../pedigree/assisted";
import type { PersonGlyph } from "../../pedigree/personGlyph";
import { renderPresymptomaticLineSvg } from "../../pedigree/evaluation";
import { renderArrowSvg, type ArrowKind } from "../../pedigree/proband";
import { renderSectorListSvg, renderAnnotationItemsSvg, renderAffectedCoreSvg, type SymbolPaint } from "../../pedigree/tags";
import {
  usesLossTriangle, CAPTION_FONT_SIZE,
  lossTrianglePoints, lossSlashEnds, pregnancyFontSize, pregnancyBaselineY,
  carrierDot, symbolTopInset, CARRIER_RIM,
} from "../../pedigree/lifeStatus";

/** Stroke width (px) of symbols and lines in a figure. */
export const STROKE = 2;
/** How far (px) a deceased or stillbirth slash reaches past the symbol box; matches DeceasedSlash in symbols.tsx. */
export const DECEASED_OVERHANG = 4;

/**
 * A straight line. `mark` tags a childless or twin mark, which is not a line
 * joining people, so the export lint (exportLint.ts) leaves it out.
 */
export function seg(x1: number, y1: number, x2: number, y2: number, dashed = false, mark = false): string {
  const dash = dashed ? ` stroke-dasharray="${ADOPTION_DASH}"` : "";
  return `<line${mark ? ` class="mark"` : ""} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${STROKE}"${dash}/>`;
}

/** Brackets round an adopted individual's symbol, centred on the origin. Shared with the U-shape exporter. */
export function renderAdoptionBrackets(ind: Individual): string {
  if (!ind.adopted) return "";
  const half = NODE_SIZE / 2;
  return `<g data-adopted="${ind.adopted}">` + adoptionBracketSegments(NODE_SIZE, -half, -half).map(([x1, y1, x2, y2]) => seg(x1, y1, x2, y2)).join("") + `</g>`;
}

/** "D" or "S" inside the symbol (#45), centred on the origin. Shared with the U-shape exporter. */
export function renderRoleLetterSvg(ind: Individual, halo = false, base: "black" | "white" = "white"): string {
  const letter = symbolLetter(ind);
  if (!letter) return "";
  const half = NODE_SIZE / 2;
  const h = halo ? ` stroke="white" stroke-width="3" paint-order="stroke"` : "";
  return `<text x="0" y="${roleLetterBaselineY(NODE_SIZE, -half)}" text-anchor="middle" font-family="sans-serif" font-size="${roleLetterFontSize(NODE_SIZE)}" font-weight="bold" fill="${roleLetterFill(base)}"${h}>${letter}</text>`;
}

/**
 * The symbol of one person, centred on the origin: outline, fill, condition
 * sections, brackets, carrier dot, role letter, presymptomatic line, the
 * marks of a pregnancy or loss, and the annotation row under it. Drawn from
 * the person's glyph (#144). The one symbol renderer of both exports (#149).
 *
 * `rotation` (degrees) is how far the caller's group is turned, as along the
 * U-shape's track: letters ("D", "S", the "P" of a pregnancy) read as other
 * letters on their side, so they are turned back upright, while slashes turn
 * with the symbol. `captionShift` is how far an "SB" / "ECT" caption pushes
 * the annotation row down in the caller's text geometry.
 */
export function renderPersonShapeSvg(ind: Individual, glyph: PersonGlyph, clipId: string, { rotation = 0, captionShift }: { rotation?: number; captionShift: number }): string {
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

  const upright = (markup: string) => (markup && rotation !== 0 ? `<g transform="rotate(${Math.round(-rotation * 10) / 10})">${markup}</g>` : markup);
  const letter = upright(renderRoleLetterSvg(ind, sectors.length > 0, paint.base));
  const marks = renderLifeStatusMarks(ind, geom, clipId, paint);
  return renderAdoptionBrackets(ind) + shape + renderCarrierDot(ind, sectors.length > 0, paint.dot) + letter
    + (paint.line ? renderPresymptomaticLineSvg(glyph.lifeStatus, NODE_SIZE, -half, -half, sectors.length > 0) : "")
    // From `ind`, as the marks themselves are (`renderLifeStatusMarks`).
    + (ind.lifeStatus === "pregnancy" ? upright(marks) : marks)
    + renderAnnotationItemsSvg(glyph.annotations, NODE_SIZE, glyph.caption ? captionShift : 0);
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

/** The slash of someone deceased, centred on the origin: it turns with the symbol. */
export function renderDeceasedSlashSvg(): string {
  const o = DECEASED_OVERHANG;
  const half = NODE_SIZE / 2;
  return `<line x1="${-half - o}" y1="${-half - o}" x2="${half + o}" y2="${half + o}" stroke="black" stroke-width="${STROKE}"/>`;
}

/** Proband arrow with its "P" (kept upright when the symbol is turned by `rotation`), or the consultand's arrow without (#99). */
export function renderProbandArrowSvg(kind: ArrowKind, rotation = 0): string {
  const half = NODE_SIZE / 2;
  return renderArrowSvg(kind, NODE_SIZE, -half, -half, { stroke: STROKE, markerId: "proband-arrowhead", ...(rotation !== 0 ? { uprightDeg: -rotation } : {}) });
}

