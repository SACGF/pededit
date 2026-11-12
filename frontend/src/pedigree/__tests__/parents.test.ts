import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setParentsProblem } from "../parents";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { lintFlow } from "../renderLint";
import { layoutToFlow } from "../layoutToFlow";
import { consanguinityTest } from "../consanguinity";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/** gf = gm → son, dau (twins); son = wife → gc1; orphan and loner have no parents. */
function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "gf", sex: "male", affected: false, sibOrder: 0 },
      { id: "gm", sex: "female", affected: false, sibOrder: 1 },
      { id: "son", sex: "male", affected: false, sibOrder: 0 },
      { id: "dau", sex: "female", affected: false, sibOrder: 1 },
      { id: "wife", sex: "female", affected: false, sibOrder: 2 },
      { id: "gc1", sex: "male", affected: false, sibOrder: 0 },
      { id: "orphan", sex: "female", affected: false, sibOrder: 3, name: "Orphan" },
      { id: "loner", sex: "unknown", affected: false, sibOrder: 4 },
      { id: "preg", sex: "unknown", affected: false, sibOrder: 5, lifeStatus: "pregnancy" },
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm", twins: [{ members: ["son", "dau"], zygosity: "dizygotic" }], childless: undefined },
      { id: "sw", individual1: "son", individual2: "wife" },
    ],
    parentOf: { g: ["son", "dau"], sw: ["gc1"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

describe("setParentsProblem (#36)", () => {
  const p = pedigree();
  it("rules", () => {
    expect(setParentsProblem(p, "orphan", [])).toMatch(/at least one/);
    expect(setParentsProblem(p, "orphan", ["gf", "gm", "son"])).toMatch(/at most two/);
    expect(setParentsProblem(p, "orphan", ["orphan"])).toMatch(/own parent/);
    expect(setParentsProblem(p, "gf", ["gc1"])).toMatch(/descendant/);
    expect(setParentsProblem(p, "orphan", ["gf", "son"])).toMatch(/both be male/);
    expect(setParentsProblem(p, "orphan", ["preg"])).toMatch(/pregnancy/);
    expect(setParentsProblem(p, "orphan", ["gf", "loner"])).toBeNull();
    expect(setParentsProblem(p, "orphan", ["son", "wife"])).toBeNull();
    expect(setParentsProblem(p, "orphan", ["wife"])).toBeNull();
  });
});

describe("setParents (#36)", () => {
  const store = () => usePedigreeStore.getState();
  const ped = () => store().pedigree;
  beforeEach(() => {
    store().initialize(pedigree());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("attaches to the parents' existing partnership", () => {
    expect(store().setParents("orphan", ["wife", "son"])).toBeNull();
    expect(ped().parentOf.sw).toEqual(["gc1", "orphan"]);
    expect(ped().partnerships).toHaveLength(2);
    expect(ped().individuals.find(i => i.id === "orphan")!.sibOrder).toBe(1);
    expect(store().notice).toMatchObject({ kind: "info", undoable: true });
    expect(lintFlow(ped(), layoutToFlow(ped()))).toEqual([]);
  });

  it("creates a partnership for two unrelated parents, father role first", () => {
    expect(store().setParents("orphan", ["gm", "loner"])).toBeNull();
    const p = ped().partnerships.find(q => (ped().parentOf[q.id] ?? []).includes("orphan"))!;
    expect([p.individual1, p.individual2]).toEqual(["loner", "gm"]);
    expect(p.consanguineous).toBeUndefined();
  });

  it("a new partnership between relatives is drawn double, with no flag stored (#85)", () => {
    expect(store().setParents("orphan", ["dau", "gc1"])).toBeNull();
    const p = ped().partnerships.find(q => (ped().parentOf[q.id] ?? []).includes("orphan"))!;
    expect(p.consanguineous).toBeUndefined();
    expect(consanguinityTest(ped())(p.individual1, p.individual2)).toBe(true);
    expect(lintFlow(ped(), layoutToFlow(ped()))).toEqual([]);
  });

  it("a single parent gets a placeholder partner of the opposite sex", () => {
    expect(store().setParents("orphan", ["wife"])).toBeNull();
    const p = ped().partnerships.find(q => (ped().parentOf[q.id] ?? []).includes("orphan"))!;
    expect(p.id).not.toBe("sw");
    expect(p.individual2).toBe("wife");
    const placeholder = ped().individuals.find(i => i.id === p.individual1)!;
    expect(placeholder.sex).toBe("male");
    expect(ped().individuals).toHaveLength(10);
  });

  it("re-parents a child who already has parents and cleans their old twin set", () => {
    expect(store().setParents("dau", ["son", "wife"])).toBeNull();
    expect(ped().parentOf.g).toEqual(["son"]);
    expect(ped().parentOf.sw).toEqual(["gc1", "dau"]);
    expect(ped().partnerships.find(q => q.id === "g")!.twins).toBeUndefined();
    expect(store().notice?.text).toMatch(/moved from the previous parents/);
  });

  it("clears a childless mark on the partnership it attaches to", () => {
    store().initialize({ ...pedigree(), partnerships: [{ id: "g", individual1: "gf", individual2: "gm", childless: "byChoice" }, { id: "sw", individual1: "son", individual2: "wife" }], parentOf: { g: [], sw: ["gc1", "son", "dau"] } });
    store().setParents("orphan", ["gf", "gm"]);
    expect(ped().partnerships.find(q => q.id === "g")!.childless).toBeUndefined();
  });

  it("refuses with the rule's message and no undo entry", () => {
    expect(store().setParents("gf", ["gc1"])).toMatch(/descendant/);
    expect(store().past).toHaveLength(0);
  });

  it("is one undo step", () => {
    store().setParents("orphan", ["son", "wife"]);
    store().undo();
    expect(ped()).toEqual(pedigree());
  });
});

describe("picking (#36)", () => {
  const store = () => usePedigreeStore.getState();
  beforeEach(() => {
    store().initialize(pedigree());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("collects two parents and applies on the second pick", () => {
    expect(store().pickIndividual("son")).toBe(false); // not picking: click falls through to select
    store().startPickingParents("orphan");
    expect(store().selectedId).toBe("orphan");
    expect(store().pickIndividual("son")).toBe(true);
    expect(store().picking).toMatchObject({ kind: "parents", picked: ["son"] });
    store().pickIndividual("son"); // toggles off
    expect(store().picking).toMatchObject({ picked: [] });
    store().pickIndividual("son");
    store().pickIndividual("wife");
    expect(store().picking).toBeNull();
    expect(store().pedigree.parentOf.sw).toContain("orphan");
  });

  it("refuses a bad pick with a notice and keeps picking", () => {
    store().startPickingParents("gf");
    store().pickIndividual("gc1");
    expect(store().notice?.kind).toBe("error");
    expect(store().picking).toMatchObject({ picked: [] });
    store().pickIndividual("gf");
    expect(store().notice?.text).toMatch(/own parent/);
  });

  it("applies a single parent on request, and cancels", () => {
    store().startPickingParents("orphan");
    store().pickIndividual("wife");
    store().applyPicking();
    expect(store().picking).toBeNull();
    expect(store().pedigree.individuals).toHaveLength(10);
    store().startPickingParents("loner");
    store().cancelPicking();
    expect(store().picking).toBeNull();
  });

  it("picking a child for a couple applies at once", () => {
    store().startPickingChild("sw");
    store().pickIndividual("orphan");
    expect(store().picking).toBeNull();
    expect(store().pedigree.parentOf.sw).toEqual(["gc1", "orphan"]);
    store().startPickingChild("sw");
    store().pickIndividual("gf"); // gf is an ancestor of son: refused
    expect(store().notice?.kind).toBe("error");
    expect(store().picking).toMatchObject({ kind: "child" });
  });
});
