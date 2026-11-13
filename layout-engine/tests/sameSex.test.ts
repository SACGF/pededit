import { describe, it, expect } from "vitest";
import { alignPedigreeByFamily, kinshipCoefficients } from "../src/index.js";
import type { Pedigree, Individual, LayoutResult } from "../src/index.js";

/**
 * Same-sex couples (#105, NSGC 2022 Fig. 5). Sex is biological sex, so two
 * partners of the same sex have no genetic children together: a child is
 * one partner's and a donor's (#45), the other partner a social parent.
 * The layout must still draw the couple line, and kinship follow the donor.
 */
const ind = (id: string, sex: Individual["sex"], extra: Partial<Individual> = {}): Individual =>
  ({ id, sex, affected: false, sibOrder: 0, ...extra });
const base = { siblingOrder: { mode: "insertion" as const, affectedFirst: false } };

/** NSGC 2022 Fig. 5 example 1b: two women, one carrying a pregnancy by donor sperm. */
const femaleCouple: Pedigree = {
  ...base,
  individuals: [
    ind("gf", "male"), ind("gm", "female"),
    ind("a", "female"), ind("b", "female"), ind("d", "male", { reproductiveRole: "donor" }),
    ind("c1", "male", { socialParents: ["b"] }), ind("c2", "female", { sibOrder: 1, socialParents: ["b"] }),
  ],
  partnerships: [
    { id: "g", individual1: "gf", individual2: "gm" },
    { id: "ab", individual1: "a", individual2: "b" },
    { id: "da", individual1: "d", individual2: "a", donorConception: true },
  ],
  parentOf: { g: ["a"], da: ["c1", "c2"] },
};

/** Two men, both with parents drawn, a child by an egg donor. */
const maleCouple: Pedigree = {
  ...base,
  individuals: [
    ind("gf", "male"), ind("gm", "female"), ind("hf", "male"), ind("hm", "female"),
    ind("a", "male"), ind("b", "male"), ind("d", "female", { reproductiveRole: "donor" }),
    ind("c", "female", { socialParents: ["b"] }),
  ],
  partnerships: [
    { id: "g", individual1: "gf", individual2: "gm" },
    { id: "h", individual1: "hf", individual2: "hm" },
    { id: "ab", individual1: "a", individual2: "b" },
    { id: "ad", individual1: "a", individual2: "d", donorConception: true },
  ],
  parentOf: { g: ["a"], h: ["b"], ad: ["c"] },
};

/** Two women, each with a child by an earlier husband: both hold the "mother" role elsewhere. */
const blended = (sex: "male" | "female"): Pedigree => {
  const other = sex === "male" ? "female" : "male";
  return {
    ...base,
    individuals: [ind("x1", other), ind("a", sex), ind("b", sex), ind("x2", other), ind("c1", "male"), ind("c2", "female")],
    partnerships: [
      { id: "p1", individual1: "x1", individual2: "a" },
      { id: "ab", individual1: "a", individual2: "b" },
      { id: "p2", individual1: "x2", individual2: "b" },
    ],
    parentOf: { p1: ["c1"], p2: ["c2"] },
  };
};

/**
 * Both women have a donor-conceived child, one has parents drawn: the
 * chain donor - woman - woman - donor puts each woman in the father role of
 * one couple and the mother role of another unless the roles are recoloured.
 */
const twoDonors: Pedigree = {
  ...base,
  individuals: [
    ind("gf", "male"), ind("gm", "female"), ind("a", "female"), ind("b", "female"),
    ind("d1", "male", { reproductiveRole: "donor" }), ind("d2", "male", { reproductiveRole: "donor" }),
    ind("k1", "unknown", { socialParents: ["b"] }), ind("k2", "unknown", { sibOrder: 1, socialParents: ["b"] }),
    ind("j", "male", { socialParents: ["a"] }),
  ],
  partnerships: [
    { id: "g", individual1: "gf", individual2: "gm" },
    { id: "ab", individual1: "a", individual2: "b" },
    { id: "pa", individual1: "d1", individual2: "a", donorConception: true },
    { id: "pb", individual1: "d2", individual2: "b", donorConception: true },
  ],
  parentOf: { g: ["a"], pa: ["k1", "k2"], pb: ["j"] },
};

/** Every individual drawn, and a couple line (spouse marker) between each non-donor pair. */
function expectDrawn(p: Pedigree, r: LayoutResult) {
  const idx = (id: string) => p.individuals.findIndex(i => i.id === id) + 1;
  const drawn = new Set(r.nid.flat());
  for (const i of p.individuals) expect(drawn.has(idx(i.id)), i.id).toBe(true);
  for (const q of p.partnerships) {
    if (q.donorConception) continue;
    const a = idx(q.individual1), b = idx(q.individual2);
    const joined = r.nid.some((row, lev) => row.some((n, s) =>
      r.spouse[lev]![s]! > 0 && ((n === a && row[s + 1] === b) || (n === b && row[s + 1] === a))));
    expect(joined, `couple line ${q.id}`).toBe(true);
  }
}

describe("same-sex couples: layout (#105)", () => {
  it("a female couple with donor-conceived children: couple line drawn, donor beside the genetic mother", () => {
    const r = alignPedigreeByFamily(femaleCouple);
    expectDrawn(femaleCouple, r);
  });

  it("a male couple, both with parents drawn, and an egg donor's child", () => {
    expectDrawn(maleCouple, alignPedigreeByFamily(maleCouple));
  });

  it("each partner of a female couple with her own donor: every couple and donor pair side by side", () => {
    const r = alignPedigreeByFamily(twoDonors);
    expectDrawn(twoDonors, r);
    const idx = (id: string) => twoDonors.individuals.findIndex(i => i.id === id) + 1;
    const row = r.nid[1]!.slice(0, r.n[1]);
    expect(row).toHaveLength(4); // nobody drawn twice
    for (const [x, y] of [["d1", "a"], ["d2", "b"]]) expect(Math.abs(row.indexOf(idx(x!)) - row.indexOf(idx(y!)))).toBe(1);
  });

  it.each(["female", "male"] as const)("two %s partners who each have a child by an earlier partner", (sex) => {
    const p = blended(sex);
    expectDrawn(p, alignPedigreeByFamily(p));
  });
});

describe("same-sex couples: kinship follows the genetic parents (#105)", () => {
  it("the genetic mother and the donor are related to the child, the social mother is not", () => {
    const k = kinshipCoefficients(femaleCouple);
    expect(k.kinship("a", "c1")).toBe(1 / 4);
    expect(k.kinship("d", "c1")).toBe(1 / 4);
    expect(k.kinship("b", "c1")).toBe(0);
    expect(k.kinship("gm", "c1")).toBe(1 / 8);
    expect(k.kinship("c1", "c2")).toBe(1 / 4); // one donor: full siblings
    expect(k.kinship("a", "b")).toBe(0);
  });

  it("an egg donor's child of a male couple: X-linked kinship from the donor", () => {
    const x = kinshipCoefficients(maleCouple, { chromosome: "X" });
    expect(x.kinship("a", "c")).toBe(1 / 2); // a daughter has her father's X
    expect(x.kinship("b", "c")).toBe(0);
    expect(kinshipCoefficients(maleCouple).kinship("hm", "c")).toBe(0);
  });
});
