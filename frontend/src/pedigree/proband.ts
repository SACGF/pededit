/**
 * Proband and consultand arrows (NSGC 2008 Fig. 1, #99). The proband (the
 * affected person through whom the family came to attention) gets an arrow
 * at the lower left with a "P" at its tail; a consultand (the person seeking
 * counselling, who may be unaffected) gets the same arrow without the "P".
 * Someone who is both is drawn as the proband. Framework-free, shared by the
 * canvas (`ProbandArrow` in `nodes/symbols.tsx`), both SVG exporters and the
 * legends, so they agree.
 */

import type { Individual } from "@pedigree-editor/layout-engine";

export type ArrowKind = "proband" | "consultand";

/** Length (px, along each axis) of the arrow from its tail to the symbol corner. */
export const ARROW_TAIL = 18;
export const PROBAND_LETTER = "P";
export const PROBAND_LETTER_SIZE = 10;

/** Which arrow, if any, points at this person. */
export function arrowKind(ind: Pick<Individual, "proband" | "consultand">): ArrowKind | undefined {
  if (ind.proband) return "proband";
  if (ind.consultand) return "consultand";
  return undefined;
}

/**
 * Arrow geometry for a symbol box of `size` with top-left (x, y): the tip at
 * the box's lower-left corner, the tail ARROW_TAIL below-left of it, and the
 * baseline point of the "P", just below-left of the tail (Fig. 1.7).
 */
export function arrowGeometry(size: number, x = 0, y = 0) {
  const tip = { x, y: y + size };
  const tail = { x: x - ARROW_TAIL, y: y + size + ARROW_TAIL };
  // The "P" ends 4px left of the tail: with a partner on the proband's left
  // their couple's line of descent drops half a slot gap left of the symbol
  // (x - 20), and the letter then sits just clear of it. A white box behind
  // the letter covers any line that does cross it (a pinned node), which
  // then shows a gap rather than running through the P, as #93's label
  // backing does.
  const letter = { x: tail.x - 4, y: tail.y + PROBAND_LETTER_SIZE - 1 };
  const letterBox = { x: letter.x - LETTER_WIDTH - 1, y: letter.y - PROBAND_LETTER_SIZE + 1, w: LETTER_WIDTH + 1.5, h: PROBAND_LETTER_SIZE };
  return { tip, tail, letter, letterBox };
}

/** Rough width (px) of the bold "P" at PROBAND_LETTER_SIZE. */
const LETTER_WIDTH = 7;

/**
 * The arrow as SVG markup, for the exporters. `markerId` names the
 * arrowhead marker in the file's <defs>. `uprightDeg` turns the "P" back by
 * that many degrees about its own anchor, for a symbol drawn rotated (the
 * U-shape export), so the letter stays upright.
 */
export function renderArrowSvg(
  kind: ArrowKind, size: number, x: number, y: number,
  opts: { stroke: number; markerId: string; uprightDeg?: number },
): string {
  const { tip, tail, letter, letterBox: b } = arrowGeometry(size, x, y);
  let out = `<line x1="${tail.x}" y1="${tail.y}" x2="${tip.x}" y2="${tip.y}" stroke="black" stroke-width="${opts.stroke}" marker-end="url(#${opts.markerId})"/>`;
  if (kind === "proband") {
    const turn = opts.uprightDeg ? ` transform="rotate(${opts.uprightDeg} ${letter.x} ${letter.y - PROBAND_LETTER_SIZE / 2})"` : "";
    out += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="white"${turn}/>`;
    out += `<text class="proband-letter" x="${letter.x}" y="${letter.y}"${turn} text-anchor="end" font-family="sans-serif" font-size="${PROBAND_LETTER_SIZE}" font-weight="bold" fill="black">${PROBAND_LETTER}</text>`;
  }
  return out;
}

/** Legend wording, shared by the in-app legend and the export key. */
export const ARROW_LEGEND_LABEL: Record<ArrowKind, string> = {
  proband: "Proband (index case)",
  consultand: "Consultand (seeking counselling)",
};

/**
 * The export key's swatch (#99): the arrow alone, pointing up-right across a
 * `s`-px cell with top-left (x, y), its head drawn as a polygon so it does
 * not depend on the file's marker, and the "P" below-left of the tail for
 * the proband.
 */
export function renderArrowKeySwatchSvg(kind: ArrowKind, x: number, y: number, s: number): string {
  const tip = { x: x + s, y };
  const tail = { x: x + s * 0.45, y: y + s * 0.55 };
  const head = 5;
  // Unit vector from tail to tip, and its normal, for the arrowhead.
  const dx = tip.x - tail.x, dy = tip.y - tail.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const bx = tip.x - ux * head, by = tip.y - uy * head;
  const pts = [[tip.x, tip.y], [bx - uy * head / 2, by + ux * head / 2], [bx + uy * head / 2, by - ux * head / 2]]
    .map(([px, py]) => `${+px!.toFixed(2)},${+py!.toFixed(2)}`).join(" ");
  let out = `<line x1="${+tail.x.toFixed(2)}" y1="${+tail.y.toFixed(2)}" x2="${+bx.toFixed(2)}" y2="${+by.toFixed(2)}" stroke="black" stroke-width="1.5"/>`
    + `<polygon points="${pts}" fill="black"/>`;
  if (kind === "proband") {
    out += `<text x="${+(tail.x - 0.5).toFixed(2)}" y="${+(y + s).toFixed(2)}" text-anchor="end" font-family="sans-serif" font-size="${PROBAND_LETTER_SIZE}" font-weight="bold" fill="black">${PROBAND_LETTER}</text>`;
  }
  return out;
}
