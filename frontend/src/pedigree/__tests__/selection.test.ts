import { describe, it, expect } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { batchLockState } from "../selection";

function pedigree(extra: Partial<Pedigree>): Pedigree {
  return {
    individuals: ["a", "b", "c"].map((id, i) => ({ id, sex: "male" as const, affected: false, sibOrder: i })),
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...extra,
  };
}

describe("batchLockState (#21)", () => {
  it("unlocks the locked ones and locks the unlocked or pinned ones", () => {
    const p = pedigree({ unlockedIndividuals: ["a"], pinnedPositions: { b: { x: 0, y: 0 } } });
    expect(batchLockState(p, ["a", "b", "c"])).toEqual({ toUnlock: ["b", "c"], toLock: ["a", "b"] });
  });

  it("offers no unlock when every node is moveable", () => {
    const p = pedigree({ canvasSettings: { nodesMoveable: true, snapToGrid: false, snapGridSize: 5 }, pinnedPositions: { c: { x: 0, y: 0 } } });
    expect(batchLockState(p, ["a", "c"])).toEqual({ toUnlock: [], toLock: ["c"] });
  });

  it("is empty for no ids", () => {
    expect(batchLockState(pedigree({}), [])).toEqual({ toUnlock: [], toLock: [] });
  });
});
