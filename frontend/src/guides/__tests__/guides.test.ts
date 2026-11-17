import { describe, expect, it } from "vitest";
import { KINSHIP_TABLE, CONSANGUINITY_FIGURES } from "../ConsanguinityGuide";
import { SYMBOL_FIGURES } from "../SymbolsGuide";
import { HOW_TO_FIGURES } from "../HowToDrawGuide";
import { figureImage } from "../GuideFigure";
import { lintExport } from "../../io/svg/exportLint";
import { PRACTICE_FAMILIES } from "../../data/practiceFamilies";
import { exampleBySlug } from "../../data/examples";
import { findProblems } from "../../pedigree/validation";

describe("consanguinity guide", () => {
  it("prints the textbook kinship coefficients", () => {
    expect(Object.fromEntries(KINSHIP_TABLE.map(r => [r.name, r.kinship]))).toEqual({
      "Parent and child": 1 / 4,
      "Full siblings": 1 / 4,
      "Half siblings": 1 / 8,
      "Uncle and niece, aunt and nephew": 1 / 8,
      "Double first cousins": 1 / 8,
      "First cousins": 1 / 16,
      "First cousins once removed": 1 / 32,
      "Second cousins": 1 / 64,
    });
  });
});

describe("guide figures", () => {
  const figures = [...SYMBOL_FIGURES, ...HOW_TO_FIGURES, ...CONSANGUINITY_FIGURES];

  it("draw every figure with no key and a size", () => {
    for (const p of figures) {
      const img = figureImage(p);
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
      expect(decodeURIComponent(img.src)).not.toContain("pedigree-key");
    }
  });

  it("draw nothing the export lint objects to", () => {
    for (const [i, p] of figures.entries()) {
      expect(lintExport(p, { padding: 10, key: false }), `figure ${i}`).toEqual([]);
    }
  });
});

describe("practice families", () => {
  it("are examples, in the Practice group", () => {
    for (const f of PRACTICE_FAMILIES) expect(exampleBySlug(f.slug)?.group).toBe("Practice");
  });

  it("raise no problems in the editor", () => {
    for (const f of PRACTICE_FAMILIES) {
      expect(findProblems(exampleBySlug(f.slug)!.data).map(p => p.message), f.slug).toEqual([]);
    }
  });
});
