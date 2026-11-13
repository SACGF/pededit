import { describe, it, expect } from "vitest";
import { alignPedigreeByFamily, alignPedigree, drawnLeftPartner } from "../src/index.js";
import type { Pedigree, Individual, Partnership, LayoutResult } from "../src/types.js";

/**
 * Partner side (#106): `Partnership.leftPartner` reaches kinship2 as a spouse
 * hint, so the couple swaps sides without anyone being pinned.
 */

type Row = [string, Individual["sex"], string?, string?]; // id, sex, father, mother

function build(rows: Row[], couples: [string, string][] = []): Pedigree {
  const p: Pedigree = {
    individuals: rows.map(([id, sex], i) => ({ id, sex, affected: false, sibOrder: i })),
    partnerships: [], parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
  const couple = (a: string, b: string): Partnership => {
    let q = p.partnerships.find(x => (x.individual1 === a && x.individual2 === b) || (x.individual1 === b && x.individual2 === a));
    if (!q) { q = { id: `${a}_${b}`, individual1: a, individual2: b }; p.partnerships.push(q); p.parentOf[q.id] = []; }
    return q;
  };
  for (const [a, b] of couples) couple(a, b);
  for (const [id, , dad, mum] of rows) if (dad && mum) p.parentOf[couple(dad, mum).id]!.push(id);
  return p;
}

function withSide(p: Pedigree, pid: string, left: string): Pedigree {
  return { ...p, partnerships: p.partnerships.map(q => q.id === pid ? { ...q, leftPartner: left } : q) };
}

/** Each person's x on their row (first copy), by id. */
function xs(p: Pedigree, r: LayoutResult): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (let lev = 0; lev < r.n.length; lev++) {
    for (let c = 0; c < r.n[lev]!; c++) {
      const id = p.individuals[r.nid[lev]![c]! - 1]!.id;
      out.set(id, [...(out.get(id) ?? []), r.pos[lev]![c]!]);
    }
  }
  return out;
}

function copies(p: Pedigree, r: LayoutResult): number {
  let total = 0;
  for (let lev = 0; lev < r.n.length; lev++) total += r.n[lev]!;
  return total - p.individuals.length;
}

describe("partner side (#106)", () => {
  it("swaps a founder couple", () => {
    const p = build([["F", "male"], ["M", "female"], ["c", "male", "F", "M"]]);
    expect(drawnLeftPartner(p, alignPedigreeByFamily(p), "F_M")).toBe("F");
    const s = withSide(p, "F_M", "M");
    const r = alignPedigreeByFamily(s);
    expect(drawnLeftPartner(s, r, "F_M")).toBe("M");
    expect(copies(s, r)).toBe(0);
  });

  it("swaps a married-in partner beside a blood relative, keeping the sibship together", () => {
    const p = build([
      ["F", "male"], ["M", "female"],
      ["a", "female", "F", "M"], ["b", "male", "F", "M"], ["c", "female", "F", "M"],
      ["W", "female"], ["k", "male", "b", "W"],
    ]);
    const before = xs(p, alignPedigreeByFamily(p));
    expect(before.get("b")![0]!).toBeLessThan(before.get("W")![0]!);
    const s = withSide(p, "b_W", "W");
    const r = alignPedigreeByFamily(s);
    const after = xs(s, r);
    expect(after.get("W")![0]!).toBeLessThan(after.get("b")![0]!);
    expect(copies(s, r)).toBe(0);
    // b's sibs still flank the pair: a is left of W, c right of b.
    expect(after.get("a")![0]!).toBeLessThan(after.get("W")![0]!);
    expect(after.get("c")![0]!).toBeGreaterThan(after.get("b")![0]!);
  });

  it("swaps one couple of a person with two partners, and both at once", () => {
    const p = build([
      ["H1", "male"], ["W", "female"], ["H2", "male"],
      ["a", "male", "H1", "W"], ["b", "female", "H2", "W"],
    ]);
    const r0 = alignPedigreeByFamily(p);
    const x0 = xs(p, r0);
    const leftOfW = (q: Pedigree, r: LayoutResult) => {
      const x = xs(q, r);
      return ["H1", "H2"].filter(h => x.get(h)![0]! < x.get("W")![0]!);
    };
    expect(leftOfW(p, r0)).toEqual(["H1"]);
    // Both swapped: H2 on the left, H1 on the right.
    const both = withSide(withSide(p, "H1_W", "W"), "H2_W", "H2");
    const rb = alignPedigreeByFamily(both);
    expect(leftOfW(both, rb)).toEqual(["H2"]);
    expect(copies(both, rb)).toBe(0);
  });

  it("one couple of a two-partner person given a side: the other partner takes the free side", () => {
    const p = build([
      ["H1", "male"], ["W", "female"], ["H2", "male"],
      ["a", "male", "H1", "W"], ["b", "female", "H2", "W"],
    ]);
    const s = withSide(p, "H1_W", "W");
    const r = alignPedigreeByFamily(s);
    const x = xs(s, r);
    expect(x.get("H2")![0]!).toBeLessThan(x.get("W")![0]!);
    expect(x.get("H1")![0]!).toBeGreaterThan(x.get("W")![0]!);
  });

  it("swaps two families when both partners have parents drawn, without a duplicate", () => {
    const p = build([
      ["F1", "male"], ["M1", "female"], ["F2", "male"], ["M2", "female"],
      ["h", "male", "F1", "M1"], ["hs", "female", "F1", "M1"],
      ["w", "female", "F2", "M2"], ["ws", "male", "F2", "M2"], ["k", "male", "h", "w"],
    ]);
    expect(drawnLeftPartner(p, alignPedigreeByFamily(p), "h_w")).toBe("h");
    const s = withSide(p, "h_w", "w");
    const r = alignPedigreeByFamily(s);
    expect(drawnLeftPartner(s, r, "h_w")).toBe("w");
    expect(copies(s, r)).toBe(0);
    const x = xs(s, r);
    // w's parents now on the left, h's on the right, each sibship beside its parent.
    expect(x.get("F2")![0]!).toBeLessThan(x.get("F1")![0]!);
    expect(x.get("ws")![0]!).toBeLessThan(x.get("w")![0]!);
    expect(x.get("hs")![0]!).toBeGreaterThan(x.get("h")![0]!);
    // Choosing the side it already has changes nothing.
    expect(alignPedigreeByFamily(withSide(p, "h_w", "h"))).toEqual(alignPedigreeByFamily(p));
  });

  it("swaps a cousin couple by swapping the lines below their shared grandparents", () => {
    const p = build([
      ["G", "male"], ["g", "female"], ["p1", "male", "G", "g"], ["p2", "female", "G", "g"],
      ["w1", "female"], ["h2", "male"], ["c1", "male", "p1", "w1"], ["c2", "female", "h2", "p2"],
      ["k", "male", "c1", "c2"],
    ]);
    expect(drawnLeftPartner(p, alignPedigreeByFamily(p), "c1_c2")).toBe("c1");
    const s = withSide(p, "c1_c2", "c2");
    const r = alignPedigreeByFamily(s);
    expect(drawnLeftPartner(s, r, "c1_c2")).toBe("c2");
    expect(copies(s, r)).toBe(0);
    expect(r.nid[0]).toEqual(alignPedigreeByFamily(p).nid[0]); // G and g stay
  });

  it("trades the families of two partners who both have parents drawn", () => {
    const p = build([
      ["A1", "male"], ["B1", "female"], ["A2", "male"], ["B2", "female"],
      ["H1", "male", "A1", "B1"], ["s1", "female", "A1", "B1"],
      ["s2", "female", "A2", "B2"], ["H2", "male", "A2", "B2"], ["W", "female"],
      ["k1", "male", "H1", "W"], ["k2", "female", "H2", "W"],
    ]);
    const x0 = xs(p, alignPedigreeByFamily(p));
    expect(x0.get("H1")![0]!).toBeLessThan(x0.get("W")![0]!);
    const s = withSide(withSide(p, "H1_W", "W"), "H2_W", "H2");
    const r = alignPedigreeByFamily(s);
    const x = xs(s, r);
    expect(copies(s, r)).toBe(0);
    expect(x.get("H2")![0]!).toBeLessThan(x.get("W")![0]!);
    expect(x.get("W")![0]!).toBeLessThan(x.get("H1")![0]!);
    expect(x.get("A2")![0]!).toBeLessThan(x.get("A1")![0]!);
  });

  it("is not read by a pedigree without sides, so the R-faithful run is unchanged", () => {
    const p = build([["F", "male"], ["M", "female"], ["c", "male", "F", "M"]]);
    expect(alignPedigree(p)).toEqual(alignPedigree({ ...p, partnerships: p.partnerships.map(q => ({ ...q })) }));
  });
});
