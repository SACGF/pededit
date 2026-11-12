import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { kinshipCoefficients } from "@pedigree-editor/layout-engine";
import type { Pedigree, Individual } from "@pedigree-editor/layout-engine";
import { symbolSex, assignedAtBirthText, assignedAtBirthInUse, drawsGender } from "../gender";
import { detailLines } from "../labels";
import { layoutToFlow } from "../layoutToFlow";
import type { RFNodeData } from "../layoutToFlow";
import { SymbolShape } from "../nodes/symbols";
import { renderExportKeySvg } from "../tags";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport } from "../../io/svg/exportLint";
import { deidentify } from "../../io/svg/deidentify";
import { exportCsv } from "../../io/csv/exporter";
import { exportJson, importJson } from "../../io/json";
import { exportPed } from "../../io/ped";
import { usePedigreeStore } from "../../store/usePedigreeStore";

/** A trans man (female, man), his cis brother, a non-binary sib and their parents. */
function family(symbolsShow?: "gender" | "sex"): Pedigree {
  return {
    individuals: [
      { id: "f", sex: "male", affected: false, sibOrder: 0, name: "Dad" },
      { id: "m", sex: "female", affected: false, sibOrder: 1, name: "Mum", genderIdentity: "woman" },
      { id: "t", sex: "female", affected: true, sibOrder: 0, name: "Sam", genderIdentity: "man" },
      { id: "b", sex: "male", affected: false, sibOrder: 1, name: "Ben", genderIdentity: "man" },
      { id: "n", sex: "male", affected: false, sibOrder: 2, name: "Alex", genderIdentity: "nonbinary" },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["t", "b", "n"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...(symbolsShow ? { canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, symbolsShow } } : {}),
  };
}

const ind = (p: Pedigree, id: string) => p.individuals.find(i => i.id === id)!;

describe("gender identity on the symbol (#26)", () => {
  it("draws the gender's shape by default and the sex's when set to sex", () => {
    const g = family();
    expect(symbolSex(ind(g, "t"), g)).toBe("male");
    expect(symbolSex(ind(g, "n"), g)).toBe("unknown");
    expect(symbolSex(ind(g, "f"), g)).toBe("male");
    const s = family("sex");
    expect(symbolSex(ind(s, "t"), s)).toBe("female");
    expect(symbolSex(ind(s, "n"), s)).toBe("male");
    expect(drawsGender(ind(s, "t"), s)).toBe(false);
  });

  it("writes the sex assigned at birth only when it differs from the gender", () => {
    const g = family();
    expect(assignedAtBirthText(ind(g, "t"), g)).toBe("AFAB");
    expect(assignedAtBirthText(ind(g, "n"), g)).toBe("AMAB");
    expect(assignedAtBirthText(ind(g, "b"), g)).toBeUndefined();
    expect(assignedAtBirthText(ind(g, "m"), g)).toBeUndefined();
    expect(assignedAtBirthText(ind(g, "f"), g)).toBeUndefined();
    const unknown: Individual = { id: "u", sex: "unknown", affected: false, sibOrder: 0, genderIdentity: "woman" };
    expect(assignedAtBirthText(unknown, g)).toBe("UAAB");
    expect(symbolSex(unknown, g)).toBe("female");
    const s = family("sex");
    expect(assignedAtBirthText(ind(s, "t"), s)).toBeUndefined();
  });

  it("ignores a gender identity on a pregnancy or loss", () => {
    const g = family();
    const preg: Individual = { id: "x", sex: "female", affected: false, sibOrder: 0, lifeStatus: "pregnancy", genderIdentity: "man" };
    expect(symbolSex(preg, g)).toBe("female");
    expect(assignedAtBirthText(preg, g)).toBeUndefined();
  });

  it("puts the code under the name, after onset and before the number", () => {
    const g = family();
    const t = { ...ind(g, "t"), age: "34y", onset: "20s" };
    expect(detailLines(t, 74, g, new Map([["t", "II-1"]]))).toEqual(["34y", "onset 20s", "AFAB", "II-1"]);
    expect(detailLines(ind(family("sex"), "t"), 74, family("sex"))).toEqual([]);
  });

  it("gives the canvas node its drawn shape, and the canvas draws it", () => {
    const nodes = layoutToFlow(family()).nodes;
    const data = (id: string) => nodes.find(n => (n.data as RFNodeData).individual.id === id)!.data as RFNodeData;
    expect(data("t").shape).toBe("male");
    expect(data("t").detailLines).toContain("AFAB");
    expect(data("n").shape).toBe("unknown");
    const t = ind(family(), "t");
    expect(renderToStaticMarkup(<svg><SymbolShape individual={t} shape="male" size={40} /></svg>)).toContain("<rect");
    expect(renderToStaticMarkup(<svg><SymbolShape individual={t} size={40} /></svg>)).toContain("<circle");
  });

  it("does not move anyone: the layout follows sex, not the drawing", () => {
    const pos = (p: Pedigree) => layoutToFlow(p).nodes.map(n => [n.id, n.position.x, n.position.y]);
    expect(pos(family())).toEqual(pos(family("sex")));
    const none = { ...family(), individuals: family().individuals.map(i => ({ ...i, genderIdentity: undefined })) };
    expect(pos(family())).toEqual(pos(none));
  });

  it("leaves kinship, X-linked kinship and PED export on biological sex", () => {
    const none = { ...family(), individuals: family().individuals.map(i => ({ ...i, genderIdentity: undefined })) };
    const x = kinshipCoefficients(family(), { chromosome: "X" });
    const x0 = kinshipCoefficients(none, { chromosome: "X" });
    for (const a of ["t", "b", "n"]) for (const b of ["t", "b", "n"]) expect(x.kinship(a, b)).toBe(x0.kinship(a, b));
    // Sam is female: two X chromosomes, so X kinship with herself is 1/2, not 1.
    expect(x.kinship("t", "t")).toBe(0.5);
    expect(kinshipCoefficients(family()).kinship("t", "b")).toBe(0.25);
    expect(exportPed(family())).toBe(exportPed(none));
  });

  it("draws gender shapes and the code in both exports, which lint clean", () => {
    const svg = exportSvg(family());
    expect(svg).toContain(">AFAB</text>");
    expect(svg).toContain(">AMAB</text>");
    expect(svg).toContain("Assigned female at birth");
    expect(lintExport(family())).toEqual([]);
    expect(exportUShapeSvg(family())).toContain(">AFAB</text>");
    const sex = exportSvg(family("sex"));
    expect(sex).not.toContain("AFAB");
    expect(sex).not.toContain("assigned");
    // Two circles (mother, Sam) in sex mode; one (mother) in gender mode.
    const circles = (s: string) => (s.match(/<circle cx="0" cy="0"[^>]*fill="(white|black)"/g) ?? []).length;
    expect(circles(sex)).toBe(2);
    expect(circles(svg)).toBe(1);
  });

  it("lists only the codes in use in the export key (the app legend is checked in the browser)", () => {
    expect(assignedAtBirthInUse(family()).map(c => c.code)).toEqual(["AMAB", "AFAB"]);
    const key = renderExportKeySvg(family(), 0, 0).markup.join("");
    expect(key).toContain("Assigned male at birth");
    expect(key).not.toContain("Unassigned");
    expect(renderExportKeySvg(family("sex"), 0, 0).markup.join("")).not.toContain("at birth");
  });

  it("keeps the gender identity in a de-identified export", () => {
    expect(ind(deidentify(family()), "t").genderIdentity).toBe("man");
    expect(exportSvg(family(), { deidentify: true })).toContain(">AFAB</text>");
  });

  it("round-trips through JSON, rejects unknown values, and has a CSV column", () => {
    const back = importJson(exportJson(family("sex"))).pedigree;
    expect(back.individuals.find(i => i.id === "t")!.genderIdentity).toBe("man");
    expect(back.canvasSettings?.symbolsShow).toBe("sex");
    const bad = JSON.parse(exportJson(family()));
    bad.pedigree.individuals[0].genderIdentity = "robot";
    bad.pedigree.canvasSettings = { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, symbolsShow: "both" };
    const result = importJson(JSON.stringify(bad));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.some(i => i.path === "pedigree.individuals[0].genderIdentity")).toBe(true);
    expect(result.issues.some(i => i.path === "pedigree.canvasSettings.symbolsShow")).toBe(true);
    const [header, ...rows] = exportCsv(family()).split("\n");
    const cols = header!.split(",");
    const col = cols.indexOf("gender_identity");
    expect(col).toBe(cols.indexOf("evaluations") + 1);
    expect(rows.map(r => r.split(",")[col])).toEqual(['""', '"woman"', '"man"', '"man"', '"nonbinary"']);
  });
});

describe("gender identity and monozygotic twins (#26)", () => {
  const get = () => usePedigreeStore.getState();
  beforeEach(() => {
    const p = family();
    p.partnerships[0]!.twins = [{ members: ["b", "n"], zygosity: "monozygotic" }];
    get().initialize(p);
  });

  it("setSex changes the twin set's sex and leaves each gender identity alone", () => {
    get().setSex("b", "female");
    const p = get().pedigree;
    expect(ind(p, "b").sex).toBe("female");
    expect(ind(p, "n").sex).toBe("female");
    expect(ind(p, "b").genderIdentity).toBe("man");
    expect(ind(p, "n").genderIdentity).toBe("nonbinary");
    expect(assignedAtBirthText(ind(p, "b"), p)).toBe("AFAB");
  });
});
