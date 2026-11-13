import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../../data/examples";
import { makeSyntheticFamily } from "../../../fixtures/syntheticFamily";
import { importPed } from "../../ped";
import { exportUShapeSvg, layoutUShape } from "../uShapeExporter";
import { lintUShape, lintUShapeSvg } from "../uShapeLint";

const named = (p: Pedigree): Pedigree =>
  ({ ...p, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, ...p.canvasSettings, relationshipLabels: true } });
const messages = (p: Pedigree, partners: boolean) => lintUShape(p, { uShapePartners: partners }).map(f => f.message);

describe("U-shape consanguinity labels (#109)", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.label}: every label clear of lines, symbols and text`, () => {
      expect(messages(named(ex.data), true)).toEqual([]);
      expect(messages(named(ex.data), false)).toEqual([]);
    });
  }

  it("examples with tags, in black and white patterns (#67): still clear", () => {
    for (const ex of EXAMPLES.filter(e => (e.data.tags ?? []).length > 0)) {
      const mono = named(ex.data);
      expect(messages({ ...mono, canvasSettings: { ...mono.canvasSettings!, tagFills: "monochrome" } }, true), ex.label).toEqual([]);
    }
  }, 30000);

  it("test-data/ped/consanguineous: drawn, and clear", () => {
    const dir = join(__dirname, "../../../../../test-data/ped/consanguineous");
    let drawn = 0;
    for (const f of readdirSync(dir).filter(f => f.endsWith(".ped"))) {
      for (const { pedigree: p } of importPed(readFileSync(join(dir, f), "utf8")).pedigrees) {
        drawn += layoutUShape(named(p))!.coupleLabels.length;
        expect(messages(named(p), true), f).toEqual([]);
      }
    }
    expect(drawn).toBeGreaterThanOrEqual(4);
  });

  it("random matings between relatives with long labels of their own", () => {
    let drawn = 0, backed = 0;
    const texts = ["third cousins once removed, both sides", "cousins", "second cousins twice removed", "siblings"];
    for (let seed = 1; seed <= 60; seed++) {
      const p = makeSyntheticFamily({ seed, generations: 3 + (seed % 4), minChildren: 1, maxChildren: 4, partnerRate: 0.6 });
      let s = seed * 7919;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const hasParents = new Set(Object.values(p.parentOf).flat());
      const blood = p.individuals.filter(i => hasParents.has(i.id));
      for (let k = 0; k < 3 && blood.length > 3; k++) {
        const a = blood[Math.floor(rnd() * blood.length)]!, b = blood[Math.floor(rnd() * blood.length)]!;
        if (a === b) continue;
        p.partnerships.push({ id: `cx${k}`, individual1: a.id, individual2: b.id, consanguineous: true, consanguinityLabel: texts[(seed + k) % texts.length], ended: (seed + k) % 5 === 0 });
        p.individuals.push({ id: `ck${k}`, sex: "male", affected: true, sibOrder: 0 });
        p.parentOf[`cx${k}`] = [`ck${k}`];
      }
      for (const partners of [true, false]) {
        const l = layoutUShape(p, { partners })!;
        drawn += l.coupleLabels.length;
        backed += l.coupleLabels.filter(c => c.backed).length;
        expect(messages(p, partners), `seed ${seed} partners ${partners}`).toEqual([]);
      }
    }
    expect(drawn).toBeGreaterThan(50);
    // Some on a backing that a dashed link passes behind.
    expect(backed).toBeGreaterThan(0);
  });

  it("writes the label along the line, between the partners, on the inward side", () => {
    const ex = EXAMPLES.find(e => e.label === "Spanish Habsburgs")!;
    const l = layoutUShape(named(ex.data))!;
    expect(l.coupleLabels.map(c => c.lines.join(" ")).sort()).toEqual(["first cousins", "first cousins", "uncle and niece"]);
    for (const c of l.coupleLabels) {
      expect(c.baselines.every(b => b < 0)).toBe(true);
      const partnership = ex.data.partnerships.find(p => p.id === c.partnershipId)!;
      const ends = [partnership.individual1, partnership.individual2]
        .map(id => [l.nodes.get(id)!, ...l.duplicates.filter(d => d.id === id)])
        .map(copies => copies.reduce((best, n) => (Math.hypot(n.x - c.x, n.y - c.y) < Math.hypot(best.x - c.x, best.y - c.y) ? n : best)));
      // Each partner is further from the middle of the line than half the label plus the symbol.
      for (const n of ends) expect(Math.hypot(n.x - c.x, n.y - c.y)).toBeGreaterThan(c.width / 2 + 20);
    }
  });

  it("nothing without text; the couple moves apart for a long label", () => {
    const ex = EXAMPLES.find(e => e.label === "Uncle-niece")!;
    expect(layoutUShape(ex.data)!.coupleLabels).toEqual([]);
    const p = named(ex.data);
    const l = layoutUShape(p)!;
    expect(l.coupleLabels).toHaveLength(1);
    const long = structuredClone(p);
    long.partnerships.find(x => x.id === l.coupleLabels[0]!.partnershipId)!.consanguinityLabel = "uncle and niece through their mothers";
    const ll = layoutUShape(long)!;
    expect(ll.coupleLabels[0]!.width).toBeGreaterThan(l.coupleLabels[0]!.width + 50);
    expect(lintUShape(long)).toEqual([]);
  });

  it("finds a line run through a label", () => {
    const svg = exportUShapeSvg(named(EXAMPLES.find(e => e.label === "Spanish Habsburgs")!.data));
    expect(lintUShapeSvg(svg)).toEqual([]);
    const m = /<g class="consanguinity-labels">\n<g transform="translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)">/.exec(svg)!;
    const [x, y, rot] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180];
    // A short stroke 8px inward of the line, across the label's middle.
    const px = x + 8 * Math.sin(rot), py = y - 8 * Math.cos(rot);
    const broken = svg.replace(`<g class="consanguinity-labels">`,
      `<line x1="${px - 3}" y1="${py - 3}" x2="${px + 3}" y2="${py + 3}" stroke="black" stroke-width="1"/>\n<g class="consanguinity-labels">`);
    expect(lintUShapeSvg(broken).map(f => f.code)).toEqual(["consanguinity-label-collides"]);
  });
});
