import { describe, it, expect, beforeEach } from "vitest";
import { kinshipCoefficients } from "@pedigree-editor/layout-engine";
import type { Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { layoutToFlow } from "../layoutToFlow";
import { nameCoupleRelationship } from "../relationship";
import {
  consanguinityLabelText, consanguinityLabelRoom, wrapConsanguinityLabel, consanguinityLabelBaseline, consanguinityLabelTop,
  highestConsanguinityLabel,
} from "../consanguinityLabel";
import { chartTitleNode } from "../nodes/ChartTitleNode";
import { NODE_SIZE, ROW_HEIGHT } from "../constants";
import { exportSvg } from "../../io/svg/svgExporter";
import { lintExport, lintExportSvg } from "../../io/svg/exportLint";
import { importJson, exportJson } from "../../io/json";
import { usePedigreeStore } from "../../store/usePedigreeStore";

const person = (id: string, sex: Sex, name?: string) => ({ id, sex, affected: false, sibOrder: 0, ...(name ? { name } : {}) });

/**
 * Founders gf = gm (marked consanguineous by hand), two children each with a
 * partner who married in, and their children, first cousins, as a couple.
 */
function cousins(): Pedigree {
  return {
    individuals: [
      person("gf", "male", "Grandpa"), person("gm", "female", "Grandma"),
      person("s1", "male"), person("w1", "female"), person("s2", "female"), person("h2", "male"),
      person("c1", "male", "Carl"), person("c2", "female", "Cara"), person("k", "female"),
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm", consanguineous: true, consanguinityLabel: "second cousins" },
      { id: "p1", individual1: "s1", individual2: "w1" },
      { id: "p2", individual1: "h2", individual2: "s2" },
      { id: "pc", individual1: "c1", individual2: "c2" },
    ],
    parentOf: { g: ["s1", "s2"], p1: ["c1"], p2: ["c2"], pc: ["k"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const withSetting = (p: Pedigree): Pedigree =>
  ({ ...p, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, relationshipLabels: true } });

const labelsByPartnership = (p: Pedigree) =>
  Object.fromEntries(layoutToFlow(p).coupleEdges.map(e => [e.data!.partnershipId, e.data!.consanguinityLabel]));

describe("nameCoupleRelationship (#97)", () => {
  const name = (p: Pedigree, a: string, b: string) => nameCoupleRelationship(p, a, b, kinshipCoefficients(p).kinship(a, b));

  it("puts cousins and siblings in the plural", () => {
    const p = cousins();
    expect(name(p, "c1", "c2")).toBe("first cousins");
    expect(name(p, "s1", "s2")).toBe("siblings");
  });

  it("names both ends of an uncle-niece or parent-child couple", () => {
    const p = cousins();
    expect(name(p, "s1", "c2")).toBe("uncle and niece");
    expect(name(p, "s2", "c1")).toBe("aunt and nephew");
    expect(name(p, "gf", "s2")).toBe("father and daughter");
    expect(name(p, "gm", "c1")).toBe("grandmother and grandson");
    // Descended from her twice over: no single name.
    expect(name(p, "gm", "k")).toBeNull();
  });

  it("is null for an unrelated couple", () => {
    expect(name(cousins(), "s1", "w1")).toBeNull();
  });
});

describe("what is written above a double line (#97)", () => {
  it("the couple's own text always; the named relationship only with the setting", () => {
    const p = cousins();
    expect(labelsByPartnership(p).pc).toBeUndefined();
    expect(labelsByPartnership(p).g!.join(" ")).toBe("second cousins");
    const named = labelsByPartnership(withSetting(p));
    expect(named.pc).toEqual(["first cousins"]);
    expect(named.g!.join(" ")).toBe("second cousins");
  });

  it("nothing on a single line, whatever is stored", () => {
    const p = cousins();
    p.partnerships[1]!.consanguinityLabel = "not related";
    expect(labelsByPartnership(withSetting(p)).p1).toBeUndefined();
    delete p.partnerships[0]!.consanguineous;
    expect(labelsByPartnership(p).g).toBeUndefined();
  });

  it("blank text counts as none", () => {
    const p = cousins();
    p.partnerships[0]!.consanguinityLabel = "  ";
    expect(consanguinityLabelText(p, p.partnerships[0]!)).toBeUndefined();
  });

  it("keeps clear of lines of descent and ? marks on the symbol tops", () => {
    const bare = { hasParents: false, familyHistoryUnknown: false };
    const child = { hasParents: true, familyHistoryUnknown: false };
    expect(consanguinityLabelRoom(0, 80, bare, bare)).toBe(80 + NODE_SIZE);
    expect(consanguinityLabelRoom(0, 80, child, child)).toBe(72);
    expect(consanguinityLabelRoom(0, 80, bare, { hasParents: false, familyHistoryUnknown: true })).toBe(64);
    expect(consanguinityLabelRoom(0, 80, child, { hasParents: true, familyHistoryUnknown: true })).toBe(46);
  });

  it("wraps to the room, one line in compact rows", () => {
    expect(wrapConsanguinityLabel("second cousins once removed", 72, ROW_HEIGHT)).toHaveLength(2);
    expect(wrapConsanguinityLabel("second cousins", 120, ROW_HEIGHT)).toEqual(["second cousins"]);
    expect(wrapConsanguinityLabel("second cousins once removed", 72, 84)).toHaveLength(1);
  });

  it("sits above the symbol tops, or above a line that hops higher", () => {
    expect(consanguinityLabelBaseline(100, 0)).toBeLessThan(100 - NODE_SIZE / 2);
    expect(consanguinityLabelBaseline(100, 60)).toBeLessThan(100 - 60);
    expect(consanguinityLabelTop(100, 0, 2)).toBeLessThan(consanguinityLabelTop(100, 0, 1));
  });
});

describe("the label in exports and over the title (#97)", () => {
  it("the export writes the text, raises the title above it, and lints clean", () => {
    const p = withSetting(cousins());
    const svg = exportSvg(p, { title: "Title" });
    expect(svg).toContain('<g class="consanguinity-labels">');
    expect(svg).toContain(">first cousins</text>");
    expect(lintExport(p, { title: "Title" })).toEqual([]);
    expect(lintExport(p, { compact: true })).toEqual([]);
    // The title baseline sits well above the founders' label.
    const titleY = Number(/class="chart-title"[^>]* y="([\d.]+)"/.exec(svg)![1]);
    const translateY = Number(/<g transform="translate\([\d.e+-]+ ([\d.e+-]+)\)">/.exec(svg)![1]);
    const top = highestConsanguinityLabel(layoutToFlow(p)) + translateY;
    expect(titleY).toBeLessThan(top - 10);
  });

  it("clears the ? of family history not known (#100)", () => {
    const p = withSetting(cousins());
    for (const ind of p.individuals) ind.familyHistoryUnknown = true;
    expect(lintExport(p)).toEqual([]);
    expect(lintExport(p, { compact: true })).toEqual([]);
    // A label forced over a "?" is caught.
    const flow = layoutToFlow(p);
    const gm = flow.nodes.find(n => n.data.individual.id === "gm")!;
    const svg = exportSvg(p).replace('<g class="consanguinity-labels">',
      `<g class="consanguinity-labels"><text x="${gm.position.x}" y="${gm.position.y - NODE_SIZE / 2 - 7}" font-size="9">x</text>`);
    expect(lintExportSvg(p, flow, svg).map(f => f.message).join()).toContain('"?"');
  });

  it("the canvas title is raised the same way", () => {
    const p = cousins();
    const flow = layoutToFlow(p);
    const plain = chartTitleNode("T", flow.nodes)!;
    const raised = chartTitleNode("T", flow.nodes, highestConsanguinityLabel(flow))!;
    expect(raised.position.y).toBeLessThan(plain.position.y);
  });

  it("the export lint catches a label drawn over a symbol", () => {
    const p = cousins();
    const flow = layoutToFlow(p);
    const node = flow.nodes.find(n => n.data.individual.id === "s1")!;
    const svg = exportSvg(p).replace('<g class="consanguinity-labels">',
      `<g class="consanguinity-labels"><text x="${node.position.x}" y="${node.position.y}" font-size="9">third cousins</text>`);
    expect(lintExportSvg(p, flow, svg).map(f => f.code)).toContain("consanguinity-label-collides");
  });
});

describe("consanguinity label data (#97)", () => {
  beforeEach(() => usePedigreeStore.getState().initialize(cousins()));

  it("the store sets and clears the text", () => {
    usePedigreeStore.getState().setPartnershipConsanguinityLabel("pc", "first cousins");
    expect(usePedigreeStore.getState().pedigree.partnerships[3]!.consanguinityLabel).toBe("first cousins");
    usePedigreeStore.getState().setPartnershipConsanguinityLabel("pc", "");
    expect(usePedigreeStore.getState().pedigree.partnerships[3]).not.toHaveProperty("consanguinityLabel");
  });

  it("text and setting survive a JSON round trip; a wrong type is refused", () => {
    const back = importJson(exportJson(withSetting(cousins())));
    expect(back.hasErrors).toBe(false);
    expect(back.pedigree!.partnerships[0]!.consanguinityLabel).toBe("second cousins");
    expect(back.pedigree!.canvasSettings!.relationshipLabels).toBe(true);
    const bad = JSON.parse(exportJson(cousins()));
    bad.pedigree.partnerships[0].consanguinityLabel = 3;
    expect(importJson(JSON.stringify(bad.pedigree)).hasErrors).toBe(true);
  });
});
