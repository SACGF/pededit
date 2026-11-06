import { describe, it, expect } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { snapValue, snapSlotPositions, backgroundDotGap, activeSnapGrid } from "../snap";
import { sibshipSegments } from "../sibshipPath";
import { layoutSpacing, scalePinnedPosition, unscalePinnedPosition } from "../spacing";
import { NODE_SIZE } from "../constants";
import { EXAMPLES } from "../../data/examples";
import { simpleFamily } from "../../fixtures/simpleFamily";
import { exportSvg } from "../../io/svg/svgExporter";

const withSnap = (p: Pedigree, grid: number, extra: Partial<Pedigree> = {}): Pedigree => ({
  ...p,
  ...extra,
  canvasSettings: { nodesMoveable: true, snapToGrid: true, snapGridSize: grid },
});

const onGrid = (v: number, g: number) => Math.abs(v / g - Math.round(v / g)) < 1e-9;

describe("snap helpers", () => {
  it("rounds to the grid and never returns -0", () => {
    expect(snapValue(93.333, 5)).toBe(95);
    expect(snapValue(-1, 5)).toBe(0);
    expect(Object.is(snapValue(-1, 5), 0)).toBe(true);
    expect(snapValue(7.3, 0)).toBe(7.3);
  });

  it("is off unless snapToGrid is set", () => {
    expect(activeSnapGrid(simpleFamily)).toBe(0);
    expect(activeSnapGrid(withSnap(simpleFamily, 10))).toBe(10);
  });

  it("spaces background dots at the grid, or a multiple of it at least 10 apart", () => {
    expect(backgroundDotGap(5)).toBe(10);
    expect(backgroundDotGap(4)).toBe(12);
    expect(backgroundDotGap(10)).toBe(10);
    expect(backgroundDotGap(45)).toBe(45);
  });

  it("keeps auto-placed slots in order and a symbol apart on a coarse grid", () => {
    // 68px compact slots on an 80px grid: plain rounding would put 2-0 and 2-1 together.
    const pos = new Map([
      ["2-0", { x: -30, y: 0 }],
      ["2-1", { x: 38, y: 0 }],
      ["2-2", { x: 106, y: 0 }],
    ]);
    const out = snapSlotPositions(pos, new Set(), 80);
    const xs = ["2-0", "2-1", "2-2"].map(id => out.get(id)!.x);
    expect(xs).toEqual([0, 80, 160]);
  });
});

describe("layoutToFlow with snap on", () => {
  for (const compact of [false, true]) {
    for (const grid of [4, 5, 45, 80]) {
      it(`puts every node of every example on the ${grid}px grid${compact ? " in compact" : ""}, rows flat`, () => {
        for (const ex of EXAMPLES) {
          const p = withSnap(ex.data, grid);
          const flow = layoutToFlow(p, { compact });
          const rowY = new Map<string, number>();
          for (const n of flow.nodes) {
            expect({ ex: ex.label, id: n.id, ok: onGrid(n.position.x, grid) && onGrid(n.position.y, grid) })
              .toEqual({ ex: ex.label, id: n.id, ok: true });
            const level = n.id.split("-")[0]!;
            if (!n.data.isPinned) {
              if (!rowY.has(level)) rowY.set(level, n.position.y);
              expect(n.position.y).toBe(rowY.get(level));
            }
          }
        }
      });
    }

    it(`adds no render lint findings at a 5px grid${compact ? " in compact" : ""}`, () => {
      for (const ex of EXAMPLES) {
        const codes = (p: Pedigree) =>
          [...new Set(lintFlow(p, layoutToFlow(p, { compact })).map(f => f.code))].sort();
        expect({ ex: ex.label, codes: codes(withSnap(ex.data, 5)) })
          .toEqual({ ex: ex.label, codes: codes(ex.data) });
      }
    });
  }

  it("puts example 2's i2a on the grid so a drag can line up under it", () => {
    const ex = EXAMPLES[2]!.data;
    const plain = layoutToFlow(ex).nodes.find(n => n.data.individual.id === "i2a")!;
    expect(onGrid(plain.position.x, 5)).toBe(false); // 129.6 without snap
    const snapped = layoutToFlow(withSnap(ex, 5)).nodes.find(n => n.data.individual.id === "i2a")!;
    expect(snapped.position.x).toBe(130);
  });

  it("puts compact rows on the grid, so a horizontal drag stays on its row", () => {
    const flow = layoutToFlow(withSnap(EXAMPLES[2]!.data, 5), { compact: true });
    const ys = [...new Set(flow.nodes.map(n => n.position.y))].sort((a, b) => a - b);
    expect(ys).toEqual([0, 85, 170, 250].slice(0, ys.length));
  });

  it("shows a pin snapped in normal coordinates on the grid in compact", () => {
    // 255, 130 is on the 5px grid at normal spacing but scales to 216.75, 91.
    const p = withSnap(simpleFamily, 5, { pinnedPositions: { i6: { x: 255, y: 130 } } });
    const n6 = layoutToFlow(p, { compact: true }).nodes.find(n => n.data.individual.id === "i6")!;
    expect(n6.position).toEqual({ x: 215, y: 90 });
  });

  it("a compact drag stored on the normal grid redraws exactly where it was dropped", () => {
    const spacing = layoutSpacing(true);
    for (const grid of [4, 5, 7, 10, 45, 80]) {
      for (let i = -20; i <= 20; i++) {
        const dropped = { x: i * grid, y: (i + 3) * grid };
        const stored = unscalePinnedPosition(dropped, spacing);
        const storedOnGrid = { x: snapValue(stored.x, grid), y: snapValue(stored.y, grid) };
        const shown = scalePinnedPosition(storedOnGrid, spacing);
        expect({ grid, i, x: snapValue(shown.x, grid), y: snapValue(shown.y, grid) })
          .toEqual({ grid, i, ...dropped });
      }
    }
  });
});

describe("sibship drops", () => {
  it("reach each child, including one pinned below its siblings' row", () => {
    const segs = sibshipSegments(40, 0, 0, [{ x: 0, y: 120 }, { x: 80, y: 160 }]);
    const drops = segs.slice(2);
    expect(drops).toEqual([
      [0, 60, 0, 120 - NODE_SIZE / 2],
      [80, 60, 80, 160 - NODE_SIZE / 2],
    ]);
  });

  it("stop at a loss triangle's apex, below the top of the symbol box (#13)", () => {
    const segs = sibshipSegments(40, 0, 0, [{ x: 0, y: 120 }, { x: 80, y: 120, topInset: 8 }]);
    expect(segs.slice(2)).toEqual([
      [0, 60, 0, 120 - NODE_SIZE / 2],
      [80, 60, 80, 120 - NODE_SIZE / 2 + 8],
    ]);
  });

  it("put the bar above the highest child even when the first child is the one moved", () => {
    const segs = sibshipSegments(40, 0, 0, [{ x: 0, y: 200 }, { x: 80, y: 120 }]);
    expect(segs[1]![1]).toBe(60);
  });

  it("are drawn to the pinned child's own row in the SVG export", () => {
    // i7 sits in the third row of simpleFamily at y=240; pin it 40px lower.
    const flow = layoutToFlow(simpleFamily);
    const n7 = flow.nodes.find(n => n.data.individual.id === "i7")!;
    const p: Pedigree = { ...simpleFamily, pinnedPositions: { i7: { x: n7.position.x, y: 280 } } };
    const svg = exportSvg(p, { padding: 0 });
    const tops = [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="\1" y2="([-\d.]+)"/g)].map(m => Number(m[3]));
    // The export translates everything; the drop to i7 ends 40px lower than its siblings'.
    const maxTop = Math.max(...tops);
    const siblingsTop = tops.filter(t => t < maxTop).reduce((a, b) => Math.max(a, b), -Infinity);
    expect(maxTop - siblingsTop).toBe(40);
  });
});
