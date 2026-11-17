/**
 * U-shape export: the sizes and gaps every part of it shares, and two small
 * helpers for writing SVG.
 */
import { ARROW_TAIL, PROBAND_LETTER_SIZE } from "../../../pedigree/proband";
import { ENDED_STROKE_DY } from "../../../pedigree/ended";

export const NODE_SIZE = 40;
export const HALF = NODE_SIZE / 2;
export const STROKE = 2;
export const PROBAND_TAIL = ARROW_TAIL + PROBAND_LETTER_SIZE; // arrow plus its "P" (proband.ts)
export const LABEL_FONT_SIZE = 10;
export const LABEL_LINE_HEIGHT = 13;
export const CONSANG_GAP = 4;

export const MIN_SLOT = 58;            // min centre-to-centre spacing between siblings
export const MAX_SLOT = 130;           // long names stop widening the layout here
export const FAMILY_GAP = 16;          // extra spacing between cousins (different parents)
export const COUPLE_GAP = 80;          // couple centre-to-centre spacing
export const BAR_CLEARANCE = 12;       // gap between a sibship bar and the child symbols
export const DUP_LINK_INSET = 6;       // "same person" link runs this far inside the symbols
export const TARGET_ASPECT = 1.35;     // height / width the figure aims for (portrait page)
export const MIN_ASPECT = 0.5;         // a fan flatter than this is no better than the ordinary export
export const MAX_PLACE_ATTEMPTS = 4;
export const FAN_MAX_WIDTH = 1200;     // a fan wider than this is no longer a page-sized figure
export const MAX_FLAT = 260;           // longest half flat bottom that generation 1 may claim
// Consanguinity label: written along the double line between the
// two symbols, on the inward side ("above" the line, as the symbols see it).
export const CLABEL_PAD = 7;           // between the label and either symbol (clears a deceased slash and adoption brackets)
export const CLABEL_BASELINE = CONSANG_GAP / 2 + 4;            // bottom line's baseline, inward of the track
export const CLABEL_ENDED_BASELINE = ENDED_STROKE_DY + 4;      // above the strokes of an ended relationship
export const CLABEL_CAP = 9;           // from the baseline to above the cap height, with a pixel to spare
export const CLABEL_REACH = 3;         // past the text's ends that the label keeps clear of the line
// Smallest founder-track radius build() ever uses: 1.4 ringGaps of at least one label line.
export const MIN_LABEL_RADIUS = 1.4 * (NODE_SIZE + 8 + LABEL_LINE_HEIGHT + BAR_CLEARANCE + 6);

export function r(n: number): number { return Math.round(n * 10) / 10; }

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
