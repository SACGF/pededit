import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_FIXTURES } from "../../fixtures/features";
import { layoutToFlow } from "../layoutToFlow";
import { drawnPedigree } from "../collapse";
import { personGlyph } from "../personGlyph";
import { labelMaxWidth } from "../labels";
import { SLOT_WIDTH } from "../constants";

describe("personGlyph", () => {
  const status = FEATURE_FIXTURES.find(f => f.slug === "status")!.data;
  const text = FEATURE_FIXTURES.find(f => f.slug === "text")!.data;
  const glyph = (p: typeof status, id: string, extra = {}) =>
    personGlyph(p.individuals.find(i => i.id === id)!, drawnPedigree(p), { labelMax: labelMaxWidth(SLOT_WIDTH), hasParents: true, ...extra });

  it("is plain data: it survives JSON unchanged", () => {
    for (const fx of FEATURE_FIXTURES) {
      for (const node of layoutToFlow(fx.data).nodes) {
        expect(JSON.parse(JSON.stringify(node.data.glyph)), `${fx.slug} ${node.data.individual.id}`).toEqual(node.data.glyph);
      }
    }
  });

  it("says what marks a person carries", () => {
    expect(glyph(status, "p")).toMatchObject({ shape: "female", arrow: "proband", documented: true, deceased: false });
    expect(glyph(status, "c")).toMatchObject({ arrow: "consultand", documented: false });
    expect(glyph(status, "gf")).toMatchObject({ deceased: true, paint: { base: "black" } });
    expect(glyph(status, "w1", { hasParents: false })).toMatchObject({ familyHistoryUnknown: true, hasParents: false });
    expect(glyph(status, "s3").paint.line).toBe(true);
    expect(glyph(status, "s5").annotations.map(a => a.tag.id)).toEqual(["dna", "apoe"]);
  });

  it("draws the gender identity's shape and writes the sex at birth under it", () => {
    const g = glyph(text, "u1");
    expect(g.shape).toBe("female");
    expect(g.detailLines).toContain("AMAB");
  });

  it("gives the canvas one line for a name when names are truncated, and a figure two", () => {
    const g = glyph(text, "gf", { nameLineLimit: 1 });
    expect(g.nameLines.length).toBe(1);
    expect(g.figureNameLines.length).toBe(2);
    expect(g.name).toBe("Bartholomew Featherstonehaugh-Wetherby");
  });

  it("carries the caption of a stillbirth and the count of a collapsed branch", () => {
    expect(glyph(text, "k3")).toMatchObject({ caption: "SB", lifeStatus: "stillbirth" });
    const collapsed = FEATURE_FIXTURES.find(f => f.slug === "collapsed")!.data;
    const counts = layoutToFlow(collapsed).nodes.map(n => n.data.glyph.groupCount).filter(c => c !== undefined);
    expect(counts.sort()).toEqual([1, 2, 3]);
  });
});

describe("the renderers draw from the glyph (#144)", () => {
  const source = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
  const imported = (text: string) => [...text.matchAll(/^import ([^;]*?) from "[^"]+";/gms)].map(m => m[1]!).join("\n");
  for (const file of ["../nodes/PedigreeSymbolNode.tsx", "../../io/svg/svgExporter.ts", "../../io/svg/uShapeExporter.ts"]) {
    it(`${file.split("/").pop()} does not decide what to draw itself`, () => {
      expect(imported(source(file))).not.toMatch(/\b(symbolPaint|annotationRow|arrowKind|symbolSex|hasDocumentedEvaluation|detailLines|wrapLabel)\b/);
    });
  }
});
