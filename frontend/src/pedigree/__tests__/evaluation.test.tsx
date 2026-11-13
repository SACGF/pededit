import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import {
  evaluationText, evaluationsCsv, documentedMarkAt, presymptomaticLine, drawsPresymptomatic,
} from "../evaluation";
import { detailLines, detailSections, evaluationLines, labelMaxWidth, textWidth } from "../labels";
import { SymbolShape, DocumentedMark } from "../nodes/symbols";
import { renderExportKeySvg } from "../tags";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport } from "../../io/svg/exportLint";
import { exportCsv } from "../../io/csv/exporter";
import { exportJson, importJson } from "../../io/json";
import { usePedigreeStore } from "../../store/usePedigreeStore";

function family(): Pedigree {
  return {
    individuals: [
      { id: "f", sex: "male", affected: false, sibOrder: 0, presymptomatic: true,
        evaluations: [{ result: "positive", detail: "BRCA1 c.5266dupC", documented: true }] },
      { id: "m", sex: "female", affected: false, sibOrder: 1 },
      { id: "c1", sex: "male", affected: true, sibOrder: 0,
        evaluations: [{ result: "negative" }, { result: "uninformative", detail: "echo" }, {}] },
      { id: "c2", sex: "female", affected: false, sibOrder: 1, carrier: true },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c1", "c2"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

/** The same family drawn in the 2008 notation (#114). */
function family2008(): Pedigree {
  return { ...family(), canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, notation: "nsgc2008" } };
}

const WIDTH = labelMaxWidth(80);
const STAR = /<text class="documented-evaluation"[^>]*>\*<\/text>/g;
const LINE = /<line class="presymptomatic"[^>]*stroke="black"/g;

describe("evaluation results, NSGC 2022 default (#114)", () => {
  it("writes the detail then the result, with no E and no numbering", () => {
    const [f, , c1] = family().individuals;
    expect(evaluationLines(f!, WIDTH)).toEqual(["BRCA1", "c.5266dupC +"]);
    expect(evaluationLines(c1!, WIDTH)).toEqual(["-", "echo u"]);
    expect(evaluationText({ result: "negative" }, "nsgc2022")).toBe("-");
    expect(evaluationText({ detail: " echo " }, "nsgc2022")).toBe("echo");
    expect(evaluationText({}, "nsgc2022")).toBe("");
  });

  it("cuts a long detail but keeps the result at the end", () => {
    const lines = evaluationLines({ id: "x", sex: "male", affected: false, sibOrder: 0,
      evaluations: [{ result: "positive", detail: "BRCA2 c.5946delT p.Ser1982ArgfsTer22 heterozygous" }] }, WIDTH);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^BRCA2/);
    expect(lines[1]).toMatch(/… \+$/);
    for (const l of lines) expect(textWidth(l)).toBeLessThanOrEqual(WIDTH);
    const word = evaluationLines({ id: "y", sex: "male", affected: false, sibOrder: 0,
      evaluations: [{ result: "uninformative", detail: "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ" }] }, WIDTH);
    expect(word).toHaveLength(2);
    expect(word[1]).toMatch(/ u$/);
    for (const l of word) expect(textWidth(l)).toBeLessThanOrEqual(WIDTH);
  });

  it("draws the results in both exports and the key, which lint clean", () => {
    const svg = exportSvg(family());
    expect(svg).toContain(">c.5266dupC +</text>");
    expect(svg).toContain(">echo u</text>");
    expect(svg).not.toContain("E+");
    expect(lintExport(family())).toEqual([]);
    expect(exportUShapeSvg(family())).toContain("echo u");
    const key = renderExportKeySvg(family(), 0, 0).markup.join("");
    expect(key).toContain("Result: + positive");
    expect(key).toContain(">+/-</text>");
    expect(key).not.toContain("Evaluation:");
  });

  it("needs no key row for detail text with no result", () => {
    const detailOnly = { ...family(), individuals: family().individuals.map(i => ({ ...i, evaluations: i.evaluations && [{ detail: "echo" }] })) };
    expect(renderExportKeySvg(detailOnly, 0, 0).markup.join("")).not.toContain("Result:");
    expect(renderExportKeySvg({ ...detailOnly, canvasSettings: family2008().canvasSettings }, 0, 0).markup.join("")).toContain("Evaluation:");
  });

  it("writes the CSV in the same notation", () => {
    expect(exportCsv(family()).split("\n")[1]).toMatch(/"1","BRCA1 c\.5266dupC \+ \*"(,|$)/);
    expect(evaluationsCsv(family().individuals[2]!, "nsgc2022")).toBe("-; echo u");
    expect(evaluationsCsv({ evaluations: [{ documented: true }] }, "nsgc2022")).toBe("*");
  });

  it("keeps the notation setting through JSON, and rejects an unknown edition", () => {
    const back = importJson(exportJson(family2008())).pedigree!;
    expect(back.canvasSettings!.notation).toBe("nsgc2008");
    const bad = JSON.parse(exportJson(family2008()));
    bad.pedigree.canvasSettings.notation = "nsgc1995";
    expect(importJson(JSON.stringify(bad)).hasErrors).toBe(true);
  });
});

describe("evaluation notation, NSGC 2008 setting (#101)", () => {
  it("writes one evaluation as E with its result and detail, several numbered", () => {
    const [f, , c1] = family().individuals;
    expect(evaluationLines(f!, WIDTH, "nsgc2008")).toEqual(["E+ (BRCA1", "c.5266dupC)"]);
    expect(evaluationLines(c1!, WIDTH, "nsgc2008")).toEqual(["E1-", "E2u (echo)", "E3"]);
    expect(evaluationText({ result: "negative" }, "nsgc2008", 0, 1)).toBe("E-");
  });

  it("wraps a long detail onto a second line and cuts it there, keeping the E and the result", () => {
    const lines = evaluationLines({ id: "x", sex: "male", affected: false, sibOrder: 0,
      evaluations: [{ result: "positive", detail: "BRCA2 c.5946delT p.Ser1982ArgfsTer22 heterozygous" }] }, WIDTH, "nsgc2008");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^E\+ \(BRCA2/);
    expect(lines[1]).toMatch(/…$/);
    for (const l of lines) expect(textWidth(l)).toBeLessThanOrEqual(WIDTH);
  });

  it("puts the evaluation lines after age and onset, before the pedigree number", () => {
    const ind = { ...family().individuals[0]!, age: "45y" };
    const numbers = new Map([["f", "I-1"]]);
    expect(detailLines(ind, WIDTH, family2008(), numbers)).toEqual(["45y", "E+ (BRCA1", "c.5266dupC)", "I-1"]);
    expect(detailLines(ind, WIDTH, family(), numbers)).toEqual(["45y", "BRCA1", "c.5266dupC +", "I-1"]);
    expect(detailSections(ind, WIDTH, family()).evaluation).toHaveLength(2);
  });

  it("draws the * at the lower right on the canvas, outside adoption brackets", () => {
    const p = documentedMarkAt(40, false);
    expect(p.x).toBeGreaterThan(40);
    expect(p.y).toBeGreaterThan(40);
    expect(documentedMarkAt(40, true).x).toBeGreaterThan(p.x);
    expect(renderToStaticMarkup(<svg><DocumentedMark size={40} adopted={false} /></svg>)).toContain(">*</text>");
  });

  it("draws the * and the evaluation lines in both exports, which lint clean", () => {
    const svg = exportSvg(family2008());
    expect(svg.match(STAR)).toHaveLength(1);
    expect(svg).toContain(">E+ (BRCA1</text>");
    expect(svg).toContain(">c.5266dupC)</text>");
    expect(svg).toContain("E2u (echo)");
    expect(lintExport(family2008())).toEqual([]);
    const u = exportUShapeSvg(family2008());
    expect(u.match(STAR)).toHaveLength(1);
    expect(u).toContain("E1-");
  });

  it("has key rows for the notation and the * only when used", () => {
    const key = renderExportKeySvg(family2008(), 0, 0).markup.join("");
    expect(key).toContain("Evaluation: + positive");
    expect(key).toContain("Documented evaluation");
    const none = { ...family2008(), individuals: family().individuals.map(i => ({ ...i, evaluations: undefined, presymptomatic: undefined })) };
    const plain = renderExportKeySvg(none, 0, 0).markup.join("");
    expect(plain).not.toContain("Evaluation");
    expect(plain).not.toContain("Presymptomatic");
  });

  it("keeps the evaluations in a de-identified export", () => {
    const svg = exportSvg(family(), { deidentify: true });
    expect(svg).toContain("c.5266dupC +");
    expect(svg.match(STAR)).toHaveLength(1);
  });
});

describe("presymptomatic carrier (#101)", () => {
  it("draws a vertical line through the symbol, not on an affected one", () => {
    const html = renderToStaticMarkup(<svg><SymbolShape individual={family().individuals[0]!} size={40} /></svg>);
    expect(html).toContain('data-presymptomatic="true"');
    expect(html).toMatch(/x1="20" y1="1" x2="20" y2="39"/);
    expect(drawsPresymptomatic({ presymptomatic: true, affected: true })).toBe(false);
    const affected = renderToStaticMarkup(<svg><SymbolShape individual={{ ...family().individuals[0]!, affected: true }} size={40} /></svg>);
    expect(affected).not.toContain("data-presymptomatic");
  });

  it("runs apex to base in a loss triangle", () => {
    const l = presymptomaticLine("miscarriage", 40);
    expect(l.x1).toBe(20);
    expect(l.y1).toBeGreaterThan(8);
    expect(l.y2).toBeLessThan(40 - 7);
  });

  it("is drawn in both exports, with a key row", () => {
    expect(exportSvg(family()).match(LINE)).toHaveLength(1);
    expect(exportUShapeSvg(family()).match(LINE)).toHaveLength(1);
    expect(renderExportKeySvg(family(), 0, 0).markup.join("")).toContain("Presymptomatic carrier");
  });
});

describe("evaluation data (#101)", () => {
  it("round-trips through JSON and validates the fields", () => {
    const back = importJson(exportJson(family())).pedigree!;
    expect(back.individuals[0]!.evaluations).toEqual(family().individuals[0]!.evaluations);
    expect(back.individuals[0]!.presymptomatic).toBe(true);
    const bad = JSON.parse(exportJson(family()));
    bad.pedigree.individuals[0].evaluations = [{ result: "maybe" }];
    expect(importJson(JSON.stringify(bad)).hasErrors).toBe(true);
  });

  it("has presymptomatic and evaluations columns after family_history_unknown in the CSV", () => {
    const [header, ...rows] = exportCsv(family()).split("\n");
    const cols = header!.split(",");
    const at = cols.indexOf("family_history_unknown");
    expect(cols.slice(at + 1, at + 3)).toEqual(["presymptomatic", "evaluations"]);
    expect(rows[0]).toMatch(/"1","BRCA1 c\.5266dupC \+ \*"(,|$)/);
    expect(exportCsv(family2008()).split("\n")[1]).toMatch(/"1","E\+ \(BRCA1 c\.5266dupC\) \*"(,|$)/);
    expect(evaluationsCsv(family().individuals[2]!, "nsgc2008")).toBe("E1-; E2u (echo); E3");
  });
});

describe("usePedigreeStore carrier status and evaluations (#101)", () => {
  const get = () => usePedigreeStore.getState();
  const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id)!;
  beforeEach(() => get().initialize(family()));

  it("keeps carrier and presymptomatic exclusive", () => {
    get().setPresymptomatic("c2", true);
    expect(ind("c2").presymptomatic).toBe(true);
    expect(ind("c2").carrier).toBeFalsy();
    get().setCarrier("f", true);
    expect(ind("f").carrier).toBe(true);
    expect("presymptomatic" in ind("f")).toBe(false);
    get().undo();
    expect(ind("f").presymptomatic).toBe(true);
  });

  it("replaces the evaluations, removing the field when empty", () => {
    get().setEvaluations("m", [{ result: "negative", detail: "echo" }]);
    expect(ind("m").evaluations).toEqual([{ result: "negative", detail: "echo" }]);
    get().setEvaluations("m", []);
    expect("evaluations" in ind("m")).toBe(false);
  });
});
