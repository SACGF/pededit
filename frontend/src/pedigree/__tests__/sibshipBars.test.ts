import { parseExportSvg } from "../../io/svg/exportLint";
import { describe, expect, it } from "vitest";
import { importPed } from "../../io/ped/index.js";
import { exportSvg } from "../../io/svg/svgExporter";
import { buildScene } from "../scene";
import { lintScene } from "../renderLint";
import { SIB_BAR_STEP, barsUnderLabels, sibshipBarOffsets, sibshipSegments } from "../sibshipPath";
import { EXAMPLES } from "../../data/examples";
import { selectionPedigree, selectionSubset } from "../selectionSubset";
import { textBlockUnder } from "../labelBlock";
import type { SibshipBar } from "../sibshipPath";

/**
 * #80: three sisters (D1 to D3) whose children take seven slots under their
 * parents' six, so each sibship sits to the right of its parents and the
 * three bars used to run into one line.
 */
const SHIFTED_PED = `
f gf 0 0 1 1
f gm 0 0 2 1
f A gf gm 2 2
f Ah 0 0 1 1
f B gf gm 1 1
f Bw 0 0 2 1
f D1 Ah A 2 1
f D2 Ah A 2 2
f D3 Ah A 2 2
f H1 0 0 1 1
f H2 0 0 1 1
f H3 0 0 1 1
f c1 H1 D1 2 1
f c2 H1 D1 2 2
f c3 H2 D2 2 1
f c4 H3 D3 1 1
f s1 0 0 1 1
f s2 0 0 1 1
f s3 0 0 1 1
f k1 s1 c1 2 1
f k2 s1 c1 2 1
f k3 s2 c2 1 1
f k4 s3 c3 1 1
f E1 B Bw 1 1
f E1w 0 0 2 1
f E2 B Bw 1 1
f E2w 0 0 2 1
f e1 E1 E1w 2 1
f e2 E2 E2w 2 1
`.trim();

const shifted = () => importPed(SHIFTED_PED).pedigrees[0]!.pedigree;

/** A sibship on rows 0 and 120. */
const bar = (coupleX: number, ...childXs: number[]): SibshipBar =>
  ({ coupleX, coupleY: 0, childXs, childYs: childXs.map(() => 120) });

/** Lines crossed by a set of bars with the given offsets: drops through other bars. */
function crossings(bars: SibshipBar[], offsets: number[]): number {
  let n = 0;
  const y = (i: number) => 60 + offsets[i]!;
  const range = (b: SibshipBar) => [Math.min(b.coupleX, ...b.childXs), Math.max(b.coupleX, ...b.childXs)] as const;
  bars.forEach((a, i) => bars.forEach((b, j) => {
    if (i === j) return;
    const [x1, x2] = range(b);
    // a's couple drop runs from the couple line to a's bar; its child drops from there down.
    if (a.coupleX >= x1 && a.coupleX <= x2 && y(j) < y(i)) n++;
    n += a.childXs.filter(x => x >= x1 && x <= x2 && y(j) > y(i)).length;
  }));
  return n;
}

describe("sibshipBarOffsets (#80)", () => {
  it("leaves bars that do not overlap on the halfway line", () => {
    expect(sibshipBarOffsets([bar(40, 0, 80), bar(240, 200, 280)])).toEqual([0, 0]);
    expect(sibshipBarOffsets([bar(40, 40)])).toEqual([0]);
    expect(sibshipBarOffsets([])).toEqual([]);
  });

  it("ignores bars on other rows", () => {
    const below: SibshipBar = { coupleX: 40, coupleY: 120, childXs: [0, 80], childYs: [240, 240] };
    expect(sibshipBarOffsets([bar(40, 0, 80), below])).toEqual([0, 0]);
  });

  it("sibships shifted right of their parents: leftmost bar lowest, nothing crosses", () => {
    const bars = [bar(40, 80, 200), bar(160, 320), bar(280, 400)];
    const offsets = sibshipBarOffsets(bars);
    expect(offsets).toEqual([2 * SIB_BAR_STEP, SIB_BAR_STEP, 0]);
    expect(crossings(bars, offsets)).toBe(0);
  });

  it("sibships shifted left of their parents: rightmost bar lowest, nothing crosses", () => {
    const bars = [bar(120, 0), bar(240, 80), bar(360, 200, 320)];
    const offsets = sibshipBarOffsets(bars);
    expect(offsets).toEqual([0, SIB_BAR_STEP, 2 * SIB_BAR_STEP]);
    expect(crossings(bars, offsets)).toBe(0);
  });

  it("does not depend on input order", () => {
    const bars = [bar(280, 400), bar(40, 80, 200), bar(160, 320)];
    expect(sibshipBarOffsets(bars)).toEqual([0, 2 * SIB_BAR_STEP, SIB_BAR_STEP]);
  });

  it("separates bars that only meet end to end", () => {
    const offsets = sibshipBarOffsets([bar(40, 0, 80), bar(120, 80, 160)]);
    expect(new Set(offsets).size).toBe(2);
  });

  it("only ever lowers a bar, and keeps it above the child symbols", () => {
    // Compact rows: 84px apart, so 22px from the halfway line to the symbols.
    const compact = (coupleX: number, ...childXs: number[]): SibshipBar =>
      ({ coupleX, coupleY: 0, childXs, childYs: childXs.map(() => 84) });
    const bars = Array.from({ length: 8 }, (_, i) => compact(34 + i * 136, 68 + i * 136, 204 + i * 136));
    const offsets = sibshipBarOffsets(bars);
    expect(Math.min(...offsets)).toBe(0);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(22 - 8);
    // Neighbours overlap, so no two in a row share a height.
    for (let i = 0; i + 1 < offsets.length; i++) expect(offsets[i]).not.toBe(offsets[i + 1]);
  });

  it("sibshipSegments lowers the bar and both ends of the drops by the offset", () => {
    const [coupleDrop, barSeg, childDrop] = sibshipSegments({ coupleX: 40, coupleY: 0, children: [{ x: 80, y: 120 }], barOffset: 12 });
    expect(coupleDrop).toEqual([40, 0, 40, 72]);
    expect(barSeg).toEqual([40, 72, 80, 72]);
    expect(childDrop).toEqual([80, 72, 80, 100]);
  });
});

describe("overlapping sibship bars on the canvas and in the export (#80)", () => {
  const barOf = (flow: ReturnType<typeof buildScene>, childId: string) => {
    const node = flow.people.find(n => n.individual.id === childId)!;
    return flow.sibships.find(e => e.data.childIds.includes(node.id))!.data;
  };

  for (const compact of [false, true]) {
    it(`gives each of the three shifted sibships its own bar height${compact ? " in compact mode" : ""}`, () => {
      const ped = shifted();
      const flow = buildScene(ped, { compact });
      const [a, b, c] = ["c1", "c3", "c4"].map(id => barOf(flow, id));
      // Leftmost lowest, so no drop crosses another couple's bar.
      expect(a!.sibBarY).toBeGreaterThan(b!.sibBarY);
      expect(b!.sibBarY).toBeGreaterThan(c!.sibBarY);
      expect(c!.barOffset).toBe(0);
      expect(barOf(flow, "c2")).toBe(a);
      // Sibships that overlap nothing stay halfway.
      expect(barOf(flow, "D1").barOffset).toBe(0);
      expect(barOf(flow, "e1").barOffset).toBe(0);
      expect(lintScene(ped, flow)).toEqual([]);
    });
  }

  it("the lint reports bars drawn along one line", () => {
    const ped = shifted();
    const flow = buildScene(ped);
    for (const e of flow.sibships) {
      e.data.sibBarY -= e.data.barOffset;
      e.data.barOffset = 0;
    }
    const found = lintScene(ped, flow);
    expect(found.map(f => f.code)).toEqual(["sibship-bars-overlap", "sibship-bars-overlap"]);
    expect(found[0]!.individuals).toEqual(["c1", "c2", "c3"]);
    expect(found[1]!.individuals).toEqual(["c3", "c4"]);
  });

  it("the SVG export draws the bars at the same heights as the canvas", () => {
    const ped = shifted();
    const flow = buildScene(ped);
    const svg = exportSvg(ped);
    const exported = [...new Set(
      parseExportSvg(svg).sibs
        .filter(([x1, y1, x2, y2]) => y1 === y2 && x1 !== x2)
        .map(([, y]) => y),
    )].sort((p, q) => p - q);
    // Three horizontal lines the same distances apart as the canvas bars
    // (the export shifts everything by its own margin).
    const gaps = (ys: number[]) => ys.slice(1).map((y, i) => y - ys[i]!);
    const want = gaps(["c1", "c3", "c4"].map(id => barOf(flow, id).sibBarY).sort((p, q) => p - q));
    expect(want).toEqual([SIB_BAR_STEP, SIB_BAR_STEP]);
    const found = exported.some((_, i) => {
      const run = exported.slice(i, i + 3);
      return run.length === 3 && gaps(run).every((g, k) => Math.abs(g - want[k]!) < 1e-6);
    });
    expect(found).toBe(true);
  });
});

describe("barsUnderLabels: a bar never runs through the text above it", () => {
  const bar = { x1: 0, x2: 80, y: 60, childY: 120 };
  const label = (bottom: number, x = 40) => ({ x, halfWidth: 20, top: 20, bottom });

  it("leaves a bar alone when the text ends above it", () => {
    expect(barsUnderLabels([bar], [label(61)])).toEqual({ lower: [0], through: new Set() });
  });

  it("lowers the bar to just under text that hangs past it", () => {
    const { lower, through } = barsUnderLabels([bar], [label(68)]);
    expect(lower).toEqual([10]);
    expect(through.size).toBe(0);
  });

  it("ignores text beside the bar", () => {
    expect(barsUnderLabels([bar], [label(68, 140)]).lower).toEqual([0]);
  });

  it("leaves the bar and asks for a backing when the text hangs lower than the bar can go", () => {
    // The bar may come no nearer the child symbols (tops at 100) than 8px.
    const { lower, through } = barsUnderLabels([bar], [label(95)]);
    expect(lower).toEqual([0]);
    expect([...through]).toEqual([0]);
  });

  it("asks for no backing where the text reaches the symbols below", () => {
    const { lower, through } = barsUnderLabels([bar], [label(104)]);
    expect(lower).toEqual([0]);
    expect(through.size).toBe(0);
  });

  it("does not lower a bar onto another couple's bar", () => {
    const other = { x1: 60, x2: 200, y: 72, childY: 120 };
    const { lower, through } = barsUnderLabels([bar, other], [label(68)]);
    expect(lower).toEqual([0, 0]);
    expect([...through]).toEqual([0]);
  });
});

describe("House Targaryen, the Dance of the Dragons rows as a figure", () => {
  const whole = EXAMPLES.find(e => e.slug === "targaryen")!.data;
  const part = selectionPedigree(whole, selectionSubset(whole, ["Jaehaerys_I", "Alysanne", "Baelon", "Alyssa", "Rodrik_Arryn", "Daella_JA", "Aemon_JA", "Aemon_Dragonknight", "Jocelyn_Baratheon", "Daemon", "Aegon_Uncrowned", "Aegon_JA", "Aegon_Baelon", "Alicent_Hightower", "Viserys_I", "Aemma_Arryn", "Corlys_Velaryon", "Rhaenys_QWNW", "Aegon_II", "Helaena", "Aemond", "Daeron_VA", "Rhaenyra", "Laenor_Velaryon", "Laena_Velaryon", "Jaehaerys_AH", "Jaehaera", "Maelor", "Aegon_III", "Daenaera_Velaryon", "Viserys_II", "Larra_Rogare", "Jacaerys", "Lucerys", "Joffrey", "Baela", "Rhaena_Aenys", "Rhaena_Daemon", "Rhaena_AD"]));
  const flow = buildScene(part);

  it("passes every sibship bar under the names of the people above it", () => {
    // Laena Velaryon with a year of birth: a two-line name, her "Vhagar" tag
    // and the year reach the bar to her children, which is lowered.
    const flow = buildScene({ ...part, individuals: part.individuals.map(i => i.id === "Laena_Velaryon" ? { ...i, dob: "93" } : i) });
    let lowered = 0;
    for (const e of flow.sibships) {
      const d = e.data, xs = [d.coupleX, ...d.childXs];
      if (d.barOffset > 0) lowered++;
      for (const n of flow.people) {
        const box = textBlockUnder(n.glyph, n.position.x, n.position.y);
        if (!box || box.top >= d.sibBarY || box.x + box.halfWidth <= Math.min(...xs) || box.x - box.halfWidth >= Math.max(...xs)) continue;
        expect(box.bottom, `${n.individual.name} over ${e.id}`).toBeLessThanOrEqual(d.sibBarY + 1);
      }
    }
    expect(lowered).toBeGreaterThan(0);
  });

  it("names every copy of Daemon in the export", () => {
    expect(flow.people.filter(n => n.individual.id === "Daemon")).toHaveLength(3);
    expect(exportSvg(part).match(/>Daemon</g)).toHaveLength(3);
  });

  it("draws one straight line to an only child who is all but under the parents", () => {
    const aemma = flow.people.find(n => n.individual.id === "Aemma_Arryn")!;
    const edge = flow.sibships.find(e => e.data.childIds.includes(aemma.id))!;
    expect(edge.data.childIds).toHaveLength(1);
    expect(edge.data.coupleX).toBe(aemma.position.x);
    const parents = [edge.data.leftParentId, edge.data.rightParentId].map(id => flow.people.find(n => n.id === id)!.position.x);
    expect(Math.abs(edge.data.coupleX - (parents[0]! + parents[1]!) / 2)).toBeLessThanOrEqual(10);
    expect(Math.abs(edge.data.coupleX - (parents[0]! + parents[1]!) / 2)).toBeGreaterThan(0);
  });
});
