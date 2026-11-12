import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { consanguinityTest, coupleConsanguinity } from "../consanguinity";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * gf = gm → son, dau; son = wife → gc1; hus = dau → gc2; gc1 = gc2 (first
 * cousins) → kid. wife and hus married in.
 */
function cousins(): Pedigree {
  return {
    individuals: [
      { id: "gf", sex: "male", affected: false, sibOrder: 0 },
      { id: "gm", sex: "female", affected: false, sibOrder: 1 },
      { id: "son", sex: "male", affected: false, sibOrder: 0 },
      { id: "dau", sex: "female", affected: false, sibOrder: 1 },
      { id: "wife", sex: "female", affected: false, sibOrder: 2 },
      { id: "hus", sex: "male", affected: false, sibOrder: 3 },
      { id: "gc1", sex: "male", affected: false, sibOrder: 0 },
      { id: "gc2", sex: "female", affected: false, sibOrder: 0 },
      { id: "kid", sex: "unknown", affected: false, sibOrder: 0 },
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm" },
      { id: "sw", individual1: "son", individual2: "wife" },
      { id: "hd", individual1: "hus", individual2: "dau" },
      { id: "cc", individual1: "gc1", individual2: "gc2" },
    ],
    parentOf: { g: ["son", "dau"], sw: ["gc1"], hd: ["gc2"], cc: ["kid"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

function withIndividual(p: Pedigree, id: string, patch: object): Pedigree {
  return { ...p, individuals: p.individuals.map(i => (i.id === id ? { ...i, ...patch } : i)) };
}
function withPartnership(p: Pedigree, id: string, patch: object): Pedigree {
  return { ...p, partnerships: p.partnerships.map(q => (q.id === id ? { ...q, ...patch } : q)) };
}

/** Which couples the canvas draws with a double line, as sorted "a-b" pairs. */
function doubleOnCanvas(p: Pedigree): string[] {
  const flow = layoutToFlow(p);
  expect(lintFlow(p, flow)).toEqual([]);
  const idOf = (nodeId: string) => flow.nodes.find(n => n.id === nodeId)!.data.individual.id;
  return flow.coupleEdges
    .filter(e => e.type === "consanguineousEdge")
    .map(e => [idOf(e.source), idOf(e.target)].sort().join("-"))
    .sort();
}

describe("consanguinityTest (#85)", () => {
  it("is double for a related couple with no flag stored, single for the rest", () => {
    const double = consanguinityTest(cousins());
    expect(double("gc1", "gc2")).toBe(true);
    expect(double("gc2", "gc1")).toBe(true);
    expect(double("gf", "gm")).toBe(false);
    expect(double("son", "wife")).toBe(false);
    expect(double("hus", "dau")).toBe(false);
  });

  it("follows blood, not the drawing: an adopted-in partner is not related", () => {
    const p = withIndividual(cousins(), "gc2", { adopted: "in" });
    expect(consanguinityTest(p)("gc1", "gc2")).toBe(false);
    // Adopted out keeps the biological parents, so the couple are still cousins.
    const out = withIndividual(cousins(), "gc2", { adopted: "out" });
    expect(consanguinityTest(out)("gc1", "gc2")).toBe(true);
  });

  it("an adopted-in parent breaks the link for their descendants too", () => {
    const p = withIndividual(cousins(), "dau", { adopted: "in" });
    expect(consanguinityTest(p)("gc1", "gc2")).toBe(false);
  });

  it("the stored flag is an override for a couple the pedigree does not relate", () => {
    const p = withPartnership(cousins(), "sw", { consanguineous: true });
    const double = consanguinityTest(p);
    expect(double("son", "wife")).toBe(true);
    expect(double("wife", "son")).toBe(true);
    expect(double("hus", "dau")).toBe(false);
    // And it holds an adopted-in partner's line double when the user says so.
    const adopted = withPartnership(withIndividual(cousins(), "gc2", { adopted: "in" }), "cc", { consanguineous: true });
    expect(consanguinityTest(adopted)("gc1", "gc2")).toBe(true);
  });

  it("a flag saved by an earlier version on a related couple changes nothing", () => {
    const p = withPartnership(cousins(), "cc", { consanguineous: true });
    expect(consanguinityTest(p)("gc1", "gc2")).toBe(true);
    expect(doubleOnCanvas(p)).toEqual(doubleOnCanvas(cousins()));
  });

  it("consanguineous: false is the same as no flag", () => {
    const p = withPartnership(cousins(), "cc", { consanguineous: false });
    expect(consanguinityTest(p)("gc1", "gc2")).toBe(true);
    const q = withPartnership(cousins(), "sw", { consanguineous: false });
    expect(consanguinityTest(q)("son", "wife")).toBe(false);
  });

  it("unknown ids and an empty pedigree are single", () => {
    expect(consanguinityTest(cousins())("gc1", "nobody")).toBe(false);
    const empty: Pedigree = { individuals: [], partnerships: [], parentOf: {}, siblingOrder: { mode: "insertion", affectedFirst: false } };
    expect(consanguinityTest(empty)("a", "b")).toBe(false);
  });
});

describe("coupleConsanguinity, what the override controls show (#92)", () => {
  it("is related and fixed for a couple the pedigree relates", () => {
    expect(coupleConsanguinity(cousins(), "cc")).toEqual({ related: true, flagged: false });
  });
  it("is unrelated and editable for a couple who married in, and reports the stored flag", () => {
    expect(coupleConsanguinity(cousins(), "sw")).toEqual({ related: false, flagged: false });
    const flagged = withPartnership(cousins(), "sw", { consanguineous: true });
    expect(coupleConsanguinity(flagged, "sw")).toEqual({ related: false, flagged: true });
  });
  it("is null for an unknown partnership", () => {
    expect(coupleConsanguinity(cousins(), "nope")).toBeNull();
  });
});

describe("the drawn line follows the test (#85)", () => {
  it("canvas", () => {
    expect(doubleOnCanvas(cousins())).toEqual(["gc1-gc2"]);
    expect(doubleOnCanvas(withIndividual(cousins(), "gc2", { adopted: "in" }))).toEqual([]);
    expect(doubleOnCanvas(withPartnership(cousins(), "sw", { consanguineous: true }))).toEqual(["gc1-gc2", "son-wife"]);
  });

  // A double line is two paths where a single line is one, so an export of
  // the same family with one more double line has one more path. The legend
  // gains its "Consanguineous couple" row with the first double line.
  const paths = (svg: string) => (svg.match(/<path /g) ?? []).length;
  const inLegend = (svg: string) => svg.includes("Consanguineous couple");
  const adopted = withIndividual(cousins(), "gc2", { adopted: "in" });
  const adoptedFlagged = withPartnership(adopted, "cc", { consanguineous: true });

  it("SVG export", () => {
    const related = exportSvg(cousins());
    expect(inLegend(related)).toBe(true);
    // Adopted in: the line is single and the legend row goes.
    expect(paths(related) - paths(exportSvg(adopted))).toBe(1);
    expect(inLegend(exportSvg(adopted))).toBe(false);
    // The override brings both back.
    expect(paths(exportSvg(adoptedFlagged))).toBe(paths(related));
    expect(inLegend(exportSvg(adoptedFlagged))).toBe(true);
    expect(paths(exportSvg(withPartnership(cousins(), "sw", { consanguineous: true }))) - paths(related)).toBe(1);
    // A redundant flag on a couple already related draws nothing extra.
    expect(paths(exportSvg(withPartnership(cousins(), "cc", { consanguineous: true })))).toBe(paths(related));
  });

  it("U-shape export", () => {
    const lines = (svg: string) => paths(svg) + (svg.match(/<line /g) ?? []).length;
    const related = lines(exportUShapeSvg(cousins()));
    expect(lines(exportUShapeSvg(withPartnership(cousins(), "cc", { consanguineous: true })))).toBe(related);
    // Adoption adds brackets, so compare the adopted family with itself:
    // unflagged it is single, and the override adds the second line.
    const single = exportUShapeSvg(adopted);
    const double = exportUShapeSvg(adoptedFlagged);
    expect(lines(double)).toBeGreaterThan(lines(single));
    expect(inLegend(single)).toBe(false);
    expect(inLegend(double)).toBe(true);
  });
});

describe("store (#85)", () => {
  const store = () => usePedigreeStore.getState();
  const ped = () => store().pedigree;
  const flag = (id: string) => ped().partnerships.find(p => p.id === id)!.consanguineous;
  beforeEach(() => {
    store().initialize(cousins());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("setPartnershipConsanguineous sets and removes the override, one undo step each", () => {
    store().setPartnershipConsanguineous("sw", true);
    expect(flag("sw")).toBe(true);
    expect(store().past).toHaveLength(1);
    expect(doubleOnCanvas(ped())).toEqual(["gc1-gc2", "son-wife"]);
    store().setPartnershipConsanguineous("sw", false);
    expect("consanguineous" in ped().partnerships.find(p => p.id === "sw")!).toBe(false);
    expect(doubleOnCanvas(ped())).toEqual(["gc1-gc2"]);
    store().undo();
    expect(flag("sw")).toBe(true);
    store().undo();
    expect(ped()).toEqual(cousins());
  });

  it("is a no-op when nothing would change or the couple is unknown", () => {
    store().setPartnershipConsanguineous("sw", false);
    store().setPartnershipConsanguineous("nope", true);
    expect(store().past).toHaveLength(0);
    store().setPartnershipConsanguineous("sw", true);
    store().setPartnershipConsanguineous("sw", true);
    expect(store().past).toHaveLength(1);
  });

  it("the line follows later edits: adoption turns a cousin couple single, and back", () => {
    expect(doubleOnCanvas(ped())).toEqual(["gc1-gc2"]);
    store().setAdopted("gc2", "in");
    expect(doubleOnCanvas(ped())).toEqual([]);
    store().setAdopted("gc2", undefined);
    expect(doubleOnCanvas(ped())).toEqual(["gc1-gc2"]);
  });

  it("re-parenting a partner away from the family turns the line single", () => {
    // gc2 becomes the child of wife alone (a new placeholder father), so gc1
    // and gc2 are now half siblings through wife: still related.
    store().setParents("gc2", ["wife"]);
    expect(consanguinityTest(ped())("gc1", "gc2")).toBe(true);
    // Removing the grandparents' link instead: dau adopted in.
    store().initialize(cousins());
    store().setAdopted("dau", "in");
    expect(doubleOnCanvas(ped())).toEqual([]);
  });

  it("linking and unlinking relatives stores nothing", () => {
    store().initialize({ ...cousins(), partnerships: cousins().partnerships.filter(p => p.id !== "cc"), parentOf: { g: ["son", "dau"], sw: ["gc1"], hd: ["gc2"] }, individuals: cousins().individuals.filter(i => i.id !== "kid") });
    expect(store().linkPartner("gc1", "gc2")).toBeNull();
    expect(ped().partnerships.every(p => p.consanguineous === undefined)).toBe(true);
    expect(doubleOnCanvas(ped())).toEqual(["gc1-gc2"]);
  });
});
