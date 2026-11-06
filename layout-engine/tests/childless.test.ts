import { describe, it, expect } from "vitest";
import { alignPedigree } from "../src/alignPedigree.js";
import { buildPartnerSetFromPedigree, resolveCouple } from "../src/couples.js";
import type { Pedigree, Individual, Sex } from "../src/types.js";

/**
 * Childless partnerships. kinship2 only knows couples through their children,
 * so these have no R ground truth: the partners must be drawn side by side in
 * one generation with a couple marker, like any other couple.
 */
function ind(id: string, sex: Sex): Individual {
  return { id, sex, affected: false, sibOrder: 0 };
}

function ped(
  people: [string, Sex][],
  partnerships: [string, string, string][],
  parentOf: Record<string, string[]>,
): Pedigree {
  return {
    individuals: people.map(([id, s], i) => ({ ...ind(id, s), sibOrder: i })),
    partnerships: partnerships.map(([id, a, b]) => ({ id, individual1: a, individual2: b })),
    parentOf,
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

/** Level and slots of each id, and the resolved couple pairs per level. */
function summary(p: Pedigree) {
  const r = alignPedigree(p);
  const partners = buildPartnerSetFromPedigree(p);
  const idOf = (nid: number) => p.individuals[nid - 1]!.id;
  const levelOf = new Map<string, number[]>();
  const couples: string[] = [];
  for (let lev = 0; lev < r.n.length; lev++) {
    for (let s = 0; s < r.n[lev]!; s++) {
      const id = idOf(r.nid[lev]![s]!);
      if (!levelOf.has(id)) levelOf.set(id, []);
      levelOf.get(id)!.push(lev);
      if (r.spouse[lev]![s]! > 0) {
        const rc = resolveCouple(r, partners, lev, s);
        couples.push([idOf(r.nid[lev]![rc.leftSlot]!), idOf(r.nid[lev]![rc.rightSlot]!)].sort().join("="));
      }
    }
  }
  return { r, levelOf, couples };
}

describe("childless partnerships", () => {
  it("a child's new partner is drawn beside them, in their generation", () => {
    const p = ped(
      [["f", "male"], ["m", "female"], ["c", "male"], ["d", "female"], ["x", "female"]],
      [["p1", "f", "m"], ["p2", "c", "x"]],
      { p1: ["c", "d"], p2: [] },
    );
    const { levelOf, couples } = summary(p);
    expect(levelOf.get("x")).toEqual([1]);
    expect(couples).toContain("c=x");
    expect(couples).toContain("f=m");
  });

  it("two founders with no children are drawn as a couple", () => {
    const p = ped([["a", "male"], ["b", "female"]], [["p1", "a", "b"]], {});
    const { r, couples } = summary(p);
    expect(r.n).toEqual([2]);
    expect(couples).toEqual(["a=b"]);
  });

  it("an empty parentOf entry counts as childless", () => {
    const p = ped([["a", "female"], ["b", "unknown"]], [["p1", "a", "b"]], { p1: [] });
    expect(summary(p).couples).toEqual(["a=b"]);
  });

  it("a third, childless partner joins the run of a man with two wives", () => {
    const p = ped(
      [["h", "male"], ["w1", "female"], ["w2", "female"], ["w3", "female"], ["k1", "male"], ["k2", "female"]],
      [["p1", "h", "w1"], ["p2", "h", "w2"], ["p3", "h", "w3"]],
      { p1: ["k1"], p2: ["k2"] },
    );
    const { levelOf, couples } = summary(p);
    expect(levelOf.get("w3")).toEqual([0]);
    expect(levelOf.get("h")).toEqual([0]);
    expect(couples.sort()).toEqual(["h=w1", "h=w2", "h=w3"]);
  });

  it("a childless partner of a grandchild lands in the grandchild's row", () => {
    const p = ped(
      [["g1", "male"], ["g2", "female"], ["p", "female"], ["s", "male"], ["gc", "male"], ["z", "female"]],
      [["pa", "g1", "g2"], ["pb", "s", "p"], ["pc", "gc", "z"]],
      { pa: ["p"], pb: ["gc"] },
    );
    const { levelOf, couples } = summary(p);
    expect(levelOf.get("z")).toEqual([2]);
    expect(couples).toContain("gc=z");
  });
});
