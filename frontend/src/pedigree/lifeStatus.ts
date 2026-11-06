import type { LifeStatus } from "@pedigree-editor/layout-engine";

/**
 * Pregnancy and pregnancy-loss symbols (NSGC 2008, Bennett et al.):
 *
 *   pregnancy    sex symbol with "P" inside
 *   miscarriage  small triangle (spontaneous abortion)
 *   termination  small triangle with a diagonal slash
 *   stillbirth   sex symbol with a slash and "SB" below
 *   ectopic      small triangle with "ECT" below
 *
 * The geometry here is shared by the React canvas (symbols.tsx) and the SVG
 * exporter so the two renderings match. Coordinates are relative to a
 * size × size box whose top-left corner is (ox, oy).
 */

export const LIFE_STATUS_OPTIONS: { value: LifeStatus; label: string }[] = [
  { value: "pregnancy",   label: "Pregnancy" },
  { value: "miscarriage", label: "Miscarriage" },
  { value: "termination", label: "Termination" },
  { value: "stillbirth",  label: "Stillbirth" },
  { value: "ectopic",     label: "Ectopic pregnancy" },
];

export function lifeStatusLabel(status: LifeStatus): string {
  return LIFE_STATUS_OPTIONS.find(o => o.value === status)?.label ?? status;
}

/** True for the statuses drawn as a small triangle regardless of sex. */
export function usesLossTriangle(status: LifeStatus | undefined): boolean {
  return status === "miscarriage" || status === "termination" || status === "ectopic";
}

/** Short text drawn under the symbol ("SB", "ECT"), or undefined for none. */
export function lifeStatusCaption(status: LifeStatus | undefined): string | undefined {
  if (status === "stillbirth") return "SB";
  if (status === "ectopic")    return "ECT";
  return undefined;
}

/** Font size (px) of the caption under the symbol. */
export const CAPTION_FONT_SIZE = 9;

/**
 * Vertical space the caption takes below the symbol. Anything drawn under the
 * symbol (tag annotation row, name, DOB) moves down by this much.
 */
export const CAPTION_ROW_HEIGHT = CAPTION_FONT_SIZE + 2;

/** Height of the caption row for this status, 0 when there is no caption. */
export function captionRowHeight(status: LifeStatus | undefined): number {
  return lifeStatusCaption(status) ? CAPTION_ROW_HEIGHT : 0;
}

/** Baseline of the caption, measured from the top of the symbol box. */
export function captionBaselineY(size: number): number {
  return size + CAPTION_FONT_SIZE + 1;
}

/** Inset of the loss triangle from the symbol box, so it reads as "small". */
function triangleInset(size: number): number {
  return size * 0.2;
}

/** Points attribute for the loss triangle (apex up). */
export function lossTrianglePoints(size: number, ox = 0, oy = 0): string {
  const inset = triangleInset(size);
  const cx = ox + size / 2;
  const top = oy + inset, bottom = oy + size - inset;
  return `${cx},${top} ${ox + size - inset},${bottom} ${ox + inset},${bottom}`;
}

/** End points of the termination slash through the loss triangle. */
export function lossSlashEnds(size: number, ox = 0, oy = 0): { x1: number; y1: number; x2: number; y2: number } {
  const inset = triangleInset(size);
  const overhang = 3;
  return {
    x1: ox + inset - overhang,        y1: oy + inset - overhang,
    x2: ox + size - inset + overhang, y2: oy + size - inset + overhang,
  };
}

/** Font size (px) of the "P" drawn inside a pregnancy symbol. */
export function pregnancyFontSize(size: number): number {
  return size * 0.5;
}

/** Baseline of the "P" so it sits centred inside the symbol. */
export function pregnancyBaselineY(size: number, oy = 0): number {
  return oy + size / 2 + pregnancyFontSize(size) * 0.35;
}
