import { describe, it, expect } from "vitest";
import { formatCoefficient, degreeOfRelationship, relatednessOf } from "../relatedness";
import type { Pedigree } from "@pedigree-editor/layout-engine";

describe("formatCoefficient (#32)", () => {
  it("writes simple coefficients as a fraction with the decimal", () => {
    expect(formatCoefficient(0)).toBe("0");
    expect(formatCoefficient(1 / 2)).toBe("1/2 (0.5)");
    expect(formatCoefficient(1 / 4)).toBe("1/4 (0.25)");
    expect(formatCoefficient(1 / 16)).toBe("1/16 (0.0625)");
    expect(formatCoefficient(3 / 16)).toBe("3/16 (0.1875)");
    expect(formatCoefficient(5 / 64)).toBe("5/64 (0.07813)");
    expect(formatCoefficient(1 / 256)).toBe("1/256 (0.003906)");
    expect(formatCoefficient(1)).toBe("1");
  });

  it("falls back to a decimal when the fraction would be unreadable", () => {
    expect(formatCoefficient(1 / 512)).toBe("0.001953");
    expect(formatCoefficient(0.21716308594)).toBe("0.2172");
  });

  it("treats float noise and nonsense as zero", () => {
    expect(formatCoefficient(1e-15)).toBe("0");
    expect(formatCoefficient(-0.25)).toBe("0");
    expect(formatCoefficient(NaN)).toBe("0");
  });
});

describe("degreeOfRelationship (#32)", () => {
  it("names the degree a coefficient lands on", () => {
    expect(degreeOfRelationship(0)).toBeNull();
    expect(degreeOfRelationship(1 / 2)).toBe("genetically identical");
    expect(degreeOfRelationship(1 / 4)).toBe("equivalent to 1st-degree relatives");
    expect(degreeOfRelationship(1 / 8)).toBe("equivalent to 2nd-degree relatives");
    expect(degreeOfRelationship(1 / 16)).toBe("equivalent to 3rd-degree relatives");
    expect(degreeOfRelationship(1 / 32)).toBe("equivalent to 4th-degree relatives");
    expect(degreeOfRelationship(1 / 2 ** 12)).toBe("equivalent to 11th-degree relatives");
    expect(degreeOfRelationship(1 / 2 ** 22)).toBe("equivalent to 21st-degree relatives");
  });

  it("says so when a coefficient falls between two degrees", () => {
    expect(degreeOfRelationship(3 / 16)).toBe("between 1st- and 2nd-degree relatives"); // three-quarter siblings
    expect(degreeOfRelationship(3 / 32)).toBe("between 2nd- and 3rd-degree relatives");
    expect(degreeOfRelationship(5 / 16)).toBe("closer than 1st-degree relatives"); // inbred parent and child
  });
});

/** gf = gm → son, dau; son = wife → a; hus = dau → b; a = b → kid; a = other (unrelated). */
function pedigree(): Pedigree {
  const person = (id: string, sex: "male" | "female") => ({ id, sex, affected: false, sibOrder: 0 });
  return {
    individuals: [
      person("gf", "male"), person("gm", "female"), person("son", "male"), person("dau", "female"),
      person("wife", "female"), person("hus", "male"), person("a", "male"), person("b", "female"),
      person("kid", "female"), person("other", "female"),
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm" },
      { id: "sw", individual1: "son", individual2: "wife" },
      { id: "hd", individual1: "hus", individual2: "dau" },
      { id: "ab", individual1: "a", individual2: "b", consanguineous: true },
      { id: "ao", individual1: "a", individual2: "other" },
    ],
    parentOf: { g: ["son", "dau"], sw: ["a"], hd: ["b"], ab: ["kid"], ao: [] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

describe("relatednessOf (#32)", () => {
  it("gives F and one entry per partnership, from either partner's side", () => {
    const p = pedigree();
    expect(relatednessOf(p, "kid")).toMatchObject({ inbreeding: 1 / 16, couples: [] });
    expect(relatednessOf(p, "a")).toMatchObject({
      inbreeding: 0,
      couples: [
        { partnershipId: "ab", partnerId: "b", kinship: 1 / 16 },
        { partnershipId: "ao", partnerId: "other", kinship: 0 },
      ],
    });
    expect(relatednessOf(p, "b").couples).toMatchObject([{ partnershipId: "ab", partnerId: "a", kinship: 1 / 16 }]);
    expect(relatednessOf(p, "gf")).toMatchObject({ inbreeding: 0, couples: [{ partnershipId: "g", partnerId: "gm", kinship: 0 }] });
  });

  it("follows adoption: an adopted-in cousin is not a blood relative", () => {
    const p = pedigree();
    p.individuals.find(i => i.id === "b")!.adopted = "in";
    expect(relatednessOf(p, "a").couples[0]!.kinship).toBe(0);
    expect(relatednessOf(p, "kid").inbreeding).toBe(0);
  });

  it("gives the X-linked values beside the autosomal ones (#87)", () => {
    const p = pedigree();
    // a's father is the grandparents' son, so no X reaches a from them.
    expect(relatednessOf(p, "a").couples[0]).toMatchObject({ kinship: 1 / 16, kinshipX: 0 });
    expect(relatednessOf(p, "kid")).toMatchObject({ inbreeding: 1 / 16, inbreedingX: 0 });
    expect(relatednessOf(p, "a").inbreedingX).toBeNaN(); // a male
    // Through two sisters instead: a's mother and b's mother are sisters.
    // (A fresh object, since the coefficients are cached per pedigree object.)
    const q = pedigree();
    q.individuals.find(i => i.id === "son")!.sex = "female";
    q.individuals.find(i => i.id === "wife")!.sex = "male";
    expect(relatednessOf(q, "a").couples[0]).toMatchObject({ kinship: 1 / 16, kinshipX: 3 / 16 });
    expect(relatednessOf(q, "kid").inbreedingX).toBe(3 / 16);
  });

  it("someone not in the pedigree has nothing", () => {
    expect(relatednessOf(pedigree(), "nobody")).toEqual({ inbreeding: 0, inbreedingX: 0, couples: [] });
  });
});
