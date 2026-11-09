import type { Adoption } from "@pedigree-editor/layout-engine";
import type { Segment } from "./sibshipPath";

/**
 * Adoption (NSGC 2008, Bennett et al.): square brackets round the symbol.
 * Adopted in (into the family shown) also draws the line from the adoptive
 * parents dashed; adopted out keeps a solid line to the biological parents.
 * Geometry shared by the canvas (symbols.tsx), svgExporter and uShapeExporter.
 */

export const ADOPTION_OPTIONS: { value: Adoption; label: string }[] = [
  { value: "in",  label: "Adopted in" },
  { value: "out", label: "Adopted out" },
];

export function adoptionLabel(status: Adoption): string {
  return ADOPTION_OPTIONS.find(o => o.value === status)?.label ?? status;
}

/** Legend wording, which also explains the line style. */
export function adoptionLegendLabel(status: Adoption): string {
  return status === "in" ? "Adopted in (dashed line to adoptive parents)" : "Adopted out";
}

/** Horizontal gap (px) between the symbol box and each bracket. */
export const ADOPTION_BRACKET_GAP = 4;
/** Length (px) of each bracket's horizontal feet. */
export const ADOPTION_BRACKET_FOOT = 5;
/** How far (px) the brackets extend above and below the symbol box. */
export const ADOPTION_BRACKET_OVERHANG = 2;
/** Dash pattern of the line from the adoptive parents to an adopted-in child. */
export const ADOPTION_DASH = "5 3";

/**
 * The six segments of the two brackets round a size × size symbol box whose
 * top-left corner is (ox, oy): for each side a vertical and two feet
 * pointing in towards the symbol.
 */
export function adoptionBracketSegments(size: number, ox = 0, oy = 0): Segment[] {
  const top = oy - ADOPTION_BRACKET_OVERHANG, bottom = oy + size + ADOPTION_BRACKET_OVERHANG;
  const lx = ox - ADOPTION_BRACKET_GAP, rx = ox + size + ADOPTION_BRACKET_GAP;
  const f = ADOPTION_BRACKET_FOOT;
  return [
    [lx, top, lx, bottom], [lx, top, lx + f, top], [lx, bottom, lx + f, bottom],
    [rx, top, rx, bottom], [rx, top, rx - f, top], [rx, bottom, rx - f, bottom],
  ];
}

/** How wide the brackets reach beyond the symbol box on each side. */
export const ADOPTION_BRACKET_EXTENT = ADOPTION_BRACKET_GAP;
