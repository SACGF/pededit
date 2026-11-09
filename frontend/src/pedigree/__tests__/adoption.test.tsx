import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SymbolShape } from "../nodes/symbols";
import { adoptionBracketSegments, ADOPTION_BRACKET_GAP, ADOPTION_DASH } from "../adoption";
import { sibshipPaths, sibshipSegments } from "../sibshipPath";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportCsv } from "../../io/csv/exporter";
import { renderExportKeySvg } from "../tags";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/** Parents with three children: "bio" born to them, "ain" adopted in, "aout" adopted out. */
function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "f",    sex: "male",    affected: false, sibOrder: 0 },
      { id: "m",    sex: "female",  affected: false, sibOrder: 1 },
      { id: "bio",  sex: "male",    affected: false, sibOrder: 0 },
      { id: "ain",  sex: "female",  affected: false, sibOrder: 1, adopted: "in" },
      { id: "aout", sex: "unknown", affected: true,  sibOrder: 2, adopted: "out" },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["bio", "ain", "aout"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

describe("adoption brackets (#12)", () => {
  it("six bracket segments just outside the symbol box", () => {
    const segs = adoptionBracketSegments(40, 10, 20);
    expect(segs).toHaveLength(6);
    expect(segs[0]![0]).toBe(10 - ADOPTION_BRACKET_GAP);
    expect(segs[3]![0]).toBe(10 + 40 + ADOPTION_BRACKET_GAP);
    for (const [, y1, , y2] of [segs[0]!, segs[3]!]) { expect(y1).toBeLessThan(20); expect(y2).toBeGreaterThan(60); }
  });

  it("SymbolShape draws the brackets for adopted in and out, not otherwise", () => {
    const html = (adopted?: "in" | "out") =>
      renderToStaticMarkup(<SymbolShape individual={{ id: "x", sex: "male", affected: false, sibOrder: 0, adopted }} size={40} />);
    expect(html("in")).toContain('data-adopted="true"');
    expect(html("out")).toContain('data-adopted="true"');
    expect(html()).not.toContain("data-adopted");
    expect(html("in").match(/<line/g)!.length).toBe(6);
  });

  it("sibshipPaths splits off the drops of adopted-in children, in order", () => {
    const kids = [{ x: 0, y: 120 }, { x: 80, y: 120, dashed: true }, { x: 160, y: 120 }];
    const all = sibshipSegments(80, 0, 0, kids);
    const { solid, dashed } = sibshipPaths(80, 0, 0, kids);
    expect(dashed).toEqual([all[3]]);
    expect(solid).toEqual([all[0], all[1], all[2], all[4]]);
    expect(sibshipPaths(80, 0, 0, kids.map(k => ({ ...k, dashed: false }))).dashed).toEqual([]);
  });

  it("the canvas layout is lint-clean and the SVG export dashes only the adopted-in drop", () => {
    const p = pedigree();
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
    const svg = exportSvg(p);
    expect(svg.match(/data-adopted="in"/g)!.length).toBe(1);
    expect(svg.match(/data-adopted="out"/g)!.length).toBe(1);
    expect(svg.match(new RegExp(`stroke-dasharray="${ADOPTION_DASH}"`, "g"))!.length).toBe(1);
    const key = renderExportKeySvg(p, 0, 0).markup.join("");
    expect(key).toContain("Adopted in (dashed line to adoptive parents)");
    expect(key).toContain("Adopted out");
  });

  it("CSV carries an adopted column", () => {
    const csv = exportCsv(pedigree());
    expect(csv.split("\n")[0]).toContain(",adopted");
    expect(csv).toContain('"ain",');
    expect(csv.split("\n").find(l => l.includes('"ain"'))).toMatch(/"in","",""$/);
  });
});

describe("setAdopted (#12)", () => {
  const store = () => usePedigreeStore.getState();
  const find = (id: string) => store().pedigree.individuals.find(i => i.id === id)!;
  beforeEach(() => store().initialize(pedigree()));

  it("sets, changes, clears and removes the key", () => {
    store().setAdopted("bio", "in");
    expect(find("bio").adopted).toBe("in");
    store().setAdopted("bio", "out");
    expect(find("bio").adopted).toBe("out");
    store().setAdopted("bio", undefined);
    expect(find("bio")).not.toHaveProperty("adopted");
  });

  it("is undoable", () => {
    store().setAdopted("bio", "in");
    store().undo();
    expect(find("bio").adopted).toBeUndefined();
    store().redo();
    expect(find("bio").adopted).toBe("in");
  });
});
