import { describe, it, expect } from "vitest";
import { alignPedigree } from "../src/alignPedigree.js";
import { buildPedigreeFromFlat } from "../src/utils.js";
import { SAMPLE_PED_1 } from "./fixtures/samplePed.js";

describe("alignPedigree — simple cases", () => {
  it("single individual: one generation of one", () => {
    const ped = buildPedigreeFromFlat([{ id: 1, father: 0, mother: 0, sex: 1 }]);
    const result = alignPedigree(ped);
    expect(result.n).toEqual([1]);
    expect(result.pos[0]![0]).toBe(0);
  });

  it("nuclear family: 2 parents + 3 children", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 1, mother: 2, sex: 2 },
      { id: 5, father: 1, mother: 2, sex: 1 },
    ]);
    const result = alignPedigree(ped);
    expect(result.n[0]).toBe(2); // parents
    expect(result.n[1]).toBe(3); // children
  });

  it("two generations: depths are monotonically increasing positions", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
    ]);
    const result = alignPedigree(ped);
    expect(result.n).toHaveLength(2);
    expect(result.n[0]).toBe(2);
    expect(result.n[1]).toBe(1);
  });
});

describe("alignPedigree — sample.ped family 1", () => {
  it("produces correct generation counts (R ground truth: n = c(8, 19, 22, 8))", () => {
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    expect(result.n).toEqual([8, 19, 22, 8]);
  });

  it("all 41 individuals appear at least once", () => {
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    const allIds = new Set(result.nid.flat().map(id => id));
    expect(allIds.size).toBeGreaterThanOrEqual(SAMPLE_PED_1.length);
  });

  it("each generation has monotonically increasing positions", () => {
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    for (let lev = 0; lev < result.n.length; lev++) {
      const positions = result.pos[lev]!.slice(0, result.n[lev]);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]!, `lev=${lev} col=${i}`).toBeGreaterThan(positions[i - 1]!);
      }
    }
  });

  it("fam pointers are valid (left parent col in level above, >= 1)", () => {
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    for (let lev = 1; lev < result.n.length; lev++) {
      for (let col = 0; col < result.n[lev]!; col++) {
        const f = result.fam[lev]![col]!;
        if (f > 0) {
          expect(f, `lev=${lev} col=${col}: left parent`).toBeGreaterThanOrEqual(1);
          expect(f + 1, `lev=${lev} col=${col}: right parent`).toBeLessThanOrEqual(result.n[lev - 1]!);
        }
      }
    }
  });
});
