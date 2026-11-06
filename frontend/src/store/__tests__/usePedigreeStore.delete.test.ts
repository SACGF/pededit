import { describe, it, expect, beforeEach } from "vitest";
import { usePedigreeStore } from "../usePedigreeStore";
import type { Pedigree } from "@pedigree-editor/layout-engine";

function twoPinned(): Pedigree {
  return {
    individuals: [
      { id: "a", sex: "female", affected: false, sibOrder: 0 },
      { id: "b", sex: "male", affected: false, sibOrder: 1 },
    ],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    pinnedPositions: { a: { x: 10, y: 0 }, b: { x: 90, y: 0 } },
    unlockedIndividuals: ["a", "b"],
  };
}

const get = () => usePedigreeStore.getState();

describe("usePedigreeStore deleteIndividual", () => {
  beforeEach(() => {
    get().initialize(twoPinned());
  });

  it("drops the deleted person's pin and unlock entries", () => {
    get().deleteIndividual("a");
    expect(get().pedigree.pinnedPositions).toEqual({ b: { x: 90, y: 0 } });
    expect(get().pedigree.unlockedIndividuals).toEqual(["b"]);
  });

  it("removes the containers once they are empty", () => {
    get().deleteIndividual("a");
    get().deleteIndividual("b");
    expect(get().pedigree.pinnedPositions).toBeUndefined();
    expect(get().pedigree.unlockedIndividuals).toBeUndefined();
  });
});
