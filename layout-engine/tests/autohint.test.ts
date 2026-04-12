import { describe, it, expect } from "vitest";
import { autohint } from "../src/autohint.js";
import { buildPedigreeFromFlat } from "../src/utils.js";
import { pedigreeToLayoutInput } from "../src/alignPedigree.js";

describe("autohint spouse hints", () => {
  it("returns null when no couples exist (single individual)", () => {
    const pedigree = buildPedigreeFromFlat([{ id: 1, father: 0, mother: 0, sex: 1 }]);
    const input = pedigreeToLayoutInput(pedigree);
    const hints = autohint(input, pedigree);
    expect(hints.spouse).toBeNull();
  });

  it("returns anchor=0 for founder couple (both have no parents)", () => {
    // Nuclear family: dad(1) + mom(2) → child(3). Both parents are founders.
    const pedigree = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
    ]);
    const input = pedigreeToLayoutInput(pedigree);
    const hints = autohint(input, pedigree);
    expect(hints.spouse).not.toBeNull();
    // One couple: [dad_idx, mom_idx, anchor]
    expect(hints.spouse!.length).toBe(3);
    // Both founders → anchor = 0 (no preference)
    expect(hints.spouse![2]).toBe(0);
  });

  it("returns anchor=1 (male anchor) when dad has parents, mom is founder", () => {
    // grandpa(1) + grandma(2) → dad(3) [male, has parents]
    // mom(4) is a founder [female, no parents]
    // dad(3) + mom(4) → child(5)
    const pedigree = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 }, // grandpa
      { id: 2, father: 0, mother: 0, sex: 2 }, // grandma
      { id: 3, father: 1, mother: 2, sex: 1 }, // dad — has parents
      { id: 4, father: 0, mother: 0, sex: 2 }, // mom — founder
      { id: 5, father: 3, mother: 4, sex: 1 }, // child
    ]);
    const input = pedigreeToLayoutInput(pedigree);
    const hints = autohint(input, pedigree);
    expect(hints.spouse).not.toBeNull();

    // Find the couple where the male (d) has parents but the female (m) does not
    const spouseRows = hints.spouse!.length / 3;
    let foundAnchor: number | null = null;
    for (let r = 0; r < spouseRows; r++) {
      const d = hints.spouse![r * 3]!;
      const m = hints.spouse![r * 3 + 1]!;
      if ((input.findex[d]! > 0 || input.mindex[d]! > 0) &&
          input.findex[m]! === 0 && input.mindex[m]! === 0) {
        foundAnchor = hints.spouse![r * 3 + 2]!;
      }
    }
    expect(foundAnchor).toBe(1);
  });

  it("returns anchor=2 (female anchor) when mom has parents, dad is founder", () => {
    // grandpa(1) + grandma(2) → mom(3) [female, has parents]
    // dad(4) is a founder [male, no parents]
    // dad(4) + mom(3) → child(5)
    const pedigree = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 }, // grandpa
      { id: 2, father: 0, mother: 0, sex: 2 }, // grandma
      { id: 3, father: 1, mother: 2, sex: 2 }, // mom — has parents
      { id: 4, father: 0, mother: 0, sex: 1 }, // dad — founder
      { id: 5, father: 4, mother: 3, sex: 1 }, // child
    ]);
    const input = pedigreeToLayoutInput(pedigree);
    const hints = autohint(input, pedigree);
    expect(hints.spouse).not.toBeNull();

    // Find the couple where the female (m) has parents but the male (d) does not
    const spouseRows = hints.spouse!.length / 3;
    let foundAnchor: number | null = null;
    for (let r = 0; r < spouseRows; r++) {
      const d = hints.spouse![r * 3]!;
      const m = hints.spouse![r * 3 + 1]!;
      if (input.findex[d]! === 0 && input.mindex[d]! === 0 &&
          (input.findex[m]! > 0 || input.mindex[m]! > 0)) {
        foundAnchor = hints.spouse![r * 3 + 2]!;
      }
    }
    expect(foundAnchor).toBe(2);
  });

  it("returns anchor=0 for consanguineous couple (both have parents)", () => {
    // grandpa(1) + grandma(2) → son(3), daughter(4)
    // son(3) + daughter(4) → child(5)  [siblings mating — both have parents]
    const pedigree = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 }, // grandpa
      { id: 2, father: 0, mother: 0, sex: 2 }, // grandma
      { id: 3, father: 1, mother: 2, sex: 1 }, // son — has parents
      { id: 4, father: 1, mother: 2, sex: 2 }, // daughter — has parents
      { id: 5, father: 3, mother: 4, sex: 1 }, // child
    ]);
    const input = pedigreeToLayoutInput(pedigree);
    const hints = autohint(input, pedigree);
    expect(hints.spouse).not.toBeNull();

    // Find the couple where both partners have parents
    const spouseRows = hints.spouse!.length / 3;
    let sawConsangCouple = false;
    for (let r = 0; r < spouseRows; r++) {
      const d = hints.spouse![r * 3]!;
      const m = hints.spouse![r * 3 + 1]!;
      if ((input.findex[d]! > 0 || input.mindex[d]! > 0) &&
          (input.findex[m]! > 0 || input.mindex[m]! > 0)) {
        expect(hints.spouse![r * 3 + 2]).toBe(0);
        sawConsangCouple = true;
      }
    }
    expect(sawConsangCouple).toBe(true);
  });
});
