import { describe, expect, it } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { importPed } from "../../io/ped/index.js";
import { exportSvg } from "../../io/svg/svgExporter";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { SLOT_WIDTH } from "../constants";

/** Ten slots wide, with three sibships that cannot sit under their parents (#82, the pedigree of #80). */
const PED = `
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

function pedigree(layoutWidth?: "minimal" | "relaxed"): Pedigree {
  const ped = importPed(PED).pedigrees[0]!.pedigree;
  if (layoutWidth) ped.canvasSettings = { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, layoutWidth };
  return ped;
}

const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const drawnWidth = (ped: Pedigree) => span(layoutToFlow(ped).nodes.map(n => n.position.x));
const svgWidth = (ped: Pedigree) => Number(exportSvg(ped).match(/<svg[^>]* width="([\d.]+)"/)![1]);

describe("canvasSettings.layoutWidth (#82)", () => {
  it("\"relaxed\" widens the canvas layout by at most two slots and keeps everyone drawn", () => {
    const minimal = pedigree(), relaxed = pedigree("relaxed");
    const extra = drawnWidth(relaxed) - drawnWidth(minimal);
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThanOrEqual(2 * SLOT_WIDTH + 2);
    expect(layoutToFlow(relaxed).nodes.map(n => n.data.individual.id).sort())
      .toEqual(layoutToFlow(minimal).nodes.map(n => n.data.individual.id).sort());
    expect(lintFlow(relaxed, layoutToFlow(relaxed))).toEqual([]);
  });

  it("\"minimal\" is the same as leaving it out", () => {
    expect(layoutToFlow(pedigree("minimal")).nodes.map(n => n.position))
      .toEqual(layoutToFlow(pedigree()).nodes.map(n => n.position));
  });

  it("the SVG export follows the setting, by the same amount as the canvas", () => {
    const minimal = pedigree(), relaxed = pedigree("relaxed");
    expect(svgWidth(relaxed) - svgWidth(minimal)).toBeCloseTo(drawnWidth(relaxed) - drawnWidth(minimal), 3);
  });

  it("each sibship sits under or beside its own parents", () => {
    const flow = layoutToFlow(pedigree("relaxed"));
    // No sibship's bar reaches into the next couple's: the #80 overlap is gone
    // without lowering any bar.
    const bars = flow.sibshipEdges.map(e => e.data!).map(d =>
      ({ y: d.sibBarY, x1: Math.min(d.coupleX, ...d.childXs), x2: Math.max(d.coupleX, ...d.childXs) }));
    for (let i = 0; i < bars.length; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const a = bars[i]!, b = bars[j]!;
        if (a.y !== b.y) continue;
        expect(Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)).toBeLessThan(0);
      }
    }
  });
});
