import { describe, expect, it } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../data/examples";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { uShapeExportLayout, uShapeViewDrawing } from "../uShapeView";

const example = (label: string): Pedigree => EXAMPLES.find(e => e.label === label)!.data;

describe("uShapeViewDrawing (#220)", () => {
  it("counts each person drawn once, and everyone in the pedigree", () => {
    const d = uShapeViewDrawing(example("Large family"))!;
    expect(d.total).toBe(100);
    const ids = new Set([...d.svg.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]));
    expect(d.drawn).toBe(ids.size);
    expect(d.drawn).toBeLessThan(d.total);
  });

  it("is the export's figure without the key", () => {
    const p = example("Queen Victoria · haemophilia B");
    const d = uShapeViewDrawing(p, "Title")!;
    expect(d.drawn).toBe(d.total);
    expect(d.svg).not.toContain("pedigree-key");
    expect(exportUShapeSvg(p, { title: "Title" })).toContain("pedigree-key");
    expect(d.svg).toBe(exportUShapeSvg(p, { title: "Title", key: false, personIds: true }));
  });

  it("is null with nobody to descend from", () => {
    const couple: Pedigree = {
      individuals: [
        { id: "a", sex: "male", affected: false, sibOrder: 0 },
        { id: "b", sex: "female", affected: false, sibOrder: 1 },
      ],
      partnerships: [{ id: "p", individual1: "a", individual2: "b" }],
      parentOf: {},
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    expect(uShapeViewDrawing(couple)).toBeNull();
  });
});

describe("uShapeExportLayout (#226)", () => {
  it("leaves out the people a view filter hides, as the view's banner counts them", () => {
    const p: Pedigree = { ...example("Simple family"), filters: { affectedOnly: true } };
    const view = uShapeViewDrawing(p)!;
    const e = uShapeExportLayout(p, true);
    expect([e.omitted, e.total]).toEqual([view.total - view.drawn, view.total]);
    expect([e.omitted, e.notDrawn]).toEqual([1, 1]);
  });

  it("counts people outside the founding couple's line, under a filter or not", () => {
    for (const filters of [undefined, { affectedOnly: true }]) {
      const p: Pedigree = { ...example("Large family"), filters };
      const view = uShapeViewDrawing(p)!;
      expect(uShapeExportLayout(p, true).omitted).toBe(view.total - view.drawn);
    }
  });
});
