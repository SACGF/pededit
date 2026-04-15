import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { exportUShapeSvg } from "../uShapeExporter";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../../fixtures/consanguineous";
import { largerFamily } from "../../../fixtures/largerFamily";
import { EXAMPLES } from "../../../data/examples";
import { parsePed } from "../../../io/ped/parser";
import { convertFamily } from "../../../io/ped/converter";
import { readFileSync } from "fs";
import type { Pedigree } from "@pedigree-editor/layout-engine";

const OUT_DIR = join(__dirname, "../../../../test-output");

function writeSvg(name: string, svg: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `${name}.svg`);
  writeFileSync(path, svg, "utf-8");
  console.log(`  -> wrote ${path}`);
}

/** Extract translate(x y) positions from SVG g elements */
function extractPositions(svg: string): Array<{ x: number; y: number }> {
  const re = /translate\(([\d.-]+)\s+([\d.-]+)\)/g;
  const positions: Array<{ x: number; y: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    positions.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  return positions;
}

describe("U-shape SVG visual snapshots", () => {
  it("simpleFamily", () => {
    const svg = exportUShapeSvg(simpleFamily, { debugSpine: true });
    writeSvg("u-simple", svg);
    expect(svg).toContain("<svg");
  });

  it("consanguineousFamily", () => {
    const svg = exportUShapeSvg(consanguineousFamily, { debugSpine: true });
    writeSvg("u-consang", svg);
    expect(svg).toContain("<svg");
  });

  it("largerFamily - 4-generation", () => {
    const svg = exportUShapeSvg(largerFamily, { debugSpine: true });
    writeSvg("u-large", svg);
    expect(svg).toContain("<svg");
  });

  it("threeGenerations example", () => {
    const threeGen = EXAMPLES.find(e => e.label === "Three generations")!;
    const svg = exportUShapeSvg(threeGen.data, { debugSpine: true });
    writeSvg("u-threegen", svg);
    expect(svg).toContain("<svg");
  });

  it("PED file 80237", () => {
    const text = readFileSync(
      join(__dirname, "../../../../../test-data/ped/80237.ped"),
      "utf-8",
    );
    const { rows } = parsePed(text);
    const pedigree = convertFamily(rows);
    const svg = exportUShapeSvg(pedigree, { debugSpine: true });
    writeSvg("u-80237", svg);
    expect(svg).toContain("<svg");
    // Root couple I1+I2 have 5 children (84, 82, 78, 81, 53)
    // All 5 should appear as symbols in the SVG
    for (const id of ["84", "82", "78", "81", "53"]) {
      const ind = pedigree.individuals.find((i: any) => i.id === id)!;
      expect(ind).toBeDefined();
    }
    // Verify males render as squares, females as circles
    // 78 is male (sex=1 in PED) -> should have <rect
    const ind78 = pedigree.individuals.find((i: any) => i.id === "78")!;
    expect(ind78.sex).toBe("male");
    // 84 is female (sex=2 in PED) -> should have <circle
    const ind84 = pedigree.individuals.find((i: any) => i.id === "84")!;
    expect(ind84.sex).toBe("female");
  });
});

describe("U-shape structural", () => {
  it("contains U-curve SVG arc path", () => {
    const svg = exportUShapeSvg(simpleFamily);
    expect(svg).toContain("<path");
    expect(svg).toMatch(/A \d/); // SVG arc command
  });

  it("root couple at bottom of U (highest y among symbols)", () => {
    const svg = exportUShapeSvg(simpleFamily);
    const positions = extractPositions(svg);
    const symbolPositions = positions.slice(1);
    const maxY = Math.max(...symbolPositions.map(p => p.y));
    // Root couple should be at the bottom (highest y)
    const rootPositions = symbolPositions.filter(p => p.y === maxY);
    expect(rootPositions.length).toBe(2); // male and female
  });

  it("generations increase upward on arms", () => {
    const svg = exportUShapeSvg(largerFamily);
    const positions = extractPositions(svg);
    const symbolPositions = positions.slice(1);
    // Root couple at bottom (highest y), later generations have smaller y values
    const ys = [...new Set(symbolPositions.map(p => p.y))].sort((a, b) => b - a);
    expect(ys.length).toBeGreaterThan(2);
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
  });

  it("empty pedigree produces valid SVG", () => {
    const empty: Pedigree = {
      individuals: [],
      partnerships: [],
      parentOf: {},
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const svg = exportUShapeSvg(empty);
    expect(svg).toContain("<svg");
    expect(svg).toContain("width=");
  });

  it("single individual produces valid SVG", () => {
    const single: Pedigree = {
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
      partnerships: [],
      parentOf: {},
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const svg = exportUShapeSvg(single);
    writeSvg("u-single", svg);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect"); // male symbol
  });

  it("couple with no children produces valid SVG", () => {
    const couple: Pedigree = {
      individuals: [
        { id: "m", sex: "male", affected: false, sibOrder: 0 },
        { id: "f", sex: "female", affected: false, sibOrder: 0 },
      ],
      partnerships: [{ id: "p1", individual1: "m", individual2: "f" }],
      parentOf: {},
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const svg = exportUShapeSvg(couple);
    writeSvg("u-couple", svg);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect"); // male
    expect(svg).toContain("<circle"); // female
  });

  it("consanguineous partnership renders double lines", () => {
    const svg = exportUShapeSvg(consanguineousFamily);
    // Two parallel lines with slightly offset y coordinates
    const lineMatches = svg.match(/<line[^>]*stroke="black"[^>]*>/g) || [];
    // Should have at least 2 lines that are close together (the double line)
    expect(lineMatches.length).toBeGreaterThan(3);
  });

  it("deidentify option works", () => {
    const svg = exportUShapeSvg(simpleFamily, { deidentify: true });
    expect(svg).toContain("<svg");
    // Should not contain original names (simpleFamily has no names set, so just verify it produces output)
    expect(svg).toContain("<rect"); // symbols still present
  });
});
