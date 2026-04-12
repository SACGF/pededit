import { describe, it, expect } from "vitest";
import { kindepth } from "../src/kindepth.js";
import { buildLayoutInput } from "../src/utils.js";
import { SAMPLE_PED_1 } from "./fixtures/samplePed.js";

describe("kindepth", () => {
  it("single founder has depth 0", () => {
    const input = buildLayoutInput([{ id: 1, father: 0, mother: 0, sex: 1 }]);
    const d = kindepth(input);
    expect(d[1]).toBe(0);
  });

  it("child of two founders has depth 1", () => {
    const input = buildLayoutInput([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
    ]);
    const d = kindepth(input);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(1);
  });

  it("three generations has depths 0, 1, 2", () => {
    // grandfather(1) + grandmother(2) → father(3) + mother(4) → child(5)
    const input = buildLayoutInput([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 0, mother: 0, sex: 2 },
      { id: 5, father: 3, mother: 4, sex: 1 },
    ]);
    const d = kindepth(input);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(1);
    expect(d[4]).toBe(0);
    expect(d[5]).toBe(2);
  });

  it("align=true equalises depths of a simple marry-in couple", () => {
    // Individual 4 is a solitary marry-in with no parents; align should lift it
    // to match the depth of its spouse (individual 3, child of 1+2 at depth 1).
    // Note: SAMPLE_PED_1 has cross-generational couples (e.g. 12×18) that R itself
    // cannot equalise ("beyond this program"), so we use a simple 5-person pedigree.
    const input = buildLayoutInput([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 0, mother: 0, sex: 2 },
      { id: 5, father: 3, mother: 4, sex: 1 },
    ]);
    const d = kindepth(input, true);
    expect(d[3]).toBe(d[4]);
  });

  it("align=true preserves at least one individual at depth 0", () => {
    const input = buildLayoutInput(SAMPLE_PED_1);
    const d = kindepth(input, true);
    let hasZero = false;
    for (let i = 1; i <= input.n; i++) {
      if (d[i] === 0) { hasZero = true; break; }
    }
    expect(hasZero).toBe(true);
  });
});

describe("kindepth force fallback", () => {
  it("does not throw on a cross-generational pedigree via try/catch pattern", () => {
    // Cross-generational: grandpa married to granddaughter.
    // This creates a depth contradiction in some align passes.
    // The try/catch pattern should always produce valid depths.
    const input = buildLayoutInput([
      { id: 1, father: 0, mother: 0, sex: 1 }, // grandpa
      { id: 2, father: 0, mother: 0, sex: 2 }, // grandma
      { id: 3, father: 1, mother: 2, sex: 2 }, // daughter
      { id: 4, father: 0, mother: 0, sex: 1 }, // marry-in male
      { id: 5, father: 4, mother: 3, sex: 2 }, // granddaughter
      // grandpa(1) also fathers a child with granddaughter(5)
      { id: 6, father: 1, mother: 5, sex: 1 },
    ]);
    expect(() => {
      let depth: Int32Array;
      try {
        depth = kindepth(input, true);
      } catch {
        depth = kindepth(input, false);
      }
      // All depths must be non-negative
      for (let i = 1; i <= input.n; i++) {
        expect(depth[i]).toBeGreaterThanOrEqual(0);
      }
    }).not.toThrow();
  });
});
