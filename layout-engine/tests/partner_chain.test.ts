import { describe, it, expect } from "vitest";
import { alignPedigree } from "../src/index.js";
import type { Pedigree, Individual } from "../src/types.js";

/**
 * H1, H2 and H3 each have a child with W1; H2 and H3 also have one with W2.
 * The agent testing run flagged this as a divergence from R (slot 8 is H2 in
 * R, W2 here; d at 5.5 in R, 6.5 here). It is a kinship2 bug, not a port bug:
 * autohint stops with "autohint bug 3" on this pedigree, and align.pedigree's
 * fallback, `list(order = seq_len(max(1, dim(ped))))`, has length 1 because
 * dim() of a pedigree object is NULL, so every rank but the first is NA.
 * With the fallback it meant, order = 1:n, R 4.5.3 / kinship2 1.9.6.2 gives
 * exactly the layout below (check.hint bypassed to pass that order).
 */
const ROWS: [string, string, string, Individual["sex"]][] = [
  ["H1", "", "", "male"], ["W1", "", "", "female"], ["H2", "", "", "male"], ["W2", "", "", "female"],
  ["H3", "", "", "male"], ["a", "H1", "W1", "male"], ["b", "H2", "W1", "female"], ["c", "H2", "W2", "male"],
  ["d", "H3", "W2", "female"], ["e", "H3", "W1", "male"],
];

function chain(): Pedigree {
  const p: Pedigree = {
    individuals: ROWS.map(([id, , , sex], i) => ({ id, sex, affected: id === "e", sibOrder: i })),
    partnerships: [], parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
  for (const [id, dad, mum] of ROWS) {
    if (!dad) continue;
    const pid = `${dad}_${mum}`;
    if (!p.parentOf[pid]) { p.partnerships.push({ id: pid, individual1: dad, individual2: mum }); p.parentOf[pid] = []; }
    p.parentOf[pid]!.push(id);
  }
  return p;
}

describe("partner chain where kinship2's autohint fails", () => {
  it("matches R's align.pedigree with the intended fallback order 1:n", () => {
    const r = alignPedigree(chain());
    expect(r.n).toEqual([9, 5]);
    expect(r.nid).toEqual([[1, 3, 2, 5, 3, 4, 5, 4, 5], [6, 7, 10, 8, 9]]);
    expect(r.spouse).toEqual([[1, 1, 1, 0, 1, 0, 1, 0, 0], [0, 0, 0, 0, 0]]);
    expect(r.fam).toEqual([[0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 2, 3, 5, 7]]);
    const pos = r.pos.map(row => row.map(x => Math.round(x * 1000) / 1000));
    expect(pos).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8], [0.5, 1.5, 2.5, 4.5, 6.5]]);
  });
});
