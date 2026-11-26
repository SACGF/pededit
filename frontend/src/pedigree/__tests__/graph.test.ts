import { describe, it, expect } from "vitest";
import { produce } from "immer";
import type { Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { F, M, U, build, couple, person } from "../../fixtures/features";
import {
  ancestorsOf, childrenOf, couplesOf, descendantsOf, hasParents, pairKey,
  parentCoupleOf, parentRoles, partnerIn, raisedChildrenOf,
} from "../graph";

/**
 * Grandparents gf + gm with children dad and aunt; dad + mum with kid;
 * mum also has a donor pair with donor d for kid2, whom dad raises.
 */
function family(): Pedigree {
  return build(
    [M("gf"), F("gm"), M("dad"), F("aunt"), F("mum"), M("kid"), M("d", { reproductiveRole: "donor" }), F("kid2", { socialParents: ["dad"] })],
    [couple("g", "gf", "gm"), couple("p", "dad", "mum"), couple("dp", "d", "mum", { donorConception: true })],
    { g: ["dad", "aunt"], p: ["kid"], dp: ["kid2"] },
  );
}

/** The same family, frozen as the store holds it, so the index is used. */
const frozen = () => produce(family(), () => {});

describe.each([["read directly", family], ["indexed", frozen]] as const)("graph questions, %s", (_, make) => {
  it("finds the couple someone is a child of", () => {
    const ped = make();
    expect(parentCoupleOf(ped, "kid")?.id).toBe("p");
    expect(parentCoupleOf(ped, "kid2")?.id).toBe("dp");
    expect(parentCoupleOf(ped, "gf")).toBeUndefined();
  });

  it("lists a person's couples in pedigree order, with or without donor pairs", () => {
    const ped = make();
    expect(couplesOf(ped, "mum", { donorPairs: true }).map(p => p.id)).toEqual(["p", "dp"]);
    expect(couplesOf(ped, "mum", { donorPairs: false }).map(p => p.id)).toEqual(["p"]);
    expect(couplesOf(ped, "aunt", { donorPairs: true })).toEqual([]);
  });

  it("says who has parents", () => {
    const ped = make();
    expect(hasParents(ped, "dad")).toBe(true);
    expect(hasParents(ped, "mum")).toBe(false);
  });

  it("gives genetic and raised children", () => {
    const ped = make();
    expect(childrenOf(ped, "p")).toEqual(["kid"]);
    expect(childrenOf(ped, "nobody")).toEqual([]);
    expect(raisedChildrenOf(ped, "p")).toEqual(["kid", "kid2"]);
    expect(raisedChildrenOf(ped, "dp")).toEqual(["kid2"]);
  });

  it("walks descendants and ancestors through donor pairs, leaving out the start", () => {
    const ped = make();
    expect([...descendantsOf(ped, ["gm"])].sort()).toEqual(["aunt", "dad", "kid"]);
    expect([...descendantsOf(ped, ["mum"])].sort()).toEqual(["kid", "kid2"]);
    expect([...ancestorsOf(ped, ["kid"])].sort()).toEqual(["dad", "gf", "gm", "mum"]);
    expect([...ancestorsOf(ped, ["kid2"])].sort()).toEqual(["d", "mum"]);
  });
});

describe("parentCoupleOf", () => {
  it("keeps the first couple for a child listed under two", () => {
    const ped = produce(build([M("a"), F("b"), M("c"), U("k")], [couple("p1", "a", "b"), couple("p2", "c", "b")], { p1: ["k"], p2: ["k"] }), () => {});
    expect(parentCoupleOf(ped, "k")?.id).toBe("p1");
    expect(parentCoupleOf({ ...ped }, "k")?.id).toBe("p1");
  });
});

describe("the index", () => {
  it("is not used for a pedigree changed in place", () => {
    const ped = family();
    expect(hasParents(ped, "mum")).toBe(false);
    ped.parentOf.g!.push("mum");
    expect(hasParents(ped, "mum")).toBe(true);
    expect(parentCoupleOf(ped, "mum")?.id).toBe("g");
  });

  it("is not used inside an immer draft", () => {
    const after = produce(frozen(), draft => {
      expect(couplesOf(draft, "aunt", { donorPairs: true })).toEqual([]);
      draft.partnerships.push(couple("q", "aunt", "d"));
      expect(couplesOf(draft, "aunt", { donorPairs: true }).map(p => p.id)).toEqual(["q"]);
    });
    expect(couplesOf(after, "aunt", { donorPairs: true }).map(p => p.id)).toEqual(["q"]);
  });
});

describe("partnerIn", () => {
  it("gives the other partner", () => {
    const p = couple("p", "a", "b");
    expect(partnerIn(p, "a")).toBe("b");
    expect(partnerIn(p, "b")).toBe("a");
  });
});

describe("parentRoles", () => {
  const roles = (s1: Sex, s2: Sex) => {
    const ped = build([person("one", s1), person("two", s2)], [couple("p", "one", "two")], {});
    return parentRoles(ped, ped.partnerships[0]!);
  };
  it.each([
    ["male", "female", "one", "two"],
    ["female", "male", "two", "one"],
    ["unknown", "female", "one", "two"],
    ["female", "unknown", "two", "one"],
    ["male", "unknown", "one", "two"],
    ["unknown", "male", "two", "one"],
    ["unknown", "unknown", "one", "two"],
    ["male", "male", "one", "two"],
    ["female", "female", "one", "two"],
  ] as const)("%s and %s: father %s, mother %s", (s1, s2, father, mother) => {
    expect(roles(s1, s2)).toEqual({ father, mother });
  });
});

describe("pairKey", () => {
  it("is the same either way round", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
  });
});
