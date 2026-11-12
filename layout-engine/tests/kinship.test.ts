import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { kinshipCoefficients, buildPedigreeFromFlat } from "../src/index.js";
import type { Pedigree } from "../src/index.js";

/** [id, father, mother, sex] rows, 0 for a founder's parents. */
function ped(rows: number[][]): Pedigree {
  return buildPedigreeFromFlat(rows.map(([id, father, mother, sex]) => ({ id: id!, father: father!, mother: mother!, sex: sex! })));
}
const phi = (p: Pedigree, a: number, b: number) => kinshipCoefficients(p).kinship(String(a), String(b));
const F = (p: Pedigree, a: number) => kinshipCoefficients(p).inbreeding(String(a));

// Two founders, their children 3 (m) and 4 (f).
const SIBS = [[1, 0, 0, 1], [2, 0, 0, 2], [3, 1, 2, 1], [4, 1, 2, 2]];

describe("kinshipCoefficients: textbook values (#32)", () => {
  it("founders, parent and child, full siblings", () => {
    const p = ped(SIBS);
    expect(phi(p, 1, 1)).toBe(1 / 2);
    expect(phi(p, 1, 2)).toBe(0);
    expect(phi(p, 1, 3)).toBe(1 / 4);
    expect(phi(p, 3, 4)).toBe(1 / 4);
    expect(phi(p, 4, 3)).toBe(1 / 4);
    expect(F(p, 3)).toBe(0);
  });

  it("half siblings 1/8", () => {
    const p = ped([[1, 0, 0, 1], [2, 0, 0, 2], [3, 0, 0, 2], [4, 1, 2, 1], [5, 1, 3, 2]]);
    expect(phi(p, 4, 5)).toBe(1 / 8);
  });

  it("grandparent and grandchild 1/8, uncle and niece 1/8, first cousins 1/16", () => {
    const p = ped([...SIBS, [5, 0, 0, 2], [6, 0, 0, 1], [7, 3, 5, 1], [8, 6, 4, 2]]);
    expect(phi(p, 1, 7)).toBe(1 / 8);
    expect(phi(p, 3, 8)).toBe(1 / 8);
    expect(phi(p, 7, 8)).toBe(1 / 16);
  });

  it("first cousins once removed 1/32, second cousins 1/64", () => {
    const p = ped([
      ...SIBS, [5, 0, 0, 2], [6, 0, 0, 1], [7, 3, 5, 1], [8, 6, 4, 2],
      [9, 0, 0, 2], [10, 0, 0, 1], [11, 7, 9, 1], [12, 10, 8, 2],
    ]);
    expect(phi(p, 7, 12)).toBe(1 / 32);
    expect(phi(p, 11, 12)).toBe(1 / 64);
  });

  it("double first cousins 1/8", () => {
    // Two brothers (5, 6) marry two sisters (7, 8).
    const p = ped([
      [1, 0, 0, 1], [2, 0, 0, 2], [3, 0, 0, 1], [4, 0, 0, 2],
      [5, 1, 2, 1], [6, 1, 2, 1], [7, 3, 4, 2], [8, 3, 4, 2],
      [9, 5, 7, 1], [10, 6, 8, 2],
    ]);
    expect(phi(p, 9, 10)).toBe(1 / 8);
  });

  it("three-quarter siblings 3/16", () => {
    // One father, mothers who are sisters.
    const p = ped([
      [1, 0, 0, 1], [2, 0, 0, 2], [3, 1, 2, 2], [4, 1, 2, 2],
      [5, 0, 0, 1], [6, 5, 3, 1], [7, 5, 4, 2],
    ]);
    expect(phi(p, 6, 7)).toBe(3 / 16);
  });

  it("inbreeding is the kinship of the parents", () => {
    // Child of full siblings 1/4, of first cousins 1/16, of uncle and niece 1/8.
    expect(F(ped([...SIBS, [5, 3, 4, 1]]), 5)).toBe(1 / 4);
    const cousins = ped([...SIBS, [5, 0, 0, 2], [6, 0, 0, 1], [7, 3, 5, 1], [8, 6, 4, 2], [9, 7, 8, 1]]);
    expect(F(cousins, 9)).toBe(1 / 16);
    expect(phi(cousins, 9, 9)).toBe((1 + 1 / 16) / 2);
    const uncle = ped([...SIBS, [6, 0, 0, 1], [8, 6, 4, 2], [9, 3, 8, 1]]);
    expect(F(uncle, 9)).toBe(1 / 8);
  });

  it("an inbred parent raises the kinship with their child", () => {
    // 5 is the child of full siblings (F = 1/4); kinship with their own child is (1 + F) / 4.
    const p = ped([...SIBS, [5, 3, 4, 1], [6, 0, 0, 2], [7, 5, 6, 2]]);
    expect(phi(p, 5, 7)).toBe((1 + 1 / 4) / 4);
  });

  it("does not depend on the order individuals are listed in", () => {
    const rows = [...SIBS, [5, 0, 0, 2], [6, 0, 0, 1], [7, 3, 5, 1], [8, 6, 4, 2], [9, 7, 8, 1]];
    const p = ped(rows);
    const reversed: Pedigree = { ...p, individuals: [...p.individuals].reverse(), partnerships: [...p.partnerships].reverse() };
    const a = kinshipCoefficients(p), b = kinshipCoefficients(reversed);
    for (const x of p.individuals) for (const y of p.individuals) expect(b.kinship(x.id, y.id)).toBe(a.kinship(x.id, y.id));
  });
});

describe("kinshipCoefficients: what counts as a parent", () => {
  it("someone adopted in is unrelated to the adoptive family", () => {
    const p = ped(SIBS);
    p.individuals.find(i => i.id === "4")!.adopted = "in";
    expect(phi(p, 3, 4)).toBe(0);
    expect(phi(p, 1, 4)).toBe(0);
    expect(phi(p, 4, 4)).toBe(1 / 2);
    // A child of the adoptive siblings is not inbred.
    const withChild = ped([...SIBS, [5, 3, 4, 1]]);
    expect(F(withChild, 5)).toBe(1 / 4);
    withChild.individuals.find(i => i.id === "4")!.adopted = "in";
    expect(F(withChild, 5)).toBe(0);
  });

  it("someone adopted out keeps their biological parents", () => {
    const p = ped(SIBS);
    p.individuals.find(i => i.id === "4")!.adopted = "out";
    expect(phi(p, 3, 4)).toBe(1 / 4);
  });

  it("only monozygotic twins share a genome", () => {
    const p = ped(SIBS.concat([[5, 1, 2, 2]]));
    const g = p.partnerships[0]!;
    g.twins = [{ members: ["4", "5"], zygosity: "dizygotic" }];
    expect(phi(p, 4, 5)).toBe(1 / 4);
    g.twins = [{ members: ["4", "5"], zygosity: "unknown" }];
    expect(phi(p, 4, 5)).toBe(1 / 4);
    g.twins = [{ members: ["4", "5"], zygosity: "monozygotic" }];
    expect(phi(p, 4, 5)).toBe(1 / 2);
    expect(phi(p, 3, 5)).toBe(1 / 4);
  });
});

describe("kinshipCoefficients: bad input", () => {
  it("unknown ids give 0", () => {
    const k = kinshipCoefficients(ped(SIBS));
    expect(k.kinship("1", "nobody")).toBe(0);
    expect(k.kinship("nobody", "nobody")).toBe(0);
    expect(k.inbreeding("nobody")).toBe(0);
  });

  it("an empty pedigree and a lone individual", () => {
    expect(kinshipCoefficients(ped([])).kinship("1", "1")).toBe(0);
    expect(phi(ped([[1, 0, 0, 1]]), 1, 1)).toBe(1 / 2);
  });

  it("ancestry that loops back on itself terminates with finite values", () => {
    // 1 is recorded as a child of their own grandchild.
    const p = ped([[1, 5, 2, 1], [2, 0, 0, 2], [3, 1, 2, 1], [4, 0, 0, 2], [5, 3, 4, 1]]);
    const k = kinshipCoefficients(p);
    for (const a of p.individuals) for (const b of p.individuals) {
      const v = k.kinship(a.id, b.id);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("a partnership naming someone who is not in the pedigree", () => {
    const p = ped(SIBS);
    p.partnerships[0]!.individual2 = "gone";
    expect(phi(p, 3, 4)).toBe(1 / 8); // one known shared parent
    expect(F(p, 3)).toBe(0);
  });
});

// ── Monozygotic twins against kinship2 ──────────────────────────────────────

interface TwinCase { rows: number[][]; mz: number[][]; ids: number[]; pairs: [number, number, number][] }
const ORACLE = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "oracle/kinship.json"), "utf8",
)) as { twins: Record<string, TwinCase> };

describe("kinshipCoefficients: monozygotic twins match kinship2", () => {
  it.each(Object.entries(ORACLE.twins))("%s", (_name, c) => {
    const p = ped(c.rows);
    for (const set of c.mz) {
      const members = set.map(String);
      const partnership = p.partnerships.find(x => (p.parentOf[x.id] ?? []).includes(members[0]!))!;
      partnership.twins = [...(partnership.twins ?? []), { members, zygosity: "monozygotic" }];
    }
    const k = kinshipCoefficients(p);
    const expected = new Map(c.pairs.map(([i, j, v]) => [`${i},${j}`, v]));
    for (let i = 1; i <= c.ids.length; i++) {
      for (let j = i; j <= c.ids.length; j++) {
        const got = k.kinship(String(c.ids[i - 1]), String(c.ids[j - 1]));
        expect(got, `kinship(${c.ids[i - 1]}, ${c.ids[j - 1]})`).toBeCloseTo(expected.get(`${i},${j}`) ?? 0, 12);
      }
    }
  });

  it("the cases are not trivial", () => {
    const c = ORACLE.twins.mz_sisters_children!;
    const at = (a: number, b: number) => c.pairs.find(([i, j]) => c.ids[i - 1] === a && c.ids[j - 1] === b)?.[2];
    expect(at(3, 4)).toBe(0.5);   // the twins
    expect(at(7, 8)).toBe(0.125); // their children: as close as half siblings
  });
});
