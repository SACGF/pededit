import { describe, it, expect } from "vitest";
import { alignPedigree, alignPedigreeByFamily, kinshipCoefficients, splitFamilies } from "../src/index.js";
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
});
