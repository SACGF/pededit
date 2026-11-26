import { describe, expect, it } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../data/examples";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { uShapeViewDrawing } from "../uShapeView";

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
