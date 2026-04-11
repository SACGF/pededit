import { describe, it, expect } from "vitest";
import { alignped3 } from "../src/alignped3.js";
import type { AlignState } from "../src/types.js";

/** Build a single-node AlignState at the given level (1-based). */
function makeSingleNode(id: number, lev: number, maxlev: number): AlignState {
  const n = new Int32Array(maxlev + 1);
  n[lev] = 1;
  const nid: Float64Array[] = Array.from({ length: maxlev + 1 }, () => new Float64Array(2));
  const pos: Float64Array[] = Array.from({ length: maxlev + 1 }, () => new Float64Array(2));
  const fam: Int32Array[] = Array.from({ length: maxlev + 1 }, () => new Int32Array(2));
  nid[lev]![1] = id;
  pos[lev]![1] = 0;
  return { n, nid, pos, fam };
}

/** Build a two-node row: [id1, id2] at lev in maxlev levels. */
function makeTwoNodes(id1: number, id2: number, lev: number, maxlev: number): AlignState {
  const n = new Int32Array(maxlev + 1);
  n[lev] = 2;
  const nid: Float64Array[] = Array.from({ length: maxlev + 1 }, () => new Float64Array(3));
  const pos: Float64Array[] = Array.from({ length: maxlev + 1 }, () => new Float64Array(3));
  const fam: Int32Array[] = Array.from({ length: maxlev + 1 }, () => new Int32Array(3));
  nid[lev]![1] = id1; nid[lev]![2] = id2;
  pos[lev]![1] = 0;   pos[lev]![2] = 1;
  return { n, nid, pos, fam };
}

describe("alignped3 - merge two trees", () => {
  it("merges two single-individual trees side by side (packed)", () => {
    const t1 = makeSingleNode(1, 1, 1);
    const t2 = makeSingleNode(2, 1, 1);
    const result = alignped3(t1, t2, true);
    expect(result.n[1]).toBe(2);
    expect(result.nid[1]![1]).toBe(1);
    expect(result.nid[1]![2]).toBe(2);
    expect(result.pos[1]![1]).toBe(0);
    expect(result.pos[1]![2]).toBe(1); // packed: 0 + space=1
  });

  it("three nodes merged two at a time", () => {
    const t1 = makeTwoNodes(1, 2, 1, 1);
    const t2 = makeSingleNode(3, 1, 1);
    const result = alignped3(t1, t2, true);
    expect(result.n[1]).toBe(3);
    expect(result.nid[1]![3]).toBe(3);
    expect(result.pos[1]![3]).toBe(2);
  });

  it("overlapping rightmost/leftmost individual is collapsed to one slot", () => {
    // Individual 3 is the rightmost in t1 and leftmost in t2.
    const t1 = makeTwoNodes(1, 3, 1, 1);
    const t2 = makeTwoNodes(3, 4, 1, 1);
    const result = alignped3(t1, t2, true);
    // After merge, individual 3 should appear exactly once
    const ni = result.n[1] ?? 0;
    const ids: number[] = [];
    for (let c = 1; c <= ni; c++) ids.push(Math.floor(result.nid[1]![c]!));
    const threes = ids.filter(id => id === 3);
    expect(threes.length).toBe(1);
    // Total individuals: 1, 3, 4 (not 1, 3, 3, 4)
    expect(ni).toBe(3);
  });

  it("fam pointers in the row below are adjusted after merge", () => {
    // t1: parent at lev=1, child at lev=2 with fam=1
    const t1: AlignState = {
      n: new Int32Array([0, 1, 1]),
      nid: [
        new Float64Array(2),
        new Float64Array([0, 1]),
        new Float64Array([0, 3]),
      ],
      pos: [
        new Float64Array(2),
        new Float64Array([0, 0]),
        new Float64Array([0, 0]),
      ],
      fam: [
        new Int32Array(2),
        new Int32Array(2),
        new Int32Array([0, 1]),
      ],
    };
    // t2: parent at lev=1, child at lev=2 with fam=1
    const t2: AlignState = {
      n: new Int32Array([0, 1, 1]),
      nid: [
        new Float64Array(2),
        new Float64Array([0, 2]),
        new Float64Array([0, 4]),
      ],
      pos: [
        new Float64Array(2),
        new Float64Array([0, 0]),
        new Float64Array([0, 0]),
      ],
      fam: [
        new Int32Array(2),
        new Int32Array(2),
        new Int32Array([0, 1]),
      ],
    };
    const result = alignped3(t1, t2, true);
    // Level 1: [1, 2]; Level 2: [3, 4]
    expect(result.n[1]).toBe(2);
    expect(result.n[2]).toBe(2);
    // Child 4's fam pointer should be adjusted: originally 1 in t2, now 1 + 1 (n1=1) - 0 = 2
    expect(result.fam[2]![2]).toBe(2);
    // Child 3's fam pointer stays 1
    expect(result.fam[2]![1]).toBe(1);
  });
});
