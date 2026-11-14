import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pedigree, Tag, TagFill } from "@pedigree-editor/layout-engine";
import {
  tagPaint, tagFillMode, fillLayers, renderRegionFillSvg, patternLinesD, patternDotsD, tint,
  MONOCHROME_PATTERN_ORDER, MONOCHROME_COLOR, TAG_FILL_OPTIONS, isTagFill,
} from "../tagFills";
import { sectorsFor, symbolPaint, renderSectorsSvg, renderTagLegendSvg, renderExportKeySvg, annotationRow, renderAnnotationRowSvg, sectorPath } from "../tags";
import { SymbolShape } from "../nodes/symbols";
import { TagSwatchSvg } from "../../components/Legend";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { importJson, exportJson } from "../../io/json";
import { EXAMPLES } from "../../data/examples";

const q = (id: string, color: string, fill?: TagFill): Tag => ({ id, label: id.toUpperCase(), color, style: "quadrant", ...(fill ? { fill } : {}) });

function ped(tags: Tag[], mono = false, indTags: string[] = tags.map(t => t.id), affected = false): Pedigree {
  return {
    individuals: [
      { id: "f", sex: "male", affected, sibOrder: 0, tags: indTags },
      { id: "m", sex: "female", affected: false, sibOrder: 1, tags: indTags },
      { id: "c", sex: "unknown", affected: false, sibOrder: 0 },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    tags,
    ...(mono ? { canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, tagFills: "monochrome" as const } } : {}),
  };
}

const BOX = { x: 0, y: 0, size: 40 };

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

  it("every offered fill is valid, and nothing else is", () => {
    expect(TAG_FILL_OPTIONS.every(o => isTagFill(o.value))).toBe(true);
    expect(isTagFill("plaid")).toBe(false);
  });
});

describe("pattern geometry", () => {
  it("line patterns are fine textures, about 4px apart on a 40px symbol", () => {
    const count = (f: TagFill) => (patternLinesD(f, BOX).match(/M/g) ?? []).length;
    expect(count("horizontal")).toBe(10);
    expect(count("vertical")).toBe(10);
    expect(count("diagonal")).toBeGreaterThanOrEqual(12);
    expect(count("crosshatch")).toBeGreaterThan(count("diagonal"));
    expect(patternLinesD("horizontal", BOX)).toMatch(/^M0 2H40/);
    expect(patternLinesD("vertical", BOX)).toMatch(/^M2 0V40/);
  });

  it("the diagonal hatch runs / (up to the right), not the \\ of the deceased slash", () => {
    const [, x1, y1, x2, y2] = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/.exec(patternLinesD("diagonal", BOX))!.map(Number);
    expect(x2! > x1!).toBe(true);
    expect(y2! < y1!).toBe(true);
  });

  it("dots are a staggered grid of small circles, much smaller than the carrier dot", () => {
    const d = patternDotsD(BOX);
    const dots = (d.match(/M/g) ?? []).length;
    expect(dots).toBeGreaterThan(80);
    expect(d).toContain("a1 1 0 1 0 2 0");
  });

  it("patterns follow the box, so the legend swatch and the symbol share the code", () => {
    expect(patternLinesD("horizontal", { x: 6, y: 6, size: 16 })).toMatch(/^M6 7.25H22/);
  });

  it("shade is a light tint: black becomes light grey", () => {
    expect(tint("#000000")).toBe("#bfbfbf");
    expect(tint("#fff")).toBe("#ffffff");
    expect(fillLayers("shade", "#000000", "M0 0Z", BOX)).toEqual([{ d: "M0 0Z", fill: "#bfbfbf", clip: false }]);
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

  it("renderRegionFillSvg clips the marks to the region and to the outer clip", () => {
    const svg = renderRegionFillSvg("horizontal", "#000000", "M0 0L40 0L40 40Z", BOX, "r1", "outline");
    expect(svg).toContain(`<clipPath id="r1"><path d="M0 0L40 0L40 40Z"/></clipPath>`);
    expect(svg).toContain(`fill="white" clip-path="url(#outline)"`);
    expect(svg).toMatch(/<g clip-path="url\(#outline\)"><path d="M0 2H40[^"]*" fill="none" stroke="#000000" stroke-width="1" clip-path="url\(#r1\)"\/><\/g>/);
    expect(renderRegionFillSvg("solid", "#000000", "M0 0Z", BOX, "r1")).toBe(`<path d="M0 0Z" fill="#000000"/>`);
  });
});

describe("renderers draw the pattern (#67)", () => {
  const tags = [q("a", "#d62728", "diagonal"), q("b", "#1f77b4", "dots"), q("c", "#2ca02c")];

  it("sectorsFor carries the resolved colour and fill", () => {
    const p = ped(tags);
    expect(sectorsFor(p.individuals[0]!, p).map(s => [s.color, s.fill])).toEqual([
      ["#d62728", "diagonal"], ["#1f77b4", "dots"], ["#2ca02c", "solid"],
    ]);
  });

  it("export sectors: patterns in the tag colour, solid as before", () => {
    const p = ped(tags);
    const svg = renderSectorsSvg(p.individuals[0]!, p, 40, "clip");
    expect(svg).toContain(`stroke="#d62728"`);
    expect(svg).toContain(`<clipPath id="clip-s0">`);
    expect(svg).toContain(`clip-path="url(#clip-s1)"`);
    expect(svg).toContain(`fill="#2ca02c" clip-path="url(#clip)"`);
  });

  it("canvas symbol draws the same layers", () => {
    const p = ped(tags);
    const ind = p.individuals[0]!;
    const html = renderToStaticMarkup(<svg><SymbolShape individual={ind} size={40} paint={symbolPaint(ind, p)} clipId="k" /></svg>);
    expect(html).toContain(`data-tag-fill="diagonal"`);
    expect(html).toContain(`data-tag-fill="dots"`);
    expect(html).toContain(`stroke="#d62728"`);
    expect(html).toContain(`<clipPath id="k-s0">`);
    expect(html).toContain(`fill="#2ca02c"`);
  });

  it("an affected patterned symbol keeps its black centre over a white pattern base", () => {
    const p = ped([q("a", "#000000", "horizontal")], false, ["a"], true);
    const ind = p.individuals[0]!;
    const html = renderToStaticMarkup(<svg><SymbolShape individual={ind} size={40} paint={symbolPaint(ind, p)} clipId="k" /></svg>);
    const base = html.indexOf(`fill="white"></path>`);
    const core = html.indexOf(`scale(0.55)`);
    expect(base).toBeGreaterThan(0);
    expect(core).toBeGreaterThan(base);
  });

  it("legend swatches (app and export key) show the pattern", () => {
    const p = ped(tags);
    const app = renderToStaticMarkup(<TagSwatchSvg tag={tags[0]!} pedigree={p} />);
    expect(app).toContain(`data-tag-fill="diagonal"`);
    expect(app).toContain(`stroke="#d62728"`);
    const key = renderTagLegendSvg(p, 0, 0).markup.join("");
    expect(key).toContain(`legend-clip-a-fill`);
    expect(key).toContain(`stroke="#d62728"`);
  });

  it("monochrome: dot and text tags turn black too", () => {
    const dot: Tag = { id: "d", label: "Sequenced", color: "#2ca02c", style: "dot" };
    const text: Tag = { id: "t", label: "Gene", color: "#ff7f0e", style: "text", abbrev: "+/-" };
    const p = ped([dot, text], true);
    expect(annotationRow(p.individuals[0]!, p).map(i => i.color)).toEqual([MONOCHROME_COLOR, MONOCHROME_COLOR]);
    const svg = renderAnnotationRowSvg(p.individuals[0]!, p, 40);
    expect(svg).not.toContain("#2ca02c");
    expect(svg).not.toContain("#ff7f0e");
  });

  it("monochrome SVG and U-shape exports use no tag colour, and pattern every quadrant tag", () => {
    const p = ped(tags, true);
    for (const svg of [exportSvg(p), exportUShapeSvg(p)]) {
      for (const t of tags) expect(svg).not.toContain(t.color);
      expect(svg).toContain(`stroke="#000000"`); // diagonal and the auto pattern for c
      expect(svg).toContain(" 0 1 0 "); // dots
    }
    expect(renderExportKeySvg(p, 0, 0).markup.join("")).not.toContain("#2ca02c");
  });

  it("every example with tags exports in monochrome with no colour left in its tags", () => {
    for (const ex of EXAMPLES.filter(e => (e.data.tags ?? []).length > 0)) {
      const p = { ...ex.data, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, ...ex.data.canvasSettings, tagFills: "monochrome" as const } };
      const svg = exportSvg(p);
      for (const t of ex.data.tags!) if (t.color.toLowerCase() !== "#000000") expect(svg, ex.label).not.toContain(t.color);
    }
  });

  it("sectorPath regions stay the clip for a pie slice of five tags", () => {
    const five = Array.from({ length: 5 }, (_, i) => q(`t${i}`, "#d62728", "vertical"));
    const p = ped(five);
    const sectors = sectorsFor(p.individuals[0]!, p);
    expect(sectors).toHaveLength(5);
    const svg = renderSectorsSvg(p.individuals[0]!, p, 40, "c");
    expect((svg.match(/<clipPath id="c-s\d">/g) ?? []).length).toBe(5);
    expect(svg).toContain(sectorPath(0, 0, 40, 0, 72));
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
    expect(importJson(exportJson(bad)).issues.some(i => i.severity === "error" && i.path.includes("tags[0]"))).toBe(true);
    const badMode = { ...ped([]), canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, tagFills: "sepia" } } as unknown as Pedigree;
    expect(importJson(exportJson(badMode)).issues.some(i => i.severity === "error")).toBe(true);
  });
});
