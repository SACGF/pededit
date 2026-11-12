import { describe, it, expect, beforeEach } from "vitest";
import { usePedigreeStore, selectedPair } from "../usePedigreeStore";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * gp1 + gp2 -> dad; dad + mum (married in) -> kid1, kid2; kid1 + spouse
 * (married in) -> gk. aunt is dad's sister.
 */
function family(): Pedigree {
  const ind = (id: string, sex: "male" | "female", sibOrder = 0) => ({ id, sex, affected: false, sibOrder });
  return {
    individuals: [
      ind("gp1", "male"), ind("gp2", "female"),
      ind("dad", "male"), ind("aunt", "female", 1), ind("mum", "female"),
      ind("kid1", "male"), ind("kid2", "female", 1), ind("spouse", "female"),
      ind("gk", "male"),
    ],
    partnerships: [
      { id: "p0", individual1: "gp1", individual2: "gp2" },
      { id: "p1", individual1: "dad", individual2: "mum" },
      { id: "p2", individual1: "kid1", individual2: "spouse" },
    ],
    parentOf: { p0: ["dad", "aunt"], p1: ["kid1", "kid2"], p2: ["gk"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const get = () => usePedigreeStore.getState();

describe("selection (#21)", () => {
  beforeEach(() => get().initialize(family()));

  it("starts empty and setSelectedId selects one", () => {
    expect(get().selectedIds).toEqual([]);
    expect(get().selectedId).toBeNull();
    get().setSelectedId("dad");
    expect(get().selectedIds).toEqual(["dad"]);
    expect(get().selectedId).toBe("dad");
    get().setSelectedId(null);
    expect(get().selectedIds).toEqual([]);
    expect(get().selectedId).toBeNull();
  });

  it("toggleSelected adds as primary and removes, falling back to the last", () => {
    get().setSelectedId("dad");
    get().toggleSelected("mum");
    expect(get().selectedIds).toEqual(["dad", "mum"]);
    expect(get().selectedId).toBe("mum");
    get().toggleSelected("aunt");
    get().toggleSelected("aunt");
    expect(get().selectedIds).toEqual(["dad", "mum"]);
    expect(get().selectedId).toBe("mum");
    get().toggleSelected("mum");
    expect(get().selectedIds).toEqual(["dad"]);
    expect(get().selectedId).toBe("dad");
    get().toggleSelected("dad");
    expect(get().selectedId).toBeNull();
  });

  it("setSelection dedupes and keeps a valid primary", () => {
    get().setSelection(["a", "b", "a"], "a");
    expect(get().selectedIds).toEqual(["a", "b"]);
    expect(get().selectedId).toBe("a");
    get().setSelection(["a", "b"], "zzz");
    expect(get().selectedId).toBe("b");
    get().setSelection([]);
    expect(get().selectedId).toBeNull();
  });

  it("selectedPair reads exactly two, primary second", () => {
    expect(selectedPair(get())).toBeNull();
    get().setSelectedId("dad");
    expect(selectedPair(get())).toBeNull();
    get().toggleSelected("aunt");
    expect(selectedPair(get())).toEqual(["dad", "aunt"]);
    get().toggleSelected("mum");
    expect(selectedPair(get())).toBeNull();
  });

  it("selectDescendants takes the branch with married-in partners, person as primary", () => {
    expect(get().selectDescendants("dad")).toBe(6);
    expect(new Set(get().selectedIds)).toEqual(new Set(["dad", "mum", "kid1", "kid2", "spouse", "gk"]));
    expect(get().selectedId).toBe("dad");
    expect(get().past).toHaveLength(0); // not an edit
  });

  it("selectDescendants of a leaf is just them; unknown ids select nothing", () => {
    expect(get().selectDescendants("kid2")).toBe(1);
    expect(get().selectedIds).toEqual(["kid2"]);
    expect(get().selectDescendants("nope")).toBe(0);
    expect(get().selectedIds).toEqual(["kid2"]);
  });

  it("removals, undo and redo drop selected people who are gone", () => {
    get().setSelection(["dad", "kid2", "aunt"], "kid2");
    get().deleteIndividual("kid2");
    expect(get().selectedIds).toEqual(["dad", "aunt"]);
    expect(get().selectedId).toBe("aunt");
    get().undo();
    get().setSelection(["kid2"]);
    get().redo();
    expect(get().selectedIds).toEqual([]);
  });

  it("deleteIndividuals removes all of them as one undo step", () => {
    get().setSelection(["kid2", "aunt"]);
    expect(get().deleteIndividuals(["kid2", "aunt"])).toBe(2);
    expect(get().pedigree.individuals.map(i => i.id)).not.toContain("kid2");
    expect(get().pedigree.individuals.map(i => i.id)).not.toContain("aunt");
    expect(get().past).toHaveLength(1);
    expect(get().selectedIds).toEqual([]);
    get().undo();
    expect(get().pedigree.individuals).toHaveLength(9);
  });

  it("initialize clears the selection", () => {
    get().setSelection(["dad", "mum"]);
    get().initialize(family());
    expect(get().selectedIds).toEqual([]);
    expect(get().selectedId).toBeNull();
  });
});

describe("batch pin, lock and unlock (#21)", () => {
  beforeEach(() => get().initialize(family()));

  it("pinIndividuals pins every one as a single undo step", () => {
    get().pinIndividuals({ dad: { x: 100, y: 120 }, mum: { x: 180, y: 120 } });
    expect(get().pedigree.pinnedPositions).toEqual({ dad: { x: 100, y: 120 }, mum: { x: 180, y: 120 } });
    expect(get().past).toHaveLength(1);
    get().undo();
    expect(get().pedigree.pinnedPositions).toBeUndefined();
  });

  it("pinIndividuals with nothing is not an edit", () => {
    get().pinIndividuals({});
    expect(get().past).toHaveLength(0);
  });

  it("pinIndividuals keeps the group's shape on the snap grid", () => {
    get().updateCanvasSettings({ snapToGrid: true, snapGridSize: 10 });
    const before = get().past.length;
    // Grid-aligned nodes moved by a grid-aligned delta stay exactly where dropped.
    get().pinIndividuals({ dad: { x: 130, y: 240 }, mum: { x: 210, y: 240 }, kid1: { x: 170, y: 360 } });
    expect(get().pedigree.pinnedPositions).toEqual({ dad: { x: 130, y: 240 }, mum: { x: 210, y: 240 }, kid1: { x: 170, y: 360 } });
    expect(get().past.length).toBe(before + 1);
  });

  it("unlockIndividuals and lockIndividuals are one step each", () => {
    get().unlockIndividuals(["dad", "mum", "dad"]);
    expect(get().pedigree.unlockedIndividuals).toEqual(["dad", "mum"]);
    expect(get().past).toHaveLength(1);
    get().unlockIndividuals(["dad", "kid1"]);
    expect(get().pedigree.unlockedIndividuals).toEqual(["dad", "mum", "kid1"]);
    get().pinIndividuals({ dad: { x: 0, y: 0 }, kid1: { x: 80, y: 240 } });
    const before = get().past.length;
    get().lockIndividuals(["dad", "kid1"]);
    expect(get().past.length).toBe(before + 1);
    expect(get().pedigree.unlockedIndividuals).toEqual(["mum"]);
    // Locking returns them to auto layout.
    expect(get().pedigree.pinnedPositions).toBeUndefined();
  });

  it("batch lock and unlock with nothing to change are not edits", () => {
    get().lockIndividuals(["dad"]);
    expect(get().past).toHaveLength(0);
    get().unlockIndividuals(["dad"]);
    get().unlockIndividuals(["dad"]);
    expect(get().past).toHaveLength(1);
  });
});
