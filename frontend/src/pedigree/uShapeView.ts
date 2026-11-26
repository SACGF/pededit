/**
 * The editor's U-shape view (#220): the U-shape export's figure drawn live
 * in place of the chart, for looking at a wide family. It is drawn by
 * `renderUShape`, so it is exactly what "Render in U shape" exports (with
 * the person ids the export leaves out, to tell who is clicked), and it
 * can only be looked at: people are selected on it and edited on the Person
 * tab. Everything here is framework-free; `UShapeView.tsx` draws it.
 */
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { renderUShape } from "../io/svg/uShapeExporter";
import { isBranchPlaceholderId } from "./collapse";

export interface UShapeViewDrawing {
  svg: string;
  /** People drawn on the U, each counted once (copies and group symbols are not people). */
  drawn: number;
  /** Everyone in the pedigree. */
  total: number;
}

/**
 * What the view draws, or null when there is nobody to descend from (the
 * same test as the export dialog's). The key is left out: the legend is on
 * the Pedigree tab, as it is for the chart.
 */
export function uShapeViewDrawing(pedigree: Pedigree, title?: string): UShapeViewDrawing | null {
  const { svg, layout } = renderUShape(pedigree, { title: title || undefined, key: false, personIds: true });
  if (!layout || layout.maxDepth === 0) return null;
  const drawn = [...layout.nodes.keys()].filter(id => !isBranchPlaceholderId(id)).length;
  return { svg, drawn, total: pedigree.individuals.length };
}

/** Why the view cannot be drawn. The export dialog says the same. */
export const U_SHAPE_UNAVAILABLE = "The U-shape view needs a couple with descendants. This pedigree has none to bend around a U.";

/** What the U leaves out, for the banner's tooltip. */
export const U_SHAPE_OMITS =
  "The U-shape draws one founding couple, their descendants and the people who married in. " +
  "It leaves out the parents and other relatives of people who married in, third and later partners, " +
  "and families not descended from that couple.";

const EDIT_HERE = "Edit on the Person tab, or go back to the standard chart.";

/** The notices for what the U-shape view cannot do, one per thing tried. */
export const U_SHAPE_REFUSALS = {
  drag: `People cannot be moved in the U-shape view: it is laid out for you. ${EDIT_HERE}`,
  menu: `The U-shape view has no menus on the chart. Select someone and use the Person tab, or go back to the standard chart.`,
  band: "The U-shape view has no rubber band. Shift+click or Ctrl+click people to select several.",
  add: "Someone added on their own would not be drawn on the U, which draws one couple's descendants. Select a person and add relatives on the Person tab, or go back to the standard chart.",
  resetLayout: "The U-shape view is always laid out for you. Reset layout clears the positions of people dragged on the standard chart; go back to it to use it.",
  picking: "Picking people is done on the standard chart, so the U-shape view was turned off.",
} as const;
