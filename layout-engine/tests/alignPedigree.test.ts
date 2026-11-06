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
  it("matches kinship2 1.9.6.2 align.pedigree() slot for slot", () => {
    // R output (data(sample.ped), ped==1). R omits individual 113, who has no
    // relatives in the file; we append such people to the end of their row.
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    const rows = result.nid.map((row, lev) =>
      row.map((nid, s) => {
        const id = ped.individuals[nid - 1]!.id;
        return `${id}${result.spouse[lev]![s] ? "~" : ""}/f${result.fam[lev]![s]}`;
      }).join(" "),
    );
    expect(rows).toEqual([
      "105~/f0 106/f0 107~/f0 108/f0 135~/f0 136/f0 113/f0",
      "101~/f0 102/f0 115/f1 117~/f0 116/f1 118/f1 119~/f1 120/f3 103~/f5 104/f0 137~/f0 138/f5",
      "109~/f1 110/f0 129/f4 130/f7 131/f7 132/f7 133/f7 134/f7 110/f9 111/f9 112~/f9 118/f0 114~/f9 115/f0 139/f11 140/f11 141/f11",
      "121/f1 122/f1 123/f1 124/f1 125/f11 126/f11 127/f13 128/f13",
    ]);
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
