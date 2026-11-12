import { describe, it, expect } from "vitest";
import { chartTitle, detailLines, labelMaxWidth, titleWidth, DEFAULT_PEDIGREE_NAME, ELLIPSIS } from "../labels";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { chartTitleNode } from "../nodes/ChartTitleNode";
import { SLOT_WIDTH } from "../constants";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport } from "../../io/svg/exportLint";
import { deidentify } from "../../io/svg/deidentify";
import { exportCsv } from "../../io/csv/exporter";
import { exportJson, importJson } from "../../io/json";
import type { Pedigree } from "@pedigree-editor/layout-engine";

const max = labelMaxWidth(SLOT_WIDTH);

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
    expect(detailLines({ dob: "1931-02-03", age: "d. 72" }, max)).toEqual(["d. 72"]);
    expect(detailLines({ dob: "1931-02-03" }, max)).toEqual(["b. 1931"]);
    expect(detailLines({ dob: "1931-02-03", age: "  " }, max)).toEqual(["b. 1931"]);
    expect(detailLines({}, max)).toEqual([]);
  });

  it("shows the year of birth, not the full date (NSGC privacy)", () => {
    expect(detailLines({ dob: "1978" }, max)).toEqual(["b. 1978"]);
    // A de-identified export's age range is shown as it is.
    expect(detailLines({ dob: "30s" }, max)).toEqual(["30s"]);
    expect(exportSvg(family())).not.toContain("1962-07-04");
  });

  it("a long age is cut to one line within the slot", () => {
    const [line, ...rest] = detailLines({ age: "approximately fifty-five" }, max);
    expect(rest).toEqual([]);
    expect(line!.endsWith(ELLIPSIS)).toBe(true);
    expect(line!.length).toBeLessThanOrEqual(12);
  });

  it("layoutToFlow puts it on the node data and the canvas lint stays clean", () => {
    const flow = layoutToFlow(family());
    const data = (id: string) => flow.nodes.find(n => n.data.individual.id === id)!.data;
    expect(data("f").detailLines).toEqual(["d. 72"]);
    expect(data("c2").detailLines).toEqual(["b. 1962"]);
    expect(lintFlow(family(), flow)).toEqual([]);
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
    const flow = layoutToFlow(family());
    const node = chartTitleNode("Smith family", flow.nodes)!;
    const xs = flow.nodes.map(n => n.position.x), ys = flow.nodes.map(n => n.position.y);
    expect(node.position.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2);
    expect(node.position.y).toBeLessThan(Math.min(...ys) - 20 - 20);
    expect(node.selectable).toBe(false);
    expect(node.draggable).toBe(false);
    expect(chartTitleNode("", flow.nodes)).toBeNull();
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

  it("JSON carries chartTitle and the importer checks its type", () => {
    const p = { ...family(), chartTitle: "Smith family" };
    expect(importJson(exportJson(p)).pedigree!.chartTitle).toBe("Smith family");
    expect(importJson(JSON.stringify({ ...family(), chartTitle: 3 })).hasErrors).toBe(true);
  });

  it("de-identification hides the title", () => {
    expect(deidentify({ ...family(), chartTitle: "Smith family" }).chartTitle).toBe("");
  });
});
