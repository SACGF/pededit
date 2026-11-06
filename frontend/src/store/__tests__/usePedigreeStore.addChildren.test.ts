import { describe, it, expect, beforeEach } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { usePedigreeStore, MAX_ADD_CHILDREN } from "../usePedigreeStore";

function loneMale(): Pedigree {
  return {
    individuals: [
      { id: "p1", sex: "male", affected: false, sibOrder: 0, name: "", notes: "" },
    ],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

function coupleWithTwoKids(): Pedigree {
  return {
    individuals: [
      { id: "p1", sex: "male", affected: false, sibOrder: 0, name: "", notes: "" },
      { id: "p2", sex: "female", affected: false, sibOrder: 0, name: "", notes: "" },
      { id: "c1", sex: "male", affected: false, sibOrder: 0, name: "", notes: "" },
      { id: "c2", sex: "female", affected: false, sibOrder: 4, name: "", notes: "" },
    ],
    partnerships: [{ id: "pp", individual1: "p1", individual2: "p2" }],
    parentOf: { pp: ["c1", "c2"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const store = () => usePedigreeStore.getState();

describe("addChildren", () => {
  beforeEach(() => {
    usePedigreeStore.getState().reset();
  });

  it("adds three daughters with consecutive sibOrder to a new partnership", () => {
    store().initialize(loneMale());
    store().addChildren("p1", 3, "female");

    const { pedigree } = store();
    // p1 + placeholder partner + 3 daughters
    expect(pedigree.individuals).toHaveLength(5);
    expect(pedigree.partnerships).toHaveLength(1);

    const partnership = pedigree.partnerships[0]!;
    expect(partnership.individual1).toBe("p1");
    const partner = pedigree.individuals.find(i => i.id === partnership.individual2)!;
    expect(partner.sex).toBe("female");

    const childIds = pedigree.parentOf[partnership.id]!;
    expect(childIds).toHaveLength(3);
    const children = childIds.map(id => pedigree.individuals.find(i => i.id === id)!);
    expect(children.map(c => c.sex)).toEqual(["female", "female", "female"]);
    expect(children.map(c => c.sibOrder)).toEqual([0, 1, 2]);
  });

  it("is a single undo step", () => {
    store().initialize(loneMale());
    store().addChildren("p1", 3, "female");
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(store().pedigree.individuals).toHaveLength(1);
    expect(store().pedigree.partnerships).toHaveLength(0);
    expect(store().pedigree.parentOf).toEqual({});

    store().redo();
    expect(store().pedigree.individuals).toHaveLength(5);
  });

  it("appends to the existing partnership after the current sibOrder values", () => {
    store().initialize(coupleWithTwoKids());
    store().addChildren("p2", 2, "unknown");

    const { pedigree } = store();
    expect(pedigree.partnerships).toHaveLength(1);
    expect(pedigree.individuals).toHaveLength(6);

    const childIds = pedigree.parentOf["pp"]!;
    expect(childIds.slice(0, 2)).toEqual(["c1", "c2"]);
    const added = childIds.slice(2).map(id => pedigree.individuals.find(i => i.id === id)!);
    expect(added.map(c => c.sex)).toEqual(["unknown", "unknown"]);
    expect(added.map(c => c.sibOrder)).toEqual([5, 6]);
  });

  it("clamps count to 1..MAX_ADD_CHILDREN", () => {
    store().initialize(coupleWithTwoKids());
    store().addChildren("p1", 0, "male");
    expect(store().pedigree.parentOf["pp"]).toHaveLength(3);

    store().addChildren("p1", 999, "male");
    expect(store().pedigree.parentOf["pp"]).toHaveLength(3 + MAX_ADD_CHILDREN);
  });

  it("matches addChild for a single child", () => {
    store().initialize(coupleWithTwoKids());
    store().addChild("p1", "unknown");
    const viaAddChild = structuredClone(store().pedigree);

    store().initialize(coupleWithTwoKids());
    store().addChildren("p1", 1, "unknown");
    const viaAddChildren = store().pedigree;

    const strip = (p: Pedigree) => ({
      n: p.individuals.length,
      sexes: p.parentOf["pp"]!.map(id => p.individuals.find(i => i.id === id)!.sex),
      orders: p.parentOf["pp"]!.map(id => p.individuals.find(i => i.id === id)!.sibOrder),
    });
    expect(strip(viaAddChildren)).toEqual(strip(viaAddChild));
  });
});
