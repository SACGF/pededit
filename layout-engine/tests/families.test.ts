import { describe, it, expect } from "vitest";
import { alignPedigree, alignPedigreeByFamily, splitFamilies, FAMILY_GAP } from "../src/index.js";
import type { Pedigree, Individual, LayoutResult } from "../src/types.js";

const ind = (id: string, sex: Individual["sex"]): Individual => ({ id, sex, affected: false, sibOrder: 0 });

/** Two nuclear families (a=b with c, d=e with f) plus one unconnected person z. */
function twoFamilies(): Pedigree {
  return {
    individuals: [ind("a", "male"), ind("b", "female"), ind("z", "male"), ind("c", "male"),
      ind("d", "male"), ind("e", "female"), ind("f", "female")],
    partnerships: [
      { id: "p1", individual1: "a", individual2: "b" },
      { id: "p2", individual1: "d", individual2: "e" },
    ],
    parentOf: { p1: ["c"], p2: ["f"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

/** Individual id at each slot of each row. */
function rows(p: Pedigree, r: LayoutResult): string[][] {
  return r.nid.map((row, lev) => row.slice(0, r.n[lev]).map(i => p.individuals[i - 1]!.id));
}

describe("splitFamilies (#64)", () => {
  it("groups people joined by partnerships or parent links, in order of first appearance", () => {
    expect(splitFamilies(twoFamilies())).toEqual({
      families: [["a", "b", "c"], ["d", "e", "f"]],
      isolated: ["z"],
    });
  });
});

describe("alignPedigreeByFamily (#64)", () => {
  it("leaves a single family exactly as alignPedigree lays it out", () => {
    const p = twoFamilies();
    p.partnerships.push({ id: "p3", individual1: "c", individual2: "f" });
    expect(alignPedigreeByFamily(p)).toEqual(alignPedigree(p));
  });

  it("separates families by FAMILY_GAP and keeps parent columns pointing at the right parents", () => {
    const p = twoFamilies();
    const r = alignPedigreeByFamily(p);
    expect(rows(p, r)).toEqual([["a", "b", "d", "e", "z"], ["c", "f"]]);

    const x = (lev: number, id: string) => r.pos[lev]![rows(p, r)[lev]!.indexOf(id)]!;
    expect(x(0, "d") - x(0, "b")).toBeCloseTo(FAMILY_GAP);
    expect(x(0, "z") - x(0, "e")).toBeCloseTo(FAMILY_GAP);

    // fam is the 1-based column of the left parent in the row above.
    const parentsOf = (id: string) => {
      const f = r.fam[1]![rows(p, r)[1]!.indexOf(id)]!;
      return [rows(p, r)[0]![f - 1], rows(p, r)[0]![f]];
    };
    expect(parentsOf("c")).toEqual(["a", "b"]);
    expect(parentsOf("f")).toEqual(["d", "e"]);
    expect(r.spouse[0]!.slice(0, 5)).toEqual([1, 0, 1, 0, 0]);
  });

  it("lays out each family as it would be drawn alone, shifted", () => {
    const p = twoFamilies();
    const r = alignPedigreeByFamily(p);
    const alone = alignPedigree({ ...p, individuals: p.individuals.slice(4), partnerships: [p.partnerships[1]!], parentOf: { p2: ["f"] } });
    const dx = r.pos[0]![2]! - alone.pos[0]![0]!;
    expect(r.pos[0]![3]! - dx).toBeCloseTo(alone.pos[0]![1]!);
    expect(r.pos[1]![1]! - dx).toBeCloseTo(alone.pos[1]![0]!);
  });
});
