import { describe, it, expect } from "vitest";
import { alignPedigree } from "../src/alignPedigree.js";
import { buildPedigreeFromFlat, type FlatPedRow } from "../src/utils.js";
import { buildPartnerSetFromPedigree, resolveCouple } from "../src/couples.js";
import { pedigreeToGeometry } from "../src/pedigreeToGeometry.js";

/**
 * Multi-partner layouts, checked against kinship2 1.9.6.2 align.pedigree().
 * Each row of `rows` reads "id~" for a slot that has a couple marker to its
 * right and "id/fN" for a slot whose parents are at columns N and N+1 above.
 */
function rowsOf(rows: FlatPedRow[]): string[] {
  const ped = buildPedigreeFromFlat(rows);
  const r = alignPedigree(ped);
  return r.nid.map((row, lev) =>
    row.map((nid, s) => {
      const id = ped.individuals[nid - 1]!.id;
      return `${id}${r.spouse[lev]![s] ? "~" : ""}${r.fam[lev]![s] ? `/f${r.fam[lev]![s]}` : ""}`;
    }).join(" "),
  );
}

const F = (id: number, sex: 1 | 2 | 0 = 2): FlatPedRow => ({ id, father: 0, mother: 0, sex });
const C = (id: number, father: number, mother: number, sex: 1 | 2 | 0): FlatPedRow => ({ id, father, mother, sex });

describe("multi-partner layout (kinship2 ground truth)", () => {
  it("man with three wives: wife - man - wife - wife, one child under each marriage", () => {
    const rows = rowsOf([F(1, 1), F(2), F(3), F(4), C(5, 1, 2, 1), C(6, 1, 3, 2), C(7, 1, 4, 1)]);
    expect(rows).toEqual(["2~ 1~ 3~ 4", "5/f1 6/f2 7/f3"]);
  });

  it("woman with three husbands: husband - husband - woman - husband", () => {
    const rows = rowsOf([F(1, 2), F(2, 1), F(3, 1), F(4, 1), C(5, 2, 1, 1), C(6, 3, 1, 2), C(7, 4, 1, 1)]);
    expect(rows).toEqual(["2~ 3~ 1~ 4", "5/f1 6/f2 7/f3"]);
  });

  it("partner chain F-M-F-M: everyone drawn exactly once", () => {
    const rows = rowsOf([
      F(62), F(63, 1), C(64, 63, 62, 1), C(65, 63, 62, 2),
      F(66), C(67, 63, 66, 1),
      F(69, 1), C(70, 69, 66, 2), C(71, 69, 66, 2),
    ]);
    expect(rows).toEqual(["62~ 63~ 66~ 69", "64/f1 65/f1 67/f2 70/f3 71/f3"]);
  });

  it("son with two married-in wives: wife - son - wife, son centred under his parents", () => {
    const rows = rowsOf([F(1, 1), F(2), C(3, 1, 2, 1), F(4), F(5), C(6, 3, 4, 1), C(7, 3, 5, 2)]);
    expect(rows).toEqual(["1~ 2", "4~ 3~/f1 5", "6/f1 7/f2"]);
  });

  it("couple where both partners have unknown sex is drawn once, not twice", () => {
    const rows = rowsOf([F(55, 0), F(56, 0), C(57, 55, 56, 2), C(58, 55, 56, 1)]);
    expect(rows).toEqual(["55~ 56", "57/f1 58/f1"]);
  });

  it("person who is father-role in one couple keeps that role in an unknown-sex couple", () => {
    // 1 (unknown) has children with 2 (female) and with 3 (unknown).
    const rows = rowsOf([F(1, 0), F(2), F(3, 0), C(4, 1, 2, 1), C(5, 1, 3, 2)]);
    const all = rows.join(" ");
    // 1 drawn once with a wife either side; both children attached
    expect((all.match(/\b1~?/g) ?? []).length).toBe(1);
    expect(rows[1]).toMatch(/4\/f\d 5\/f\d|5\/f\d 4\/f\d/);
  });
});

describe("resolveCouple", () => {
  it("adjacent partners resolve to themselves without a hop", () => {
    const ped = buildPedigreeFromFlat([F(1, 1), F(2), C(3, 1, 2, 1)]);
    const r = alignPedigree(ped);
    expect(resolveCouple(r, buildPartnerSetFromPedigree(ped), 0, 0)).toEqual({ leftSlot: 0, rightSlot: 1, hop: false });
  });

  it("marker between two wives resolves to the husband two slots left, with a hop", () => {
    // layout: 2~ 1~ 3~ 4 — marker at slot 2 joins wife 3 and wife 4, who are not partners
    const ped = buildPedigreeFromFlat([F(1, 1), F(2), F(3), F(4), C(5, 1, 2, 1), C(6, 1, 3, 2), C(7, 1, 4, 1)]);
    const r = alignPedigree(ped);
    const partners = buildPartnerSetFromPedigree(ped);
    expect(resolveCouple(r, partners, 0, 0)).toEqual({ leftSlot: 0, rightSlot: 1, hop: false });
    expect(resolveCouple(r, partners, 0, 1)).toEqual({ leftSlot: 1, rightSlot: 2, hop: false });
    expect(resolveCouple(r, partners, 0, 2)).toEqual({ leftSlot: 1, rightSlot: 3, hop: true });
  });

  it("marker between two husbands resolves to the wife on the right, with a hop", () => {
    // layout: 2~ 3~ 1~ 4
    const ped = buildPedigreeFromFlat([F(1, 2), F(2, 1), F(3, 1), F(4, 1), C(5, 2, 1, 1), C(6, 3, 1, 2), C(7, 4, 1, 1)]);
    const r = alignPedigree(ped);
    const partners = buildPartnerSetFromPedigree(ped);
    expect(resolveCouple(r, partners, 0, 0)).toEqual({ leftSlot: 0, rightSlot: 2, hop: true });
    expect(resolveCouple(r, partners, 0, 1)).toEqual({ leftSlot: 1, rightSlot: 2, hop: false });
  });
});

describe("pedigreeToGeometry with a hopping couple line", () => {
  it("joins the real partners, raises the line, and starts the sibship drop from the raised line", () => {
    const ped = buildPedigreeFromFlat([F(1, 1), F(2), F(3), F(4), C(5, 1, 2, 1), C(6, 1, 3, 2), C(7, 1, 4, 1)]);
    const geo = pedigreeToGeometry(ped);
    const hop = geo.couples.find(c => c.hopHeight > 0)!;
    expect(hop).toBeDefined();
    expect([hop.leftId, hop.rightId]).toEqual(["1", "4"]);
    expect(hop.hopHeight).toBe(28);
    expect(geo.couples.filter(c => c.hopHeight === 0).map(c => [c.leftId, c.rightId])).toEqual([["2", "1"], ["1", "3"]]);

    // Child 7 hangs from the raised segment between wife 3 and wife 4.
    const raised = geo.sibships.filter(s => s.hopHeight > 0);
    expect(raised).toHaveLength(1);
    expect(raised[0]!.childXs).toHaveLength(1);
    expect(raised[0]!.hopHeight).toBe(28);
  });

  it("nested hops rise further so they do not overlap", () => {
    // man 1 with five wives: layout 2~ 3~ 1~ 4~ 8~ 9, so the line to wife 9
    // passes over both 4 and 8 and must sit above the line to wife 8.
    const ped = buildPedigreeFromFlat([
      F(1, 1), F(2), F(3), F(4), F(8), F(9),
      C(5, 1, 2, 1), C(6, 1, 3, 2), C(7, 1, 4, 1), C(10, 1, 8, 1), C(11, 1, 9, 2),
    ]);
    const geo = pedigreeToGeometry(ped);
    const heights = geo.couples.map(c => c.hopHeight).filter(h => h > 0).sort((a, b) => a - b);
    expect(heights).toEqual([28, 28, 38]);
  });

  it("isolated individuals are appended after the optimiser so connected families stay centred", () => {
    // Nuclear family with five children plus six unconnected people at the top level.
    const rows: FlatPedRow[] = [F(1, 1), F(2), C(3, 1, 2, 1), C(4, 1, 2, 2), C(5, 1, 2, 1), C(6, 1, 2, 2), C(7, 1, 2, 1)];
    for (let id = 20; id < 26; id++) rows.push(F(id, 1));
    const r = alignPedigree(buildPedigreeFromFlat(rows));
    expect(r.n).toEqual([8, 5]);
    const parentMid = (r.pos[0]![0]! + r.pos[0]![1]!) / 2;
    const childMid = r.pos[1]!.reduce((a, b) => a + b, 0) / 5;
    expect(parentMid).toBeCloseTo(childMid, 5);
    // isolated people sit to the right of the family, one unit apart
    for (let s = 2; s < 8; s++) expect(r.pos[0]![s]!).toBeGreaterThan(r.pos[0]![s - 1]!);
  });
});
