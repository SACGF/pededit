import { describe, it, expect } from "vitest";
import { alignPedigree } from "../src/alignPedigree.js";
import { buildPedigreeFromFlat } from "../src/utils.js";

describe("children centered under parents (not shifted left)", () => {
  it("proband with sibling: children should be under proband+partner, not sibling+proband", () => {
    // Gen 0: grandpa(1) + grandma(2)
    // Gen 1: sibling(3), proband(4), partner(5, no parents)
    // Gen 2: child1(6), child2(7)  — parents are 4+5
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 1, mother: 2, sex: 1 },
      { id: 5, father: 0, mother: 0, sex: 2 },
      { id: 6, father: 4, mother: 5, sex: 1 },
      { id: 7, father: 4, mother: 5, sex: 2 },
    ]);

    const result = alignPedigree(ped);

    // Log the layout for inspection
    for (let lev = 0; lev < result.n.length; lev++) {
      const ni = result.n[lev]!;
      console.log(`Level ${lev}: nid=${JSON.stringify(result.nid[lev]!.slice(0,ni))} pos=${JSON.stringify(result.pos[lev]!.slice(0,ni).map(p=>+p.toFixed(2)))} fam=${JSON.stringify(result.fam[lev]!.slice(0,ni))}`);
    }

    expect(result.n).toHaveLength(3); // 3 generations

    // Find slots of proband(4) and partner(5) in gen1
    const gen1 = result.nid[1]!;
    const probandSlot  = gen1.findIndex(id => id === 4);
    const partnerSlot  = gen1.findIndex(id => id === 5);
    expect(probandSlot).toBeGreaterThanOrEqual(0);
    expect(partnerSlot).toBeGreaterThanOrEqual(0);

    // Couple fam value = probandSlot + 1 (1-based)
    const expectedFam = probandSlot + 1;

    // All children (6, 7) should have fam pointing to proband+partner
    const gen2 = result.nid[2]!;
    const gen2fam = result.fam[2]!;
    for (let slot = 0; slot < result.n[2]!; slot++) {
      const id = gen2[slot];
      if (id === 6 || id === 7) {
        expect(gen2fam[slot], `child ${id} fam`).toBe(expectedFam);
      }
    }

    // Children should be centered under proband+partner
    const probandPos = result.pos[1]![probandSlot]!;
    const partnerPos = result.pos[1]![partnerSlot]!;
    const parentMidX = (probandPos + partnerPos) / 2;

    const childPositions = [6, 7].map(id => {
      const slot = gen2.findIndex(s => s === id);
      return result.pos[2]![slot]!;
    });
    const childMidX = childPositions.reduce((a, b) => a + b, 0) / childPositions.length;

    expect(childMidX).toBeCloseTo(parentMidX, 1);
  });
});
