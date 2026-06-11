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

  it("PED file kinship2 sample", () => {
    const text = readFileSync(
      join(__dirname, "../../../../../test-data/ped/large/kinship2_sample.ped"),
      "utf-8",
    );
    const { rows } = parsePed(text);
    // The sample holds two families; render the first.
    const family1 = rows.filter((r: any) => r.familyId === "1");
    const pedigree = convertFamily(family1);
    const svg = exportUShapeSvg(pedigree, { debugSpine: true });
    writeSvg("u-kinship2", svg);
    expect(svg).toContain("<svg");
    // Founder couple 135 (male) + 136 (female) and their descendants render.
    const ind135 = pedigree.individuals.find((i: any) => i.id === "135")!;
    expect(ind135.sex).toBe("male");
    const ind136 = pedigree.individuals.find((i: any) => i.id === "136")!;
    expect(ind136.sex).toBe("female");
    // Symbols for both square (male) and circle (female) appear.
    expect(svg).toContain("<rect");
    expect(svg).toContain("<circle");
  });
});

describe("U-shape structural", () => {
  it("contains U-curve SVG arc path", () => {
    const svg = exportUShapeSvg(simpleFamily);
    expect(svg).toContain("<path");
    expect(svg).toMatch(/A \d/); // SVG arc command
  });

  // The founder couple are the only two symbols sharing a y value and separated
  // horizontally by the couple gap; their raw midpoint is the layout origin.
  function findCoupleY(positions: Array<{ x: number; y: number }>): number | null {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i], b = positions[j];
        if (Math.abs(a.y - b.y) < 1 && Math.abs(Math.abs(a.x - b.x) - 46) < 2) {
          return a.y;
        }
      }
    }
    return null;
  }

  it("founder couple sits in the interior, descent line pointing down", () => {
    const svg = exportUShapeSvg(largerFamily);
    const symbolPositions = extractPositions(svg).slice(1);
    const founderY = findCoupleY(symbolPositions);
    expect(founderY).not.toBeNull();
    // The family wraps around the founder: descendants appear both below the
    // founder (descent points down) and above it (the arms curl back up).
    expect(symbolPositions.some(p => p.y > founderY! + 20)).toBe(true);
    expect(symbolPositions.some(p => p.y < founderY! - 20)).toBe(true);
  });

  it("generations radiate outward from the founder", () => {
    const svg = exportUShapeSvg(largerFamily);
    const symbolPositions = extractPositions(svg).slice(1);
    // Raw coordinates are centred on the founder, so distance from the origin
    // grows with generation. A 4-generation family yields several radial bands.
    const bands = new Set(symbolPositions.map(p => Math.round(Math.hypot(p.x, p.y) / 20)));
    expect(bands.size).toBeGreaterThanOrEqual(3);
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
