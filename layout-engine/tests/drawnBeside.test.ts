import { describe, it, expect } from "vitest";
import { alignPedigree, alignPedigreeByFamily, drawnBesideChoices, drawnBesideConflict } from "../src/index.js";
import type { Pedigree, Individual, Partnership, LayoutResult } from "../src/types.js";

/**
 * `Partnership.drawnBeside` (#205): which partner a couple is drawn beside,
 * and so who is drawn twice in a family with a loop. It reaches kinship2 as
 * the anchor of the couple's spouse hint.
 */

type Row = [string, Individual["sex"], string?, string?]; // id, sex, father, mother

function build(rows: Row[], couples: Record<string, Partial<Partnership>> = {}): Pedigree {
  const p: Pedigree = {
    individuals: rows.map(([id, sex]) => ({ id, sex, affected: false, sibOrder: 0 })),
    partnerships: [], parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
  for (const [id, , dad, mum] of rows) {
    if (!dad || !mum) continue;
    const pid = `${dad}+${mum}`;
    if (!p.parentOf[pid]) { p.partnerships.push({ id: pid, individual1: dad, individual2: mum, ...couples[pid] }); p.parentOf[pid] = []; }
    p.parentOf[pid]!.push(id);
  }
  return p;
}

/**
 * Quadruple half first cousins: A and C each have a child with B and with
 * D, so the four are a ring of couples and someone must be drawn twice.
 */
const RING: Row[] = [
  ["A", "male"], ["B", "female"], ["C", "male"], ["D", "female"],
  ["F1", "male", "A", "B"], ["M1", "female", "C", "D"], ["F2", "male", "A", "D"], ["M2", "female", "C", "B"],
  ["X", "male", "F1", "M1"], ["Y", "female", "F2", "M2"],
];

/** Ids along each row, and how many people each row draws more than once (copies with no line left out). */
function rows(p: Pedigree, r: LayoutResult): { ids: string[][]; twice: number[] } {
  const parentSlots = new Set<string>();
  for (let lev = 1; lev < r.n.length; lev++) for (let s = 0; s < r.n[lev]!; s++) {
    const f = r.fam[lev]![s]!;
    if (f > 0) { parentSlots.add(`${lev - 1}-${f - 1}`); parentSlots.add(`${lev - 1}-${f}`); }
  }
  const ids: string[][] = [], twice: number[] = [];
  for (let lev = 0; lev < r.n.length; lev++) {
    const row: string[] = [];
    for (let s = 0; s < r.n[lev]!; s++) {
      const lined = r.fam[lev]![s]! > 0 || r.spouse[lev]![s]! > 0 || (s > 0 && r.spouse[lev]![s - 1]! > 0) || parentSlots.has(`${lev}-${s}`);
      if (lined) row.push(p.individuals[r.nid[lev]![s]! - 1]!.id);
    }
    ids.push(row);
    twice.push(row.length - new Set(row).size);
  }
  return { ids, twice };
}

const layout = (p: Pedigree) => alignPedigreeByFamily(p);

describe("drawnBeside (#205)", () => {
  it("left to itself the ring draws four people twice, over two rows", () => {
    const p = build(RING);
    expect(rows(p, layout(p)).twice).toEqual([3, 1, 0]);
  });

  it("chooses who is drawn twice: three people, all in the founders' row", () => {
    const p = build(RING, { "C+D": { leftPartner: "D" }, "C+B": { leftPartner: "C", drawnBeside: "C" } });
    const drawn = rows(p, layout(p));
    expect(drawn.twice).toEqual([3, 0, 0]);
    expect(drawn.ids[0]).toEqual(["B", "A", "D", "C", "B", "A", "D"]);
    // Both cousin couples sit side by side, each drawn once.
    expect(drawn.ids[1]).toEqual(["F1", "M1", "M2", "F2"]);
  });

  it("the other partner of the same couple gives a different drawing", () => {
    const beside = (id: string) => build(RING, { "C+B": { leftPartner: "C", drawnBeside: id } });
    expect(rows(beside("C"), layout(beside("C"))).ids).not.toEqual(rows(beside("B"), layout(beside("B"))).ids);
  });

  it("offers both partners only where each has a place of their own", () => {
    const ring = build(RING);
    for (const c of ring.partnerships) expect(drawnBesideChoices(ring, c.id).sort()).toEqual([c.individual1, c.individual2].sort());
    // H married in: he is only ever drawn beside W, so there is nothing to choose.
    const marriedIn = build([["F", "male"], ["M", "female"], ["W", "female", "F", "M"], ["H", "male"], ["c", "male", "H", "W"]]);
    expect(drawnBesideChoices(marriedIn, "H+W")).toEqual(["W"]);
    // Two founders with one couple between them: the layout starts from the mother.
    expect(drawnBesideChoices(marriedIn, "F+M")).toEqual(["M"]);
    expect(drawnBesideChoices(marriedIn, "nobody")).toEqual([]);
  });

  it("ignores a choice nobody could draw, so the couple and its children stay drawn", () => {
    const rowsOf = (couples: Record<string, Partial<Partnership>>) => {
      const p = build([["F", "male"], ["M", "female"], ["W", "female", "F", "M"], ["H", "male"], ["c", "male", "H", "W"]], couples);
      return rows(p, layout(p)).ids;
    };
    expect(rowsOf({ "H+W": { drawnBeside: "H" } })).toEqual(rowsOf({}));
    expect(rowsOf({ "F+M": { drawnBeside: "F" } })).toEqual(rowsOf({}));
    // A value that is neither partner is no choice at all.
    expect(rowsOf({ "H+W": { drawnBeside: "F" } })).toEqual(rowsOf({}));
  });

  it("drops a set of choices that would leave a couple undrawn, and says so", () => {
    // Three choices on the ring that kinship2 can only draw with a couple line read as another couple's.
    const p = build(RING, {
      "A+B": { leftPartner: "A", drawnBeside: "B" },
      "C+D": { leftPartner: "D" },
      "C+B": { leftPartner: "C", drawnBeside: "B" },
    });
    expect(drawnBesideConflict(p)).toBe(true);
    const without: Pedigree = { ...p, partnerships: p.partnerships.map(({ drawnBeside: _b, ...q }) => q) };
    expect(layout(p)).toEqual(layout(without));
    expect(drawnBesideConflict(without)).toBe(false);
    expect(drawnBesideConflict(build(RING, { "C+B": { leftPartner: "C", drawnBeside: "C" } }))).toBe(false);
  });

  it("is read by the plain alignPedigree too, not only the editor's path", () => {
    // Without the improvement passes the drawing differs from the editor's, but the choice still moves the couple.
    const side = build(RING, { "C+B": { leftPartner: "C" } });
    const beside = build(RING, { "C+B": { leftPartner: "C", drawnBeside: "C" } });
    expect(rows(beside, alignPedigree(beside)).ids).not.toEqual(rows(side, alignPedigree(side)).ids);
  });
});
