import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Individual, Tag } from "@pedigree-editor/layout-engine";
import { SymbolShape } from "../nodes/symbols";
import type { Sector } from "../tags";

const SIZE = 40;
const tag = (id: string, color: string): Tag => ({ id, label: id, color, style: "quadrant" });
const ALL_FOUR: Sector[] = [
  { tag: tag("a", "#d62728"), start: 270, end: 360 },
  { tag: tag("b", "#1f77b4"), start: 0, end: 90 },
  { tag: tag("c", "#2ca02c"), start: 90, end: 180 },
  { tag: tag("d", "#ff7f0e"), start: 180, end: 270 },
];

function render(ind: Partial<Individual>, sectors: Sector[]): string {
  const individual: Individual = { id: "i1", sex: "male", affected: false, sibOrder: 0, ...ind };
  return renderToStaticMarkup(<svg><SymbolShape individual={individual} size={SIZE} sectors={sectors} clipId="c" /></svg>);
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
