import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Individual, NotationEdition, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import {
  affectedControlOn, applyAffected, applyCarrier, applyConditionState, carrierConditions, conditionMode, isAffected, isCarrier,
  plainAffected, plainCarrier, resolvePlainAffected,
} from "../conditions";
import { symbolPaint, renderExportKeySvg, renderSectorsSvg, keyTagRows, statusKeyRows, sectionLayout, sectionName, sectorAngles, sectorPath, conditionSection, conditionPaint, conditionCarrierPaint, PLAIN_CARRIER_TAG } from "../tags";
import { carrierPaint, tagPaint } from "../tagFills";
import { notationOf, withCurrentNotation } from "../notation";
import { SymbolShape } from "../nodes/symbols";
import { Legend } from "../../components/Legend";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport } from "../../io/svg/exportLint";
import { lintUShape } from "../../io/svg/uShapeLint";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { exportCsv } from "../../io/csv/exporter";
import { exportJson, importJson } from "../../io/json";
import { exportPed, importPed } from "../../io/ped";
import { EXAMPLES } from "../../data/examples";
import { affectedOnlySeeds } from "../viewFilters";
import { batchStatus } from "../batch";
import { findProblems } from "../validation";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { pedigreeApi } from "../../api/client";

const CF: Tag = { id: "cf", label: "Cystic fibrosis", color: "#d62728", style: "quadrant" };
const TS: Tag = { id: "ts", label: "Tay-Sachs", color: "#1f77b4", style: "quadrant" };

function ind(id: string, extra: Partial<Individual> = {}): Individual {
  return { id, sex: "female", affected: false, sibOrder: 0, name: id, ...extra };
}

/**
 * Parents and seven children covering every combination (#115). Recording a
 * condition does not set the plain flag (#118), so `affected` here is only
 * on d and g, affected with nothing recorded.
 */
function family(tags: Tag[] = [CF, TS], notation?: NotationEdition, tagFills?: "monochrome"): Pedigree {
  return {
    individuals: [
      ind("gf", { sex: "male", carrierTags: ["cf"] }),
      ind("gm", { carrierTags: ["cf", "ts"] }),
      ind("a", { sex: "male", tags: ["cf"] }),
      ind("b", { carrierTags: ["cf"], sibOrder: 1 }),
      ind("c", { sex: "male", tags: ["ts"], carrierTags: ["cf"], sibOrder: 2 }),
      ind("d", { affected: true, sibOrder: 3 }),
      ind("e", { sex: "male", carrier: true, sibOrder: 4 }),
      ind("f", { carrier: true, tags: ["ts"], sibOrder: 5 }),
      ind("g", { sex: "male", affected: true, carrierTags: ["ts"], sibOrder: 6, lifeStatus: undefined }),
    ],
    partnerships: [{ id: "p", individual1: "gf", individual2: "gm" }],
    parentOf: { p: ["a", "b", "c", "d", "e", "f", "g"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    tags,
    ...(notation || tagFills ? { canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 5, ...(notation ? { notation } : {}), ...(tagFills ? { tagFills } : {}) } } : {}),
  };
}

const byId = (p: Pedigree, id: string) => p.individuals.find(i => i.id === id)!;

describe("notation default (#115)", () => {
  it("absent means NSGC 2008, so saved pedigrees keep their look", () => {
    expect(notationOf(family())).toBe("nsgc2008");
    expect(notationOf(undefined)).toBe("nsgc2008");
    expect(notationOf(family([CF], "nsgc2022"))).toBe("nsgc2022");
  });

  it("new pedigrees, PED imports and every example are written in NSGC 2022", () => {
    expect(withCurrentNotation({}).canvasSettings).toEqual({ nodesMoveable: false, snapToGrid: false, snapGridSize: 5, notation: "nsgc2022" });
    expect(withCurrentNotation(family([], "nsgc2008")).canvasSettings!.notation).toBe("nsgc2008");
    const ped = importPed("F 1 0 0 1 1\nF 2 0 0 2 1\nF 3 1 2 1 2\n");
    expect(ped.pedigrees[0]!.pedigree.canvasSettings!.notation).toBe("nsgc2022");
    for (const e of EXAMPLES) expect(notationOf(e.data), e.label).toBe("nsgc2022");
  });

  it("a blank pedigree is created with NSGC 2022", async () => {
    const { apiClient } = await import("../../api/client");
    let sent: unknown;
    const orig = apiClient.post;
    apiClient.post = (async (_url: string, body: unknown) => { sent = body; return { data: {} }; }) as typeof apiClient.post;
    try { await pedigreeApi.create("x"); } finally { apiClient.post = orig; }
    expect((sent as { data: Pedigree }).data.canvasSettings!.notation).toBe("nsgc2022");
  });

  it("JSON import keeps what the file says", () => {
    const old = importJson(exportJson(family())).pedigree!;
    expect(old.canvasSettings).toBeUndefined();
    expect(notationOf(importJson(exportJson(family([CF], "nsgc2022"))).pedigree!)).toBe("nsgc2022");
  });
});

describe("condition state helpers", () => {
  it("modes, plain flags and carriers", () => {
    expect(conditionMode(family([]))).toBe("plain");
    expect(conditionMode(family([CF]))).toBe("single");
    expect(conditionMode(family())).toBe("per-condition");
    const p = family();
    expect(plainAffected(byId(p, "d"), p)).toBe(true);
    expect(plainAffected(byId(p, "a"), p)).toBe(false);
    expect(plainCarrier(byId(p, "e"), p)).toBe(true);
    expect(isCarrier(byId(p, "b"), p)).toBe(true);
    expect(carrierConditions(byId(p, "c"), p).map(t => t.id)).toEqual(["cf"]);
  });

  it("a tag in both lists counts as affected; a non-quadrant carrier tag is ignored", () => {
    const dot: Tag = { id: "dna", label: "DNA", color: "#000", style: "dot" };
    const p = family([CF, dot]);
    const x = ind("x", { tags: ["cf"], carrierTags: ["cf", "dna"] });
    expect(carrierConditions(x, p)).toEqual([]);
  });

  it("applyConditionState keeps a tag in one list and the flags coherent", () => {
    const p = family();
    const x = ind("x", { carrier: true, onset: "40s" });
    expect(applyConditionState(x, "cf", "carrier", p)).toBe(true);
    expect(x).toMatchObject({ carrierTags: ["cf"], carrier: false });
    expect(applyConditionState(x, "cf", "carrier", p)).toBe(false);
    applyConditionState(x, "ts", "affected", p);
    // Recording a condition leaves the plain flag alone (#118).
    expect(x).toMatchObject({ affected: false, tags: ["ts"], carrierTags: ["cf"] });
    x.tagOnset = { ts: "5y" };
    applyConditionState(x, "ts", "carrier", p);
    expect(x.affected).toBe(false);
    expect(x.tags).toBeUndefined();
    expect(x.onset).toBeUndefined();
    expect(x.tagOnset).toBeUndefined();
    expect(x.carrierTags).toEqual(["cf", "ts"]);
    applyConditionState(x, "cf", "none", p);
    applyConditionState(x, "ts", "none", p);
    expect(x.carrierTags).toBeUndefined();
    // Nor does clearing one (#118): the flag is affected with something not recorded.
    const y = ind("y", { affected: true, onset: "30s" });
    applyConditionState(y, "cf", "affected", p);
    applyConditionState(y, "cf", "none", p);
    expect(y).toMatchObject({ affected: true, onset: "30s" });
    expect(y.tags).toBeUndefined();
  });

  it("isAffected is the flag or an affected condition; the control state follows the mode (#118)", () => {
    const p = family();
    expect(["a", "c", "d", "f", "g"].every(id => isAffected(byId(p, id), p))).toBe(true);
    expect(["b", "e", "gf"].some(id => isAffected(byId(p, id), p))).toBe(false);
    // Two conditions: the control is the flag, so "a" (CF only) can still be marked affected.
    expect(affectedControlOn(byId(p, "a"), p)).toBe(false);
    expect(affectedControlOn(byId(p, "d"), p)).toBe(true);
    // The flag beside a recorded condition is plain with two conditions, not with one.
    const both = { ...byId(p, "a"), affected: true };
    expect(plainAffected(both, p)).toBe(true);
    const one = family([CF]);
    expect(plainAffected(both, one)).toBe(false);
    expect(affectedControlOn(byId(one, "a"), one)).toBe(true);
  });

  it("resolvePlainAffected records the flag as a condition or drops it, moving its onset", () => {
    const p = family();
    const x = ind("x", { affected: true, onset: "40s" });
    expect(resolvePlainAffected(x, "cf", p)).toMatchObject({ affected: false, onset: undefined, tags: ["cf"], tagOnset: { cf: "40s" } });
    const y = ind("y", { affected: true, onset: "40s", tags: ["ts"], tagOnset: { ts: "5y" } });
    expect(resolvePlainAffected(y, null, p)).toMatchObject({ affected: false, onset: undefined, tags: ["ts"], tagOnset: { ts: "5y" } });
    const z = ind("z", { affected: true, onset: "40s", tags: ["ts"] });
    expect(resolvePlainAffected(z, null, p)).toMatchObject({ tagOnset: { ts: "40s" } });
  });

  it("with one condition the plain controls record it", () => {
    const p = family([CF]);
    const x = ind("x");
    applyAffected(x, true, p);
    expect(x).toMatchObject({ affected: false, tags: ["cf"] });
    applyCarrier(x, true, p);
    expect(x).toMatchObject({ affected: false, carrierTags: ["cf"] });
    expect(x.tags).toBeUndefined();
    applyCarrier(x, false, p);
    expect(x.carrierTags).toBeUndefined();
    expect(x.carrier).toBeFalsy();
  });

  it("with none or several, the plain controls set only the plain flags; unaffected clears affected conditions", () => {
    const p = family();
    const x = ind("x", { carrierTags: ["ts"] });
    applyCarrier(x, true, p);
    expect(x).toMatchObject({ carrier: true, carrierTags: ["ts"] });
    applyCarrier(x, false, p);
    expect(x).toMatchObject({ carrier: false, carrierTags: ["ts"] });
    applyConditionState(x, "cf", "affected", p);
    applyAffected(x, false, p);
    expect(x.affected).toBe(false);
    expect(x.tags).toBeUndefined();
  });
});

describe("symbolPaint (#115)", () => {
  it("NSGC 2022: no dot, recorded conditions are sectors alone, the plain carrier a dotted right half", () => {
    const p = family(undefined, "nsgc2022");
    const paint = (id: string) => symbolPaint(byId(p, id), p);
    expect(paint("a")).toMatchObject({ base: "white", core: false, dot: false });
    // Two conditions: halves, CF on the left.
    expect(paint("b").sectors).toMatchObject([{ tag: CF, carrier: true, fill: "diagonal", start: 180, end: 360 }]);
    expect(paint("d")).toMatchObject({ base: "black", core: false, sectors: [] });
    const e = paint("e");
    expect(e.dot).toBe(false);
    expect(e.sectors).toMatchObject([{ tag: PLAIN_CARRIER_TAG, start: 0, end: 180, fill: "dots" }]);
    // affected with Tay-Sachs, the right half: it covers the plain carrier half, which is left off.
    expect(paint("f").sectors.map(s => s.tag.id)).toEqual(["ts"]);
    // affected with CF, the left half: the plain carrier half is drawn beside it.
    const h = { ...byId(p, "f"), tags: ["cf"] };
    expect(symbolPaint(h, p).sectors.map(s => s.tag.id)).toEqual([PLAIN_CARRIER_TAG.id, "cf"]);
    // affected, condition not recorded, beside a carrier sector: black under it, the black centre on top (#118).
    expect(paint("g")).toMatchObject({ base: "black", core: true });
    // The flag beside a recorded condition is drawn the same way, the condition's section over black.
    const flagged = { ...byId(p, "a"), affected: true };
    expect(symbolPaint(flagged, p)).toMatchObject({ base: "black", core: true, sectors: [{ tag: CF, start: 180, end: 360 }] });
    // With one condition the flag beside it adds nothing: the whole-symbol section alone.
    const one = family([CF], "nsgc2022");
    expect(symbolPaint(flagged, one)).toMatchObject({ base: "white", core: false, sectors: [{ tag: CF, start: 0, end: 360 }] });
  });

  it("NSGC 2008: as before for the plain flags, carrier conditions as sectors", () => {
    const p = family();
    const paint = (id: string) => symbolPaint(byId(p, id), p);
    // Two conditions: a quarter per condition on white; the flag is black under them (#118).
    expect(paint("a")).toMatchObject({ base: "white", core: false });
    expect(symbolPaint({ ...byId(p, "a"), affected: true }, p)).toMatchObject({ base: "black", core: true });
    expect(paint("d")).toMatchObject({ base: "black", core: false });
    // One condition: affected with it is the black fill, as before.
    const one = family([CF]);
    expect(symbolPaint(byId(one, "a"), one)).toMatchObject({ base: "black", core: true });
    expect(paint("e")).toMatchObject({ dot: true, sectors: [] });
    // Affected only with Tay-Sachs: its quarter on white, so the plain carrier's dot shows (#118).
    expect(paint("f")).toMatchObject({ dot: true, base: "white" });
    expect(paint("g").dot).toBe(false);
    expect(paint("b")).toMatchObject({ dot: false, base: "white" });
    expect(paint("b").sectors[0]!.carrier).toBe(true);
  });

  it("carrier paint always differs from the affected one, colour and black and white", () => {
    for (const tags of [[CF, TS], [{ ...CF, fill: "dots" as const }, { ...TS, fill: "shade" as const }]]) {
      for (const mono of [undefined, "monochrome" as const]) {
        const p = family(tags, "nsgc2022", mono);
        for (const t of tags) expect(carrierPaint(t, p)).not.toEqual(tagPaint(t, p));
      }
    }
    const mono = family(undefined, "nsgc2022", "monochrome");
    expect(carrierPaint(CF, mono)).toEqual({ color: "#8c8c8c", fill: tagPaint(CF, mono).fill });
  });
});

describe("sections follow the number of conditions in use (NSGC 2022)", () => {
  const T3: Tag = { id: "t3", label: "Third", color: "#2ca02c", style: "quadrant" };
  const T4: Tag = { id: "t4", label: "Fourth", color: "#f2c80f", style: "quadrant" };
  const angles = (p: Pedigree, id: string) => symbolPaint(byId(p, id), p).sectors.map(s => [s.tag.id, s.start, s.end]);

  it("one condition: the whole symbol, affected and carrier", () => {
    const p = family([CF], "nsgc2022");
    expect(sectionLayout(p)).toBe("whole");
    expect(angles(p, "a")).toEqual([["cf", 0, 360]]);
    expect(angles(p, "b")).toEqual([["cf", 0, 360]]);
    expect(symbolPaint(byId(p, "b"), p).sectors[0]).toMatchObject({ carrier: true, fill: "diagonal" });
    // A plain carrier still draws the dotted right half, told apart by its size and black dots.
    expect(symbolPaint(byId(p, "e"), p).sectors).toMatchObject([{ tag: PLAIN_CARRIER_TAG, start: 0, end: 180, fill: "dots", color: "#000000" }]);
    expect(sectorAngles(0, p)).toEqual([0, 360]);
    expect(sectionName(CF, p).name).toBe("whole symbol");
  });

  it("two conditions: left and right halves", () => {
    const p = family([CF, TS], "nsgc2022");
    expect(sectionLayout(p)).toBe("halves");
    expect(angles(p, "gm")).toEqual([["cf", 180, 360], ["ts", 0, 180]]);
    expect(angles(p, "c")).toEqual([["ts", 0, 180], ["cf", 180, 360]].sort((x, y) => (x[0]! < y[0]! ? -1 : 1)));
    expect([sectionName(CF, p).name, sectionName(TS, p).name]).toEqual(["left half", "right half"]);
  });

  /** `family(tags)` plus one person with each of `extra` (so those conditions are in use). */
  const using = (tags: Tag[], extra: string[], mono?: "monochrome") => {
    const p = family(tags, "nsgc2022", mono);
    p.individuals.push(...extra.map((t, i) => ind(`x${i}`, { affected: true, tags: [t], sibOrder: 7 + i })));
    p.parentOf.p = [...p.parentOf.p!, ...extra.map((_, i) => `x${i}`)];
    return p;
  };

  it("three or four conditions in use: the fixed quarters; five or more: slices for those with a fifth", () => {
    const p3 = using([CF, TS, T3], ["t3"]);
    expect(sectionLayout(p3)).toBe("quarters");
    expect(angles(p3, "gm")).toEqual([["cf", 270, 360], ["ts", 0, 90]]);
    expect(angles(p3, "x0")).toEqual([["t3", 90, 180]]);
    const T5: Tag = { id: "t5", label: "Fifth", color: "#ff7f0e", style: "quadrant" };
    const p5 = using([CF, TS, T3, T4, T5], ["t3", "t4", "t5"]);
    expect(angles(p5, "gm")).toEqual([["cf", 270, 360], ["ts", 0, 90]]);
    const five = { ...byId(p5, "gm"), tags: ["t5"] };
    expect(symbolPaint(five, p5).sectors.map(s => [s.start, s.end])).toEqual([[0, 120], [120, 240], [240, 360]]);
    // Four in use out of five defined: everyone has a fixed quarter, the fifth defined one is unused.
    const p4 = using([CF, TS, T3, T4, T5], ["t5", "t4"]);
    expect(angles(p4, "x0")).toEqual([["t5", 180, 270]]);
  });

  it("a condition defined but not in use changes nothing", () => {
    // Nobody has Tay-Sachs: the CF fill stays the whole symbol.
    const strip = (p: Pedigree) => {
      for (const i of p.individuals) {
        if (i.tags) i.tags = i.tags.filter(t => t !== "ts");
        if (i.carrierTags) i.carrierTags = i.carrierTags.filter(t => t !== "ts");
      }
      return p;
    };
    const p = strip(family([CF, TS], "nsgc2022"));
    expect(sectionLayout(p)).toBe("whole");
    expect(angles(p, "a")).toEqual([["cf", 0, 360]]);
    expect(angles(p, "gm")).toEqual([["cf", 0, 360]]);
    // The unused one is shown where it would go once someone has it.
    expect(conditionSection(TS, p)).toMatchObject({ inUse: false, layout: "halves", angles: [0, 180] });
    expect(sectionName(TS, p)).toMatchObject({ name: "right half", title: expect.stringContaining("No one has it yet") });
    expect(sectionName(CF, p)).toMatchObject({ name: "whole symbol" });
    // Positions follow tag order among the conditions in use: an unused first tag leaves the left half to CF.
    const q = family([T3, CF, TS], "nsgc2022");
    expect(sectionLayout(q)).toBe("halves");
    expect(angles(q, "gm")).toEqual([["cf", 180, 360], ["ts", 0, 180]]);
    // Exports, the export key and the app legend agree.
    const centred = sectorPath(0, 0, 40, 0, 360);
    expect(exportSvg(p)).toContain(centred);
    expect(exportUShapeSvg(p)).toContain(centred);
    expect(renderToStaticMarkup(<Legend pedigree={p} />)).toContain(sectorPath(14, 14, 16, 0, 360));
    expect(renderExportKeySvg(p, 0, 0).markup.find(m => m.includes(">Cystic fibrosis<"))).toMatch(/A 16 16 0 1 1 \S+ \S+ A 16 16 0 1 1/);
    // NSGC 2008 keeps a quarter per defined condition.
    const old = strip(family([CF, TS]));
    expect(sectionLayout(old)).toBe("quarters");
    expect(angles(old, "gm")).toEqual([["cf", 270, 360]]);
  });

  it("people in a collapsed branch do not count (drawn pedigree)", () => {
    // gm's only Tay-Sachs relatives are her carrier children; collapse hides the
    // unaffected ones, but she carries it herself, so take hers off.
    const p = family([CF, TS], "nsgc2022");
    byId(p, "gm").carrierTags = ["cf"];
    for (const id of ["c", "f", "g"]) p.individuals = p.individuals.filter(i => i.id !== id);
    p.parentOf.p = ["a", "b", "d", "e"];
    byId(p, "b").carrierTags = ["ts"];
    expect(sectionLayout(p)).toBe("halves");
    byId(p, "gf").descendantsHidden = true;
    const hidden = { ...p };
    expect(sectionLayout(hidden)).toBe("whole");
    expect(angles(hidden, "a")).toEqual([["cf", 0, 360]]);
    const centred = sectorPath(0, 0, 40, 0, 360);
    expect(exportSvg(hidden)).toContain(centred);
    expect(exportSvg(hidden)).not.toContain("Tay-Sachs");
    expect(renderToStaticMarkup(<Legend pedigree={hidden} />)).toContain(sectorPath(14, 14, 16, 0, 360));
  });

  it("NSGC 2008 and pedigrees with no notation keep the quarters", () => {
    for (const notation of [undefined, "nsgc2008" as const]) {
      const p = family([CF], notation);
      expect(sectionLayout(p)).toBe("quarters");
      expect(angles(p, "b")).toEqual([["cf", 270, 360]]);
      expect(angles(family([CF, TS], notation), "gm")).toEqual([["cf", 270, 360], ["ts", 0, 90]]);
    }
  });

  it("the affected core still sits over a whole-symbol carrier fill", () => {
    const p = family([CF], "nsgc2022");
    const g = { ...byId(p, "g"), carrierTags: ["cf"] };
    expect(symbolPaint(g, p)).toMatchObject({ base: "black", core: true, sectors: [{ start: 0, end: 360, carrier: true }] });
  });

  it("every renderer draws the section: canvas, app legend, export key, SVG and U-shape", () => {
    for (const [tags, start, end] of [[[CF], 0, 360], [[CF, TS], 180, 360]] as const) {
      for (const tagFills of [undefined, "monochrome" as const]) {
        const p = family([...tags], "nsgc2022", tagFills);
        const a = byId(p, "a");
        // The canvas symbol has its corner at 0 0; the exporters centre it on 0 0. Radius = size.
        const canvas = renderToStaticMarkup(<svg><SymbolShape individual={a} size={40} paint={symbolPaint(a, p)} clipId="k" /></svg>);
        expect(canvas).toContain(sectorPath(20, 20, 40, start, end));
        const centred = sectorPath(0, 0, 40, start, end);
        expect(renderSectorsSvg(a, p, 40, "x")).toContain(centred);
        expect(exportSvg(p)).toContain(centred);
        expect(exportUShapeSvg(p)).toContain(centred);
      }
    }
    // Legend swatches: 16px, at 6 6 in the app legend and at the key's origin in exports.
    for (const [tags, start, end] of [[[CF], 0, 360], [[CF, TS], 180, 360]] as const) {
      const p = family([...tags], "nsgc2022");
      expect(renderToStaticMarkup(<Legend pedigree={p} />)).toContain(sectorPath(14, 14, 16, start, end));
    }
    // Export key: the CF swatch is a full circle path with one condition, a left half (vertical chord) with two.
    const keyRow = (p: Pedigree) => renderExportKeySvg(p, 0, 0).markup.find(m => m.includes(">Cystic fibrosis<"))!;
    expect(keyRow(family([CF], "nsgc2022"))).toMatch(/A 16 16 0 1 1 \S+ \S+ A 16 16 0 1 1/);
    expect(keyRow(family([CF, TS], "nsgc2022"))).toMatch(/M (\S+) \S+ L \1 \S+ A 16 16 0 0 1 \1 \S+ Z/);
    expect(keyRow(family([CF, TS]))).not.toMatch(/M (\S+) \S+ L \1 \S+ A 16 16 0 0 1 \1 \S+ Z/);
  });
});

describe("one condition in black and white is solid black (NSGC 2022)", () => {
  /** One condition, no one affected without it recorded (d, f and g would be a plain black fill). */
  const single = (tagFills?: "monochrome", notation: NotationEdition | "none" = "nsgc2022", tags: Tag[] = [CF]) => {
    const p = family(tags, notation === "none" ? undefined : notation, tagFills);
    const drop = new Set(["d", "f", "g"]);
    p.individuals = p.individuals.filter(i => !drop.has(i.id));
    p.parentOf.p = p.parentOf.p!.filter(id => !drop.has(id));
    return p;
  };
  const paint = (p: Pedigree, id: string) => symbolPaint(byId(p, id), p);

  it("affected is solid black, its carrier black hatch, the plain carrier a dotted half", () => {
    const p = single("monochrome");
    expect(paint(p, "a")).toMatchObject({ base: "white", core: false, sectors: [{ tag: CF, start: 0, end: 360, fill: "solid", color: "#000000" }] });
    expect(paint(p, "b").sectors).toMatchObject([{ tag: CF, start: 0, end: 360, fill: "diagonal", color: "#000000", carrier: true }]);
    expect(paint(p, "e").sectors).toMatchObject([{ tag: PLAIN_CARRIER_TAG, start: 0, end: 180, fill: "dots" }]);
    expect(conditionPaint(CF, p)).toEqual({ color: "#000000", fill: "solid" });
    expect(conditionCarrierPaint(CF, p)).toEqual({ color: "#000000", fill: "diagonal" });
    // A second condition defined but unused keeps it solid black.
    const two = single("monochrome", "nsgc2022", [CF, TS]);
    two.individuals = two.individuals.map(i => ({ ...i, tags: i.tags?.filter(t => t !== "ts"), carrierTags: i.carrierTags?.filter(t => t !== "ts") }));
    expect(paint(two, "a").sectors).toMatchObject([{ start: 0, end: 360, fill: "solid", color: "#000000" }]);
  });

  it("colour keeps the tag colour; 2008, a chosen pattern, two conditions and a plain black fill keep the pattern", () => {
    expect(paint(single(), "a").sectors).toMatchObject([{ fill: "solid", color: CF.color }]);
    expect(paint(single(), "b").sectors).toMatchObject([{ fill: "diagonal", color: CF.color }]);
    for (const notation of ["none", "nsgc2008"] as const) {
      const p = single("monochrome", notation);
      expect(paint(p, "a").sectors).toMatchObject([{ start: 270, end: 360, fill: tagPaint(CF, p).fill }]);
      expect(tagPaint(CF, p).fill).not.toBe("solid");
    }
    const own = single("monochrome", "nsgc2022", [{ ...CF, fill: "crosshatch" }]);
    expect(paint(own, "a").sectors).toMatchObject([{ fill: "crosshatch" }]);
    const both = family([CF, TS], "nsgc2022", "monochrome");
    expect(paint(both, "a").sectors[0]!.fill).not.toBe("solid");
    // Someone affected with no condition recorded is solid black: the condition keeps its hatch.
    const plain = family([CF], "nsgc2022", "monochrome");
    expect(paint(plain, "d").base).toBe("black");
    expect(paint(plain, "a").sectors[0]!.fill).toBe("diagonal");
  });

  it("every renderer and both keys draw it: canvas, app legend, export key, SVG, U-shape", () => {
    const p = single("monochrome");
    const a = byId(p, "a");
    const canvas = renderToStaticMarkup(<svg><SymbolShape individual={a} size={40} paint={symbolPaint(a, p)} clipId="k" /></svg>);
    expect(canvas).toContain(`<path d="${sectorPath(20, 20, 40, 0, 360)}" fill="#000000"`);
    const centred = `<path d="${sectorPath(0, 0, 40, 0, 360)}" fill="#000000"`;
    expect(renderSectorsSvg(a, p, 40, "x")).toContain(centred);
    expect(exportSvg(p)).toContain(centred);
    expect(exportUShapeSvg(p)).toContain(centred);
    // Keys: the condition's own row, a solid black whole swatch named for it; then its carriers, hatched.
    const key = renderExportKeySvg(p, 0, 0).markup;
    const row = key.find(m => m.includes(">Cystic fibrosis<"))!;
    expect(row).toMatch(/<path d="M \S+ \S+ A 16 16 0 1 1 [^"]+" fill="#000000"/);
    expect(key.find(m => m.includes(">Cystic fibrosis carrier<"))).toContain(`stroke="#000000"`);
    expect(key.some(m => m.includes(">Affected<"))).toBe(false);
    const legend = renderToStaticMarkup(<Legend pedigree={p} />);
    expect(legend).toContain(`<path d="${sectorPath(14, 14, 16, 0, 360)}" fill="#000000"`);
    expect(lintExport(p)).toEqual([]);
    expect(lintUShape(p)).toEqual([]);
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  });
});

describe("renderers (#115)", () => {
  const html = (p: Pedigree, id: string) =>
    renderToStaticMarkup(<svg><SymbolShape individual={byId(p, id)} size={40} paint={symbolPaint(byId(p, id), p)} clipId="k" /></svg>);

  it("canvas symbol: carrier sectors are marked, no dot in 2022, the dot in 2008", () => {
    const p22 = family(undefined, "nsgc2022"), p08 = family();
    expect(html(p22, "b")).toContain(`data-carrier-sector="cf"`);
    expect(html(p22, "e")).toContain(`data-carrier-sector="${PLAIN_CARRIER_TAG.id}"`);
    expect(html(p22, "e")).not.toContain(`r="6"`);
    expect(html(p08, "e")).toMatch(/<circle[^>]*fill="black"/);
    expect(html(p08, "e")).not.toContain("data-carrier-sector");
  });

  it("key rows: conditions and their carriers, plain flags not recorded", () => {
    const p = family(undefined, "nsgc2022");
    expect(keyTagRows(p).map(r => r.label)).toEqual(["Cystic fibrosis", "Cystic fibrosis carrier", "Tay-Sachs", "Tay-Sachs carrier"]);
    const st = statusKeyRows(p);
    expect(st).toMatchObject({
      affectedLabel: "Affected (condition not recorded)", carrierLabel: "Carrier (condition not recorded)", carrierHalf: true,
      coreLabel: "Affected, condition not recorded (black centre)",
    });
    expect(st.affected!.id).toBe("d");
    // One condition: plain labels.
    const one = family([CF], "nsgc2022");
    expect(statusKeyRows(one).carrierLabel).toBe("Carrier");
    // A condition with carriers only lists just the carrier row.
    const carriersOnly = { ...family(undefined, "nsgc2022"), individuals: [ind("z", { carrierTags: ["ts"] })] };
    expect(keyTagRows(carriersOnly).map(r => r.label)).toEqual(["Tay-Sachs carrier"]);
  });

  it("app legend lists the carrier rows and the plain rows", () => {
    const out = renderToStaticMarkup(<Legend pedigree={family(undefined, "nsgc2022")} />);
    expect(out).toContain(`data-legend-carrier-row="cf"`);
    expect(out).toContain("Cystic fibrosis carrier");
    expect(out).toContain("Carrier (condition not recorded)");
    expect(out).toContain(`data-carrier-sector="${PLAIN_CARRIER_TAG.id}"`);
    const old = renderToStaticMarkup(<Legend pedigree={family([])} />);
    expect(old).toContain(">Carrier<");
  });

  it("app legend marks a selected carrier's condition row", () => {
    const p = family(undefined, "nsgc2022");
    const out = renderToStaticMarkup(<Legend pedigree={p} individual={byId(p, "b")} onToggleTag={() => {}} />);
    expect(out).toContain(`data-carrier-of="cf"`);
  });

  for (const notation of ["nsgc2022", "nsgc2008"] as const) {
    for (const mono of [undefined, "monochrome" as const]) {
      it(`exports draw it and lint clean (${notation}${mono ? ", black and white" : ""})`, () => {
        const p = family(undefined, notation, mono);
        const svg = exportSvg(p);
        expect(svg).toContain("Cystic fibrosis carrier");
        expect(svg).toContain("Carrier (condition not recorded)");
        expect(lintExport(p)).toEqual([]);
        expect(lintUShape(p)).toEqual([]);
        expect(exportUShapeSvg(p)).toContain("Tay-Sachs carrier");
        expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
        const key = renderExportKeySvg(p, 0, 0).markup.join("");
        if (notation === "nsgc2008") expect(key).toMatch(/<circle[^>]*r="2.4" fill="black"/);
        else expect(key).toContain("legend-plain-carrier");
      });
    }
  }

  it("export: no white slash over a 2022 condition-affected stillbirth (white base)", () => {
    const p = family(undefined, "nsgc2022");
    byId(p, "a").lifeStatus = "stillbirth";
    expect(exportSvg(p)).not.toContain(`stroke="white" clip-path="url(#`);
  });
});

describe("data (#115)", () => {
  it("round-trips carrierTags through JSON and warns on an unknown id", () => {
    const p = family(undefined, "nsgc2022");
    const back = importJson(exportJson(p)).pedigree!;
    expect(byId(back, "gm").carrierTags).toEqual(["cf", "ts"]);
    const bad = JSON.parse(exportJson(p));
    bad.pedigree.individuals[0].carrierTags = ["nope"];
    expect(importJson(JSON.stringify(bad)).issues.some(i => i.path?.includes("carrierTags"))).toBe(true);
    bad.pedigree.individuals[0].carrierTags = "cf";
    expect(importJson(JSON.stringify(bad)).hasErrors).toBe(true);
  });

  it("CSV: carrier is any carrier, carrier_of names the conditions", () => {
    const [header, ...rows] = exportCsv(family()).split("\n");
    const cols = header!.split(",");
    const at = (row: string, col: string) => JSON.parse(`[${row}]`)[cols.indexOf(col)];
    expect(cols.at(-1)).toBe("carrier_of");
    expect(at(rows[1]!, "carrier_of")).toBe("Cystic fibrosis;Tay-Sachs");
    expect(at(rows[1]!, "carrier")).toBe("1");
    expect(at(rows[6]!, "carrier")).toBe("1");
    expect(at(rows[6]!, "carrier_of")).toBe("");
  });

  it("Affected only seeds carriers of a condition", () => {
    const p: Pedigree = { ...family(), individuals: [ind("x"), ind("y", { carrierTags: ["ts"] })], partnerships: [], parentOf: {} };
    expect([...affectedOnlySeeds(p)]).toEqual(["y"]);
  });

  it("batch status counts each condition's states", () => {
    const st = batchStatus(family(), ["a", "b", "c"]);
    expect(st.conditions.cf).toEqual({ affected: 1, carrier: 2, none: 0 });
    expect(st.conditions.ts).toEqual({ affected: 1, carrier: 0, none: 2 });
  });
});

describe("condition-not-recorded warning (#115)", () => {
  it("only with two or more conditions, one fix per condition", () => {
    const rule = (p: Pedigree) => findProblems(p).filter(x => x.rule === "condition-not-recorded");
    expect(rule(family([CF]))).toEqual([]);
    const probs = rule(family());
    expect(probs.map(x => x.individualId)).toEqual(["d", "e", "f", "g"]);
    const d = probs.find(x => x.individualId === "d")!;
    expect(d.field).toBe("conditions");
    expect([d.fix!.label, ...d.moreFixes!.map(f => f.label)]).toEqual(["Record as Cystic fibrosis", "Record as Tay-Sachs"]);
    const e = probs.find(x => x.individualId === "e")!;
    expect(e.moreFixes![0]!.label).toBe("Record as Tay-Sachs carrier");
  });

  it("the fix records the condition and clears the warning", () => {
    usePedigreeStore.getState().initialize(family());
    const problems = () => findProblems(usePedigreeStore.getState().pedigree).filter(x => x.rule === "condition-not-recorded");
    problems().find(x => x.individualId === "e")!.moreFixes![0]!.apply(usePedigreeStore.getState());
    const e = usePedigreeStore.getState().pedigree.individuals.find(i => i.id === "e")!;
    expect(e).toMatchObject({ carrier: false, carrierTags: ["ts"] });
    problems().find(x => x.individualId === "d")!.fix!.apply(usePedigreeStore.getState());
    expect(problems().map(x => x.individualId)).toEqual(["f", "g"]);
  });
});

describe("trait quadrants (#118)", () => {
  const COHORT: Tag = { id: "cohort", label: "Cohort", color: "#2ca02c", style: "quadrant", kind: "trait" };
  /** One condition (CF) and one trait: x has the trait only, y the trait and the plain flag. */
  function withTrait(notation: NotationEdition = "nsgc2022", tagFills?: "monochrome"): Pedigree {
    const p = family([CF, COHORT], notation, tagFills);
    p.individuals.push(ind("x", { tags: ["cohort"], sibOrder: 7 }), ind("y", { affected: true, tags: ["cohort"], sibOrder: 8 }));
    p.parentOf.p!.push("x", "y");
    return p;
  }

  it("is not a condition: modes, affected, PED and CSV, the Affected only filter", () => {
    const p = withTrait();
    expect(conditionMode(p)).toBe("single");
    expect(isAffected(byId(p, "x"), p)).toBe(false);
    expect(affectedOnlySeeds(p).has("x")).toBe(false);
    // PED rows follow the individuals; the sixth column is affection (1 unaffected).
    const rows = exportPed(p).split("\n").filter(l => l.trim() && !l.startsWith("#"));
    const row = rows[rows.length - p.individuals.length + p.individuals.findIndex(i => i.id === "x")]!;
    expect(row.split("\t")[5]).toBe("1");
    const csv = exportCsv(p).split("\n");
    const col = csv[0]!.split(",").indexOf("affected");
    expect(csv.find(l => l.split(",")[1] === '"x"')!.split(",")[col]).toBe('"0"');
  });

  it("takes a section like a condition, and never the solid black of NSGC shading", () => {
    const p = withTrait();
    expect(sectionLayout(p)).toBe("halves");
    expect(symbolPaint(byId(p, "x"), p)).toMatchObject({ base: "white", core: false, sectors: [{ tag: COHORT }] });
    const alone = family([COHORT], "nsgc2022", "monochrome");
    alone.individuals.push(ind("x", { tags: ["cohort"] }));
    alone.parentOf.p!.push("x");
    expect(conditionPaint(COHORT, alone).fill).not.toBe("solid");
  });

  it("affected with a trait: black under its section, the black centre on top, no warning with one condition", () => {
    for (const notation of ["nsgc2022", "nsgc2008"] as const) {
      const p = withTrait(notation);
      expect(symbolPaint(byId(p, "y"), p), notation).toMatchObject({ base: "black", core: true });
      expect(findProblems(p).filter(x => x.individualId === "y" && x.rule === "condition-not-recorded")).toEqual([]);
    }
  });

  it("the store and the menus treat a trait as a plain tag", () => {
    usePedigreeStore.getState().initialize(withTrait());
    usePedigreeStore.getState().setIndividualTag("b", "cohort", true);
    const b = usePedigreeStore.getState().pedigree.individuals.find(i => i.id === "b")!;
    expect(b.tags).toEqual(["cohort"]);
    expect(b.carrierTags).toEqual(["cf"]);
    expect(batchStatus(usePedigreeStore.getState().pedigree, ["b"]).conditions).toEqual({ cf: { affected: 0, carrier: 1, none: 0 } });
  });

  it("survives JSON export and import; an unknown kind is reported", () => {
    const p = withTrait();
    expect(importJson(exportJson(p)).pedigree!.tags!.find(t => t.id === "cohort")!.kind).toBe("trait");
    const bad = JSON.parse(exportJson(p));
    bad.pedigree.tags[1].kind = "maybe";
    expect(importJson(JSON.stringify(bad)).issues.some(i => i.path.includes("kind"))).toBe(true);
  });
});

describe("store actions (#115)", () => {
  const get = () => usePedigreeStore.getState();
  const who = (id: string) => get().pedigree.individuals.find(i => i.id === id)!;
  beforeEach(() => get().initialize(family()));

  it("setConditionStatus is one undo step, and a no-op makes none", () => {
    get().setConditionStatus("d", "cf", "carrier");
    expect(who("d")).toMatchObject({ carrierTags: ["cf"], affected: true });
    expect(get().past).toHaveLength(1);
    get().setConditionStatus("d", "cf", "carrier");
    expect(get().past).toHaveLength(1);
    get().undo();
    expect(who("d").carrierTags).toBeUndefined();
  });

  it("setConditionStatusMany marks several in one step", () => {
    get().setConditionStatusMany(["a", "b", "d"], "ts", "carrier");
    expect(get().past).toHaveLength(1);
    for (const id of ["a", "b", "d"]) expect(who(id).carrierTags).toContain("ts");
    expect(get().notice?.text).toBe("Marked 3 carriers of Tay-Sachs.");
  });

  it("ticking a condition tag records affected; deleting a tag drops it from carrierTags", () => {
    get().setIndividualTag("b", "ts", true);
    expect(who("b")).toMatchObject({ affected: false, tags: ["ts"] });
    get().deleteTag("cf");
    expect(who("gm").carrierTags).toEqual(["ts"]);
    expect(who("gf").carrierTags).toBeUndefined();
  });

  it("with one condition, setAffected, setCarrier and the batch apply it", () => {
    get().initialize(family([CF]));
    get().setAffected("d", true);
    get().setCarrier("e", true);
    get().setAffectedMany(["b"], true);
    get().setCarrierStatusMany(["gf", "a"], "carrier");
    expect(who("b")).toMatchObject({ affected: false, tags: ["cf"] });
    expect(who("a")).toMatchObject({ carrierTags: ["cf"] });
    expect(who("a").tags).toBeUndefined();
    get().setPresymptomatic("a", true);
    expect(who("a").carrierTags).toBeUndefined();
  });
});

describe("every example in both notations and in black and white (#115)", () => {
  for (const ex of EXAMPLES) {
    for (const notation of ["nsgc2022", "nsgc2008"] as const) {
      it(`${ex.label}, ${notation}`, () => {
        for (const tagFills of ["color", "monochrome"] as const) {
          const p: Pedigree = { ...ex.data, canvasSettings: { ...ex.data.canvasSettings!, notation, tagFills } };
          expect(lintExport(p), "export").toEqual([]);
          expect(lintUShape(p), "u-shape").toEqual([]);
          expect(lintFlow(p, layoutToFlow(p)), "render").toEqual([]);
        }
      });
    }
  }
});
