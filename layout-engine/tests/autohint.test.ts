import { describe, it, expect } from "vitest";
import { autohint } from "../src/autohint.js";
import { buildPedigreeFromFlat } from "../src/utils.js";
import { pedigreeToLayoutInput } from "../src/alignPedigree.js";
import type { FlatPedRow } from "../src/utils.js";

function hintsFor(rows: FlatPedRow[]) {
  const pedigree = buildPedigreeFromFlat(rows);
  const input = pedigreeToLayoutInput(pedigree);
  return autohint(input, pedigree);
}

function spouseRows(spouse: Int32Array | null): number[][] {
  if (!spouse) return [];
  const out: number[][] = [];
  for (let r = 0; r < spouse.length / 3; r++) out.push([spouse[r * 3]!, spouse[r * 3 + 1]!, spouse[r * 3 + 2]!]);
  return out;
}

// The spouse-hint behaviour mirrors R kinship2 autohint(): hints are only
// produced for people who would otherwise be drawn twice. Expected values
// below were taken from kinship2 1.9.6.2.

describe("autohint spouse hints", () => {
  it("returns null when no couples exist (single individual)", () => {
    const hints = hintsFor([{ id: 1, father: 0, mother: 0, sex: 1 }]);
    expect(hints.spouse).toBeNull();
  });

  it("returns null for a nuclear family (nobody is duplicated)", () => {
    const hints = hintsFor([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
    ]);
    expect(hints.spouse).toBeNull();
    expect(Array.from(hints.order).slice(1)).toEqual([1, 2, 1]);
  });

  it("returns null for a man with three wives (one marriage run, no duplicates)", () => {
    const hints = hintsFor([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 0, mother: 0, sex: 2 },
      { id: 4, father: 0, mother: 0, sex: 2 },
      { id: 5, father: 1, mother: 2, sex: 1 },
      { id: 6, father: 1, mother: 3, sex: 2 },
      { id: 7, father: 1, mother: 4, sex: 1 },
    ]);
    expect(hints.spouse).toBeNull();
  });

  it("partner chain F-M-F-M: hints merge the two copies of the shared woman (R: [5,7,0],[2,5,0])", () => {
    // 62(F) + 63(M) → 64, 65;  63(M) + 66(F) → 67;  69(M) + 66(F) → 70, 71
    const hints = hintsFor([
      { id: 62, father: 0, mother: 0, sex: 2 },
      { id: 63, father: 0, mother: 0, sex: 1 },
      { id: 64, father: 63, mother: 62, sex: 1 },
      { id: 65, father: 63, mother: 62, sex: 2 },
      { id: 66, father: 0, mother: 0, sex: 2 },
      { id: 67, father: 63, mother: 66, sex: 1 },
      { id: 69, father: 0, mother: 0, sex: 1 },
      { id: 70, father: 69, mother: 66, sex: 2 },
      { id: 71, father: 69, mother: 66, sex: 2 },
    ]);
    // 1-based indices: 66 → 5, 69 → 7, 63 → 2
    expect(spouseRows(hints.spouse)).toEqual([[5, 7, 0], [2, 5, 0]]);
  });

  it("duplicate child with parents: moved to the edge of the sibship nearest the spouse (R order 1 2 1 2 3 1 2 ...)", () => {
    // Two founder couples; a son of the first marries a daughter of the second.
    // 1+2 → 3, 4, 5 (3 is the middle child); 6+7 → 8, 9; 4(M) + 8(F) → 10
    const hints = hintsFor([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 1, mother: 2, sex: 1 },
      { id: 5, father: 1, mother: 2, sex: 2 },
      { id: 6, father: 0, mother: 0, sex: 1 },
      { id: 7, father: 0, mother: 0, sex: 2 },
      { id: 8, father: 6, mother: 7, sex: 2 },
      { id: 9, father: 6, mother: 7, sex: 1 },
      { id: 10, father: 4, mother: 8, sex: 1 },
    ]);
    const order = Array.from(hints.order).slice(1);
    // 4 is shifted to the right end of its sibship (3, 5, 4) and 8 to the left of hers (8, 9)
    expect(order.slice(2, 5)).toEqual([1, 3, 2]);
    expect(order.slice(7, 9)).toEqual([1, 2]);
    expect(spouseRows(hints.spouse)).toHaveLength(1);
    const [left, right] = spouseRows(hints.spouse)[0]!;
    expect(new Set([left, right])).toEqual(new Set([4, 8]));
  });
});
