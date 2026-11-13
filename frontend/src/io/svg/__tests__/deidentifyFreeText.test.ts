import { describe, it, expect } from "vitest";
import type { NotationEdition, Pedigree } from "@pedigree-editor/layout-engine";
import { deidentify, deidentifiableText } from "../deidentify";
import { exportSvg } from "../svgExporter";
import { exportUShapeSvg } from "../uShapeExporter";
import { lintExport } from "../exportLint";
import { DEIDENTIFY_KEEP_DEFAULTS } from "../types";
import type { DeidentifyKeep } from "../types";
import { evaluationLegend } from "../../../pedigree/evaluation";

// #111: the free text a de-identified export keeps or drops.

function family(notation: NotationEdition = "nsgc2022"): Pedigree {
  return {
    individuals: [
      { id: "gf", sex: "male", affected: false, sibOrder: 0 },
      { id: "gm", sex: "female", affected: false, sibOrder: 1 },
      { id: "a", sex: "male", affected: false, sibOrder: 0 },
      { id: "b", sex: "female", affected: false, sibOrder: 1 },
      { id: "x", sex: "female", affected: false, sibOrder: 0 },
      { id: "y", sex: "male", affected: false, sibOrder: 1 },
      {
        id: "c1", sex: "male", affected: false, sibOrder: 0,
        evaluations: [
          { detail: "BRCA1 c.5266dupC", result: "positive", documented: true },
          { detail: "echo" },
        ],
      },
      {
        id: "c2", sex: "female", affected: true, sibOrder: 0, onset: "45y",
        tags: ["bc", "geno"], tagOnset: { bc: "50y" },
      },
    ],
    partnerships: [
      { id: "p0", individual1: "gf", individual2: "gm" },
      { id: "pa", individual1: "a", individual2: "x" },
      { id: "pb", individual1: "y", individual2: "b" },
      { id: "pc", individual1: "c1", individual2: "c2", consanguinityLabel: "first cousins" },
    ],
    parentOf: { p0: ["a", "b"], pa: ["c1"], pb: ["c2"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    tags: [
      { id: "bc", label: "Breast cancer", color: "#cc0000", style: "quadrant" },
      { id: "geno", label: "Genotype exp/+", abbrev: "exp/+", color: "#000000", style: "text" },
    ],
    canvasSettings: {
      nodesMoveable: false, snapToGrid: false, notation,
    } as Pedigree["canvasSettings"],
  };
}

const ind = (p: Pedigree, id: string) => p.individuals.find(i => i.id === id)!;
const svg = (p: Pedigree, keep: Partial<DeidentifyKeep> = {}) => exportSvg(p, { deidentify: true, deidentifyKeep: keep });
const keyText = (s: string) => s.match(/<g class="pedigree-key"[\s\S]*$/)?.[0] ?? "";

describe("deidentify free text (#111): defaults", () => {
  it("are the maintainer's: drop detail and onset, keep marks, couple text and text tags", () => {
    expect(DEIDENTIFY_KEEP_DEFAULTS).toEqual({
      evaluationDetail: false, evaluationMarks: true, onset: false, consanguinityLabels: true, textTags: true,
    });
  });

  it("drops the detail, keeps every evaluation's result and the documented mark", () => {
    const out = deidentify(family());
    expect(ind(out, "c1").evaluations).toEqual([{ result: "positive", documented: true }, {}]);
    expect(ind(out, "c2").onset).toBeUndefined();
    expect(ind(out, "c2").tagOnset).toBeUndefined();
    expect(ind(out, "c2").tags).toEqual(["bc", "geno"]);
    expect(out.partnerships.find(p => p.id === "pc")!.consanguinityLabel).toBe("first cousins");
  });

  it("does not change the source pedigree", () => {
    const p = family();
    deidentify(p, { deidentifyKeep: { consanguinityLabels: false, textTags: false } });
    expect(ind(p, "c1").evaluations![0].detail).toBe("BRCA1 c.5266dupC");
    expect(ind(p, "c2").onset).toBe("45y");
    expect(ind(p, "c2").tags).toEqual(["bc", "geno"]);
    expect(p.partnerships.find(q => q.id === "pc")!.consanguinityLabel).toBe("first cousins");
  });
});

describe.each(["nsgc2022", "nsgc2008"] as const)("deidentify evaluations (#111), %s notation", notation => {
  const legend = evaluationLegend(notation).label;

  it("detail kept: the line is as on the canvas", () => {
    const s = svg(family(notation), { evaluationDetail: true });
    expect(s).toContain("BRCA1");
    expect(s).toContain("c.5266dupC");
    expect(s).toContain("echo");
    expect(s).toContain('class="documented-evaluation"');
    expect(keyText(s)).toContain(legend);
  });

  it("detail dropped, marks kept: the result alone, the * stays, the key keeps its rows", () => {
    const s = svg(family(notation));
    expect(s).not.toContain("BRCA1");
    expect(s).not.toContain("echo");
    expect(s).toMatch(notation === "nsgc2008" ? />E1\+</ : />\+</);
    // 2008 keeps the numbering and the bare "E2"; 2022 draws nothing for an evaluation left empty.
    if (notation === "nsgc2008") expect(s).toMatch(/>E2</);
    expect(s).toContain('class="documented-evaluation"');
    expect(keyText(s)).toContain(legend);
    expect(keyText(s)).toContain("Documented evaluation");
  });

  it("detail and marks dropped: no evaluation line, no *, no key rows for them", () => {
    const out = deidentify(family(notation), { deidentifyKeep: { evaluationMarks: false } });
    expect(ind(out, "c1").evaluations).toBeUndefined();
    const s = svg(family(notation), { evaluationMarks: false });
    expect(s).not.toContain("BRCA1");
    expect(s).not.toMatch(notation === "nsgc2008" ? />E1?\+</ : />\+</);
    expect(s).not.toMatch(/>E2</);
    expect(s).not.toContain('class="documented-evaluation"');
    expect(keyText(s)).not.toContain(legend);
    expect(keyText(s)).not.toContain("Documented evaluation");
  });

  it("marks choice is ignored while the detail is kept", () => {
    const out = deidentify(family(notation), { deidentifyKeep: { evaluationDetail: true, evaluationMarks: false } });
    expect(ind(out, "c1").evaluations).toHaveLength(2);
  });
});

describe("deidentify onset, couple text and text tags (#111)", () => {
  it("onset: dropped by default, kept when asked", () => {
    expect(svg(family())).not.toMatch(/45y|50y/);
    const s = svg(family(), { onset: true });
    expect(s).toContain("45y");
    expect(s).toContain("50y");
  });

  it("consanguinity text: kept by default, dropped when asked", () => {
    expect(svg(family())).toContain("first cousins");
    const out = deidentify(family(), { deidentifyKeep: { consanguinityLabels: false } });
    expect(out.partnerships.find(p => p.id === "pc")!.consanguinityLabel).toBeUndefined();
    expect(svg(family(), { consanguinityLabels: false })).not.toContain("first cousins");
  });

  it("consanguinity text: the named relationship goes too", () => {
    const p = family();
    delete p.partnerships.find(q => q.id === "pc")!.consanguinityLabel;
    p.canvasSettings!.relationshipLabels = true;
    expect(svg(p)).toContain("first cousins");
    expect(svg(p, { consanguinityLabels: false })).not.toContain("first cousins");
  });

  it("text tags: kept by default with their key row, dropped with it when asked", () => {
    const kept = svg(family());
    expect(kept).toContain("exp/+");
    expect(keyText(kept)).toContain("Genotype exp/+");
    const out = deidentify(family(), { deidentifyKeep: { textTags: false } });
    expect(ind(out, "c2").tags).toEqual(["bc"]);
    const dropped = svg(family(), { textTags: false });
    expect(dropped).not.toContain("exp/+");
    expect(keyText(dropped)).toContain("Breast cancer");
  });

  it("the U-shape export follows the same choices", () => {
    const keepAll = { evaluationDetail: true, onset: true };
    const u = (k: Partial<DeidentifyKeep>) => exportUShapeSvg(family(), { deidentify: true, deidentifyKeep: k });
    const all = u(keepAll);
    expect(all).toContain("BRCA1");
    expect(all).toContain("45y");
    expect(all).toContain("first cousins");
    expect(all).toContain("exp/+");
    const none = u({ consanguinityLabels: false, textTags: false });
    for (const t of ["BRCA1", "45y", "first cousins", "exp/+"]) expect(none).not.toContain(t);
  });
});

describe("deidentify free text (#111): export lint and dialog offers", () => {
  const combos: Partial<DeidentifyKeep>[] = [
    {},
    { evaluationDetail: true, onset: true },
    { evaluationMarks: false, consanguinityLabels: false, textTags: false },
  ];
  it.each(combos)("lint is clean with %o", keep => {
    for (const notation of ["nsgc2022", "nsgc2008"] as const) {
      expect(lintExport(family(notation), { deidentify: true, deidentifyKeep: keep })).toEqual([]);
    }
  });

  it("offers only what the pedigree has", () => {
    expect(deidentifiableText(family())).toEqual({ evaluationDetail: true, onset: true, consanguinityLabels: true, textTags: true });
    const bare = family();
    bare.individuals = bare.individuals.map(i => ({ ...i, evaluations: undefined, onset: undefined, tagOnset: undefined, tags: undefined }));
    bare.partnerships = bare.partnerships.map(p => ({ ...p, consanguinityLabel: undefined }));
    expect(deidentifiableText(bare)).toEqual({ evaluationDetail: false, onset: false, consanguinityLabels: false, textTags: false });
  });
});
