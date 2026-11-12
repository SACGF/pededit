import { describe, expect, it } from "vitest";
import { importPed } from "../../io/ped/index.js";
import { exportSvg } from "../../io/svg/svgExporter";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { SIB_BAR_STEP, sibshipBarOffsets, sibshipSegments } from "../sibshipPath";
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
    const [coupleDrop, barSeg, childDrop] = sibshipSegments(40, 0, 0, [{ x: 80, y: 120 }], 12);
    expect(coupleDrop).toEqual([40, 0, 40, 72]);
    expect(barSeg).toEqual([40, 72, 80, 72]);
    expect(childDrop).toEqual([80, 72, 80, 100]);
  });
});

describe("overlapping sibship bars on the canvas and in the export (#80)", () => {
  const barOf = (flow: ReturnType<typeof layoutToFlow>, childId: string) => {
    const node = flow.nodes.find(n => n.data.individual.id === childId)!;
    return flow.sibshipEdges.find(e => e.data!.childIds.includes(node.id))!.data!;
  };

  for (const compact of [false, true]) {
    it(`gives each of the three shifted sibships its own bar height${compact ? " in compact mode" : ""}`, () => {
      const ped = shifted();
      const flow = layoutToFlow(ped, { compact });
      const [a, b, c] = ["c1", "c3", "c4"].map(id => barOf(flow, id));
      // Leftmost lowest, so no drop crosses another couple's bar.
      expect(a!.sibBarY).toBeGreaterThan(b!.sibBarY);
      expect(b!.sibBarY).toBeGreaterThan(c!.sibBarY);
      expect(c!.barOffset).toBe(0);
      expect(barOf(flow, "c2")).toBe(a);
      // Sibships that overlap nothing stay halfway.
      expect(barOf(flow, "D1").barOffset).toBe(0);
      expect(barOf(flow, "e1").barOffset).toBe(0);
      expect(lintFlow(ped, flow)).toEqual([]);
    });
  }

  it("the lint reports bars drawn along one line", () => {
    const ped = shifted();
    const flow = layoutToFlow(ped);
    for (const e of flow.sibshipEdges) {
      e.data!.sibBarY -= e.data!.barOffset;
      e.data!.barOffset = 0;
    }
    const found = lintFlow(ped, flow);
    expect(found.map(f => f.code)).toEqual(["sibship-bars-overlap", "sibship-bars-overlap"]);
    expect(found[0]!.individuals).toEqual(["c1", "c2", "c3"]);
    expect(found[1]!.individuals).toEqual(["c3", "c4"]);
  });

  it("the SVG export draws the bars at the same heights as the canvas", () => {
    const ped = shifted();
    const flow = layoutToFlow(ped);
    const svg = exportSvg(ped);
    const exported = [...new Set(
      [...svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)]
        .filter(m => m[2] === m[4] && m[1] !== m[3])
        .map(m => Number(m[2])),
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
