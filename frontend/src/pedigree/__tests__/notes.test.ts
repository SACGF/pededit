import { describe, it, expect } from "vitest";
import { detailLines, detailSections, labelMaxWidth, noteLineLimit, noteLines, textWidth, ELLIPSIS, NOTE_LINES } from "../labels";
import { NODE_SIZE, ROW_HEIGHT, SLOT_WIDTH } from "../constants";
import { buildScene } from "../scene";
import { textBlockUnder } from "../labelBlock";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { deidentify } from "../../io/svg/deidentify";
import type { CanvasSettings, Individual, Pedigree } from "@pedigree-editor/layout-engine";

const max = labelMaxWidth(SLOT_WIDTH);
const NOTE = "Records held at the regional hospital; cause of death not confirmed by post mortem";

function family(showNotes?: boolean, more: Partial<CanvasSettings> = {}): Pedigree {
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
    canvasSettings: { nodesMoveable: true, snapToGrid: false, snapGridSize: 20, ...(showNotes === undefined ? {} : { showNotes }), ...more },
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

  it("are cut at two lines when the length is absent or twoLines, and drawn whole with full", () => {
    const linesOf = (more: Partial<CanvasSettings>) => {
      const p = family(true, more);
      return detailLines(detailSections(person(p, "m"), max, p)).slice(1);
    };
    expect(noteLineLimit(family(true))).toBe(NOTE_LINES);
    expect(linesOf({})).toEqual(noteLines(NOTE, max));
    expect(linesOf({ notesLength: "twoLines" })).toEqual(noteLines(NOTE, max));
    const full = linesOf({ notesLength: "full" });
    expect(full.length).toBeGreaterThan(NOTE_LINES);
    expect(full.some(l => l.includes(ELLIPSIS))).toBe(false);
    expect(full.join(" ")).toBe(NOTE);
    for (const l of full) expect(textWidth(l)).toBeLessThanOrEqual(max);
    expect(noteLines("one\ntwo\nthree\nfour", max, Infinity)).toEqual(["one", "two", "three", "four"]);
    // Full length without Show notes on the chart draws nothing.
    const off = family(false, { notesLength: "full" });
    expect(detailLines(detailSections(person(off, "m"), max, off))).toEqual(["60y"]);
  });

  it("in full move the next row down until the text clears its symbols, on the canvas and in the export", () => {
    const rows = (p: Pedigree) => {
      const scene = buildScene(p);
      return { mother: scene.people.find(n => n.individual.id === "m")!, child: scene.people.find(n => n.individual.id === "c")! };
    };
    const cut = rows(family(true));
    expect(cut.child.position.y - cut.mother.position.y).toBe(ROW_HEIGHT);
    const { mother, child } = rows(family(true, { notesLength: "full" }));
    const text = textBlockUnder(mother.glyph, mother.position.x, mother.position.y)!;
    expect(text.bottom).toBeGreaterThan(mother.position.y + ROW_HEIGHT - NODE_SIZE / 2);
    expect(child.position.y - NODE_SIZE / 2).toBeGreaterThan(text.bottom);
    expect(exportSvg(family(true, { notesLength: "full" }))).toContain("post mortem");
    expect(exportSvg(family(true))).not.toContain("post mortem");
  });
});
