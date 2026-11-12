import { describe, it, expect } from "vitest";
import { alignPedigree, alignPedigreeByFamily, RELAXED_WIDTH_SLACK } from "../src/index.js";
import type { Pedigree, Individual, LayoutResult } from "../src/types.js";

/**
 * #82. Three sisters (D1 to D3) whose children take seven slots under their
 * parents' six, in a pedigree ten slots wide: kinship2 packs the widest row
 * solid, so the sibships cannot sit under their parents.
 * Rows are [id, father, mother, sex].
 */
const ROWS: [string, string, string, 1 | 2][] = [
  ["gf", "", "", 1], ["gm", "", "", 2],
  ["A", "gf", "gm", 2], ["Ah", "", "", 1], ["B", "gf", "gm", 1], ["Bw", "", "", 2],
  ["D1", "Ah", "A", 2], ["D2", "Ah", "A", 2], ["D3", "Ah", "A", 2],
  ["H1", "", "", 1], ["H2", "", "", 1], ["H3", "", "", 1],
  ["c1", "H1", "D1", 2], ["c2", "H1", "D1", 2], ["c3", "H2", "D2", 2], ["c4", "H3", "D3", 1],
  ["s1", "", "", 1], ["s2", "", "", 1], ["s3", "", "", 1],
  ["k1", "s1", "c1", 2], ["k2", "s1", "c1", 2], ["k3", "s2", "c2", 1], ["k4", "s3", "c3", 1],
  ["E1", "B", "Bw", 1], ["E1w", "", "", 2], ["E2", "B", "Bw", 1], ["E2w", "", "", 2],
  ["e1", "E1", "E1w", 2], ["e2", "E2", "E2w", 2],
];

function build(rows: typeof ROWS, layoutWidth?: "minimal" | "relaxed"): Pedigree {
  const individuals: Individual[] = rows.map(([id, , , sex], i) =>
    ({ id, sex: sex === 1 ? "male" : "female", affected: false, sibOrder: i }));
  const partnerships: Pedigree["partnerships"] = [];
  const parentOf: Pedigree["parentOf"] = {};
  for (const [id, f, m] of rows) {
    if (!f) continue;
    const pid = `${f}+${m}`;
    if (!parentOf[pid]) { partnerships.push({ id: pid, individual1: f, individual2: m }); parentOf[pid] = []; }
    parentOf[pid]!.push(id);
  }
  return {
    individuals, partnerships, parentOf,
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...(layoutWidth ? { canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, layoutWidth } } : {}),
  };
}

const structure = (r: LayoutResult) => ({
  n: Array.from(r.n),
  nid: r.nid.map((row, l) => Array.from(row).slice(0, r.n[l])),
  fam: r.fam.map((row, l) => Array.from(row).slice(0, r.n[l])),
  spouse: r.spouse.map((row, l) => Array.from(row).slice(0, r.n[l])),
});
const positions = (r: LayoutResult) => r.pos.map((row, l) => Array.from(row).slice(0, r.n[l]));

/** Drawn width in slots, and how far each sibship's middle is from its parents' middle, summed. */
function measure(r: LayoutResult) {
  let min = Infinity, max = -Infinity, offset = 0;
  for (let lev = 0; lev < r.n.length; lev++) {
    const groups = new Map<number, number[]>();
    for (let s = 0; s < r.n[lev]!; s++) {
      const x = r.pos[lev]![s]!;
      min = Math.min(min, x); max = Math.max(max, x);
      const f = r.fam[lev]![s]!;
      if (f > 0) groups.set(f, [...(groups.get(f) ?? []), x]);
    }
    for (const [f, xs] of groups) {
      const parents = (r.pos[lev - 1]![f - 1]! + r.pos[lev - 1]![f]!) / 2;
      offset += Math.abs(parents - (Math.min(...xs) + Math.max(...xs)) / 2);
    }
  }
  return { width: max - min + 1, widest: Math.max(...Array.from(r.n)), offset };
}

describe("layout width setting (#82)", () => {
  it("absent and \"minimal\" both give today's layout", () => {
    const plain = alignPedigreeByFamily(build(ROWS));
    expect(positions(alignPedigreeByFamily(build(ROWS, "minimal")))).toEqual(positions(plain));
    const m = measure(plain);
    expect(m.widest).toBe(10);
    // The widest row is packed solid: no slack at all.
    expect(m.width).toBeCloseTo(10, 1);
  });

  it("\"relaxed\" moves positions only, by at most the slack, and brings sibships under their parents", () => {
    const minimal = alignPedigreeByFamily(build(ROWS));
    const relaxed = alignPedigreeByFamily(build(ROWS, "relaxed"));
    expect(structure(relaxed)).toEqual(structure(minimal));
    const a = measure(minimal), b = measure(relaxed);
    expect(b.width).toBeGreaterThan(a.width);
    expect(b.width).toBeLessThanOrEqual(a.widest + RELAXED_WIDTH_SLACK + 0.02);
    expect(b.offset).toBeLessThan(a.offset);
    // Neighbours never come closer than one slot.
    for (const row of positions(relaxed)) {
      for (let i = 0; i + 1 < row.length; i++) expect(row[i + 1]! - row[i]!).toBeGreaterThanOrEqual(1 - 1e-6);
    }
  });

  it("is the widthSlack option underneath, which an explicit option overrides", () => {
    const relaxed = alignPedigreeByFamily(build(ROWS, "relaxed"));
    expect(positions(alignPedigreeByFamily(build(ROWS), { widthSlack: RELAXED_WIDTH_SLACK }))).toEqual(positions(relaxed));
    expect(positions(alignPedigreeByFamily(build(ROWS, "relaxed"), { widthSlack: 0 })))
      .toEqual(positions(alignPedigreeByFamily(build(ROWS))));
  });

  it("plain alignPedigree ignores the setting, so it stays comparable with R", () => {
    expect(positions(alignPedigree(build(ROWS, "relaxed")))).toEqual(positions(alignPedigree(build(ROWS))));
  });

  it("makes no difference to a small pedigree, which already has room", () => {
    const small = ROWS.filter(([id]) => ["gf", "gm", "A", "Ah", "B", "Bw", "D1", "D2", "D3", "H1", "c1", "c2"].includes(id));
    expect(positions(alignPedigreeByFamily(build(small, "relaxed")))).toEqual(positions(alignPedigreeByFamily(build(small))));
  });

  it("gives each family its own slack", () => {
    const second = ROWS.map(([id, f, m, sex]) => [`x${id}`, f && `x${f}`, m && `x${m}`, sex] as (typeof ROWS)[number]);
    const both = [...ROWS, ...second];
    const a = measure(alignPedigreeByFamily(build(both)));
    const b = measure(alignPedigreeByFamily(build(both, "relaxed")));
    const one = measure(alignPedigreeByFamily(build(ROWS, "relaxed"))).width - measure(alignPedigreeByFamily(build(ROWS))).width;
    expect(b.width - a.width).toBeCloseTo(2 * one, 5);
  });
});
