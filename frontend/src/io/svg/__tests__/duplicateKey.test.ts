import { describe, it, expect } from "vitest";
import { EXAMPLES } from "../../../data/examples";
import { exportSvg } from "../svgExporter";
import { exportUShapeSvg, layoutUShape } from "../uShapeExporter";
import { layoutToFlow } from "../../../pedigree/layoutToFlow";
import { drawsDuplicates } from "../../../pedigree/duplicates";
import { DUPLICATE_LEGEND_LABEL } from "../../../pedigree/constants";
import { drawnPedigree } from "../../../pedigree/collapse";

// #124: the key explains the dashed arc exactly when the drawing has one.
describe("duplicate key row", () => {
  const withDup = EXAMPLES.filter(e => layoutToFlow(e.data).duplicateEdges.length > 0);

  it("some examples draw someone twice, some do not", () => {
    expect(withDup.length).toBeGreaterThan(0);
    expect(withDup.length).toBeLessThan(EXAMPLES.length);
  });

  for (const ex of EXAMPLES) {
    it(`${ex.label}: SVG and U-shape keys follow their own drawings`, () => {
      const dup = layoutToFlow(ex.data).duplicateEdges.length > 0;
      expect(drawsDuplicates(ex.data)).toBe(dup);
      expect(exportSvg(ex.data).includes(DUPLICATE_LEGEND_LABEL)).toBe(dup);
      const u = layoutUShape(drawnPedigree(ex.data));
      if (!u) return;
      const svg = exportUShapeSvg(ex.data);
      expect(svg.includes(DUPLICATE_LEGEND_LABEL)).toBe(u.duplicates.length > 0);
    });
  }
});
