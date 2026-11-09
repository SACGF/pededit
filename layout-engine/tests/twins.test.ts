import { describe, it, expect } from "vitest";
import { alignPedigree } from "../src/index.js";
import type { Pedigree } from "../src/types.js";

/**
 * Twins (#11), after kinship2's autohint: the members of a twin set get the
 * mean of their sibling ranks, so they are laid out side by side whatever the
 * stored sibling order says.
 */
function family(twins: Pedigree["partnerships"][0]["twins"], order: string[] = ["a", "b", "c", "d"]): Pedigree {
  return {
    individuals: [
      { id: "f", sex: "male",   affected: false, sibOrder: 0 },
      { id: "m", sex: "female", affected: false, sibOrder: 1 },
      ...order.map((id, i) => ({ id, sex: "male" as const, affected: false, sibOrder: i })),
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m", twins }],
    parentOf: { p: order },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const row = (p: Pedigree, lev: number) => alignPedigree(p).nid[lev]!.map(i => p.individuals[i - 1]!.id);

describe("twins in autohint", () => {
  it("a twin set whose members are apart in sibling order is drawn together, in set order", () => {
    // Stored order a b c d, twins a and d: expect b a d c? R: mean(1,4)=2.5, +0.01/0.02 ->
    // a=2.51, d=2.52, b=2, c=3 -> b a d c.
    expect(row(family([{ members: ["a", "d"], zygosity: "dizygotic" }]), 1)).toEqual(["b", "a", "d", "c"]);
  });

  it("set order wins over sibling order within the set", () => {
    expect(row(family([{ members: ["d", "a"], zygosity: "monozygotic" }]), 1)).toEqual(["b", "d", "a", "c"]);
  });

  it("without twins the stored order stands", () => {
    expect(row(family(undefined), 1)).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores a set whose members are not children of the partnership, or fewer than two", () => {
    expect(row(family([{ members: ["a", "zz"], zygosity: "dizygotic" }]), 1)).toEqual(["a", "b", "c", "d"]);
    expect(row(family([{ members: ["d"], zygosity: "dizygotic" }]), 1)).toEqual(["a", "b", "c", "d"]);
  });

  it("the duplicate fixup moves a twin set as a unit", () => {
    // Cousin marriage: d (a twin of c) marries e, a child of the other founder
    // couple, so d is drawn twice and shifted to the edge of the sibship. The
    // co-twin c must come along.
    const p = family([{ members: ["c", "d"], zygosity: "monozygotic" }], ["a", "b", "c", "d"]);
    p.individuals.push(
      { id: "f2", sex: "male",   affected: false, sibOrder: 2 },
      { id: "m2", sex: "female", affected: false, sibOrder: 3 },
      { id: "e",  sex: "female", affected: false, sibOrder: 0 },
      { id: "g",  sex: "male",   affected: false, sibOrder: 0 },
    );
    p.partnerships.push({ id: "p2", individual1: "f2", individual2: "m2" }, { id: "de", individual1: "d", individual2: "e" });
    p.parentOf.p2 = ["e"];
    p.parentOf.de = ["g"];
    const r = alignPedigree(p);
    const ids = r.nid[1]!.map(i => p.individuals[Math.floor(i) - 1]!.id);
    const ic = ids.indexOf("c"), id_ = ids.indexOf("d");
    expect(Math.abs(ic - id_)).toBe(1);
  });
});
