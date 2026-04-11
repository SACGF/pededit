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

  it("align=true equalises cross-generational couple depths", () => {
    // For any couple (fi, mi) that are both parents of some child,
    // with align=true their depths must be equal.
    const input = buildLayoutInput(SAMPLE_PED_1);
    const d = kindepth(input, true);
    for (let i = 1; i <= input.n; i++) {
      const fi = input.findex[i]!;
      const mi = input.mindex[i]!;
      if (fi > 0 && mi > 0) {
        expect(d[fi], `father depth for child ${i}`).toBe(d[mi]);
      }
    }
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
