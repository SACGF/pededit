import { NODE_SIZE } from "./constants";
import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT, linesWidth, textWidth } from "./labels";
import { ANNOTATION_ROW_HEIGHT } from "./tags";
import { CAPTION_ROW_HEIGHT, captionBaselineY } from "./lifeStatus";
import type { TextBlock } from "./geometryTypes";
import type { PersonGlyph } from "./personGlyph";

/**
 * Where the text under a symbol goes: one geometry for the canvas
 * (`TextUnderSymbol` in `chart/symbols.tsx`), the standard SVG export
 * (`svgExporter.tsx`), the lints and the placement of couple labels and
 * sibship bars. All of it is measured from the symbol's centre.
 */

/** Baseline of the first line under the symbol ("SB" / "ECT" caption or name), below its centre. */
export const TEXT_OFFSET_Y = captionBaselineY(NODE_SIZE) - NODE_SIZE / 2;
/** Extra drop for the name when a tag annotation row sits between it and the symbol. */
export const ANNOTATION_SHIFT = ANNOTATION_ROW_HEIGHT + 8;
/** Extra drop for everything under a symbol with an "SB" / "ECT" caption, the annotation row included. */
export const CAPTION_SHIFT = CAPTION_ROW_HEIGHT + 3;

/** A box from the symbol's centre: a white backing behind lines of text. */
export interface TextBacking { x: number; y: number; width: number; height: number }

/** Where each line of text under one symbol is written, from the symbol's centre. */
export interface TextUnder {
  /** Baseline of the "SB" / "ECT" caption, when there is one. */
  captionY?: number;
  /** How far the annotation row moves down for the caption (the `offsetY` of its renderers). */
  annotationShift: number;
  /** Baseline of each name line. */
  nameY: number[];
  /** Baseline of each detail line, under the name. */
  detailY: number[];
  /** White box behind the name, when a line runs down through it (`labelsBacked`). */
  nameBacking?: TextBacking;
  /** White box behind the detail lines (`detailsBacked` or `labelsBacked`). */
  detailBacking?: TextBacking;
}

/**
 * Where the text under a symbol goes. `nameLines` are the name as drawn:
 * the glyph's `nameLines` on the canvas, `figureNameLines` in a file.
 */
export function textUnder(
  glyph: Pick<PersonGlyph, "caption" | "annotations" | "detailLines" | "detailsBacked" | "labelsBacked">,
  nameLines: string[],
): TextUnder {
  const first = TEXT_OFFSET_Y + (glyph.caption ? CAPTION_SHIFT : 0) + (glyph.annotations.length > 0 ? ANNOTATION_SHIFT : 0);
  const details = glyph.detailLines;
  const backing = (lines: string[], baseline: number): TextBacking => {
    const width = linesWidth(lines) + 4;
    return { x: -width / 2, y: baseline - LABEL_FONT_SIZE, width, height: lines.length * LABEL_LINE_HEIGHT };
  };
  const detailTop = first + nameLines.length * LABEL_LINE_HEIGHT;
  return {
    ...(glyph.caption ? { captionY: TEXT_OFFSET_Y } : {}),
    annotationShift: glyph.caption ? CAPTION_SHIFT : 0,
    nameY: nameLines.map((_, k) => first + k * LABEL_LINE_HEIGHT),
    detailY: details.map((_, k) => detailTop + k * LABEL_LINE_HEIGHT),
    ...(glyph.labelsBacked && nameLines.length > 0 ? { nameBacking: backing(nameLines, first) } : {}),
    ...(details.length > 0 && (glyph.labelsBacked || glyph.detailsBacked) ? { detailBacking: backing(details, detailTop) } : {}),
  };
}

/**
 * The box the text under a symbol centred at (x, y) takes in a figure:
 * caption, tag annotation row, name and detail lines. Null when there is no
 * name or detail line. The canvas's text takes the same box or less (its
 * names may be cut to one line).
 */
export function textBlockUnder(glyph: PersonGlyph, x: number, y: number): TextBlock | null {
  const lines = [...glyph.figureNameLines, ...glyph.detailLines];
  if (lines.length === 0) return null;
  const at = textUnder(glyph, glyph.figureNameLines);
  const last = Math.max(...at.nameY, ...at.detailY);
  return {
    x,
    top: y + NODE_SIZE / 2,
    bottom: y + last + 3,
    halfWidth: linesWidth(lines) / 2,
  };
}

/** Font size (px) of the copy number beside someone drawn more than once. */
export const COPY_NUMBER_FONT_SIZE = 10;

/**
 * Where the copy number of someone drawn more than once starts, from the
 * symbol's centre: the left end of its baseline, just right of the symbol's
 * top right corner. The canvas and the exports both write it here.
 */
export function copyNumberAt(size = NODE_SIZE): { x: number; y: number } {
  return { x: size / 2 + 2, y: -size / 2 + 2 };
}

/**
 * The box the copy number beside the top right corner of a symbol drawn
 * twice takes (`copyNumberAt`), with a few px to spare above and below.
 */
export function copyNumberBlock(x: number, y: number, index: number): TextBlock {
  const left = x + NODE_SIZE / 2, right = x + NODE_SIZE / 2 + 2 + textWidth(String(index));
  return { x: (left + right) / 2, top: y - NODE_SIZE / 2 - 8, bottom: y - NODE_SIZE / 2 + 5, halfWidth: (right - left) / 2 };
}
