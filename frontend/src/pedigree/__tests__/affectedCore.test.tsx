import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Individual, Tag } from "@pedigree-editor/layout-engine";
import { SymbolShape, standaloneGlyph } from "../chart/symbols";
import type { Sector } from "../tags";

const SIZE = 40;
const tag = (id: string, color: string): Tag => ({ id, label: id, color, style: "quadrant" });
const sector = (id: string, color: string, start: number, end: number): Sector => ({ tag: tag(id, color), start, end, color, fill: "solid" });
const ALL_FOUR: Sector[] = [
  sector("a", "#d62728", 270, 360),
  sector("b", "#1f77b4", 0, 90),
  sector("c", "#2ca02c", 90, 180),
  sector("d", "#ff7f0e", 180, 270),
];

function render(ind: Partial<Individual>, sectors: Sector[]): string {
  const individual: Individual = { id: "i1", sex: "male", affected: false, sibOrder: 0, ...ind };
  // The NSGC 2008 paint (`symbolPaint`): black fill, and the black centre over sectors.
  const paint = { sectors, base: individual.affected ? "black" as const : "white" as const, core: individual.affected && sectors.length > 0, dot: false };
  return renderToStaticMarkup(<svg><SymbolShape glyph={{ ...standaloneGlyph(individual), paint: paint }} size={SIZE} clipId="c" /></svg>);
}

describe("affected core on tagged symbols", () => {
  it("an affected person with all four quarters tagged still shows black", () => {
    for (const sex of ["male", "female", "unknown"] as const) {
      const svg = render({ sex, affected: true }, ALL_FOUR);
      expect(svg).toContain("scale(0.55)");
      // the core paints black after the sectors
      expect(svg.lastIndexOf('fill="black"')).toBeGreaterThan(svg.indexOf("#ff7f0e"));
    }
  });

  it("is not drawn when unaffected or untagged", () => {
    expect(render({ affected: false }, ALL_FOUR)).not.toContain("scale(0.55)");
    expect(render({ affected: true }, [])).not.toContain("scale(0.55)");
  });
});
