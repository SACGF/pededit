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
 * The span (px) the label, over partners at x `lx` and `rx`, must stay
 * inside. It keeps clear of what lands on each symbol top: the line of
 * descent in the middle of the top, and the "?" for family history not known
 * (#100), centred or, with a line of descent, left of it. A bare top can be
 * written over.
 */
export function consanguinityLabelLimits(lx: number, rx: number, left: SymbolTop, right: SymbolTop): [number, number] {
  const leftLimit = left.hasParents ? lx + 4 : left.familyHistoryUnknown ? lx + 8 : lx - NODE_SIZE / 2;
  const rightLimit = right.hasParents
    ? rx - (right.familyHistoryUnknown ? 17 : 4)
    : right.familyHistoryUnknown ? rx - 8 : rx + NODE_SIZE / 2;
  return [leftLimit, rightLimit];
}

/**
 * How wide (px) the label, centred between partners at x `lx` and `rx`, may
 * be: the widest that fits inside `consanguinityLabelLimits` while centred.
 */
export function consanguinityLabelRoom(lx: number, rx: number, left: SymbolTop, right: SymbolTop): number {
  const mid = (lx + rx) / 2;
  const [leftLimit, rightLimit] = consanguinityLabelLimits(lx, rx, left, right);
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

/** Baselines of each line, top line first, moved down by `dy` (`ConsanguinityLabelOffset`). */
export function consanguinityLabelBaselines(cy: number, hop: number, lines: number, dy = 0): number[] {
  const bottom = consanguinityLabelBaseline(cy, hop) + dy;
  return Array.from({ length: lines }, (_, i) => bottom - (lines - 1 - i) * CONSANGUINITY_LABEL_LINE_HEIGHT);
}

/** Top (px) of the label's highest line. */
export function consanguinityLabelTop(cy: number, hop: number, lines: number, dy = 0): number {
  return consanguinityLabelBaseline(cy, hop) + dy - (lines - 1) * CONSANGUINITY_LABEL_LINE_HEIGHT - CAP;
}

/**
 * Where the label goes relative to its usual place (centred, over the symbol
 * tops): `dx` along the line, `dy` down. `backed`: on a white backing that
 * a dashed arc between two copies of someone passes behind. Absent means
 * the usual place.
 */
export interface ConsanguinityLabelOffset { dx: number; dy: number; backed?: boolean }

/**
 * Something drawn that a couple label must keep off, as a box (x centre,
 * top, bottom, half width): the text under a symbol, a copy number, a
 * stretch of sibship line or of the dashed arc between two copies.
 */
export interface TextBlock { x: number; top: number; bottom: number; halfWidth: number; arc?: boolean }

/** How far (px) a label may be raised, in steps of 3, to clear what is under its usual place. */
const MAX_RAISE = 12;

/**
 * Where a couple's label can go without touching anything drawn near it
 * (#109). In compact rows the name and details of a person in the row
 * above can hang down to the symbol tops of the row below, right where the
 * label goes; a copy number or a dashed arc between two copies can sit
 * there in any layout. In order, the first place that is clear:
 *
 *   1. the usual place, centred over the line above the symbol tops;
 *   2. the same height, slid along the line as little as gets it clear,
 *      inside `limits` (`consanguinityLabelLimits`: lines of descent and
 *      "?" marks on the tops);
 *   3. both again, raised 3, 6, 9 and then 12 px (the sibship bar above is
 *      among the `blocks`, so it is never crossed);
 *   4. low, just above the double line between the two symbols, when the
 *      gap between them is wide enough, the line is straight (no hop) and
 *      not ended (#98, whose strokes cross it there);
 *   5. all of that again with the dashed arcs between copies of someone
 *      left out of the way: the label goes on a white backing and the arc
 *      passes behind it (`backed`), as in the U-shape export;
 *   6. nowhere: null, and the label is not drawn. This is the fallback when
 *      the text above fills the only room there is, typically siblings
 *      side by side in compact rows under a parent with two or more lines
 *      of text. The text is still in the data, the edit panel and the
 *      normal layout.
 */
export function placeConsanguinityLabel(o: {
  lx: number; rx: number; cy: number; hop: number; lines: string[];
  limits: [number, number]; blocks: TextBlock[]; ended?: boolean;
}): ConsanguinityLabelOffset | null {
  const clear = searchLabelPlace(o, o.blocks);
  if (clear) return clear;
  const behind = searchLabelPlace(o, o.blocks.filter(b => !b.arc));
  return behind && { ...behind, backed: true };
}

function searchLabelPlace(o: Parameters<typeof placeConsanguinityLabel>[0], blocks: TextBlock[]): ConsanguinityLabelOffset | null {
  const { lx, rx, cy, hop, lines, limits } = o;
  const mid = (lx + rx) / 2;
  const half = Math.max(...lines.map(consanguinityLabelWidth)) / 2;
  const box = (dx: number, dy: number) => ({
    left: mid + dx - half - 1, right: mid + dx + half + 1,
    top: consanguinityLabelTop(cy, hop, lines.length, dy) - 1,
    bottom: consanguinityLabelBaseline(cy, hop) + dy + 3,
  });
  // Text boxes run from cap height to below the descenders, so touching
  // boxes still leave a visible gap above and below; beside, keep 2px.
  const gap = 2;
  const hits = (b: ReturnType<typeof box>) => blocks.filter(t =>
    t.x - t.halfWidth - gap < b.right && b.left < t.x + t.halfWidth + gap && t.top < b.bottom && b.top < t.bottom);
  const minX = limits[0] + half, maxX = limits[1] - half;

  for (let dy = 0; dy >= -MAX_RAISE; dy -= 3) {
    // Centred, then slid as little as clears what is in the way.
    const inTheWay = hits(box(0, dy));
    if (inTheWay.length === 0) return { dx: 0, dy };
    const slides = inTheWay.flatMap(t => [t.x - t.halfWidth - gap - half - 1.5 - mid, t.x + t.halfWidth + gap + half + 1.5 - mid])
      .filter(dx => mid + dx >= minX - 0.01 && mid + dx <= maxX + 0.01)
      .sort((a, b) => Math.abs(a) - Math.abs(b));
    for (const dx of slides) if (hits(box(dx, dy)).length === 0) return { dx, dy };
  }

  // Low, between the symbols, on a straight line.
  if (hop === 0 && !o.ended && rx - lx - NODE_SIZE - 12 >= 2 * half) {
    const dy = cy - DOUBLE_GAP / 2 - 5 - consanguinityLabelBaseline(cy, hop);
    if (hits(box(0, dy)).length === 0) return { dx: 0, dy };
  }
  return null;
}

/** Where each couple label of a laid-out flow sits, for drawing, bounds and the title. */
export function consanguinityLabelPlacements(flow: {
  nodes: { id: string; position: { x: number; y: number } }[];
  coupleEdges: { source: string; target: string; data?: { hopHeight?: number; consanguinityLabel?: string[]; consanguinityLabelOffset?: ConsanguinityLabelOffset } }[];
}): { x: number; cy: number; hop: number; dy: number; lines: string[]; backed: boolean }[] {
  const pos = new Map(flow.nodes.map(n => [n.id, n.position]));
  const out: { x: number; cy: number; hop: number; dy: number; lines: string[]; backed: boolean }[] = [];
  for (const e of flow.coupleEdges) {
    const lines = e.data?.consanguinityLabel;
    const s = pos.get(e.source), t = pos.get(e.target);
    if (!lines?.length || !s || !t) continue;
    const off = e.data?.consanguinityLabelOffset ?? { dx: 0, dy: 0 };
    out.push({ x: (s.x + t.x) / 2 + off.dx, cy: (s.y + t.y) / 2, hop: e.data?.hopHeight ?? 0, dy: off.dy, lines, backed: !!off.backed });
  }
  return out;
}

/** The highest point any couple label reaches, or Infinity when there is none. */
export function highestConsanguinityLabel(flow: Parameters<typeof consanguinityLabelPlacements>[0]): number {
  return Math.min(Infinity, ...consanguinityLabelPlacements(flow).map(p => consanguinityLabelTop(p.cy, p.hop, p.lines.length, p.dy)));
}

/**
 * The white backing behind a label on a dashed arc (`ConsanguinityLabelOffset.backed`):
 * from cap height to below the descenders of every line, as wide as the
 * widest. Shared by the canvas, the export and its lint.
 */
export function consanguinityLabelBacking(x: number, baselines: number[], lines: string[]): { x: number; y: number; width: number; height: number } {
  const width = Math.max(...lines.map(consanguinityLabelWidth)) + 2;
  const top = Math.min(...baselines) - CAP - 1;
  return { x: x - width / 2, y: top, width, height: Math.max(...baselines) + 3 - top };
}
