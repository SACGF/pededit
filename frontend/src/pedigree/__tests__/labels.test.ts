import { describe, it, expect } from "vitest";
import { wrapLabel, labelMaxWidth, LABEL_CHAR_WIDTH, ELLIPSIS, linesWidth } from "../labels";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { exportSvg } from "../../io/svg/svgExporter";
import { SLOT_WIDTH } from "../constants";
import { EXAMPLES } from "../../data/examples";
import type { Pedigree } from "@pedigree-editor/layout-engine";

const max = labelMaxWidth(SLOT_WIDTH); // 74px: 12 characters

describe("wrapLabel (#68)", () => {
  it("short names stay on one line, empty names give none", () => {
    expect(wrapLabel("Mary", max)).toEqual(["Mary"]);
    expect(wrapLabel("", max)).toEqual([]);
    expect(wrapLabel(undefined, max)).toEqual([]);
    expect(wrapLabel("  spaced   out ", max)).toEqual(["spaced out"]);
  });

  it("wraps at a space onto two lines within the slot width", () => {
    expect(wrapLabel("Ferdinand of Aragon", max)).toEqual(["Ferdinand of", `Aragon`]);
    expect(wrapLabel("Isabella of Portugal", max)).toEqual(["Isabella of", "Portugal"]);
    for (const line of wrapLabel("Charles I (Charles V)", max)) expect(line.length * LABEL_CHAR_WIDTH).toBeLessThanOrEqual(max);
  });

  it("cuts a third line with an ellipsis and splits an overlong word", () => {
    const lines = wrapLabel("Maria Anna Josepha Antonia", max);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith(ELLIPSIS)).toBe(true);
    expect(lines[1]!.length).toBeLessThanOrEqual(12);
    const long = wrapLabel("Wolfeschlegelsteinhausen", max);
    expect(long[0]).toHaveLength(12);
    expect(long[1]).toBe("lsteinhausen");
    expect(wrapLabel("Wolfeschlegelsteinhausenbergerdorff", max)[1]!.endsWith(ELLIPSIS)).toBe(true);
  });

  it("gives fewer characters per line in compact slots", () => {
    expect(wrapLabel("Ferdinand of Aragon", labelMaxWidth(68))).toEqual(["Ferdinand", `of Aragon`]);
  });
});

describe("labels on the canvas, in exports and in the lint (#68)", () => {
  function pair(name: string, dx = SLOT_WIDTH, other = "Bea"): Pedigree {
    return {
      individuals: [
        { id: "a", sex: "male", affected: false, sibOrder: 0, name },
        { id: "b", sex: "female", affected: false, sibOrder: 1, name: other },
      ],
      partnerships: [{ id: "p", individual1: "a", individual2: "b" }],
      parentOf: { p: [] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
      pinnedPositions: { b: { x: dx, y: 0 }, a: { x: 0, y: 0 } },
    };
  }

  it("layoutToFlow puts the wrapped lines on the node data", () => {
    const flow = layoutToFlow(pair("Ferdinand of Aragon"));
    expect(flow.nodes.find(n => n.data.individual.id === "a")!.data.nameLines).toEqual(["Ferdinand of", "Aragon"]);
    expect(linesWidth(["Ferdinand of", "Aragon"])).toBeLessThanOrEqual(max);
  });

  it("the SVG export writes one text element per line and keeps the full name as a title", () => {
    const svg = exportSvg(pair("Ferdinand of Aragon"));
    expect(svg).toContain(">Ferdinand of</text>");
    expect(svg).toContain(">Aragon</text>");
    expect(svg).toContain("<title>Ferdinand of Aragon</title>");
    expect(exportSvg(pair("Bob"))).not.toContain("<title>");
  });

  it("the lint reports labels that run together only when they do", () => {
    const p = pair("Ferdinand of Aragon");
    expect(lintFlow(p, layoutToFlow(p)).filter(f => f.code === "labels-overlap")).toEqual([]);
    // Two wrapped names a slot apart fit; dragged half a slot closer they collide.
    const wide = pair("Ferdinand of Aragon", SLOT_WIDTH, "Isabella of Portugal");
    expect(lintFlow(wide, layoutToFlow(wide)).filter(f => f.code === "labels-overlap")).toEqual([]);
    const close = pair("Ferdinand of Aragon", 50, "Isabella of Portugal");
    const found = lintFlow(close, layoutToFlow(close));
    expect(found.some(f => f.code === "labels-overlap")).toBe(true);
  });

  it("no example's labels overlap, in normal or compact spacing", () => {
    for (const ex of EXAMPLES) {
      for (const compact of [false, true]) {
        const found = lintFlow(ex.data, layoutToFlow(ex.data, { compact })).filter(f => f.code === "labels-overlap");
        expect({ label: ex.label, compact, found }).toEqual({ label: ex.label, compact, found: [] });
      }
    }
  });
});
