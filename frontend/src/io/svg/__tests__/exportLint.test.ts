import { describe, expect, it } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../../data/examples";
import { buildScene } from "../../../pedigree/scene";
import { exportSvg } from "../svgExporter";
import { lintExport, lintExportSvg, parseExportSvg } from "../exportLint";

const summary = (p: Pedigree, opts = {}) => lintExport(p, opts).map(f => `${f.code}: ${f.message}`);

describe("export lint over every example", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.label} exports cleanly, normal, compact and de-identified`, () => {
      expect(summary(ex.data)).toEqual([]);
      expect(summary(ex.data, { compact: true })).toEqual([]);
      // With the chart title, which nothing over the top row may reach (#172).
      expect(summary(ex.data, { title: ex.label })).toEqual([]);
      expect(summary(ex.data, { title: ex.label, compact: true })).toEqual([]);
      expect(summary(ex.data, { deidentify: true, title: "T" })).toEqual([]);
      // Pedigree numbers before the names (#8).
      const numbered = { ...ex.data, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, ...ex.data.canvasSettings, showNumbers: true } };
      expect(summary(numbered)).toEqual([]);
      expect(summary(numbered, { compact: true })).toEqual([]);
      // Black and white tag patterns (#67).
      const mono = { ...ex.data, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, ...ex.data.canvasSettings, tagFills: "monochrome" as const } };
      expect(summary(mono)).toEqual([]);
      expect(summary(mono, { deidentify: true })).toEqual([]);
      // Named relationships above every double line (#97).
      const named = { ...ex.data, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, ...ex.data.canvasSettings, relationshipLabels: true } };
      expect(summary(named, { title: "T" })).toEqual([]);
      // Compact rows leave 84px: a label moves aside, or is left out, rather
      // than touch the text of someone drawn above (#109, House Targaryen).
      expect(summary(named, { compact: true })).toEqual([]);
    });
  }

  it("sees every symbol and line of an example", () => {
    const ex = EXAMPLES.find(e => e.data.partnerships.length > 2)!;
    const parsed = parseExportSvg(exportSvg(ex.data));
    expect(parsed.structured).toBe(true);
    expect(parsed.symbols.length).toBe(buildScene(ex.data).people.length);
    expect(parsed.couples.length).toBeGreaterThanOrEqual(ex.data.partnerships.length);
    expect(parsed.sibs.length).toBeGreaterThan(0);
  });
});

describe("lintExportSvg finds what the exporter got wrong", () => {
  const trio: Pedigree = {
    individuals: [
      { id: "f", name: "Dad", sex: "male", affected: false, sibOrder: 0 },
      { id: "m", name: "Mum", sex: "female", affected: false, sibOrder: 1 },
      { id: "c", name: "Kid", sex: "female", affected: false, sibOrder: 0 },
      { id: "x", name: "Other", sex: "male", affected: false, sibOrder: 0 },
      { id: "y", name: "Partner", sex: "female", affected: false, sibOrder: 1 },
    ],
    partnerships: [
      { id: "p", individual1: "f", individual2: "m" },
      { id: "q", individual1: "x", individual2: "y" },
    ],
    parentOf: { p: ["c"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  } as Pedigree;
  const flow = buildScene(trio);
  const svg = exportSvg(trio);
  const codes = (s: string) => lintExportSvg(trio, flow, s).map(f => f.code);
  const section = (s: string, cls: string) => {
    const start = s.indexOf(`<g class="${cls}">`);
    return [start, s.indexOf('</g><g class="', start)] as const;
  };

  it("is clean as exported", () => {
    expect(codes(svg)).toEqual([]);
  });

  // Each break below takes something out of the file or moves it: the scene
  // is untouched, so the render lint has nothing to say and only the file
  // check can notice.
  const messages = (s: string) => lintExportSvg(trio, flow, s).map(f => `${f.code}: ${f.message}`);

  it("reports a line of descent left out of the file", () => {
    const [a, b] = section(svg, "sibship-lines");
    expect(messages(svg.slice(0, a) + `<g class="sibship-lines">` + svg.slice(b))).toEqual(["missing-from-file: a line of descent to Kid (c) is not in the file"]);
  });

  it("reports a couple line left out of the file", () => {
    const [a] = section(svg, "couple-lines");
    const first = svg.indexOf("<path", a);
    const end = svg.indexOf("</path>", first) + "</path>".length;
    expect(codes(svg.slice(0, first) + svg.slice(end))).toEqual(["missing-from-file"]);
  });

  it("reports a symbol left out of the file, and one where the scene has none", () => {
    // The first symbol is from its group to the next one's.
    const [a] = section(svg, "symbols");
    const start = svg.indexOf(`<g transform`, a);
    const end = svg.indexOf(`<g transform`, svg.indexOf("</g></g>", start));
    expect(messages(svg.slice(0, start) + svg.slice(end))).toEqual(["missing-from-file: the symbol of Dad (f) is not in the file"]);
    const symbol = svg.slice(start, end);
    const moved = symbol.replace(/^<g transform="translate\(([-\d.e]+) /, (_, x) => `<g transform="translate(${Number(x) + 7} `);
    expect(moved).not.toBe(symbol);
    expect(codes(svg.replace(symbol, moved))).toEqual(["missing-from-file", "symbol-not-in-scene"]);
  });

  it("reports a couple line that does not end where the scene's does", () => {
    const pos = (id: string) => flow.people.find(n => n.individual.id === id)!.position;
    const f = pos("f"), m = pos("m"), x = pos("x");
    // A couple line runs between the facing edges of the two symbol boxes.
    const from = `M ${f.x + 20} ${f.y} L ${m.x - 20} ${m.y}`;
    expect(svg).toContain(from);
    expect(codes(svg.replace(from, `M ${f.x + 20} ${f.y} L ${x.x - 20} ${x.y}`))).toEqual(["missing-from-file"]);
  });

  it("reports a line of text changed or left out", () => {
    expect(messages(svg.replace(">Kid</text>", ">Kit</text>"))).toEqual(['missing-from-file: the line "Kid" under Kid (c) is not in the file']);
  });

  it("reports the key drawn into the drawing", () => {
    const keyed: Pedigree = { ...trio, individuals: trio.individuals.map(i => (i.id === "c" ? { ...i, affected: true } : i)) };
    const file = exportSvg(keyed);
    const [x, top] = parseExportSvg(file).symbols[0]!;
    const raised = file.replace(/data-box="[-\d.]+ [-\d.]+ /, `data-box="${x - 10} ${top} `);
    expect(raised).not.toBe(file);
    expect(lintExportSvg(keyed, buildScene(keyed), file)).toEqual([]);
    expect(lintExportSvg(keyed, buildScene(keyed), raised).map(f => f.code)).toEqual(["key-collides"]);
  });

  it("reports a drawing wider than the figure", () => {
    const narrow = svg.replace(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+"/, `<svg xmlns="http://www.w3.org/2000/svg" width="100"`);
    expect(narrow).not.toBe(svg);
    expect(codes(narrow)).toEqual(["outside-figure"]);
  });

  it("reports an SVG with none of the export's groups", () => {
    expect(codes(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)).toEqual(["missing-from-file"]);
  });
});
