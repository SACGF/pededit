import { describe, it, expect } from "vitest";
import { detailLines, detailSections, labelMaxWidth, noteLines, textWidth, ELLIPSIS, NOTE_LINES } from "../labels";
import { SLOT_WIDTH } from "../constants";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { deidentify } from "../../io/svg/deidentify";
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";

const max = labelMaxWidth(SLOT_WIDTH);
const NOTE = "Records held at the regional hospital; cause of death not confirmed by post mortem";

function family(showNotes?: boolean): Pedigree {
  const ind = (id: string, sex: Individual["sex"], fields: Partial<Individual> = {}): Individual =>
    ({ id, sex, affected: false, sibOrder: 0, ...fields });
  return {
    individuals: [
      ind("f", "male", { name: "Frank", notes: "Lives abroad" }),
      ind("m", "female", { name: "Mary", age: "60y", notes: NOTE }),
      ind("c", "female", { name: "Cleo", notes: "Deaf\n\nsince age 5" }),
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c"] },
    siblingOrder: { mode: "manual", affectedFirst: false },
    canvasSettings: { nodesMoveable: true, snapToGrid: false, snapGridSize: 20, ...(showNotes === undefined ? {} : { showNotes }) },
  };
}
const person = (p: Pedigree, id: string) => p.individuals.find(i => i.id === id)!;

describe("notes under the symbol (#219)", () => {
  it("are drawn only with Show notes on the chart", () => {
    for (const p of [family(), family(false)]) {
      expect(detailLines(detailSections(person(p, "m"), max, p))).toEqual(["60y"]);
    }
    const on = family(true);
    expect(detailLines(detailSections(person(on, "f"), max, on))).toEqual(["Lives abroad"]);
  });

  it("go after the other text and before the pedigree number", () => {
    const on = family(true);
    const lines = detailLines(detailSections(person(on, "m"), max, on, new Map([["m", "I-2"]])));
    expect(lines[0]).toBe("60y");
    expect(lines.at(-1)).toBe("I-2");
    expect(lines.slice(1, -1)).toEqual(noteLines(NOTE, max));
  });

  it("wrap to the slot width and are cut at two lines with an ellipsis", () => {
    const lines = noteLines(NOTE, max);
    expect(lines).toHaveLength(NOTE_LINES);
    expect(lines.at(-1)!.endsWith(ELLIPSIS)).toBe(true);
    for (const l of lines) expect(textWidth(l)).toBeLessThanOrEqual(max);
  });

  it("keep their own lines, skip blank ones, and are cut when lines run out", () => {
    expect(noteLines("Deaf\n\nsince age 5", max)).toEqual(["Deaf", "since age 5"]);
    expect(noteLines("one\ntwo\nthree\nfour", max)).toEqual(["one", `two${ELLIPSIS}`]);
    expect(noteLines("  \n", max)).toEqual([]);
    expect(noteLines(undefined, max)).toEqual([]);
  });

  it("reach the SVG and U-shape exports with the setting, and never a de-identified one", () => {
    expect(exportSvg(family(true))).toContain("Lives abroad");
    expect(exportUShapeSvg(family(true))).toContain("Lives abroad");
    expect(exportSvg(family())).not.toContain("Lives abroad");
    expect(exportSvg(family(true), { deidentify: true })).not.toContain("Lives abroad");
    const copy = deidentify(family(true));
    expect(copy.canvasSettings?.showNotes).toBe(false);
    expect(copy.individuals.every(i => i.notes === undefined)).toBe(true);
  });
});
