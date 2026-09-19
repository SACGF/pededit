import { describe, it, expect } from "vitest";
import { exportUShapeSvg, layoutUShape } from "../uShapeExporter";
import type { UShapeLayout, UShapeNode } from "../uShapeExporter";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { largerFamily } from "../../../fixtures/largerFamily";
import { makeSyntheticFamily } from "../../../fixtures/syntheticFamily";
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

function childrenByParent(l: UShapeLayout): Map<string, UShapeNode[]> {
  const m = new Map<string, UShapeNode[]>();
  for (const n of l.nodes.values()) {
    if (!n.parent) continue;
    if (!m.has(n.parent)) m.set(n.parent, []);
    m.get(n.parent)!.push(n);
  }
  return m;
}

describe("U-shape layout", () => {
  it("draws the founders and every blood descendant once, and nobody married in", () => {
    const p = wide();
    const l = layoutUShape(p)!;
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
        if (Math.abs(n.u) <= vb) {
          expect(Math.hypot(n.x, n.y)).toBeCloseTo(radius, 3);
          expect(n.y).toBeGreaterThanOrEqual(-1e-6);
        } else {
          expect(Math.abs(n.x)).toBeCloseTo(radius, 3);
          expect(n.y).toBeLessThan(0);
          expect(Math.abs(n.rotation)).toBeCloseTo(90, 6);
        }
      }
    }
  });

  it("never overlaps two symbols", () => {
    for (const { name, pedigree } of battery()) {
      const nodes = [...layoutUShape(pedigree)!.nodes.values()];
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
      for (const [parentId, kids] of childrenByParent(l)) {
        const parent = l.nodes.get(parentId)!;
        // The founders' descent line leaves from the middle of their couple line.
        const uP = parent.parent === null && l.founders.length === 2
          ? (l.nodes.get(l.founders[0])!.u + l.nodes.get(l.founders[1])!.u) / 2
          : parent.u;
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
      for (const kids of childrenByParent(layoutUShape(pedigree)!).values()) {
        const byU = [...kids].sort((a, b) => a.u - b.u).map(k => order.get(k.id));
        expect(byU).toEqual([...byU].sort((a, b) => a! - b!));
      }
    }
  });

  it("centres each parent over its children", () => {
    const l = layoutUShape(wide())!;
    for (const [parentId, kids] of childrenByParent(l)) {
      const parent = l.nodes.get(parentId)!;
      if (parent.parent === null) continue; // the founders slide to level the arms
      const us = kids.map(k => k.u);
      expect(parent.u).toBeGreaterThanOrEqual(Math.min(...us) - 1e-6);
      expect(parent.u).toBeLessThanOrEqual(Math.max(...us) + 1e-6);
    }
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
      expect(left).toBeGreaterThan((Math.PI * l.r0) / 2); // it really has arms
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

  it("runs a single line of descent straight out through the bottom", () => {
    const p: Pedigree = {
      individuals: ["a", "b", "c", "d", "e"].map((id, i) => ({ id, sex: i % 2 ? "female" as const : "male" as const, affected: false, sibOrder: 0 })),
      partnerships: [{ id: "p1", individual1: "a", individual2: "b" }, { id: "p2", individual1: "c", individual2: "d" }],
      parentOf: { p1: ["c"], p2: ["e"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const l = layoutUShape(p)!;
    expect(l.omitted).toEqual(["d"]);
    expect(l.nodes.get("c")!.x).toBeCloseTo(0, 6);
    expect(l.nodes.get("e")!.x).toBeCloseTo(0, 6);
    expect(l.nodes.get("e")!.y).toBeGreaterThan(l.nodes.get("c")!.y);
  });
});
