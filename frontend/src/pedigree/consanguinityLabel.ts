import type { Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE, ROW_HEIGHT } from "./constants";
import { LABEL_FONT_SIZE, textWidth, wrapLabel } from "./labels";
import { kinshipOf } from "./relatedness";
import { nameCoupleRelationship } from "./relationship";

/**
 * The degree of relationship written above a consanguineous couple's double
 * line (#97, NSGC 2008 Fig. 2.2b: "if the degree of relationship is not
 * obvious from the pedigree, it should be stated above the relationship
 * line"). Framework-free: the canvas edges, `svgExporter`, the export lint
 * and the chart title placement share it.
 *
 * What is written: the partnership's own `consanguinityLabel` when set (the
 * only way to say anything for a couple marked consanguineous by hand, whose
 * common ancestors are not drawn); otherwise, when the pedigree's
 * `canvasSettings.relationshipLabels` is on, the relationship's name from
 * `nameCoupleRelationship` ("first cousins"), if it can be named for certain.
 * Nothing is written on a single line.
 */

export const CONSANGUINITY_LABEL_FONT_SIZE = 9;
export const CONSANGUINITY_LABEL_LINE_HEIGHT = 11;
/** Cap height (px) of the label font, for the top of the text. */
const CAP = 7;
/** How far a deceased slash reaches above the symbol box (as in symbols.tsx). */
const SLASH_OVERHANG = 4;
/** Gap between the double line's two lines (as in ConsanguineousEdge). */
const DOUBLE_GAP = 4;
const SCALE = CONSANGUINITY_LABEL_FONT_SIZE / LABEL_FONT_SIZE;

/** Estimated width (px) of one line of the label. */
export function consanguinityLabelWidth(text: string): number {
  return textWidth(text) * SCALE;
}

/** The text to write above this couple's double line, or undefined for none. */
export function consanguinityLabelText(pedigree: Pedigree, partnership: Partnership): string | undefined {
  const own = partnership.consanguinityLabel?.trim();
  if (own) return own;
  if (!pedigree.canvasSettings?.relationshipLabels) return undefined;
  return namedCoupleRelationship(pedigree, partnership) ?? undefined;
}

/** The relationship's name, for the panel's suggestion and the setting. */
export function namedCoupleRelationship(pedigree: Pedigree, partnership: Partnership): string | null {
  const { individual1: a, individual2: b } = partnership;
  return nameCoupleRelationship(pedigree, a, b, kinshipOf(pedigree).kinship(a, b));
}

/** What sits on a partner's symbol top: a line of descent from their parents, a "?" (#100). */
export interface SymbolTop { hasParents: boolean; familyHistoryUnknown: boolean }

/**
 * How wide (px) the label, centred between partners at x `lx` and `rx`, may
 * be. It keeps clear of what lands on each symbol top: the line of descent
 * in the middle of the top, and the "?" for family history not known (#100),
 * centred or, with a line of descent, left of it. A bare top can be written
 * over.
 */
export function consanguinityLabelRoom(lx: number, rx: number, left: SymbolTop, right: SymbolTop): number {
  const mid = (lx + rx) / 2;
  const leftLimit = left.hasParents ? lx + 4 : left.familyHistoryUnknown ? lx + 8 : lx - NODE_SIZE / 2;
  const rightLimit = right.hasParents
    ? rx - (right.familyHistoryUnknown ? 17 : 4)
    : right.familyHistoryUnknown ? rx - 8 : rx + NODE_SIZE / 2;
  return Math.max(2 * Math.min(mid - leftLimit, rightLimit - mid), NODE_SIZE);
}

/**
 * The label's lines for `maxWidth` px of room (`consanguinityLabelRoom`).
 * One line when rows are compact: the sibship bar above is then too close
 * for two.
 */
export function wrapConsanguinityLabel(text: string, maxWidth: number, rowHeight: number): string[] {
  return wrapLabel(text, maxWidth / SCALE, rowHeight >= ROW_HEIGHT ? 2 : 1);
}

/**
 * Baseline of the label's bottom line over a couple line at height `cy`
 * that rises `hop` px: above the symbol tops (and a deceased slash), or just
 * above the line where it hops higher than that.
 */
export function consanguinityLabelBaseline(cy: number, hop: number): number {
  return Math.min(cy - NODE_SIZE / 2 - SLASH_OVERHANG - 3, cy - hop - DOUBLE_GAP / 2 - 5);
}

/** Baselines of each line, top line first. */
export function consanguinityLabelBaselines(cy: number, hop: number, lines: number): number[] {
  const bottom = consanguinityLabelBaseline(cy, hop);
  return Array.from({ length: lines }, (_, i) => bottom - (lines - 1 - i) * CONSANGUINITY_LABEL_LINE_HEIGHT);
}

/** Top (px) of the label's highest line. */
export function consanguinityLabelTop(cy: number, hop: number, lines: number): number {
  return consanguinityLabelBaseline(cy, hop) - (lines - 1) * CONSANGUINITY_LABEL_LINE_HEIGHT - CAP;
}

/** Where each couple label of a laid-out flow sits, for bounds and the title. */
export function consanguinityLabelPlacements(flow: {
  nodes: { id: string; position: { x: number; y: number } }[];
  coupleEdges: { source: string; target: string; data?: { hopHeight?: number; consanguinityLabel?: string[] } }[];
}): { x: number; cy: number; hop: number; lines: string[] }[] {
  const pos = new Map(flow.nodes.map(n => [n.id, n.position]));
  const out: { x: number; cy: number; hop: number; lines: string[] }[] = [];
  for (const e of flow.coupleEdges) {
    const lines = e.data?.consanguinityLabel;
    const s = pos.get(e.source), t = pos.get(e.target);
    if (!lines?.length || !s || !t) continue;
    out.push({ x: (s.x + t.x) / 2, cy: (s.y + t.y) / 2, hop: e.data?.hopHeight ?? 0, lines });
  }
  return out;
}

/** The highest point any couple label reaches, or Infinity when there is none. */
export function highestConsanguinityLabel(flow: Parameters<typeof consanguinityLabelPlacements>[0]): number {
  return Math.min(Infinity, ...consanguinityLabelPlacements(flow).map(p => consanguinityLabelTop(p.cy, p.hop, p.lines.length)));
}
