import { describe, it, expect } from "vitest";
import { alignPedigree, alignPedigreeByFamily, kinshipCoefficients, splitFamilies, placementParentOf, carrierAbove } from "../src/index.js";
import type { Pedigree, Individual } from "../src/index.js";

/**
 * Assisted reproduction (#45): the child's partnership in `parentOf` is its
 * genetic parents, so kinship (and the layout) follow the donor; a surrogate
 * (`carriedBy`) and a social parent (`socialParents`) are lines on the
 * drawing only.
 */
const ind = (id: string, sex: Individual["sex"], extra: Partial<Individual> = {}): Individual =>
  ({ id, sex, affected: false, sibOrder: 0, ...extra });
const base = { siblingOrder: { mode: "insertion" as const, affectedFirst: false } };

/** NSGC 2008 Fig. 3 scenario 1: a couple, the woman carrying a pregnancy by donor sperm. */
const spermDonor: Pedigree = {
  ...base,
  individuals: [
    ind("gf", "male"), ind("gm", "female"),
    ind("h", "male"), ind("w", "female"), ind("d", "male", { reproductiveRole: "donor" }),
    ind("c", "female", { socialParents: ["h"] }),
  ],
  partnerships: [
    { id: "g", individual1: "gf", individual2: "gm" },
    { id: "hw", individual1: "h", individual2: "w" },
    { id: "wd", individual1: "w", individual2: "d", donorConception: true },
  ],
  parentOf: { g: ["h"], wd: ["c"] },
};

/** Scenario 2: donor egg, the man's sperm, his partner carries. */
const eggDonor: Pedigree = {
  ...base,
  individuals: [
    ind("h", "male"), ind("w", "female"), ind("d", "female", { reproductiveRole: "donor" }),
    ind("c", "male", { carriedBy: "w" }),
  ],
  partnerships: [
    { id: "hw", individual1: "h", individual2: "w" },
    { id: "hd", individual1: "h", individual2: "d", donorConception: true },
  ],
  parentOf: { hd: ["c"] },
};

/** Scenario 3: the couple's own embryo carried by a surrogate; the man's parents drawn too. */
const surrogate: Pedigree = {
  ...base,
  individuals: [
    ind("gf", "male"), ind("gm", "female"),
    ind("h", "male"), ind("w", "female"), ind("s", "female", { reproductiveRole: "surrogate" }),
    ind("c", "male", { carriedBy: "s" }),
  ],
  partnerships: [
    { id: "g", individual1: "gf", individual2: "gm" },
    { id: "hw", individual1: "h", individual2: "w" },
  ],
  parentOf: { g: ["h"], hw: ["c"] },
};

describe("assisted reproduction: kinship follows the genetic parents (#45)", () => {
  it("a sperm donor is the father; the intended father and his parents are unrelated to the child", () => {
    const k = kinshipCoefficients(spermDonor);
    expect(k.kinship("d", "c")).toBe(1 / 4);
    expect(k.kinship("w", "c")).toBe(1 / 4);
    expect(k.kinship("h", "c")).toBe(0);
    expect(k.kinship("gf", "c")).toBe(0);
  });

  it("an egg donor is the mother; the woman who carried is not", () => {
    const k = kinshipCoefficients(eggDonor);
    expect(k.kinship("d", "c")).toBe(1 / 4);
    expect(k.kinship("h", "c")).toBe(1 / 4);
    expect(k.kinship("w", "c")).toBe(0);
    const x = kinshipCoefficients(eggDonor, { chromosome: "X" });
    expect(x.kinship("d", "c")).toBe(1 / 2); // a son has his genetic mother's X
    expect(x.kinship("w", "c")).toBe(0);
  });

  it("a surrogate is unrelated to the child she carried; the grandparents are related", () => {
    const k = kinshipCoefficients(surrogate);
    expect(k.kinship("s", "c")).toBe(0);
    expect(k.kinship("w", "c")).toBe(1 / 4);
    expect(k.kinship("gm", "c")).toBe(1 / 8);
  });
});

describe("assisted reproduction: layout (#45)", () => {
  const rowOf = (p: Pedigree, r: ReturnType<typeof alignPedigree>, id: string) => {
    const i = p.individuals.findIndex(x => x.id === id) + 1;
    return r.nid.findIndex(row => row.includes(i));
  };
  const slotsOf = (p: Pedigree, r: ReturnType<typeof alignPedigree>, id: string) => {
    const i = p.individuals.findIndex(x => x.id === id) + 1;
    return r.nid.flatMap((row, lev) => row.flatMap((n, s) => (n === i ? [{ lev, x: r.pos[lev]![s]! }] : [])));
  };

  it("the donor is placed beside the woman, as her partner, in her row", () => {
    const r = alignPedigreeByFamily(spermDonor);
    expect(rowOf(spermDonor, r, "d")).toBe(1);
    expect(rowOf(spermDonor, r, "c")).toBe(2);
    const [w] = slotsOf(spermDonor, r, "w"), [d] = slotsOf(spermDonor, r, "d"), [h] = slotsOf(spermDonor, r, "h");
    expect(Math.abs(w!.x - d!.x)).toBeCloseTo(1);
    expect(Math.abs(w!.x - h!.x)).toBeCloseTo(1);
  });

  it("a surrogate with no partner of her own sits in the row above the child, in the same family", () => {
    expect(splitFamilies(surrogate).families).toHaveLength(1);
    const r = alignPedigreeByFamily(surrogate);
    expect(rowOf(surrogate, r, "s")).toBe(rowOf(surrogate, r, "c") - 1);
    expect(slotsOf(surrogate, r, "s")).toHaveLength(1);
  });

  it("without the assisted lines the layout is unchanged", () => {
    const plain: Pedigree = { ...surrogate, individuals: surrogate.individuals.map(i => ({ ...i, carriedBy: undefined })) };
    const a = alignPedigree(plain), b = alignPedigree(surrogate);
    // Only the surrogate moves (from the founder row to the couple's row).
    expect(a.n.reduce((x, y) => x + y)).toBe(b.n.reduce((x, y) => x + y));
    expect(rowOf(plain, a, "s")).toBe(0);
  });

  // NSGC 2008 Fig. 3: "the pregnancy symbol and its line of descent are
  // positioned below the woman who is carrying the pregnancy".
  it("scenario 1: the pregnancy sits below the mother, not between her and the donor", () => {
    const r = alignPedigreeByFamily(spermDonor);
    const [w] = slotsOf(spermDonor, r, "w"), [c] = slotsOf(spermDonor, r, "c");
    expect(c!.x).toBeCloseTo(w!.x);
    expect(carrierAbove(spermDonor, spermDonor.parentOf, "c")).toBe("w");
  });

  it("scenario 2: the child hangs from the couple carrying it; kinship keeps the donor", () => {
    const placed = placementParentOf(eggDonor);
    expect(placed.hw).toEqual(["c"]);
    expect(placed.hd).toEqual([]);
    expect(eggDonor.parentOf.hd).toEqual(["c"]); // not modified
    const r = alignPedigreeByFamily(eggDonor);
    const [h] = slotsOf(eggDonor, r, "h"), [w] = slotsOf(eggDonor, r, "w"), [c] = slotsOf(eggDonor, r, "c");
    expect(c!.x).toBeCloseTo((h!.x + w!.x) / 2);
    expect(Math.abs(w!.x - h!.x)).toBeCloseTo(1);
    expect(slotsOf(eggDonor, r, "d")).toHaveLength(1); // still beside the father
    expect(carrierAbove(eggDonor, placed, "c")).toBeUndefined();
    expect(kinshipCoefficients(eggDonor).kinship("d", "c")).toBe(1 / 4);
  });

  it("scenario 3: the child sits below the surrogate", () => {
    const r = alignPedigreeByFamily(surrogate);
    const [s] = slotsOf(surrogate, r, "s"), [c] = slotsOf(surrogate, r, "c");
    expect(c!.x).toBeCloseTo(s!.x);
  });

  it("a child in a twin set, or with siblings, stays where kinship2 puts it", () => {
    const twins: Pedigree = {
      ...eggDonor,
      individuals: [...eggDonor.individuals, ind("c2", "male", { carriedBy: "w" })],
      partnerships: eggDonor.partnerships.map(p => (p.id === "hd" ? { ...p, twins: [{ members: ["c", "c2"], zygosity: "dizygotic" as const }] } : p)),
      parentOf: { hd: ["c", "c2"] },
    };
    expect(placementParentOf(twins)).toBe(twins.parentOf);
    const sibs: Pedigree = { ...surrogate, individuals: [...surrogate.individuals, ind("c2", "female")], parentOf: { ...surrogate.parentOf, hw: ["c", "c2"] } };
    const plain: Pedigree = { ...sibs, individuals: sibs.individuals.map(i => ({ ...i, carriedBy: undefined })) };
    const a = alignPedigreeByFamily(plain), b = alignPedigreeByFamily(sibs);
    expect(slotsOf(sibs, b, "c")[0]!.x).toBeCloseTo(slotsOf(plain, a, "c")[0]!.x);
  });
});
