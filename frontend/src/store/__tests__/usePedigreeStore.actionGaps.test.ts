import { beforeEach, describe, expect, it } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { usePedigreeStore } from "../usePedigreeStore";
import { F, M, U, build, couple } from "../../fixtures/features";
import { parentCoupleOf } from "../../pedigree/graph";
import { geneticParents } from "../../pedigree/assisted";
import { expectNoEdit, expectOneUndoStep } from "./undoSteps";

// #243: the store actions behind the gaps the inventory found.

const get = () => usePedigreeStore.getState();
const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id);
const ids = () => get().pedigree.individuals.map(i => i.id);

/** Mum and Dad with children kid and kid2; Gran, Nan, Pop and Ma unrelated. */
function family(): Pedigree {
  return build(
    [M("dad", { name: "Dad" }), F("mum", { name: "Mum" }), F("kid", { name: "Kid" }), M("kid2"), M("pop"), F("ma"), U("x")],
    [couple("p", "dad", "mum"), couple("q", "pop", "ma")],
    { p: ["kid", "kid2"] },
  );
}

beforeEach(() => get().initialize(family()));

describe("Remove donor (#243, row 4)", () => {
  it("a sperm donor removed: the father is the genetic parent again, his social parent link goes, the new donor goes", () => {
    get().addDonor("kid", "sperm");
    const donorId = geneticParents(get().pedigree, "kid").find(id => id !== "mum")!;
    expect(ind(donorId)?.reproductiveRole).toBe("donor");
    expect(ind("kid")?.socialParents).toEqual(["dad"]);
    expectOneUndoStep(() => expect(get().removeDonor("kid")).toBeNull());
    expect(parentCoupleOf(get().pedigree, "kid")?.id).toBe("p");
    expect(ind("kid")?.socialParents).toBeUndefined();
    expect(ind(donorId)).toBeUndefined();
    expect(get().pedigree.partnerships.some(p => p.donorConception)).toBe(false);
  });

  it("an egg donor removed: the mother is the genetic parent again, and no longer recorded as carrying", () => {
    get().addDonor("kid", "egg");
    expect(ind("kid")?.carriedBy).toBe("mum");
    get().removeDonor("kid");
    expect(geneticParents(get().pedigree, "kid").sort()).toEqual(["dad", "mum"]);
    expect(ind("kid")?.carriedBy).toBeUndefined();
  });

  it("an existing person who was the donor stays, no longer a donor", () => {
    get().addDonor("kid", "sperm", "pop");
    get().removeDonor("kid");
    expect(ind("pop")).toBeDefined();
    expect(ind("pop")?.reproductiveRole).toBeUndefined();
  });

  it("is refused, with no edit, for a child with no donor", () => {
    expect(expectNoEdit(() => get().removeDonor("kid"))).toMatch(/No donor/);
  });

  it("deleting the donor does the same, with a notice", () => {
    get().addDonor("kid", "sperm", "pop");
    get().deleteIndividual("pop");
    expect(parentCoupleOf(get().pedigree, "kid")?.id).toBe("p");
    expect(ind("kid")?.socialParents).toBeUndefined();
    expect(get().notice?.text).toMatch(/genetic parent again/);
    get().initialize(family());
    get().addDonor("kid", "egg", "ma");
    get().deleteIndividuals(["ma"]);
    expect(geneticParents(get().pedigree, "kid").sort()).toEqual(["dad", "mum"]);
  });
});

describe("Remove surrogate (#243, row 5)", () => {
  it("a new surrogate removed goes, and nobody is recorded as carrying", () => {
    get().addSurrogate("kid");
    const s = ind("kid")!.carriedBy!;
    expectOneUndoStep(() => expect(get().removeSurrogate("kid")).toBeNull());
    expect(ind("kid")?.carriedBy).toBeUndefined();
    expect(ind(s)).toBeUndefined();
  });

  it("with a donor egg, the mother carries the child again", () => {
    get().addDonor("kid", "egg");
    get().addSurrogate("kid", "ma");
    expect(ind("kid")?.socialParents).toContain("mum");
    get().removeSurrogate("kid");
    expect(ind("kid")?.carriedBy).toBe("mum");
    expect(ind("kid")?.socialParents ?? []).not.toContain("mum");
    expect(ind("ma")?.reproductiveRole).toBeUndefined();
  });

  it("is refused for a child with no surrogate", () => {
    expect(expectNoEdit(() => get().removeSurrogate("kid"))).toMatch(/No surrogate/);
  });
});

describe("batch edits (#243, rows 6, 13, 14)", () => {
  it("consultand, family history not known and adoption apply to several, one undo step each", () => {
    expectOneUndoStep(() => get().setConsultandMany(["pop", "ma"], true));
    expect([ind("pop")?.consultand, ind("ma")?.consultand]).toEqual([true, true]);
    expectOneUndoStep(() => get().setFamilyHistoryUnknownMany(["pop", "ma"], true));
    expect(ind("ma")?.familyHistoryUnknown).toBe(true);
    expectOneUndoStep(() => get().setAdoptedMany(["kid", "kid2"], "in"));
    expect([ind("kid")?.adopted, ind("kid2")?.adopted]).toEqual(["in", "in"]);
    expectNoEdit(() => get().setAdoptedMany(["kid", "kid2"], "in"));
  });

  it("Set parents for several gives all of them the same parents, one undo step", () => {
    expectOneUndoStep(() => expect(get().setParentsMany(["kid", "kid2"], ["pop", "ma"])).toBeNull());
    expect(parentCoupleOf(get().pedigree, "kid")?.id).toBe("q");
    expect(parentCoupleOf(get().pedigree, "kid2")?.id).toBe("q");
  });

  it("Set parents for several refuses all when one cannot take them", () => {
    expect(expectNoEdit(() => get().setParentsMany(["kid", "dad"], ["kid2"]))).toBeTruthy();
  });

  it("Detach from parents for several, one undo step", () => {
    expectOneUndoStep(() => get().detachFromParentsMany(["kid", "kid2"]));
    expect(parentCoupleOf(get().pedigree, "kid")).toBeUndefined();
    expect(parentCoupleOf(get().pedigree, "kid2")).toBeUndefined();
  });

  it("Unpin several", () => {
    get().pinIndividuals({ pop: { x: 0, y: 0 }, ma: { x: 80, y: 0 } });
    expectOneUndoStep(() => get().unpinIndividuals(["pop", "ma"]));
    expect(get().pedigree.pinnedPositions ?? {}).toEqual({});
  });

  it("Not twins for several siblings, one undo step", () => {
    get().setTwins("p", ["kid", "kid2"], "dizygotic");
    expectOneUndoStep(() => get().removeTwins(["kid", "kid2"]));
    expect(get().pedigree.partnerships.find(p => p.id === "p")?.twins).toBeUndefined();
  });
});

describe("adding (#243, rows 8 and 10)", () => {
  it("Add brother and Add sister make a sibling of that sex", () => {
    get().addSibling("kid", "male");
    get().addSibling("kid", "female");
    const added = ids().filter(id => !family().individuals.some(i => i.id === id)).map(id => ind(id)!.sex);
    expect(added).toEqual(["male", "female"]);
  });

  it("Add existing child on a person with no partner makes a placeholder partner, as Set parents does", () => {
    get().startPickingChildOf("x");
    get().pickIndividual("pop");
    const p = parentCoupleOf(get().pedigree, "pop")!;
    expect([p.individual1, p.individual2]).toContain("x");
    expect(get().picking).toBeNull();
  });

  it("Set parents for several by picking: the parents picked are applied to all", () => {
    get().startPickingParentsOf(["kid", "kid2"]);
    get().pickIndividual("pop");
    get().pickIndividual("ma");
    expect(parentCoupleOf(get().pedigree, "kid")?.id).toBe("q");
    expect(parentCoupleOf(get().pedigree, "kid2")?.id).toBe("q");
    expect(get().selectedIds.sort()).toEqual(["kid", "kid2"]);
  });
});

describe("Select with ancestors (#243, row 7)", () => {
  it("selects the person and their ancestors", () => {
    expect(get().selectAncestors("kid")).toBeGreaterThan(1);
    expect(get().selectedIds).toEqual(expect.arrayContaining(["kid", "dad", "mum"]));
    expect(get().selectedIds).not.toContain("pop");
  });
});
