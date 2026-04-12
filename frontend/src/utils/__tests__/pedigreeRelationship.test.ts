import { describe, it, expect } from "vitest";
import { getAncestors, shareAncestor } from "../pedigreeRelationship";
import type { Pedigree } from "@pedigree-editor/layout-engine";

function makePedigree(overrides: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...overrides,
  };
}

describe("getAncestors", () => {
  it("returns empty set for a founder (no parents)", () => {
    const ped = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    expect(getAncestors(ped, "i1").size).toBe(0);
  });

  it("returns both parents for a child", () => {
    const ped = makePedigree({
      individuals: [
        { id: "dad", sex: "male",   affected: false, sibOrder: 0 },
        { id: "mom", sex: "female", affected: false, sibOrder: 1 },
        { id: "child", sex: "male", affected: false, sibOrder: 0 },
      ],
      partnerships: [{ id: "p1", individual1: "dad", individual2: "mom" }],
      parentOf: { p1: ["child"] },
    });
    const anc = getAncestors(ped, "child");
    expect(anc.has("dad")).toBe(true);
    expect(anc.has("mom")).toBe(true);
    expect(anc.size).toBe(2);
  });

  it("returns all four grandparents for a grandchild", () => {
    const ped = makePedigree({
      individuals: [
        { id: "gf1", sex: "male",   affected: false, sibOrder: 0 },
        { id: "gm1", sex: "female", affected: false, sibOrder: 1 },
        { id: "gf2", sex: "male",   affected: false, sibOrder: 2 },
        { id: "gm2", sex: "female", affected: false, sibOrder: 3 },
        { id: "dad", sex: "male",   affected: false, sibOrder: 0 },
        { id: "mom", sex: "female", affected: false, sibOrder: 1 },
        { id: "child", sex: "male", affected: false, sibOrder: 0 },
      ],
      partnerships: [
        { id: "p1", individual1: "gf1", individual2: "gm1" },
        { id: "p2", individual1: "gf2", individual2: "gm2" },
        { id: "p3", individual1: "dad", individual2: "mom" },
      ],
      parentOf: { p1: ["dad"], p2: ["mom"], p3: ["child"] },
    });
    const anc = getAncestors(ped, "child");
    expect(anc.has("dad")).toBe(true);
    expect(anc.has("mom")).toBe(true);
    expect(anc.has("gf1")).toBe(true);
    expect(anc.has("gm1")).toBe(true);
    expect(anc.has("gf2")).toBe(true);
    expect(anc.has("gm2")).toBe(true);
    expect(anc.size).toBe(6);
  });
});

describe("shareAncestor", () => {
  it("returns false for two unrelated founders", () => {
    const ped = makePedigree({
      individuals: [
        { id: "a", sex: "male",   affected: false, sibOrder: 0 },
        { id: "b", sex: "female", affected: false, sibOrder: 1 },
      ],
    });
    expect(shareAncestor(ped, "a", "b")).toBe(false);
  });

  it("returns true for siblings (share both parents)", () => {
    const ped = makePedigree({
      individuals: [
        { id: "dad",  sex: "male",   affected: false, sibOrder: 0 },
        { id: "mom",  sex: "female", affected: false, sibOrder: 1 },
        { id: "sib1", sex: "male",   affected: false, sibOrder: 0 },
        { id: "sib2", sex: "female", affected: false, sibOrder: 1 },
      ],
      partnerships: [{ id: "p1", individual1: "dad", individual2: "mom" }],
      parentOf: { p1: ["sib1", "sib2"] },
    });
    expect(shareAncestor(ped, "sib1", "sib2")).toBe(true);
  });

  it("returns true for first cousins (share grandparents)", () => {
    const ped = makePedigree({
      individuals: [
        { id: "gf",    sex: "male",   affected: false, sibOrder: 0 },
        { id: "gm",    sex: "female", affected: false, sibOrder: 1 },
        { id: "dad",   sex: "male",   affected: false, sibOrder: 0 },
        { id: "aunt",  sex: "female", affected: false, sibOrder: 1 },
        { id: "mom",   sex: "female", affected: false, sibOrder: 2 },
        { id: "uncle", sex: "male",   affected: false, sibOrder: 3 },
        { id: "c1",    sex: "male",   affected: false, sibOrder: 0 },
        { id: "c2",    sex: "female", affected: false, sibOrder: 0 },
      ],
      partnerships: [
        { id: "p_gp",    individual1: "gf",    individual2: "gm"    },
        { id: "p_left",  individual1: "dad",   individual2: "mom"   },
        { id: "p_right", individual1: "uncle", individual2: "aunt"  },
      ],
      parentOf: {
        p_gp:    ["dad", "aunt"],
        p_left:  ["c1"],
        p_right: ["c2"],
      },
    });
    expect(shareAncestor(ped, "c1", "c2")).toBe(true);
  });

  it("returns true when one is a direct ancestor of the other", () => {
    const ped = makePedigree({
      individuals: [
        { id: "grandpa", sex: "male",   affected: false, sibOrder: 0 },
        { id: "grandma", sex: "female", affected: false, sibOrder: 1 },
        { id: "child",   sex: "male",   affected: false, sibOrder: 0 },
      ],
      partnerships: [{ id: "p1", individual1: "grandpa", individual2: "grandma" }],
      parentOf: { p1: ["child"] },
    });
    // grandpa is in the ancestor set of child; also grandpa's ancestors don't
    // include child, but child's ancestors include grandpa
    expect(shareAncestor(ped, "grandpa", "child")).toBe(true);
  });

  it("returns false for unrelated individuals from different families", () => {
    const ped = makePedigree({
      individuals: [
        { id: "a1", sex: "male",   affected: false, sibOrder: 0 },
        { id: "a2", sex: "female", affected: false, sibOrder: 1 },
        { id: "a3", sex: "male",   affected: false, sibOrder: 0 },
        { id: "b1", sex: "male",   affected: false, sibOrder: 0 },
        { id: "b2", sex: "female", affected: false, sibOrder: 1 },
        { id: "b3", sex: "female", affected: false, sibOrder: 0 },
      ],
      partnerships: [
        { id: "pa", individual1: "a1", individual2: "a2" },
        { id: "pb", individual1: "b1", individual2: "b2" },
      ],
      parentOf: { pa: ["a3"], pb: ["b3"] },
    });
    expect(shareAncestor(ped, "a3", "b3")).toBe(false);
  });
});
