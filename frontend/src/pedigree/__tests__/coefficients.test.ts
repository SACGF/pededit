import { describe, expect, it } from "vitest";
import type { CanvasSettings, Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../data/examples";
import { exportCsv } from "../../io/csv/exporter";
import { deidentifiableText, deidentify } from "../../io/svg/deidentify";
import { lintExport } from "../../io/svg/exportLint";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { consanguinityLabelText, wrapConsanguinityLabel } from "../consanguinityLabel";
import { ROW_HEIGHT, SLOT_WIDTH } from "../constants";
import { drawnPedigree } from "../collapse";
import { keyRows } from "../keyRows";
import { detailLines, labelMaxWidth } from "../labels";
import { layoutToFlow, pedigreeNumbers } from "../layoutToFlow";
import { inbreedingLabel, kinshipLabel } from "../relatedness";
import { lintFlow } from "../renderLint";

const BASE: CanvasSettings = { nodesMoveable: false, snapToGrid: false, snapGridSize: 5, notation: "nsgc2022" };
const person = (id: string, sex: "male" | "female", extra = {}) => ({ id, sex, affected: false, sibOrder: 0, ...extra });

/** First cousins k1 and k2 with a daughter z; x1 and x2 married in. */
function cousins(settings: Partial<CanvasSettings> = {}, extra: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [
      person("gf", "male"), person("gm", "female"), person("s1", "male"), person("x1", "female"),
      person("s2", "female"), person("x2", "male"), person("k1", "male"), person("k2", "female"), person("z", "female"),
    ],
    partnerships: [
      { id: "p0", individual1: "gf", individual2: "gm" }, { id: "p1", individual1: "s1", individual2: "x1" },
      { id: "p2", individual1: "x2", individual2: "s2" }, { id: "p3", individual1: "k1", individual2: "k2" },
    ],
    parentOf: { p0: ["s1", "s2"], p1: ["k1"], p2: ["k2"], p3: ["z"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    canvasSettings: { ...BASE, ...settings },
    ...extra,
  };
}
const ON = { showCoefficients: true };
const max = labelMaxWidth(SLOT_WIDTH);
const couple = (p: Pedigree, id = "p3") => p.partnerships.find(x => x.id === id)!;
const under = (p: Pedigree, id: string) => layoutToFlow(p).nodes.find(n => n.data.individual.id === id)!.data.detailLines;
const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

describe("coefficients on the figure (#86)", () => {
  it("draws nothing unless the pedigree is set to", () => {
    const p = cousins();
    expect(inbreedingLabel(p, "z")).toBeUndefined();
    expect(kinshipLabel(p, "k1", "k2")).toBeUndefined();
    expect(under(p, "z")).toEqual([]);
    expect(consanguinityLabelText(p, couple(p))).toBeUndefined();
    expect(exportSvg(p)).not.toMatch(/F = |φ/);
    // Every example, as saved: none has the setting.
    for (const ex of EXAMPLES) expect(exportSvg(ex.data), ex.label).not.toMatch(/>F = |φ/);
  });

  it("F under someone whose parents are related, and under nobody else", () => {
    const p = cousins(ON);
    expect(under(p, "z")).toEqual(["F = 1/16"]);
    for (const id of ["gf", "s1", "x1", "k1", "k2"]) expect(under(p, id), id).toEqual([]);
  });

  it("F goes after the age and before the pedigree number", () => {
    const p = cousins({ ...ON, showNumbers: true });
    p.individuals.find(i => i.id === "z")!.dob = "1990-05-06";
    const z = p.individuals.find(i => i.id === "z")!;
    expect(detailLines(z, max, p, pedigreeNumbers(p))).toEqual(["b. 1990", "F = 1/16", "IV-1"]);
  });

  it("φ above the double line, alone or after the words", () => {
    const p = cousins(ON);
    expect(consanguinityLabelText(p, couple(p))).toBe("φ = 1/16");
    // Unrelated couples have no double line and no label.
    expect(consanguinityLabelText(p, couple(p, "p1"))).toBeUndefined();
    const named = cousins({ ...ON, relationshipLabels: true });
    expect(consanguinityLabelText(named, couple(named))).toBe("first cousins (φ = 1/16)");
    const own = cousins(ON);
    couple(own).consanguinityLabel = "cousins (maternal)";
    expect(consanguinityLabelText(own, couple(own))).toBe("cousins (maternal) (φ = 1/16)");
  });

  it("a couple marked consanguineous by hand has no number: the pedigree does not show how they are related", () => {
    const p = cousins(ON);
    p.partnerships.find(x => x.id === "p1")!.consanguineous = true;
    p.partnerships.find(x => x.id === "p1")!.consanguinityLabel = "distant cousins";
    expect(consanguinityLabelText(p, couple(p, "p1"))).toBe("distant cousins");
  });

  it("a named relationship that already ends with the kinship gives the number once", () => {
    // Siblings whose parents are siblings: "siblings (3/8)" with the setting off.
    const p: Pedigree = {
      individuals: [person("a", "male"), person("b", "female"), person("c", "male"), person("d", "female"), person("e", "male"), person("f", "female")],
      partnerships: [{ id: "ab", individual1: "a", individual2: "b" }, { id: "cd", individual1: "c", individual2: "d" }, { id: "ef", individual1: "e", individual2: "f" }],
      parentOf: { ab: ["c", "d"], cd: ["e", "f"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
      canvasSettings: { ...BASE, relationshipLabels: true },
    };
    expect(consanguinityLabelText(p, couple(p, "ef"))).toBe("siblings (3/8)");
    const on = { ...p, canvasSettings: { ...p.canvasSettings!, ...ON } };
    expect(consanguinityLabelText(on, couple(on, "ef"))).toBe("siblings (φ = 3/8)");
    expect(under(on, "e")).toEqual(["F = 1/4"]);
  });

  it("the number keeps the last line to itself when the words are long", () => {
    expect(wrapConsanguinityLabel("half first cousins once removed (φ = 1/64)", 90, ROW_HEIGHT).at(-1)).toBe("(φ = 1/64)");
    expect(wrapConsanguinityLabel("first cousins (φ = 1/16)", 200, ROW_HEIGHT)).toEqual(["first cousins (φ = 1/16)"]);
  });

  it("a view filter that leaves out the common ancestors does not change the number", () => {
    // Blood relatives of x1, who married in: her husband's parents are not drawn.
    const p = cousins(ON, { filters: { bloodRelativesOnly: true } });
    p.individuals.find(i => i.id === "x1")!.proband = true;
    const drawn = drawnPedigree(p);
    expect(drawn.individuals.map(i => i.id)).not.toContain("gf");
    expect(inbreedingLabel(drawn, "z")).toBe("F = 1/16");
    expect(under(p, "z")).toEqual(["F = 1/16"]);
  });

  it("is drawn the same in the SVG and U-shape exports, with a key row each", () => {
    const p = cousins({ ...ON, relationshipLabels: true });
    for (const svg of [exportSvg(p), exportUShapeSvg(p)]) {
      expect(texts(svg)).toEqual(expect.arrayContaining(["F = 1/16", "Inbreeding coefficient", "Kinship coefficient of the couple"]));
      expect(texts(svg).join(" ")).toContain("(φ = 1/16)");
    }
    const kinds = (q: Pedigree) => [...keyRows(q, "legend").symbols, ...keyRows(q, "legend").relationships].map(r => r.kind);
    expect(kinds(p)).toEqual(expect.arrayContaining(["inbreeding", "kinship"]));
    expect(kinds(cousins())).not.toEqual(expect.arrayContaining(["inbreeding"]));
    expect(kinds(cousins())).not.toContain("kinship");
    // On, with nobody related: no rows.
    const unrelated = cousins(ON);
    unrelated.partnerships = unrelated.partnerships.filter(x => x.id !== "p3");
    unrelated.parentOf = { p0: ["s1", "s2"], p1: ["k1"], p2: ["k2"] };
    expect(kinds(unrelated).filter(k => k === "inbreeding" || k === "kinship")).toEqual([]);
  });

  it("draws cleanly, in compact rows too", () => {
    const p = cousins({ ...ON, relationshipLabels: true, showNumbers: true });
    for (const compact of [false, true]) {
      expect(lintFlow(p, layoutToFlow(p, { compact }))).toEqual([]);
      expect(lintExport(p, { compact })).toEqual([]);
    }
  });

  it("a de-identified export keeps the numbers, which name nobody, and offers no choice about them", () => {
    const p = cousins(ON);
    expect(deidentifiableText(p).consanguinityLabels).toBe(false);
    expect(deidentifiableText(cousins({ ...ON, relationshipLabels: true })).consanguinityLabels).toBe(true);
    const named = cousins({ ...ON, relationshipLabels: true });
    expect(texts(exportSvg(deidentify(named, {})))).toEqual(expect.arrayContaining(["F = 1/16", "first cousins (φ = 1/16)"]));
    // Without the consanguinity text the words go and the number stays.
    const bare = texts(exportSvg(deidentify(named, { deidentifyKeep: { consanguinityLabels: false } })));
    expect(bare).toEqual(expect.arrayContaining(["F = 1/16", "φ = 1/16"]));
    expect(bare.join(" ")).not.toContain("first cousins");
  });

  it("the CSV always has F as a decimal in its last column", () => {
    const [header, ...rows] = exportCsv(cousins()).split("\n");
    expect(header!.split(",").at(-1)).toBe("inbreeding_coefficient");
    const last = (id: string) => JSON.parse(`[${rows.find(r => r.includes(`"${id}"`))}]`).at(-1);
    expect(last("z")).toBe("0.0625");
    expect(last("k1")).toBe("0");
  });
});
