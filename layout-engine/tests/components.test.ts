import { describe, it, expect } from "vitest";
import { alignPedigree, alignPedigreeByFamily } from "../src/index.js";
import type { Pedigree } from "../src/types.js";

/**
 * Unrelated families must not interleave (#39): every member of one family
 * sits in a contiguous run of slots on every level, whatever order the
 * individuals were entered in. alignped1 builds one founder's tree at a time
 * and alignped3 joins the trees side by side, and the editor lays each family
 * out alone (families.ts, #64), so no separate component pass is needed.
 */
function twoFamiliesInterleaved(): Pedigree {
  // Entered alternating A, B, A, B so a naive per-depth sort would interleave.
  const rows: [string, string, string, Pedigree["individuals"][0]["sex"]][] = [
    ["a1", "", "", "male"], ["b1", "", "", "male"], ["a2", "", "", "female"], ["b2", "", "", "female"],
    ["a3", "a1", "a2", "male"], ["b3", "b1", "b2", "female"], ["a4", "a1", "a2", "female"], ["b4", "b1", "b2", "male"],
    ["a5", "a3", "a2x", "male"], ["b5", "b4", "b4x", "female"], ["a2x", "", "", "female"], ["b4x", "", "", "female"],
  ];
  const p: Pedigree = {
    individuals: rows.map(([id, , , sex], i) => ({ id, sex, affected: false, sibOrder: i })),
    partnerships: [], parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
  for (const [id, dad, mum] of rows) {
    if (!dad) continue;
    const pid = `${dad}_${mum}`;
    if (!p.parentOf[pid]) { p.partnerships.push({ id: pid, individual1: dad, individual2: mum }); p.parentOf[pid] = []; }
    p.parentOf[pid]!.push(id);
  }
  return p;
}

function runsPerLevel(p: Pedigree, r: ReturnType<typeof alignPedigree>): string[][] {
  // Family letter of each slot, collapsed into runs: ["a", "b"] means A then B with no interleaving.
  return r.nid.map(row => {
    const letters = row.map(i => p.individuals[Math.floor(i) - 1]!.id[0]!);
    return letters.filter((l, k) => k === 0 || l !== letters[k - 1]);
  });
}

describe("unrelated families stay contiguous (#39)", () => {
  it("alignPedigree keeps each family in one run of slots on every level", () => {
    const p = twoFamiliesInterleaved();
    const r = alignPedigree(p);
    for (const runs of runsPerLevel(p, r)) expect(runs.length).toBeLessThanOrEqual(2);
    // The founder order decides which family comes first, consistently on every level.
    const first = runsPerLevel(p, r).map(runs => runs[0]);
    expect(new Set(first).size).toBe(1);
  });

  it("alignPedigreeByFamily lays the families out side by side with a gap", () => {
    const p = twoFamiliesInterleaved();
    const r = alignPedigreeByFamily(p);
    for (const runs of runsPerLevel(p, r)) expect(runs.length).toBeLessThanOrEqual(2);
    const xs = (letter: string) => r.nid.flatMap((row, lev) => row.map((i, s) => [p.individuals[Math.floor(i) - 1]!.id[0], r.pos[lev]![s]!] as const).filter(([l]) => l === letter).map(([, x]) => x));
    expect(Math.max(...xs("a"))).toBeLessThan(Math.min(...xs("b")));
  });

  it("is deterministic", () => {
    const p = twoFamiliesInterleaved();
    expect(alignPedigree(p).nid).toEqual(alignPedigree(p).nid);
    expect(alignPedigreeByFamily(p).pos).toEqual(alignPedigreeByFamily(p).pos);
  });
});
