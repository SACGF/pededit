import { describe, it, expect } from "vitest";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { childlessMarkSegments, childlessReasonBaselineY, activeChildless, CHILDLESS_DROP, CHILDLESS_BAR, CHILDLESS_BAR_GAP } from "../childless";
import { exportSvg } from "../../io/svg/svgExporter";
import { renderExportKeySvg } from "../tags";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/** Two couples on one row: a = b (childless, infertility) and c = d with a child. */
function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "a", sex: "male",   affected: false, sibOrder: 0, name: "Al" },
      { id: "b", sex: "female", affected: false, sibOrder: 1, name: "Bea" },
      { id: "c", sex: "male",   affected: false, sibOrder: 2 },
      { id: "d", sex: "female", affected: false, sibOrder: 3 },
      { id: "e", sex: "female", affected: false, sibOrder: 0 },
    ],
    partnerships: [
      { id: "ab", individual1: "a", individual2: "b", childless: "infertility", childlessReason: "azoospermia" },
      { id: "cd", individual1: "c", individual2: "d", childless: "byChoice" },
    ],
    parentOf: { ab: [], cd: ["e"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

describe("childless mark geometry (#15)", () => {
  it("by choice: a drop and one bar", () => {
    const segs = childlessMarkSegments(100, 50, "byChoice");
    expect(segs).toEqual([
      [100, 50, 100, 50 + CHILDLESS_DROP],
      [100 - CHILDLESS_BAR / 2, 50 + CHILDLESS_DROP, 100 + CHILDLESS_BAR / 2, 50 + CHILDLESS_DROP],
    ]);
  });

  it("infertility: a second bar above the first", () => {
    const segs = childlessMarkSegments(0, 0, "infertility");
    expect(segs).toHaveLength(3);
    expect(segs[2]).toEqual([-CHILDLESS_BAR / 2, CHILDLESS_DROP - CHILDLESS_BAR_GAP, CHILDLESS_BAR / 2, CHILDLESS_DROP - CHILDLESS_BAR_GAP]);
    expect(childlessReasonBaselineY(0)).toBeGreaterThan(CHILDLESS_DROP);
  });

  it("a mark on a couple with children is inactive", () => {
    const p = pedigree();
    expect(activeChildless(p.partnerships[0]!, p)).toBe("infertility");
    expect(activeChildless(p.partnerships[1]!, p)).toBeUndefined();
  });
});

describe("childless mark on the canvas and in exports (#15)", () => {
  it("layoutToFlow puts the mark on the childless couple's edge only", () => {
    const p = pedigree();
    const flow = layoutToFlow(p);
    expect(lintFlow(p, flow)).toEqual([]);
    const byPair = new Map(flow.coupleEdges.map(e => {
      const ids = [e.source, e.target].map(id => flow.nodes.find(n => n.id === id)!.data.individual.id).sort();
      return [ids.join("|"), e.data];
    }));
    expect(byPair.get("a|b")).toMatchObject({ childless: "infertility", childlessReason: "azoospermia" });
    expect(byPair.get("c|d")?.childless).toBeUndefined();
  });

  it("the SVG export draws the bars and the reason, and the key lists the mark", () => {
    const p = pedigree();
    const svg = exportSvg(p);
    expect(svg).toContain(">azoospermia</text>");
    // Drop plus two bars for infertility: three line elements beyond the sibship and couple lines of c = d.
    const key = renderExportKeySvg(p, 0, 0);
    expect(key.markup.join("")).toContain("Infertility");
    expect(key.markup.join("")).not.toContain("No children by choice");
  });

  it("the mark is not drawn once the couple has children", () => {
    const p = pedigree();
    p.parentOf.ab = ["e"];
    p.parentOf.cd = [];
    delete p.partnerships[1]!.childless;
    const svg = exportSvg(p);
    expect(svg).not.toContain("azoospermia");
    expect(renderExportKeySvg(p, 0, 0).markup.join("")).not.toContain("Infertility");
  });
});
