import { describe, expect, it } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../../data/examples";
import { layoutToFlow } from "../../../pedigree/layoutToFlow";
import { exportSvg } from "../svgExporter";
import { lintExport, lintExportSvg, parseExportSvg } from "../exportLint";

const summary = (p: Pedigree, opts = {}) => lintExport(p, opts).map(f => `${f.code}: ${f.message}`);

describe("export lint over every example", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.label} exports cleanly, normal, compact and de-identified`, () => {
      expect(summary(ex.data)).toEqual([]);
      expect(summary(ex.data, { compact: true })).toEqual([]);
      expect(summary(ex.data, { deidentify: true, title: "T" })).toEqual([]);
    });
  }

  it("sees every symbol and line of an example", () => {
    const ex = EXAMPLES.find(e => e.data.partnerships.length > 2)!;
    const parsed = parseExportSvg(exportSvg(ex.data));
    expect(parsed.structured).toBe(true);
    expect(parsed.symbols.length).toBe(layoutToFlow(ex.data).nodes.length);
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
  const flow = layoutToFlow(trio);
  const svg = exportSvg(trio);
  const codes = (s: string) => lintExportSvg(trio, flow, s).map(f => f.code);
  const section = (s: string, cls: string) => {
    const start = s.indexOf(`<g class="${cls}">`);
    return [start, s.indexOf("\n</g>", start)] as const;
  };

  it("is clean as exported", () => {
    expect(codes(svg)).toEqual([]);
  });

  it("reports a missing child line", () => {
    const [a, b] = section(svg, "sibship-lines");
    expect(codes(svg.slice(0, a) + `<g class="sibship-lines">` + svg.slice(b))).toEqual(["child-without-parents"]);
  });

  it("reports a missing couple line", () => {
    const [a] = section(svg, "couple-lines");
    const first = svg.indexOf("<path", a);
    const end = svg.indexOf("/>", first) + 2;
    expect(codes(svg.slice(0, first) + svg.slice(end))).toContain("partnership-not-drawn");
  });

  it("reports a missing symbol", () => {
    const [a] = section(svg, "symbols");
    const start = svg.indexOf("<g transform", a);
    const end = svg.indexOf("</g>", start) + 4;
    const found = codes(svg.slice(0, start) + svg.slice(end));
    expect(found).toContain("missing-individual");
    expect(found).toContain("missing-node");
  });

  it("reports a couple line between the wrong people and a child under them", () => {
    // Move the end of Dad = Mum onto Other, beyond: it now joins Dad and Other
    // and runs through Mum, and the child hangs from it.
    const pos = (id: string) => flow.nodes.find(n => n.data.individual.id === id)!.position;
    const f = pos("f"), m = pos("m"), x = pos("x");
    const from = `M ${f.x} ${f.y} L ${m.x} ${m.y}`;
    expect(svg).toContain(from);
    const broken = svg.replace(from, `M ${f.x} ${f.y} L ${x.x} ${x.y}`);
    const found = codes(broken);
    expect(found).toContain("couple-not-partners");
    expect(found).toContain("partnership-not-drawn");
  });

  it("reports a sibship drop that ends in empty space", () => {
    const c = flow.nodes.find(n => n.data.individual.id === "c")!.position;
    const re = new RegExp(`(<line x1="${c.x}" y1="[^"]+" x2="${c.x}" y2=")([^"]+)(")`);
    expect(svg).toMatch(re);
    const found = codes(svg.replace(re, (_, a, y, b) => `${a}${Number(y) - 15}${b}`));
    expect(found).toContain("missing-node");
    expect(found).toContain("child-without-parents");
  });

  it("reports overlapping labels", () => {
    // A second label on the first one's baseline, right next to it.
    const m = /<g class="labels">\n<text x="([^"]+)" y="([^"]+)"/.exec(svg)!;
    const extra = `<text x="${Number(m[1]) + 10}" y="${m[2]}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="black">Someone else</text>`;
    expect(codes(svg.replace(`<g class="labels">\n`, `<g class="labels">\n${extra}\n`))).toEqual(["labels-overlap"]);
  });

  it("reports an SVG with none of the export's groups", () => {
    expect(codes(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)).toEqual(["missing-individual"]);
  });
});
