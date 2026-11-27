import { describe, it, expect } from "vitest";
import { wrapLabel, labelMaxWidth, LABEL_CHAR_WIDTH, ELLIPSIS, linesWidth, nameLabelMode, isLabelCut, NAME_CHAR_WIDTH, detailSections, tagSection } from "../labels";
import { buildScene } from "../scene";
import { lintScene } from "../renderLint";
import { exportSvg } from "../../io/svg/svgExporter";
import { NODE_SIZE, SLOT_WIDTH } from "../constants";
import { textUnder } from "../labelBlock";
import { EXAMPLES } from "../../data/examples";
import type { Individual, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";

const max = labelMaxWidth(SLOT_WIDTH); // 74px: 12 characters

describe("wrapLabel (#68)", () => {
  it("short names stay on one line, empty names give none", () => {
    expect(wrapLabel("Mary", max)).toEqual(["Mary"]);
    expect(wrapLabel("", max)).toEqual([]);
    expect(wrapLabel(undefined, max)).toEqual([]);
    expect(wrapLabel("  spaced   out ", max)).toEqual(["spaced out"]);
  });

  it("wraps at a space onto two lines within the slot width", () => {
    expect(wrapLabel("Ferdinand of Aragon", max)).toEqual(["Ferdinand of", `Aragon`]);
    expect(wrapLabel("Isabella of Portugal", max)).toEqual(["Isabella of", "Portugal"]);
    for (const line of wrapLabel("Charles I (Charles V)", max)) expect(line.length * LABEL_CHAR_WIDTH).toBeLessThanOrEqual(max);
  });

  it("cuts a third line with an ellipsis and splits an overlong word", () => {
    const lines = wrapLabel("Maria Anna Josepha Antonia", max);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith(ELLIPSIS)).toBe(true);
    expect(lines[1]!.length).toBeLessThanOrEqual(12);
    const long = wrapLabel("Wolfeschlegelsteinhausen", max);
    expect(long[0]).toHaveLength(12);
    expect(long[1]).toBe("lsteinhausen");
    expect(wrapLabel("Wolfeschlegelsteinhausenbergerdorff", max)[1]!.endsWith(ELLIPSIS)).toBe(true);
  });

  it("gives fewer characters per line in compact slots", () => {
    expect(wrapLabel("Ferdinand of Aragon", labelMaxWidth(68))).toEqual(["Ferdinand", `of Aragon`]);
  });
});

function pair(name: string, dx = SLOT_WIDTH, other = "Bea"): Pedigree {
  return {
    individuals: [
      { id: "a", sex: "male", affected: false, sibOrder: 0, name },
      { id: "b", sex: "female", affected: false, sibOrder: 1, name: other },
    ],
    partnerships: [{ id: "p", individual1: "a", individual2: "b" }],
    parentOf: { p: [] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    pinnedPositions: { b: { x: dx, y: 0 }, a: { x: 0, y: 0 } },
  };
}

describe("labels on the canvas, in exports and in the lint (#68)", () => {
  it("buildScene puts the wrapped lines on the node data", () => {
    const flow = buildScene(pair("Ferdinand of Aragon"));
    // Names are bold (#246), so they wrap at the bold width: "Ferdinand of"
    // fits the slot in regular text but not in bold.
    expect(flow.people.find(n => n.individual.id === "a")!.glyph.nameLines).toEqual(["Ferdinand", "of Aragon"]);
    expect(linesWidth(["Ferdinand", "of Aragon"], NAME_CHAR_WIDTH)).toBeLessThanOrEqual(max);
    expect(linesWidth(["Ferdinand of"])).toBeLessThanOrEqual(max);
    expect(linesWidth(["Ferdinand of"], NAME_CHAR_WIDTH)).toBeGreaterThan(max);
  });

  it("the SVG export writes one text element per line and keeps the full name as a title", () => {
    const svg = exportSvg(pair("Ferdinand of Aragon"));
    expect(svg).toContain(">Ferdinand</text>");
    expect(svg).toContain(">of Aragon</text>");
    expect(svg).toContain("<title>Ferdinand of Aragon</title>");
    expect(exportSvg(pair("Bob"))).not.toContain("<title>");
  });

  it("the lint reports labels that run together only when they do", () => {
    const p = pair("Ferdinand of Aragon");
    expect(lintScene(p, buildScene(p)).filter(f => f.code === "labels-overlap")).toEqual([]);
    // Two wrapped names a slot apart fit; dragged half a slot closer they collide.
    const wide = pair("Ferdinand of Aragon", SLOT_WIDTH, "Isabella of Portugal");
    expect(lintScene(wide, buildScene(wide)).filter(f => f.code === "labels-overlap")).toEqual([]);
    const close = pair("Ferdinand of Aragon", 50, "Isabella of Portugal");
    const found = lintScene(close, buildScene(close));
    expect(found.some(f => f.code === "labels-overlap")).toBe(true);
  });

  it("no example's labels overlap, in normal or compact spacing", () => {
    for (const ex of EXAMPLES) {
      for (const compact of [false, true]) {
        const found = lintScene(ex.data, buildScene(ex.data, { compact })).filter(f => f.code === "labels-overlap");
        expect({ label: ex.label, compact, found }).toEqual({ label: ex.label, compact, found: [] });
      }
    }
  });
});

describe("name label setting: wrap or truncate (#68)", () => {
  const truncated = (p: Pedigree): Pedigree => ({
    ...p,
    canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, nameLabels: "truncate" },
  });

  it("is wrap unless the pedigree says truncate", () => {
    expect(nameLabelMode(pair("Bob"))).toBe("wrap");
    expect(nameLabelMode({ canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20 } })).toBe("wrap");
    expect(nameLabelMode(truncated(pair("Bob")))).toBe("truncate");
  });

  it("truncate gives one line on the canvas, cut with an ellipsis", () => {
    const p = truncated(pair("Ferdinand of Aragon"));
    const lines = buildScene(p).people[0]!.glyph.nameLines;
    expect(lines).toHaveLength(1);
    expect(lines[0]!.endsWith(ELLIPSIS)).toBe(true);
    expect(linesWidth(lines, NAME_CHAR_WIDTH)).toBeLessThanOrEqual(max);
    expect(buildScene(truncated(pair("Mary"))).people[0]!.glyph.nameLines).toEqual(["Mary"]);
    expect(buildScene(pair("Ferdinand of Aragon")).people[0]!.glyph.nameLines).toEqual(["Ferdinand", "of Aragon"]);
  });

  it("knows when a label leaves part of the name out", () => {
    expect(isLabelCut(["Ferdinand of", "Aragon"], "Ferdinand of Aragon")).toBe(false);
    expect(isLabelCut(["Mary"], "  Mary ")).toBe(false);
    expect(isLabelCut(wrapLabel("Bartholomewson", max), "Bartholomewson")).toBe(false); // split mid-word, nothing lost
    expect(isLabelCut(wrapLabel("Ferdinand of Aragon", max, 1), "Ferdinand of Aragon")).toBe(true);
    expect(isLabelCut(wrapLabel("Maria Anna Josepha Antonia", max), "Maria Anna Josepha Antonia")).toBe(true);
  });

  it("exports wrap whatever the setting, since a file cannot be hovered", () => {
    const svg = exportSvg(truncated(pair("Ferdinand of Aragon")));
    expect(svg).toContain(">Ferdinand</text>");
    expect(svg).toContain(">of Aragon</text>");
  });

  it("no example's labels overlap when truncated, in normal or compact spacing", () => {
    for (const ex of EXAMPLES) {
      for (const compact of [false, true]) {
        const p = truncated(ex.data);
        const found = lintScene(p, buildScene(p, { compact })).filter(f => f.code === "labels-overlap");
        expect({ label: ex.label, compact, found }).toEqual({ label: ex.label, compact, found: [] });
      }
    }
  });
});

describe("name in bold, text tags in the detail lines (#246)", () => {
  const geno: Tag = { id: "g", label: "Gene result +/-", abbrev: "+/-", color: "#cc0000", style: "text" };
  const vhagar: Tag = { id: "v", label: "Rode Vhagar", abbrev: "Vhagar", color: "#7f7f7f", style: "text" };
  const dna: Tag = { id: "d", label: "DNA banked", color: "#1f77b4", style: "dot" };
  const withTags = (tags: string[], extra: Partial<Individual> = {}): Pedigree => {
    const p = pair("Tamsin");
    p.tags = [geno, vhagar, dna];
    p.individuals[0] = { ...p.individuals[0]!, tags, evaluations: [{ detail: "BRCA1", result: "positive" }], dob: "1970", notes: "Seen 2019", ...extra };
    return p;
  };

  it("puts the text tags after the evaluations, before notes and the number", () => {
    const p = withTags(["g", "v", "d"]);
    const sections = detailSections(p.individuals[0]!, max, p, new Map([["a", "II-3"]]));
    expect(sections.filter(s => s.lines.length).map(s => s.key)).toEqual(["age", "evaluation", "tags", "notes", "number"]);
    expect(sections.find(s => s.key === "tags")!.lines).toEqual(["+/- Vhagar"]);
  });

  it("keeps each tag's colour, and wraps several to the width", () => {
    const p = withTags(["g", "v"]);
    expect(tagSection(p.individuals[0]!, p, max).runs).toEqual([[{ text: "+/-", color: "#cc0000" }, { text: "Vhagar", color: "#7f7f7f" }]]);
    expect(tagSection(p.individuals[0]!, p, 40).lines).toEqual(["+/-", "Vhagar"]);
    expect(tagSection(p.individuals[0]!, p, 40).lines.every(l => linesWidth([l]) <= 40)).toBe(true);
  });

  it("the row under the symbol keeps only the dot tags, and none with text tags alone", () => {
    const glyph = buildScene(withTags(["g", "d"])).people[0]!.glyph;
    expect(glyph.annotations.map(a => a.tag.id)).toEqual(["d"]);
    expect(buildScene(withTags(["g"])).people[0]!.glyph.annotations).toEqual([]);
  });

  it("draws the name bold and the tags in regular weight, in their colour", () => {
    const svg = exportSvg(withTags(["g"]));
    expect(svg).toMatch(/font-weight="bold"[^>]*>Tamsin</);
    expect(svg).toMatch(/<text[^>]*>(?:(?!font-weight)[^>])*?<tspan fill="#cc0000">\+\/-<\/tspan>/);
    expect(svg).not.toMatch(/font-weight="bold"[^>]*><tspan/);
  });

  it("a de-identified figure writes the pedigree number in regular weight", () => {
    const p = withTags(["g"]);
    for (const svg of [exportSvg(p, { deidentify: true }), exportUShapeSvg(p, { deidentify: true })]) {
      expect(svg).toMatch(/>I-1</);
      expect(svg).not.toContain('font-weight="bold"');
    }
    expect(exportUShapeSvg(p)).toMatch(/font-weight="bold"[^>]*>(<title>[^<]*<\/title>)?Tamsin</);
  });

  it("dropping text tags in a de-identified figure leaves no detail line", () => {
    const svg = exportSvg(withTags(["g"]), { deidentify: true, deidentifyKeep: { textTags: false } });
    expect(svg).not.toContain("+/-");
  });
});

describe("text under a proband's arrow (#246)", () => {
  it("drops a name wider than the symbol below the arrowhead, and leaves a short one", () => {
    const at = (name: string, proband: boolean) => {
      const p = pair(name);
      p.individuals[0] = { ...p.individuals[0]!, proband };
      return textUnder(buildScene(p).people[0]!.glyph, buildScene(p).people[0]!.glyph.nameLines).nameY[0]!;
    };
    expect(at("Wilhelmina", true)).toBeGreaterThan(at("Wilhelmina", false));
    expect(at("Ann", true)).toBe(at("Ann", false));
    // The arrowhead reaches about 9px below the symbol's corner; the cap height of the line is about 7px.
    expect(at("Wilhelmina", true) - 7).toBeGreaterThan(NODE_SIZE / 2 + 9);
  });
});
