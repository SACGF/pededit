import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "./constants";
import { detailLines, linesWidth, nameLabelText, textWidth, wrapLabel } from "./labels";
import { ANNOTATION_ROW_HEIGHT, hasAnnotationRow } from "./tags";
import { CAPTION_ROW_HEIGHT, lifeStatusCaption } from "./lifeStatus";
import type { TextBlock } from "./consanguinityLabel";

/**
 * Where the standard SVG export (`svgExporter.ts`) writes the text under a
 * symbol. Kept here so the couple label placement (#109) can stay off it.
 * The export's text runs lower and in taller lines than the canvas's, so a
 * label clear of the export's text is clear of the canvas's too.
 */
export const EXPORT_LABEL_LINE_HEIGHT = 13;
/** Baseline of the first line under the symbol, below its centre. */
export const EXPORT_LABEL_OFFSET_Y = NODE_SIZE / 2 + 12;
/** Extra drop for the name when a tag annotation row sits between it and the symbol. */
export const EXPORT_ANNOTATION_SHIFT = ANNOTATION_ROW_HEIGHT + 8;
/** Extra drop for everything under a symbol with an "SB" / "ECT" caption. */
export const EXPORT_CAPTION_SHIFT = CAPTION_ROW_HEIGHT + 3;

/**
 * The box the text under a symbol centred at (x, y) takes in the export:
 * caption, tag annotation row, name and detail lines. Null when there is no
 * text under it.
 */
export function textBlockUnder(ind: Individual, pedigree: Pedigree, x: number, y: number, labelMax: number, numbers?: Map<string, string>): TextBlock | null {
  const lines = [...wrapLabel(nameLabelText(ind), labelMax), ...detailLines(ind, labelMax, pedigree, numbers)];
  if (lines.length === 0) return null;
  const firstBaseline = y + EXPORT_LABEL_OFFSET_Y
    + (lifeStatusCaption(ind.lifeStatus) ? EXPORT_CAPTION_SHIFT : 0)
    + (hasAnnotationRow(ind, pedigree) ? EXPORT_ANNOTATION_SHIFT : 0);
  return {
    x,
    top: y + NODE_SIZE / 2,
    bottom: firstBaseline + (lines.length - 1) * EXPORT_LABEL_LINE_HEIGHT + 3,
    halfWidth: linesWidth(lines) / 2,
  };
}

/**
 * The copy number written beside the top right corner of a symbol drawn
 * twice: from 20px right of the centre (the canvas) to past the end of the
 * export's text at 22px, from 28px above the centre (the canvas) to just
 * below the export's baseline at 18px above.
 */
export function copyNumberBlock(x: number, y: number, index: number): TextBlock {
  const left = x + NODE_SIZE / 2, right = x + NODE_SIZE / 2 + 2 + textWidth(String(index));
  return { x: (left + right) / 2, top: y - NODE_SIZE / 2 - 8, bottom: y - NODE_SIZE / 2 + 5, halfWidth: (right - left) / 2 };
}
