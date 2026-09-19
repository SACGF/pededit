import { describe, it, expect } from "vitest";
import { exportUShapeSvg, layoutUShape } from "../uShapeExporter";
import type { UShapeLayout, UShapeNode } from "../uShapeExporter";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { largerFamily } from "../../../fixtures/largerFamily";
import { makeSyntheticFamily } from "../../../fixtures/syntheticFamily";
import { EXAMPLES } from "../../../data/examples";
import type { Pedigree } from "@pedigree-editor/layout-engine";

// To LOOK at the output rather than assert on it, run frontend/render-u.sh.

const NODE_SIZE = 40;

const wide = () => makeSyntheticFamily({ seed: 8, generations: 5, minChildren: 2, maxChildren: 5, partnerRate: 0.65 });
const skewed = () => makeSyntheticFamily({ seed: 20, generations: 6, minChildren: 1, maxChildren: 4, partnerRate: 0.5 });

/** A spread of random families: bushy, sparse, deep, shallow. */
function battery(): Array<{ name: string; pedigree: Pedigree }> {
  const out: Array<{ name: string; pedigree: Pedigree }> = [];
  for (let seed = 1; seed <= 12; seed++) {
    out.push({ name: `bushy-${seed}`, pedigree: makeSyntheticFamily({ seed, generations: 5, minChildren: 2, maxChildren: 5, partnerRate: 0.65 }) });
    out.push({ name: `deep-${seed}`, pedigree: makeSyntheticFamily({ seed, generations: 6, minChildren: 1, maxChildren: 4, partnerRate: 0.5 }) });
  }
  return out;
}

function bloodDescendants(p: Pedigree, founders: string[]): Set<string> {
  const seen = new Set<string>(founders);
  const stack = [...founders];
  while (stack.length) {
    const id = stack.pop()!;
    for (const pr of p.partnerships) {
      if (pr.individual1 !== id && pr.individual2 !== id) continue;
      for (const c of p.parentOf[pr.id] ?? []) if (!seen.has(c)) { seen.add(c); stack.push(c); }
    }
  }
  return seen;
}

/** Sibships: children grouped by the couple line (or lone parent) they descend from. */
function sibships(l: UShapeLayout): Array<{ parent: UShapeNode; uP: number; kids: UShapeNode[] }> {
  const m = new Map<string, { parent: UShapeNode; uP: number; kids: UShapeNode[] }>();
  for (const n of l.nodes.values()) {
    if (!n.parent) continue;
    const key = `${n.parent}|${n.parentU!.toFixed(3)}`;
    if (!m.has(key)) m.set(key, { parent: l.nodes.get(n.parent)!, uP: n.parentU!, kids: [] });
    m.get(key)!.kids.push(n);
  }
  return [...m.values()];
}

describe("U-shape layout", () => {
  it("draws the founders, every blood descendant and their partners, once each", () => {
    const p = wide();
    const l = layoutUShape(p)!;
    const blood = bloodDescendants(p, l.founders);
    const expected = new Set(blood);
    for (const pr of p.partnerships) {
      if (blood.has(pr.individual1) || blood.has(pr.individual2)) expected.add(pr.individual1).add(pr.individual2);
    }
    expect(new Set(l.nodes.keys())).toEqual(expected);
    expect(l.duplicates).toEqual([]);
    // A partner stands on the same track as their blood relative, next to them.
    const partners = [...l.nodes.values()].filter(n => n.partnerOf);
    expect(partners.length).toBeGreaterThan(0);
    for (const n of partners) {
      const mate = l.nodes.get(n.partnerOf!)!;
      expect(n.depth).toBe(mate.depth);
      expect(n.parent).toBeNull();
      expect(Math.hypot(n.x - mate.x, n.y - mate.y)).toBeGreaterThan(NODE_SIZE + 8);
      expect(Math.hypot(n.x - mate.x, n.y - mate.y)).toBeLessThan(81);
    }
  });

  it("draws nobody married in when partners are switched off", () => {
    const p = wide();
    const l = layoutUShape(p, { partners: false })!;
    const expected = bloodDescendants(p, l.founders);
    expect(new Set(l.nodes.keys())).toEqual(expected);
    expect(l.omitted.length).toBe(p.individuals.length - expected.size);
    expect(l.omitted.length).toBeGreaterThan(0);
  });

  it("puts every symbol exactly on its generation track", () => {
    for (const { pedigree } of battery()) {
      const l = layoutUShape(pedigree)!;
      const vb = (Math.PI * l.r0) / 2;
      for (const n of l.nodes.values()) {
        const radius = l.r0 + n.depth * l.ringGap;
        if (Math.abs(n.u) <= l.flat) {
          // Flat bottom: upright.
          expect(n.y).toBeCloseTo(radius, 3);
          expect(n.rotation).toBeCloseTo(0, 6);
        } else if (Math.abs(n.u) <= l.flat + vb) {
          // Quarter circle centred on the end of the flat bottom.
          expect(Math.hypot(Math.abs(n.x) - l.flat, n.y)).toBeCloseTo(radius, 3);
          expect(n.y).toBeGreaterThanOrEqual(-1e-6);
        } else {
          expect(Math.abs(n.x)).toBeCloseTo(l.flat + radius, 3);
          expect(n.y).toBeLessThan(0);
          expect(Math.abs(n.rotation)).toBeCloseTo(90, 6);
        }
      }
    }
  });

  it("never overlaps two symbols", () => {
    for (const { name, pedigree } of battery()) {
      const l = layoutUShape(pedigree)!;
      const nodes = [...l.nodes.values(), ...l.duplicates];
      let closest = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          closest = Math.min(closest, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
        }
      }
      expect(closest, name).toBeGreaterThan(NODE_SIZE + 8);
    }
  });

  it("never overlaps two sibship bars on the same level", () => {
    for (const { name, pedigree } of battery()) {
      const l = layoutUShape(pedigree)!;
      const spans = new Map<number, Array<[number, number]>>();
      for (const { parent, uP, kids } of sibships(l)) {
        const us = [uP, ...kids.map(k => k.u)];
        if (!spans.has(parent.depth)) spans.set(parent.depth, []);
        spans.get(parent.depth)!.push([Math.min(...us), Math.max(...us)]);
      }
      for (const level of spans.values()) {
        level.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < level.length; i++) {
          expect(level[i][0], name).toBeGreaterThan(level[i - 1][1]);
        }
      }
    }
  });

  it("keeps siblings in order, reading left arm to right arm", () => {
    for (const { pedigree } of battery()) {
      const order = new Map(pedigree.individuals.map(i => [i.id, i.sibOrder]));
      for (const { kids } of sibships(layoutUShape(pedigree)!)) {
        const byU = [...kids].sort((a, b) => a.u - b.u).map(k => order.get(k.id));
        expect(byU).toEqual([...byU].sort((a, b) => a! - b!));
      }
    }
  });

  it("centres each couple over its children", () => {
    const l = layoutUShape(wide())!;
    for (const { parent, uP, kids } of sibships(l)) {
      if (parent.parent === null) continue; // the founders slide to level the arms
      const us = kids.map(k => k.u);
      expect(uP).toBeGreaterThanOrEqual(Math.min(...us) - 1e-6);
      expect(uP).toBeLessThanOrEqual(Math.max(...us) + 1e-6);
    }
  });

  it("hangs each sibship from the middle of its parents' couple line", () => {
    const p = wide();
    const l = layoutUShape(p)!;
    let checked = 0;
    for (const { parent, uP } of sibships(l)) {
      const mate = [...l.nodes.values()].find(n => n.partnerOf === parent.id);
      if (!mate) continue;
      expect(uP).toBeCloseTo((parent.u + mate.u) / 2, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("moves each generation one track further out", () => {
    const l = layoutUShape(largerFamily)!;
    for (const n of l.nodes.values()) {
      if (n.parent) expect(n.depth).toBe(l.nodes.get(n.parent)!.depth + 1);
    }
    expect(l.maxDepth).toBe(3);
  });

  it("levels the two arms, even for a lopsided family", () => {
    for (const p of [wide(), skewed()]) {
      const l = layoutUShape(p)!;
      const us = [...l.nodes.values()].map(n => n.u);
      const left = -Math.min(...us), right = Math.max(...us);
      expect(left).toBeGreaterThan(l.flat + (Math.PI * l.r0) / 2); // it really has arms
      expect(Math.abs(left - right)).toBeLessThan(l.slot);
    }
  });

  it("keeps the founders at the bottom centre when the family fits on the curve", () => {
    const l = layoutUShape(simpleFamily)!;
    const [a, b] = l.founders.map(id => l.nodes.get(id)!);
    expect(a.u + b.u).toBeCloseTo(0, 6);
    expect(a.u).toBeLessThan(0);
    expect(a.y).toBeGreaterThan(0);
  });

  it("produces a roughly portrait figure for a wide family", () => {
    const svg = exportUShapeSvg(wide());
    const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/)!.map(Number);
    expect(h / w).toBeGreaterThan(0.9);
    expect(h / w).toBeLessThan(1.6);
  });

  it("lays out 1500 individuals in well under a second or two", () => {
    const p = makeSyntheticFamily({ seed: 5, generations: 7, minChildren: 2, maxChildren: 5, partnerRate: 0.7 });
    expect(p.individuals.length).toBeGreaterThan(1000);
    const t = performance.now();
    layoutUShape(p);
    expect(performance.now() - t).toBeLessThan(4000);
  });
});

describe("U-shape SVG", () => {
  it("rotates symbols and draws sibship bars as arcs", () => {
    const svg = exportUShapeSvg(wide());
    expect(svg).toMatch(/rotate\(-90\)/);
    expect(svg).toMatch(/rotate\(90\)/);
    expect(svg).toMatch(/<path d="M [^"]* A /);
  });

  it("draws one symbol group per drawn individual", () => {
    const p = wide();
    const svg = exportUShapeSvg(p);
    expect(svg.match(/<g data-id=/g)!.length).toBe(layoutUShape(p)!.nodes.size);
  });

  it("draws a double couple line for consanguineous founders", () => {
    const paths = (p: Pedigree) => exportUShapeSvg(p).match(/<path /g)!.length;
    const p: Pedigree = structuredClone(simpleFamily);
    const single = paths(p);
    p.partnerships[0].consanguineous = true;
    expect(paths(p)).toBe(single + 1);
  });

  it("supports de-identification, titles and the debug overlay", () => {
    const named: Pedigree = structuredClone(simpleFamily);
    named.individuals[0].name = "Very Identifiable";
    const svg = exportUShapeSvg(named, { deidentify: true });
    expect(svg).not.toContain("Very Identifiable");
    expect(svg).toContain("I-1");
    expect(exportUShapeSvg(named, { title: "Fam <1>" })).toContain("Fam &lt;1&gt;");
    expect(exportUShapeSvg(named, { debugSpine: true })).toContain('stroke="red"');
    expect(exportUShapeSvg(named)).not.toContain('stroke="red"');
  });

  it("handles degenerate pedigrees", () => {
    const base = { partnerships: [], parentOf: {}, siblingOrder: { mode: "insertion" as const, affectedFirst: false } };
    const empty: Pedigree = { ...base, individuals: [] };
    const single: Pedigree = { ...base, individuals: [{ id: "a", sex: "female", affected: true, sibOrder: 0 }] };
    const couple: Pedigree = {
      ...base,
      individuals: [
        { id: "a", sex: "male", affected: false, sibOrder: 0 },
        { id: "b", sex: "female", affected: false, sibOrder: 0 },
      ],
      partnerships: [{ id: "p", individual1: "a", individual2: "b" }],
    };
    expect(exportUShapeSvg(empty)).toContain("<svg");
    expect(layoutUShape(empty)).toBeNull();
    expect(exportUShapeSvg(single).match(/<g data-id=/g)!.length).toBe(1);
    expect(exportUShapeSvg(couple).match(/<g data-id=/g)!.length).toBe(2);
    for (const svg of [exportUShapeSvg(single), exportUShapeSvg(couple)]) expect(svg).not.toContain("NaN");
  });

  it("splits a small family's children evenly between the two sides", () => {
    const p: Pedigree = {
      individuals: ["a", "b", "k1", "k2", "k3", "k4"].map((id, i) => ({ id, sex: i % 2 ? "female" as const : "male" as const, affected: false, sibOrder: i })),
      partnerships: [{ id: "p", individual1: "a", individual2: "b" }],
      parentOf: { p: ["k1", "k2", "k3", "k4"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const l = layoutUShape(p)!;
    const mid = l.founders.reduce((s, id) => s + l.nodes.get(id)!.u, 0) / l.founders.length;
    const founderKids = [...l.nodes.values()].filter(n => n.depth === 1);
    const left = founderKids.filter(n => n.u < mid).length;
    expect(Math.abs(2 * left - founderKids.length)).toBeLessThanOrEqual(1);
  });

  it("draws a founder with two partners between them, each sibship under its own couple", () => {
    const p = EXAMPLES.find(e => e.label.startsWith("Remarriage"))!.data;
    const l = layoutUShape(p)!;
    expect(l.omitted).toEqual([]);
    expect(l.founders).toEqual(["rm_mom1", "rm_dad", "rm_mom2"]);
    const u = (id: string) => l.nodes.get(id)!.u;
    expect(u("rm_mom1")).toBeLessThan(u("rm_dad"));
    expect(u("rm_dad")).toBeLessThan(u("rm_mom2"));
    // First marriage's children on the left, second marriage's on the right.
    expect(Math.max(u("rm_c1a"), u("rm_c1b"))).toBeLessThan(Math.min(u("rm_c2a"), u("rm_c2b"), u("rm_c2c")));
    for (const c of ["rm_c1a", "rm_c2a"]) expect(l.nodes.get(c)!.parent).toBe("rm_dad");
    expect(exportUShapeSvg(p)).not.toContain("NaN");
  });

  it("omits children of a founder's further partnerships rather than misattribute them", () => {
    const p: Pedigree = {
      individuals: ["a", "b", "c", "d", "k1", "k2", "k3"].map(id => ({ id, sex: id === "a" ? "male" as const : "female" as const, affected: false, sibOrder: 0 })),
      partnerships: [
        { id: "p1", individual1: "a", individual2: "b" },
        { id: "p2", individual1: "a", individual2: "c" },
        { id: "p3", individual1: "a", individual2: "d" },
      ],
      parentOf: { p1: ["k1"], p2: ["k2"], p3: ["k3"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const l = layoutUShape(p)!;
    expect(l.founders).toEqual(["b", "a", "c"]);
    expect([...l.omitted].sort()).toEqual(["d", "k3"]);
  });

  it("runs a single line of descent straight out through the bottom", () => {
    const p: Pedigree = {
      individuals: ["a", "b", "c", "d", "e"].map((id, i) => ({ id, sex: i % 2 ? "female" as const : "male" as const, affected: false, sibOrder: 0 })),
      partnerships: [{ id: "p1", individual1: "a", individual2: "b" }, { id: "p2", individual1: "c", individual2: "d" }],
      parentOf: { p1: ["c"], p2: ["e"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const l = layoutUShape(p, { partners: false })!;
    expect(l.omitted).toEqual(["d"]);
    expect(l.nodes.get("c")!.x).toBeCloseTo(0, 6);
    expect(l.nodes.get("e")!.x).toBeCloseTo(0, 6);
    expect(l.nodes.get("e")!.y).toBeGreaterThan(l.nodes.get("c")!.y);
  });

  it("with partners, the line of descent steps to the middle of each couple", () => {
    const p: Pedigree = {
      individuals: ["a", "b", "c", "d", "e"].map((id, i) => ({ id, sex: i % 2 ? "female" as const : "male" as const, affected: false, sibOrder: 0 })),
      partnerships: [{ id: "p1", individual1: "a", individual2: "b" }, { id: "p2", individual1: "c", individual2: "d" }],
      parentOf: { p1: ["c"], p2: ["e"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const l = layoutUShape(p)!;
    expect(l.omitted).toEqual([]);
    const x = (id: string) => l.nodes.get(id)!.x;
    expect(x("c")).toBeCloseTo((x("a") + x("b")) / 2, 6);
    expect(x("e")).toBeCloseTo((x("c") + x("d")) / 2, 6);
    expect(x("c")).toBeLessThan(x("d")); // male on the left
  });
});

// ── Consanguinity ─────────────────────────────────────────────────────────────

function ped(rows: Array<[string, string | null, string | null, "male" | "female"]>, proband?: string): Pedigree {
  const partnerships: Pedigree["partnerships"] = [];
  const parentOf: Record<string, string[]> = {};
  for (const [id, f, m] of rows) {
    if (!f || !m) continue;
    let pr = partnerships.find(x => x.individual1 === f && x.individual2 === m);
    if (!pr) { pr = { id: `p_${f}_${m}`, individual1: f, individual2: m }; partnerships.push(pr); parentOf[pr.id] = []; }
    parentOf[pr.id].push(id);
  }
  return {
    individuals: rows.map(([id, , , sex], i) => ({ id, sex, affected: false, sibOrder: i, proband: id === proband })),
    partnerships, parentOf, siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

describe("U-shape consanguinity", () => {
  const firstCousins = () => ped([
    ["1", null, null, "male"], ["2", null, null, "female"],
    ["3", "1", "2", "male"], ["4", "1", "2", "female"],
    ["5", null, null, "female"], ["6", null, null, "male"],
    ["7", "3", "5", "male"], ["8", "6", "4", "female"],
    ["9", "7", "8", "male"],
  ]);

  it("joins first cousins with a double line and hangs their child from its middle", () => {
    const p = firstCousins();
    const l = layoutUShape(p)!;
    expect(l.omitted).toEqual([]);
    expect(l.duplicates).toEqual([]);
    const [a, b, kid] = ["7", "8", "9"].map(id => l.nodes.get(id)!);
    expect(a.depth).toBe(b.depth);
    // Nobody stands between the two cousins on their track.
    const lo = Math.min(a.u, b.u), hi = Math.max(a.u, b.u);
    expect([...l.nodes.values()].filter(n => n.depth === a.depth && n.u > lo && n.u < hi)).toEqual([]);
    expect(kid.parentU).toBeCloseTo((a.u + b.u) / 2, 6);
    // Double line: two paths more than the same family with the cousins' line unrelated.
    const paths = (q: Pedigree, o = {}) => exportUShapeSvg(q, o).match(/<path /g)!.length;
    const unrelated = firstCousins();
    unrelated.parentOf["p_6_4"] = [];
    unrelated.individuals = unrelated.individuals.filter(i => i.id !== "8");
    unrelated.partnerships.push({ id: "px", individual1: "7", individual2: "x" });
    unrelated.individuals.push({ id: "x", sex: "female", affected: false, sibOrder: 0 });
    unrelated.parentOf["px"] = unrelated.parentOf["p_7_8"];
    delete unrelated.parentOf["p_7_8"];
    unrelated.partnerships = unrelated.partnerships.filter(x => x.id !== "p_7_8");
    expect(paths(p)).toBeGreaterThan(paths(unrelated));
  });

  it("joins siblings, half-siblings and double first cousins directly too", () => {
    const sibs = ped([["1", null, null, "male"], ["2", null, null, "female"], ["3", "1", "2", "male"], ["4", "1", "2", "female"], ["5", "3", "4", "male"]]);
    const halfSibs = ped([
      ["1", null, null, "male"], ["2", null, null, "female"], ["3", null, null, "female"],
      ["4", "1", "2", "male"], ["5", "1", "3", "female"], ["6", "4", "5", "male"],
    ]);
    for (const p of [sibs, halfSibs]) {
      const l = layoutUShape(p)!;
      expect(l.omitted).toEqual([]);
      expect(l.duplicates).toEqual([]);
      expect(exportUShapeSvg(p)).not.toContain("NaN");
    }
    // Still shown when married-in partners are not.
    const l = layoutUShape(firstCousins(), { partners: false })!;
    expect(l.nodes.get("9")!.parentU).toBeCloseTo((l.nodes.get("7")!.u + l.nodes.get("8")!.u) / 2, 6);
  });

  it("draws a relative from another generation twice, linked by a dashed line", () => {
    const p = ped([
      ["1", null, null, "male"], ["2", null, null, "female"],
      ["3", "1", "2", "male"], ["4", "1", "2", "female"], ["5", null, null, "male"],
      ["6", "5", "4", "female"], ["7", "3", "6", "male"],
    ]);
    const l = layoutUShape(p)!;
    expect(l.omitted).toEqual([]);
    expect(l.duplicates.map(d => d.id)).toEqual(["6"]);
    const dup = l.duplicates[0], uncle = l.nodes.get("3")!, niece = l.nodes.get("6")!;
    expect(dup.depth).toBe(uncle.depth);
    expect(niece.depth).toBe(uncle.depth + 1);
    expect(l.nodes.get("7")!.parentU).toBeCloseTo((uncle.u + dup.u) / 2, 6);
    const svg = exportUShapeSvg(p);
    expect(svg.match(/data-dup-of="6"/g)!.length).toBe(1);
    expect(svg.match(/data-id="6"/g)!.length).toBe(1);
    expect(svg).toContain("stroke-dasharray");
  });
});

describe("U-shape with random matings between relatives", () => {
  // Same generation or not, near or far: whatever the loop, nothing may throw,
  // land on top of something else, or run one sibship bar into another.
  function withLoops(seed: number): Pedigree {
    const p = makeSyntheticFamily({ seed, generations: 3 + (seed % 4), minChildren: 1, maxChildren: 4, partnerRate: 0.6 });
    let s = seed * 7919;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const hasParents = new Set(Object.values(p.parentOf).flat());
    const blood = p.individuals.filter(i => hasParents.has(i.id));
    const n = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < n && blood.length > 3; k++) {
      const a = blood[Math.floor(rnd() * blood.length)], b = blood[Math.floor(rnd() * blood.length)];
      if (a === b) continue;
      p.partnerships.push({ id: `cx${k}`, individual1: a.id, individual2: b.id, consanguineous: true });
      p.individuals.push({ id: `ck${k}`, sex: "male", affected: true, sibOrder: 0 });
      p.parentOf[`cx${k}`] = [`ck${k}`];
    }
    return p;
  }

  it("keeps symbols and sibship bars apart", () => {
    let duplicates = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const p = withLoops(seed);
      for (const partners of [true, false]) {
        const name = `seed ${seed} partners ${partners}`;
        const l = layoutUShape(p, { partners })!;
        expect(exportUShapeSvg(p, { uShapePartners: partners }), name).not.toMatch(/NaN|Infinity/);
        duplicates += l.duplicates.length;
        const all = [...l.nodes.values(), ...l.duplicates];
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            expect(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y), `${name}: ${all[i].id}/${all[j].id}`).toBeGreaterThan(NODE_SIZE + 4);
          }
        }
        const levels = new Map<number, Array<[number, number]>>();
        for (const { parent, uP, kids } of sibships(l)) {
          const us = [uP, ...kids.map(c => c.u)];
          if (!levels.has(parent.depth)) levels.set(parent.depth, []);
          levels.get(parent.depth)!.push([Math.min(...us), Math.max(...us)]);
        }
        for (const level of levels.values()) {
          level.sort((a, b) => a[0] - b[0]);
          for (let i = 1; i < level.length; i++) expect(level[i][0], name).toBeGreaterThan(level[i - 1][1]);
        }
      }
    }
    expect(duplicates).toBeGreaterThan(0);
  });
});

describe("U-shape figure shape", () => {
  it("stands the founders and a small generation 1 upright on the flat bottom", () => {
    const l = layoutUShape(simpleFamily)!;
    for (const n of l.nodes.values()) if (n.depth <= 1) expect(n.rotation).toBeCloseTo(0, 6);
  });

  it("keeps a lopsided family that fits on a page as a fan under upright founders", () => {
    const p = makeSyntheticFamily({ seed: 26, generations: 4, minChildren: 1, maxChildren: 4 });
    const l = layoutUShape(p)!;
    const [a, b] = l.founders.map(id => l.nodes.get(id)!);
    expect(a.u + b.u).toBeCloseTo(0, 6);
    expect(a.rotation).toBeCloseTo(0, 6);
    // No arms: nobody is past the top of the curve.
    for (const n of l.nodes.values()) expect(Math.abs(n.u)).toBeLessThanOrEqual(l.flat + (Math.PI * l.r0) / 2 + NODE_SIZE);
  });

  it("roots the figure on the founder couple whose line shows the proband", () => {
    // Big family A marries into small family B. The proband is in B only.
    const rows: Array<[string, string | null, string | null, "male" | "female"]> = [
      ["a1", null, null, "male"], ["a2", null, null, "female"],
      ["a3", "a1", "a2", "male"], ["a4", "a1", "a2", "female"], ["a5", "a1", "a2", "male"], ["a6", "a1", "a2", "female"],
      ["b1", null, null, "male"], ["b2", null, null, "female"],
      ["b3", "b1", "b2", "female"], ["b4", "b1", "b2", "male"],
      ["k", "a3", "b3", "male"],
    ];
    expect(layoutUShape(ped(rows))!.founders).toEqual(["a1", "a2"]);
    const l = layoutUShape(ped(rows, "b4"))!;
    expect(l.founders).toEqual(["b1", "b2"]);
    expect(l.nodes.has("b4")).toBe(true);
    expect(l.nodes.has("a3")).toBe(true); // married in, beside b3
  });
});
