import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../data/examples";
import { importPed } from "../../io/ped";
import { lintExport } from "../../io/svg/exportLint";
import { duplicateArcD, duplicateArcPoints, pathPoints } from "../couplePath";
import { arcCollisions, chooseArcRoute } from "../duplicateArc";
import { layoutToFlow } from "../layoutToFlow";
import type { FlowData } from "../layoutToFlow";
import { lintFlow } from "../renderLint";

const HALF = 20, SLOT = 80, BULGE = 28;
const arcCodes = (p: Pedigree, flow: FlowData) => lintFlow(p, flow).filter(f => f.code.startsWith("arc-")).map(f => `${f.code} ${f.individuals[1]}`);
/** The flow with every arc drawn as the usual curve. */
const unrouted = (flow: FlowData): FlowData =>
  ({ ...flow, duplicateEdges: flow.duplicateEdges.map(e => ({ ...e, data: { bulge: e.data!.bulge } })) });
const example = (label: string) => EXAMPLES.find(e => e.label === label)!.data;

describe("pathPoints", () => {
  it("follows M, L and Q", () => {
    expect(pathPoints("M 0 0 L 10 0 Q 20 0 20 10", 2)).toEqual([[0, 0], [10, 0], [17.5, 2.5], [20, 10]]);
  });

  it("gives the usual curve's ends and the routed arc's corners", () => {
    const usual = duplicateArcPoints(0, 0, 240, 120, BULGE, HALF);
    expect(usual[0]).toEqual([HALF, 0]);
    expect(usual.at(-1)).toEqual([240, 120 - HALF]);
    const routed = duplicateArcPoints(0, 0, 240, 120, BULGE, HALF, 12, SLOT / 2);
    expect(routed[0]).toEqual([HALF, 0]);
    expect(routed.at(-1)).toEqual([240, 120 - HALF]);
    // Down the gap beside the upper copy, then along above the lower row.
    expect(routed.some(([x, y]) => x === SLOT / 2 && y > HALF && y < 120 - HALF - BULGE)).toBe(true);
    expect(routed.filter(([, y]) => y === 120 - HALF - BULGE).length).toBeGreaterThan(1);
    expect(Math.max(...routed.map(([, y]) => y))).toBe(120 - HALF);
  });
});

describe("duplicateArcD with a leg", () => {
  it("ignores the leg for copies on one row", () => {
    expect(duplicateArcD(0, 0, 240, 0, BULGE, HALF, 40)).toBe(duplicateArcD(0, 0, 240, 0, BULGE, HALF));
  });

  it("goes straight down when the lower copy is under the leg", () => {
    expect(duplicateArcD(0, 0, 40, 120, BULGE, HALF, 40)).toBe("M 20 0 L 30 0 Q 40 0 40 10 L 40 100");
  });

  it("leaves from the side the leg is on, whichever copy is given first", () => {
    expect(duplicateArcD(240, 120, 0, 0, BULGE, HALF, -40)).toMatch(/^M -20 0 L -30 0 Q -40 0 -40 10 /);
  });
});

describe("chooseArcRoute", () => {
  const a = { x: 0, y: 0 }, b = { x: 240, y: 120 };
  const person = (id: string, x: number, y: number) => ({ id, x, y, text: null });

  it("keeps the usual curve when it passes through nobody", () => {
    expect(chooseArcRoute(a, b, BULGE, HALF, SLOT, [person("far", 400, 0)], [])).toBeUndefined();
    expect(chooseArcRoute(a, { x: 240, y: 0 }, BULGE, HALF, SLOT, [person("between", 80, 0)], [])).toBeUndefined();
  });

  it("flattens an arc on one row to pass under text hanging from the row above", () => {
    const text = { x: 120, halfWidth: 30, top: -100, bottom: -HALF - 12 };
    expect(chooseArcRoute(a, { x: 240, y: 0 }, 15.4, HALF, SLOT, [{ id: "above", x: 120, y: -120, text }], [])).toEqual({ bulge: 15.4 - 7 });
  });

  it("goes down the gap facing the lower copy when someone is between the copies", () => {
    expect(chooseArcRoute(a, b, BULGE, HALF, SLOT, [person("between", 80, 0)], [])).toEqual({ legDx: 40, bulge: BULGE });
    expect(chooseArcRoute(b, { x: 480, y: 0 }, BULGE, HALF, SLOT, [person("between", 400, 0)], [])).toEqual({ legDx: -40, bulge: BULGE });
  });

  it("goes round the far side when a couple line leaves the facing side", () => {
    expect(chooseArcRoute(a, b, BULGE, HALF, SLOT, [person("partner", 80, 0)], [[0, 0, 80, 0]])?.legDx).toBe(-40);
  });

  it("runs clear of a sibship bar at the usual height, and of another routed arc", () => {
    const bar: [number, number, number, number] = [0, 120 - HALF - BULGE, 400, 120 - HALF - BULGE];
    expect(chooseArcRoute(a, b, BULGE, HALF, SLOT, [person("between", 80, 0)], [bar])).toEqual({ legDx: 40, bulge: BULGE - 7 });
    // Crossing a line costs nothing: a drop from that bar does not move the route.
    expect(chooseArcRoute(a, b, BULGE, HALF, SLOT, [person("between", 80, 0)], [[160, 60, 160, 100]])).toEqual({ legDx: 40, bulge: BULGE });
    expect(chooseArcRoute(a, b, BULGE, HALF, SLOT, [person("between", 80, 0)], [], [BULGE])).toEqual({ legDx: 40, bulge: BULGE - 7 });
  });

  it("counts a symbol from inside its box and text from its box", () => {
    // An arc on one row, 30px above the symbol tops at y = 0.
    const pts: [number, number][] = [[0, 0], [0, -30], [100, -30], [100, 0]];
    const text = { x: 50, halfWidth: 10, top: -60, bottom: -25 };
    const at = (o: Partial<typeof text>) => arcCollisions(pts, [{ id: "s", x: 500, y: 500, text: { ...text, ...o } }], HALF).labels;
    expect(arcCollisions(pts, [{ id: "s", x: 50, y: -30, text: null }], HALF).symbols).toEqual(["s"]);
    expect(arcCollisions(pts, [{ id: "s", x: 50, y: -30 - HALF, text: null }], HALF).symbols).toEqual([]);
    expect(at({})).toEqual(["s"]);
    expect(at({ bottom: -30 })).toEqual([]);
    // Text hanging to the symbol tops leaves no room for any arc, so it is not counted.
    expect(at({ bottom: -5 })).toEqual([]);
  });
});

describe("dashed arcs keep off other people (#192)", () => {
  it("House Targaryen: Daemon's arc is routed, and as a plain curve it would run through his brother, Alicent and Viserys I", () => {
    const p = example("House Targaryen");
    for (const compact of [false, true]) {
      const flow = layoutToFlow(p, { compact });
      expect(flow.duplicateEdges.filter(e => e.data?.legDx !== undefined).map(e => e.id)).toEqual(["duplicate-Daemon-0"]);
      expect(arcCodes(p, flow)).toEqual([]);
      expect(arcCodes(p, unrouted(flow))).toEqual(expect.arrayContaining(["arc-through-symbol Aegon_Baelon", "arc-through-symbol Alicent_Hightower", "arc-through-label Viserys_I"]));
    }
  });

  it("Spanish Habsburgs: Philip IV's arc goes down between the labels beside him", () => {
    const p = example("Spanish Habsburgs");
    const flow = layoutToFlow(p);
    expect(flow.duplicateEdges.filter(e => e.data?.legDx !== undefined).map(e => e.id)).toEqual(["duplicate-Philip_IV-0"]);
    expect(arcCodes(p, flow)).toEqual([]);
    expect(arcCodes(p, unrouted(flow))).toEqual(["arc-through-label Maria_Anna_of_Austria"]);
  });

  it("the kinship2 sample: two routed arcs ending on one row run at different heights", () => {
    const file = path.resolve(__dirname, "../../../../test-data/ped/large/kinship2_sample.ped");
    const p = importPed(fs.readFileSync(file, "utf8")).pedigrees[0]!.pedigree;
    for (const compact of [false, true]) {
      const flow = layoutToFlow(p, { compact });
      const routed = flow.duplicateEdges.filter(e => e.data?.legDx !== undefined);
      expect(routed.length).toBe(2);
      expect(new Set(routed.map(e => e.data!.bulge)).size).toBe(2);
      expect(arcCodes(p, flow)).toEqual([]);
      expect(arcCodes(p, unrouted(flow)).filter(c => c.startsWith("arc-through-symbol")).length).toBeGreaterThan(8);
      expect(lintExport(p, { compact }).filter(f => f.code.startsWith("arc-"))).toEqual([]);
    }
  });

  it("an arc that passes through nobody is left as the usual curve", () => {
    for (const ex of EXAMPLES.filter(e => !["House Targaryen", "Spanish Habsburgs"].includes(e.label))) {
      expect(layoutToFlow(ex.data).duplicateEdges.filter(e => e.data?.legDx !== undefined).map(e => `${ex.label} ${e.id}`)).toEqual([]);
    }
  });
});
