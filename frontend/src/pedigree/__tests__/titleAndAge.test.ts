import { describe, it, expect } from "vitest";
import { chartTitle, detailLines, labelMaxWidth, titleWidth, DEFAULT_PEDIGREE_NAME, ELLIPSIS, detailSections } from "../labels";
import { buildScene } from "../scene";
import { lintScene } from "../renderLint";
import { chartTitleNode } from "../nodes/ChartTitleNode";
import { NODE_SIZE, SLOT_WIDTH } from "../constants";
import { highestDuplicateArc, highestHop } from "../couplePath";
import { highestAboveSymbols } from "../consanguinityLabel";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport, lintExportSvg } from "../../io/svg/exportLint";
import { deidentify } from "../../io/svg/deidentify";
import { exportCsv } from "../../io/csv/exporter";
import { exportJson, importJson } from "../../io/json";
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";

const max = labelMaxWidth(SLOT_WIDTH);
/** The lines under someone with these fields, in a pedigree with no settings. */
const under = (fields: Partial<Individual>) =>
  detailLines(detailSections({ id: "x", sex: "unknown", affected: false, sibOrder: 0, ...fields }, max, family()));

function family(): Pedigree {
  return {
    individuals: [
      { id: "f", sex: "male", affected: false, deceased: true, sibOrder: 0, name: "Bartholomew Montgomery-Fitzwilliam", dob: "1931-02-03", age: "d. 72" },
      { id: "m", sex: "female", affected: false, sibOrder: 0, name: "Mary", age: "80s" },
      { id: "c1", sex: "female", affected: false, sibOrder: 0, name: "Alexandrina Wilhelmina Featherstonehaugh", age: "approximately fifty-five" },
      { id: "c2", sex: "male", affected: false, sibOrder: 1, name: "Christopher", dob: "1962-07-04" },
      { id: "c3", sex: "unknown", affected: false, sibOrder: 2, age: "34 y" },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c1", "c2", "c3"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

describe("approximate age under the symbol (#20)", () => {
  it("the age takes the line under the name, in place of the DOB", () => {
    expect(under({ dob: "1931-02-03", age: "d. 72" })).toEqual(["d. 72"]);
    expect(under({ dob: "1931-02-03" })).toEqual(["b. 1931"]);
    expect(under({ dob: "1931-02-03", age: "  " })).toEqual(["b. 1931"]);
    expect(under({})).toEqual([]);
  });

  it("shows the year of birth, not the full date (NSGC privacy)", () => {
    expect(under({ dob: "1978" })).toEqual(["b. 1978"]);
    // A de-identified export's age range is shown as it is.
    expect(under({ dob: "30s" })).toEqual(["30s"]);
    expect(exportSvg(family())).not.toContain("1962-07-04");
  });

  it("a long age is cut to one line within the slot", () => {
    const [line, ...rest] = under({ age: "approximately fifty-five" });
    expect(rest).toEqual([]);
    expect(line!.endsWith(ELLIPSIS)).toBe(true);
    expect(line!.length).toBeLessThanOrEqual(12);
  });

  it("buildScene puts it on the node data and the canvas lint stays clean", () => {
    const flow = buildScene(family());
    const data = (id: string) => flow.people.find(n => n.individual.id === id)!;
    expect(data("f").glyph.detailLines).toEqual(["d. 72"]);
    expect(data("c2").glyph.detailLines).toEqual(["b. 1962"]);
    expect(lintScene(family(), flow)).toEqual([]);
  });

  it("the SVG export draws it in the labels group, and the export lint passes", () => {
    const svg = exportSvg(family());
    expect(svg).toContain(">d. 72</text>");
    expect(svg).toContain(">80s</text>");
    expect(svg).toContain(">b. 1962</text>");
    expect(svg).not.toContain(">1931-02-03</text>");
    expect(lintExport(family())).toEqual([]);
  });

  it("the U-shape export draws it too", () => {
    const svg = exportUShapeSvg(family());
    expect(svg).toContain(">d. 72</text>");
    expect(svg).toContain(">34 y</text>");
  });

  it("de-identification drops it, and the DOB age range still applies", () => {
    const d = deidentify(family(), { ageBuckets: true });
    expect(d.individuals.every(i => i.age === undefined)).toBe(true);
    expect(d.individuals.find(i => i.id === "c2")!.dob).toMatch(/0s$/);
    expect(exportSvg(family(), { deidentify: true })).not.toContain("d. 72");
  });

  it("CSV and JSON carry it", () => {
    const csv = exportCsv(family());
    expect(csv.split("\n")[0]).toContain(",dob,age,");
    expect(csv).toContain('"1931-02-03","d. 72"');
    const back = importJson(exportJson(family(), { title: "x" }));
    expect(back.hasErrors).toBe(false);
    expect(back.pedigree!.individuals[0]!.age).toBe("d. 72");
  });

  it("the JSON importer rejects an age that is not a string", () => {
    const bad = family();
    (bad.individuals[0] as unknown as Record<string, unknown>).age = 72;
    expect(importJson(JSON.stringify(bad)).hasErrors).toBe(true);
  });
});

describe("chart title (#20)", () => {
  it("falls back to the pedigree's name, but not the default one", () => {
    expect(chartTitle({}, "Smith family")).toBe("Smith family");
    expect(chartTitle({}, DEFAULT_PEDIGREE_NAME)).toBe("");
    expect(chartTitle({}, null)).toBe("");
    expect(chartTitle({ chartTitle: " BRCA1 clinic " }, "Smith family")).toBe("BRCA1 clinic");
    expect(chartTitle({ chartTitle: "" }, "Smith family")).toBe("");
  });

  it("the canvas title node sits centred above the highest symbol", () => {
    const flow = buildScene(family());
    const node = chartTitleNode("Smith family", flow.people)!;
    const xs = flow.people.map(n => n.position.x), ys = flow.people.map(n => n.position.y);
    expect(node.position.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2);
    expect(node.position.y).toBeLessThan(Math.min(...ys) - 20 - 20);
    expect(node.selectable).toBe(false);
    expect(node.draggable).toBe(false);
    expect(chartTitleNode("", flow.people)).toBeNull();
    expect(chartTitleNode("x", [])).toBeNull();
  });

  it("a title wider than the drawing widens the export", () => {
    const title = "The Montgomery-Fitzwilliam family, hereditary breast and ovarian cancer clinic referral";
    for (const exporter of [exportSvg, exportUShapeSvg]) {
      const svg = exporter(family(), { title });
      expect(svg).toContain(`class="chart-title"`);
      const width = Number(/width="(\d+)"/.exec(svg)![1]);
      expect(width).toBeGreaterThanOrEqual(titleWidth(title));
    }
    expect(lintExport(family(), { title })).toEqual([]);
  });

  /** Quadruple half first cousins: A and C each have children with B and with D, so the founder row draws people twice. */
  function drawnTwiceInTopRow(): Pedigree {
    const ind = (id: string, sex: "male" | "female") => ({ id, sex, affected: false, sibOrder: 0 });
    return {
      individuals: [ind("A", "male"), ind("B", "female"), ind("C", "male"), ind("D", "female"),
                    ind("F1", "male"), ind("M1", "female"), ind("F2", "male"), ind("M2", "female"),
                    ind("X", "male"), ind("Y", "female")],
      partnerships: [
        { id: "ab", individual1: "A", individual2: "B" }, { id: "cd", individual1: "C", individual2: "D" },
        { id: "ad", individual1: "A", individual2: "D" }, { id: "cb", individual1: "C", individual2: "B" },
        { id: "x", individual1: "F1", individual2: "M1" }, { id: "y", individual1: "F2", individual2: "M2" },
      ],
      parentOf: { ab: ["F1"], cd: ["M1"], ad: ["F2"], cb: ["M2"], x: ["X"], y: ["Y"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
  }
  const TITLE_Y = /(class="chart-title"><text[^>]* y=")([\d.]+)"/;
  const TRANSLATE_Y = /<g transform="translate\([\d.e+-]+ ([\d.e+-]+)\)">/;

  it("is raised above the dashed arc of someone drawn twice in the top row (#172)", () => {
    const p = drawnTwiceInTopRow();
    const flow = buildScene(p);
    const topRow = Math.min(...flow.people.map(n => n.position.y));
    const arcTop = highestDuplicateArc(flow, NODE_SIZE / 2);
    // The fixture does what it is for: an arc rises above the top row's symbols.
    expect(arcTop).toBeLessThan(topRow - NODE_SIZE / 2 - 10);
    expect(highestAboveSymbols(flow)).toBe(arcTop);

    // Canvas: the bottom of the title box is above the top of the arc.
    const node = chartTitleNode("Quadruple half first cousins", flow.people, highestAboveSymbols(flow))!;
    expect(node.position.y + node.height! / 2).toBeLessThan(arcTop);

    // Export: the title's baseline is above the arc, and the lint agrees.
    const options = { title: "Quadruple half first cousins" };
    const svg = exportSvg(p, options);
    const titleY = Number(TITLE_Y.exec(svg)![2]);
    const translateY = Number(TRANSLATE_Y.exec(svg)![1]);
    expect(titleY).toBeLessThan(arcTop + translateY - 10);
    expect(lintExport(p, options)).toEqual([]);
  });

  it("is raised above a couple line hopping over several partners in the top row (#177)", () => {
    const wives = [1, 2, 3, 4, 5, 6, 7];
    const ind = (id: string, sex: "male" | "female") => ({ id, sex, affected: false, sibOrder: 0 });
    const p: Pedigree = {
      individuals: [ind("m", "male"), ...wives.map(i => ind(`w${i}`, "female")), ...wives.map(i => ind(`k${i}`, "male"))],
      partnerships: wives.map(i => ({ id: `p${i}`, individual1: "m", individual2: `w${i}` })),
      parentOf: Object.fromEntries(wives.map(i => [`p${i}`, [`k${i}`]])),
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const flow = buildScene(p);
    const topRow = Math.min(...flow.people.map(n => n.position.y));
    const hopTop = highestHop(flow);
    // The fixture does what it is for: a hop rises into where the title would be.
    expect(hopTop).toBeLessThan(topRow - NODE_SIZE / 2 - 20);
    expect(highestAboveSymbols(flow)).toBe(hopTop);

    // Canvas: the bottom of the title box is above the highest hop, and the lint agrees.
    const node = chartTitleNode("Seven partners", flow.people, highestAboveSymbols(flow))!;
    expect(node.position.y + node.height! / 2).toBeLessThan(hopTop);
    expect(lintScene(p, flow, { title: "Seven partners" })).toEqual([]);

    // Export: the title's baseline is above the hop, and the lint agrees.
    const options = { title: "Seven partners" };
    const svg = exportSvg(p, options);
    const titleY = Number(TITLE_Y.exec(svg)![2]);
    const translateY = Number(TRANSLATE_Y.exec(svg)![1]);
    expect(titleY).toBeLessThan(hopTop + translateY);
    expect(lintExport(p, options)).toEqual([]);
  });

  it("the export lint catches a title drawn through an arc or a symbol (#172)", () => {
    const p = drawnTwiceInTopRow();
    const flow = buildScene(p);
    const svg = exportSvg(p, { title: "Quadruple half first cousins" });
    const moved = (dy: number) => svg.replace(TITLE_Y, (_m, pre: string, y: string) => `${pre}${Number(y) + dy}"`);
    const messages = (s: string) => lintExportSvg(p, flow, s).filter(f => f.code === "title-collides").map(f => f.message).join();
    expect(messages(svg)).toBe("");
    // Where the title was before the fix: the arc's height lower.
    const topRow = Math.min(...flow.people.map(n => n.position.y));
    const bulge = topRow - NODE_SIZE / 2 - highestDuplicateArc(flow, NODE_SIZE / 2);
    expect(messages(moved(bulge))).toContain("is drawn through a dashed arc between two copies");
    // Lower still, onto the symbols.
    const titleY = Number(TITLE_Y.exec(svg)![2]);
    const translateY = Number(TRANSLATE_Y.exec(svg)![1]);
    expect(messages(moved(topRow + translateY - titleY))).toContain("is drawn through the symbol at");
  });

  it("JSON carries chartTitle and the importer checks its type", () => {
    const p = { ...family(), chartTitle: "Smith family" };
    expect(importJson(exportJson(p)).pedigree!.chartTitle).toBe("Smith family");
    expect(importJson(JSON.stringify({ ...family(), chartTitle: 3 })).hasErrors).toBe(true);
  });

  it("de-identification hides the title", () => {
    expect(deidentify({ ...family(), chartTitle: "Smith family" }).chartTitle).toBe("");
  });
});
