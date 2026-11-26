import { describe, it, expect, beforeEach } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { usePedigreeStore, MAX_ADD_CHILDREN } from "../usePedigreeStore";
import { F, M, build, couple } from "../../fixtures/features";
import { expectOneUndoStep } from "./undoSteps";

const loneMale = () => build([M("p1")], [], {});

/** c2's sibOrder has a gap below it (4), which new children must follow. */
const coupleWithTwoKids = (): Pedigree => {
  const p = build([M("p1"), F("p2"), M("c1"), F("c2")], [couple("pp", "p1", "p2")], { pp: ["c1", "c2"] });
  p.individuals.find(i => i.id === "c2")!.sibOrder = 4;
  return p;
};

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
    expectOneUndoStep(() => store().addChildren("p1", 3, "female"));

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

  it("adds to the chosen partnership when the individual has several", () => {
    const ped = coupleWithTwoKids();
    ped.individuals.push(F("p3"));
    ped.partnerships.push(couple("pq", "p1", "p3"));
    ped.parentOf["pq"] = [];
    store().initialize(ped);
    store().addChildren("p1", 2, "male", "pq");
    expect(store().pedigree.parentOf["pq"]).toHaveLength(2);
    expect(store().pedigree.parentOf["pp"]).toHaveLength(2);

    // A partnership that is not the individual's falls back to the first.
    store().addChildren("p3", 1, "male", "pp");
    expect(store().pedigree.parentOf["pq"]).toHaveLength(3);
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
