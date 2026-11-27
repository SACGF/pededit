import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pedigree, Tag, TagFill } from "@pedigree-editor/layout-engine";
import { tagPaint, tagFillMode, fillLayers, MONOCHROME_PATTERN_ORDER, MONOCHROME_COLOR } from "../tagFills";
import { symbolPaint, annotationRow } from "../tags";
import { tagSection } from "../labels";
import { SymbolShape, standaloneGlyph, AnnotationRow } from "../chart/symbols";
import { TagSwatchSvg } from "../chart/keySwatches";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { importJson, exportJson } from "../../io/json";
import { EXAMPLES } from "../../data/examples";
import { F, M, U, couple, build } from "../../fixtures/features";

const q = (id: string, color: string, fill?: TagFill): Tag => ({ id, label: id.toUpperCase(), color, style: "quadrant", ...(fill ? { fill } : {}) });

/** NSGC 2008 (no notation saved), so one condition in black and white keeps its pattern. */
function ped(tags: Tag[], mono = false, indTags: string[] = tags.map(t => t.id), affected = false): Pedigree {
  const p = build(
    [M("f", { affected, tags: indTags }), F("m", { tags: indTags }), U("c")],
    [couple("p", "f", "m")],
    { p: ["c"] },
    { tags, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, tagFills: "monochrome" } },
  );
  if (!mono) delete p.canvasSettings;
  return p;
}

const BOX = { x: 0, y: 0, size: 40 };
/** The marks a pattern draws over its white base, as path data. */
const marks = (fill: TagFill, box = BOX) => fillLayers(fill, "#000000", "M0 0Z", box)[1]!.d;
/** The `data-tag-fill` of each region a rendering fills, in order. */
const fillsDrawn = (html: string) => [...html.matchAll(/data-tag-fill="([^"]+)"/g)].map(m => m[1]);
const symbolHtml = (p: Pedigree, clipId = "k") => {
  const ind = p.individuals[0]!;
  return renderToStaticMarkup(<svg><SymbolShape glyph={{ ...standaloneGlyph(ind), paint: symbolPaint(ind, p) }} size={40} clipId={clipId} /></svg>);
};

describe("tagPaint (#67)", () => {
  it("colour mode draws each tag as set; dot and text tags never take a fill", () => {
    const tags = [q("a", "#d62728", "diagonal"), q("b", "#1f77b4"), { id: "d", label: "D", color: "#2ca02c", style: "dot" as const, fill: "dots" as const }];
    const p = ped(tags);
    expect(tagFillMode(p)).toBe("color");
    expect(tagPaint(tags[0]!, p)).toEqual({ color: "#d62728", fill: "diagonal" });
    expect(tagPaint(tags[1]!, p)).toEqual({ color: "#1f77b4", fill: "solid" });
    expect(tagPaint(tags[2]!, p)).toEqual({ color: "#2ca02c", fill: "solid" });
  });

  it("monochrome: every tag black, solid quadrant tags get distinct patterns, own patterns kept", () => {
    const tags = [q("a", "#d62728"), q("b", "#1f77b4", "diagonal"), q("c", "#2ca02c"), { id: "t", label: "T", color: "#ff7f0e", style: "text" as const }];
    const p = ped(tags, true);
    const paints = tags.map(t => tagPaint(t, p));
    expect(paints.every(x => x.color === MONOCHROME_COLOR)).toBe(true);
    // "diagonal" is taken by b, so a gets the next in order, and c the one after.
    expect(paints.map(x => x.fill)).toEqual(["horizontal", "diagonal", "dots", "solid"]);
  });

  it("monochrome with more quadrant tags than patterns cycles rather than going solid", () => {
    const tags = Array.from({ length: 8 }, (_, i) => q(`t${i}`, "#d62728"));
    const fills = tags.map(t => tagPaint(t, ped(tags, true)).fill);
    expect(fills.slice(0, MONOCHROME_PATTERN_ORDER.length)).toEqual([...MONOCHROME_PATTERN_ORDER]);
    expect(fills).not.toContain("solid");
  });
});

describe("pattern geometry", () => {
  it("line patterns are fine textures, about 4px apart on a 40px symbol", () => {
    const count = (f: TagFill) => (marks(f).match(/M/g) ?? []).length;
    expect(count("horizontal")).toBe(10);
    expect(count("vertical")).toBe(10);
    expect(count("diagonal")).toBeGreaterThanOrEqual(12);
    expect(count("crosshatch")).toBeGreaterThan(count("diagonal"));
  });

  it("the diagonal hatch runs / (up to the right), not the \\ of the deceased slash", () => {
    const [, x1, y1, x2, y2] = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/.exec(marks("diagonal"))!.map(Number);
    expect(x2! > x1!).toBe(true);
    expect(y2! < y1!).toBe(true);
  });

  it("dots are a grid of many small marks", () => {
    expect((marks("dots").match(/M/g) ?? []).length).toBeGreaterThan(80);
  });

  it("patterns follow the box, so the legend swatch and the symbol share the code", () => {
    // Every point of the marks lies within the box they are drawn for.
    const box = { x: 6, y: 6, size: 16 };
    const xs = [...marks("horizontal", box).matchAll(/[MH](-?[\d.]+)/g)].map(m => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(22);
    expect((marks("horizontal", box).match(/M/g) ?? []).length).toBeLessThan((marks("horizontal").match(/M/g) ?? []).length);
  });

  it("shade is a light tint: black becomes light grey", () => {
    expect(fillLayers("shade", "#000000", "M0 0Z", BOX)).toEqual([{ d: "M0 0Z", fill: "#bfbfbf", clip: false }]);
    expect(fillLayers("shade", "#fff", "M0 0Z", BOX)[0]!.fill).toBe("#ffffff");
  });

  it("solid is one region path; a pattern is a white base then the marks, clipped", () => {
    expect(fillLayers("solid", "#d62728", "M0 0Z", BOX)).toEqual([{ d: "M0 0Z", fill: "#d62728", clip: false }]);
    const lines = fillLayers("diagonal", "#d62728", "M0 0Z", BOX);
    expect(lines[0]).toEqual({ d: "M0 0Z", fill: "white", clip: false });
    expect(lines[1]).toMatchObject({ fill: "none", stroke: "#d62728", clip: true });
    expect(fillLayers("dots", "#d62728", "M0 0Z", BOX)[1]).toMatchObject({ fill: "#d62728", clip: true });
    // An unknown value (a newer file) draws solid rather than nothing.
    expect(fillLayers("plaid" as TagFill, "#d62728", "M0 0Z", BOX)).toHaveLength(1);
  });

});

describe("renderers draw the pattern (#67)", () => {
  const tags = [q("a", "#d62728", "diagonal"), q("b", "#1f77b4", "dots"), q("c", "#2ca02c")];

  it("symbolPaint carries the resolved colour and fill", () => {
    const p = ped(tags);
    expect(symbolPaint(p.individuals[0]!, p).sectors.map(s => [s.color, s.fill])).toEqual([
      ["#d62728", "diagonal"], ["#1f77b4", "dots"], ["#2ca02c", "solid"],
    ]);
  });

  // The canvas and the exports draw the symbol with this one component.
  it("the symbol fills each section with its pattern, in the tag colour", () => {
    const html = symbolHtml(ped(tags));
    expect(fillsDrawn(html)).toEqual(["diagonal", "dots", "solid"]);
    for (const t of tags) expect(html).toContain(t.color);
  });

  it("an affected patterned symbol keeps its black centre over a white pattern base", () => {
    const p = ped([q("a", "#000000", "horizontal")], false, ["a"], true);
    const ind = p.individuals[0]!;
    const html = renderToStaticMarkup(<svg><SymbolShape glyph={{ ...standaloneGlyph(ind), paint: symbolPaint(ind, p) }} size={40} clipId="k" /></svg>);
    const base = html.indexOf(`fill="white"></path>`);
    const core = html.indexOf(`scale(0.55)`);
    expect(base).toBeGreaterThan(0);
    expect(core).toBeGreaterThan(base);
  });

  it("the key swatch (legend and export key) shows the pattern", () => {
    const html = renderToStaticMarkup(<TagSwatchSvg tag={tags[0]!} pedigree={ped(tags)} />);
    expect(fillsDrawn(html)).toEqual(["diagonal"]);
    expect(html).toContain("#d62728");
  });

  it("monochrome: dot and text tags turn black too", () => {
    const dot: Tag = { id: "d", label: "Sequenced", color: "#2ca02c", style: "dot" };
    const text: Tag = { id: "t", label: "Gene", color: "#ff7f0e", style: "text", abbrev: "+/-" };
    const p = ped([dot, text], true);
    expect(annotationRow(p.individuals[0]!, p).map(i => i.color)).toEqual([MONOCHROME_COLOR]);
    expect(tagSection(p.individuals[0]!, p, 74).runs!.flat().map(r => r.color)).toEqual([MONOCHROME_COLOR]);
    const svg = renderToStaticMarkup(<svg><AnnotationRow items={annotationRow(p.individuals[0]!, p)} size={40} /></svg>);
    expect(svg).not.toContain("#2ca02c");
    for (const s of [exportSvg(p), exportUShapeSvg(p)]) expect(s).not.toContain("#ff7f0e");
  });

  it("monochrome SVG and U-shape exports use no tag colour, and pattern every quadrant tag", () => {
    const p = ped(tags, true);
    expect(symbolPaint(p.individuals[0]!, p).sectors.map(s => [s.color, s.fill])).toEqual([
      [MONOCHROME_COLOR, "diagonal"], [MONOCHROME_COLOR, "dots"], [MONOCHROME_COLOR, "horizontal"],
    ]);
    // The files, key included, keep none of the tag colours.
    for (const svg of [exportSvg(p), exportUShapeSvg(p)]) {
      for (const t of tags) expect(svg).not.toContain(t.color);
      expect(fillsDrawn(svg)).toEqual(expect.arrayContaining(["diagonal", "dots", "horizontal"]));
      expect(fillsDrawn(svg)).not.toContain("solid");
    }
  });

  it("every example with tags exports in monochrome with no colour left in its tags", () => {
    for (const ex of EXAMPLES.filter(e => (e.data.tags ?? []).length > 0)) {
      const p = { ...ex.data, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, ...ex.data.canvasSettings, tagFills: "monochrome" as const } };
      const svg = exportSvg(p);
      for (const t of ex.data.tags!) if (t.color.toLowerCase() !== "#000000") expect(svg, ex.label).not.toContain(t.color);
    }
  });

  it("five tags are five equal slices, each with its pattern", () => {
    const five = Array.from({ length: 5 }, (_, i) => q(`t${i}`, "#d62728", "vertical"));
    const p = ped(five);
    const sectors = symbolPaint(p.individuals[0]!, p).sectors;
    expect(sectors.map(s => [s.start, s.end])).toEqual([[0, 72], [72, 144], [144, 216], [216, 288], [288, 360]]);
    expect(fillsDrawn(symbolHtml(p))).toEqual(Array(5).fill("vertical"));
  });
});

describe("JSON import of fills (#67)", () => {
  it("round trips a tag fill and the monochrome setting", () => {
    const p = ped([q("a", "#d62728", "crosshatch")], true);
    const back = importJson(exportJson(p));
    expect(back.issues.filter(i => i.severity === "error")).toEqual([]);
    expect(back.pedigree!.tags![0]!.fill).toBe("crosshatch");
    expect(back.pedigree!.canvasSettings!.tagFills).toBe("monochrome");
  });

  it("rejects an unknown fill or mode", () => {
    const bad = ped([{ ...q("a", "#d62728"), fill: "plaid" as TagFill }]);
    expect(importJson(exportJson(bad)).issues.some(i => i.severity === "error" && i.path?.includes("tags[0]"))).toBe(true);
    const badMode = { ...ped([]), canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, tagFills: "sepia" } } as unknown as Pedigree;
    expect(importJson(exportJson(badMode)).issues.some(i => i.severity === "error")).toBe(true);
  });
});
