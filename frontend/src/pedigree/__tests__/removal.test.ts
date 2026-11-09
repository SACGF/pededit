import { describe, it, expect, beforeEach } from "vitest";
import { descendantsOf, ancestorsOf, removeWithDescendantsSet, removeWithAncestorsSet } from "../removal";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { lintFlow } from "../renderLint";
import { layoutToFlow } from "../layoutToFlow";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 *   gf = gm             (founders)
 *   ├ son = wife        wife married in; twins son and dau
 *   │   └ gc1, gc2      gc2 is pinned and unlocked
 *   └ dau = cousin      cousin is gf's nephew: parents uncle = aunt
 *       └ gc3
 *   uncle = aunt → cousin
 *   loner               unrelated
 */
function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "gf", sex: "male", affected: false, sibOrder: 0 },
      { id: "gm", sex: "female", affected: false, sibOrder: 1 },
      { id: "son", sex: "male", affected: false, sibOrder: 0 },
      { id: "dau", sex: "female", affected: false, sibOrder: 1 },
      { id: "wife", sex: "female", affected: false, sibOrder: 2 },
      { id: "uncle", sex: "male", affected: false, sibOrder: 3 },
      { id: "aunt", sex: "female", affected: false, sibOrder: 4 },
      { id: "cousin", sex: "male", affected: false, sibOrder: 0 },
      { id: "gc1", sex: "male", affected: false, sibOrder: 0 },
      { id: "gc2", sex: "female", affected: false, sibOrder: 1 },
      { id: "gc3", sex: "unknown", affected: false, sibOrder: 0 },
      { id: "loner", sex: "unknown", affected: false, sibOrder: 5 },
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm", twins: [{ members: ["son", "dau"], zygosity: "dizygotic" }] },
      { id: "sw", individual1: "son", individual2: "wife" },
      { id: "ua", individual1: "uncle", individual2: "aunt" },
      { id: "dc", individual1: "dau", individual2: "cousin", consanguineous: true },
    ],
    parentOf: { g: ["son", "dau"], sw: ["gc1", "gc2"], ua: ["cousin"], dc: ["gc3"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    pinnedPositions: { gc2: { x: 10, y: 20 }, gf: { x: 0, y: 0 } },
    unlockedIndividuals: ["gc2", "gf"],
  };
}

const sorted = (s: Set<string>) => [...s].sort();

describe("branch sets (#34)", () => {
  it("descendants and ancestors", () => {
    const p = pedigree();
    expect(sorted(descendantsOf(p, ["gf"]))).toEqual(["dau", "gc1", "gc2", "gc3", "son"]);
    expect(sorted(ancestorsOf(p, ["gc3"]))).toEqual(["aunt", "cousin", "dau", "gf", "gm", "uncle"]);
    expect(sorted(ancestorsOf(p, ["loner"]))).toEqual([]);
  });

  it("remove with descendants takes married-in partners with no other link, keeps blood relatives", () => {
    const p = pedigree();
    // son's branch: wife married in and only partnered with son, so she goes.
    expect(sorted(removeWithDescendantsSet(p, ["son"]))).toEqual(["gc1", "gc2", "son", "wife"]);
    // dau's branch: cousin has parents in the pedigree, so he stays.
    expect(sorted(removeWithDescendantsSet(p, ["dau"]))).toEqual(["dau", "gc3"]);
    // gf's branch: gm married in; uncle, aunt, cousin and loner stay.
    expect(sorted(removeWithDescendantsSet(p, ["gf"]))).toEqual(["dau", "gc1", "gc2", "gc3", "gf", "gm", "son", "wife"]);
  });

  it("a married-in partner with children by someone outside the branch stays", () => {
    const p = pedigree();
    p.individuals.push({ id: "ex", sex: "male", affected: false, sibOrder: 6 }, { id: "step", sex: "male", affected: false, sibOrder: 0 });
    p.partnerships.push({ id: "we", individual1: "wife", individual2: "ex" });
    p.parentOf.we = ["step"];
    expect(removeWithDescendantsSet(p, ["son"]).has("wife")).toBe(false);
  });

  it("remove with ancestors keeps descendants and the partner", () => {
    expect(sorted(removeWithAncestorsSet(pedigree(), ["dau"]))).toEqual(["dau", "gf", "gm"]);
    expect(sorted(removeWithAncestorsSet(pedigree(), ["gc3"]))).toEqual(["aunt", "cousin", "dau", "gc3", "gf", "gm", "uncle"]);
  });
});

describe("removeWithDescendants / removeWithAncestors (#34)", () => {
  const store = () => usePedigreeStore.getState();
  const ids = () => store().pedigree.individuals.map(i => i.id).sort();
  beforeEach(() => store().initialize(pedigree()));

  it("removes the branch, cleans twins, pins and unlocks, and says how many went", () => {
    store().setSelectedId("gc2");
    expect(store().removeWithDescendants(["son"])).toBe(4);
    const p = store().pedigree;
    expect(ids()).toEqual(["aunt", "cousin", "dau", "gc3", "gf", "gm", "loner", "uncle"]);
    expect(p.partnerships.map(q => q.id).sort()).toEqual(["dc", "g", "ua"]);
    expect(p.parentOf).toEqual({ g: ["dau"], ua: ["cousin"], dc: ["gc3"] });
    expect(p.partnerships.find(q => q.id === "g")!.twins).toBeUndefined();
    expect(p.pinnedPositions).toEqual({ gf: { x: 0, y: 0 } });
    expect(p.unlockedIndividuals).toEqual(["gf"]);
    expect(store().selectedId).toBeNull();
    expect(store().notice).toMatchObject({ kind: "info", text: "Removed 4 individuals.", undoable: true });
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  });

  it("remove with ancestors makes the descendants founders", () => {
    expect(store().removeWithAncestors(["gc3"])).toBe(7);
    expect(ids()).toEqual(["gc1", "gc2", "loner", "son", "wife"]);
    expect(store().pedigree.parentOf).toEqual({ sw: ["gc1", "gc2"] });
  });

  it("refuses to empty the pedigree, with an error notice and no undo entry", () => {
    const p: Pedigree = { ...pedigree(), individuals: pedigree().individuals.filter(i => ["gf", "gm", "son", "dau", "wife", "gc1", "gc2"].includes(i.id)) };
    p.partnerships = p.partnerships.filter(q => ["g", "sw"].includes(q.id));
    p.parentOf = { g: ["son", "dau"], sw: ["gc1", "gc2"] };
    store().initialize(p);
    expect(store().removeWithDescendants(["gf"])).toBe(0);
    expect(store().pedigree.individuals).toHaveLength(7);
    expect(store().past).toHaveLength(0);
    expect(store().notice?.kind).toBe("error");
  });

  it("is one undo step", () => {
    store().removeWithDescendants(["gf"]);
    expect(store().pedigree.individuals).toHaveLength(4);
    store().undo();
    expect(store().pedigree).toEqual(pedigree());
  });

  it("ignores unknown ids", () => {
    expect(store().removeWithAncestors(["nobody"])).toBe(0);
    expect(store().past).toHaveLength(0);
  });
});
