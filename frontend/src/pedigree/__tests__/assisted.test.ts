import { describe, it, expect, beforeEach } from "vitest";
import { produce } from "immer";
import { kinshipCoefficients, placementParentOf } from "@pedigree-editor/layout-engine";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import {
  assistedLinks, applyAddDonor, addDonorProblem, applyAddSurrogate, addSurrogateProblem,
  assistedLinkSegment, donorDescentSegments, symbolExitPoint,
} from "../assisted";
import { layoutToFlow } from "../layoutToFlow";
import { sibshipSegments } from "../sibshipPath";
import { lintFlow } from "../renderLint";
import { nameRelationship } from "../relationship";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport, lintExportSvg } from "../../io/svg/exportLint";
import { renderExportKeySvg } from "../tags";
import { exportPed, pedLostAssisted } from "../../io/ped/exporter";
import { exportCsv } from "../../io/csv/exporter";
import { importJson, exportJson } from "../../io/json";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { EXAMPLES } from "../../data/examples";

const base = { siblingOrder: { mode: "insertion" as const, affectedFirst: false } };

/** A couple (h, w) with two children; w's parents gf and gm. */
function family(): Pedigree {
  return {
    ...base,
    individuals: [
      { id: "gf", sex: "male",   affected: false, sibOrder: 0 },
      { id: "gm", sex: "female", affected: false, sibOrder: 0 },
      { id: "h",  sex: "male",   affected: false, sibOrder: 0, name: "Harry" },
      { id: "w",  sex: "female", affected: false, sibOrder: 0, name: "Wendy" },
      { id: "c1", sex: "female", affected: true,  sibOrder: 0 },
      { id: "c2", sex: "male",   affected: false, sibOrder: 1 },
    ],
    partnerships: [
      { id: "g",  individual1: "gf", individual2: "gm" },
      { id: "hw", individual1: "h",  individual2: "w", twins: [{ members: ["c1", "c2"], zygosity: "dizygotic" }] },
    ],
    parentOf: { g: ["w"], hw: ["c1", "c2"] },
  };
}

const assisted = () => EXAMPLES.find(e => e.label === "Assisted reproduction")!.data;
const parentsOf = (p: Pedigree, id: string) => {
  const q = p.partnerships.find(x => (p.parentOf[x.id] ?? []).includes(id));
  return q ? [q.individual1, q.individual2].sort() : [];
};

describe("assisted reproduction: editing (#45)", () => {
  it("a sperm donor becomes the genetic father; the intended father a social parent", () => {
    const p = produce(family(), d => { applyAddDonor(d, "c1", "sperm", "d", "wd"); });
    const donor = p.individuals.find(i => i.id === "d")!;
    expect(donor).toMatchObject({ sex: "male", reproductiveRole: "donor" });
    expect(p.partnerships.find(x => x.id === "wd")).toMatchObject({ individual1: "d", individual2: "w", donorConception: true });
    expect(parentsOf(p, "c1")).toEqual(["d", "w"]);
    expect(parentsOf(p, "c2")).toEqual(["h", "w"]);
    expect(p.individuals.find(i => i.id === "c1")!.socialParents).toEqual(["h"]);
    // c1 left the twin set with c2, which needs two members.
    expect(p.partnerships.find(x => x.id === "hw")!.twins).toBeUndefined();

    const k = kinshipCoefficients(p);
    expect(k.kinship("d", "c1")).toBe(1 / 4);
    expect(k.kinship("h", "c1")).toBe(0);
    expect(k.kinship("gm", "c1")).toBe(1 / 8);
    expect(k.kinship("c1", "c2")).toBe(1 / 8); // half siblings now
    expect(nameRelationship(p, "c1", "c2", 1 / 8)?.term).toMatch(/half/i);
    expect(nameRelationship(p, "d", "c1", 1 / 4)?.term).toBe("father");
    expect(nameRelationship(p, "h", "c1", 0)).toBeNull();
  });

  it("an egg donor becomes the genetic mother; the mother carried the pregnancy", () => {
    const p = produce(family(), d => { applyAddDonor(d, "c2", "egg", "d", "hd"); });
    expect(parentsOf(p, "c2")).toEqual(["d", "h"]);
    const c2 = p.individuals.find(i => i.id === "c2")!;
    expect(c2.carriedBy).toBe("w");
    expect(c2.socialParents).toBeUndefined();
    expect(kinshipCoefficients(p).kinship("w", "c2")).toBe(0);
    expect(kinshipCoefficients(p, { chromosome: "X" }).kinship("d", "c2")).toBe(1 / 2);
    // NSGC Fig. 3 scenario 2: the child hangs from the couple (the father and
    // the woman carrying it); the donor has her own line.
    expect(placementParentOf(p).hw).toEqual(["c1", "c2"]);
    expect(placementParentOf(p).hd).toEqual([]);
    expect(assistedLinks(p)).toEqual([{ from: "d", child: "c2", kind: "genetic" }]);
  });

  it("both donors (embryo donation): the empty donor pair goes, the couple keep their lines", () => {
    let p = produce(family(), d => { applyAddDonor(d, "c1", "sperm", "d1", "wd1"); });
    p = produce(p, d => { applyAddDonor(d, "c1", "egg", "d2", "dd"); });
    expect(parentsOf(p, "c1")).toEqual(["d1", "d2"]);
    expect(p.partnerships.some(x => x.id === "wd1")).toBe(false);
    expect(p.parentOf.wd1).toBeUndefined();
    const c1 = p.individuals.find(i => i.id === "c1")!;
    expect(c1.carriedBy).toBe("w");
    expect(c1.socialParents).toEqual(["h"]);
    expect(kinshipCoefficients(p).kinship("w", "c1")).toBe(0);
  });

  it("refuses a donor without parents, or in place of a donor", () => {
    expect(addDonorProblem(family(), "h", "sperm")).toMatch(/parents first/);
    const p = produce(family(), d => { applyAddDonor(d, "c1", "sperm", "d", "wd"); });
    expect(addDonorProblem(p, "c1", "sperm")).toMatch(/already a donor/);
    expect(addDonorProblem(p, "c1", "egg")).toBeNull();
  });

  it("an existing person can be the donor and the surrogate (#104, NSGC Fig. 3: the wife's sister)", () => {
    const withSister = produce(family(), d => {
      d.individuals.push({ id: "sis", sex: "female", affected: false, sibOrder: 1, name: "Sue" });
      d.parentOf.g!.push("sis");
    });
    expect(addDonorProblem(withSister, "c1", "egg", "h")).toMatch(/already a genetic parent/);
    expect(addDonorProblem(withSister, "c1", "sperm", "sis")).toMatch(/cannot be female/);
    expect(addDonorProblem(withSister, "c1", "egg", "gm")).toBeNull();
    expect(addDonorProblem(withSister, "c1", "egg", "c2")).toMatch(/An egg donor cannot be male/);
    let p = produce(withSister, d => { applyAddDonor(d, "c1", "egg", "sis", "hs"); });
    expect(p.individuals.length).toBe(withSister.individuals.length);
    expect(parentsOf(p, "c1")).toEqual(["h", "sis"]);
    expect(p.individuals.find(i => i.id === "sis")).toMatchObject({ name: "Sue", reproductiveRole: "donor" });
    expect(p.individuals.find(i => i.id === "c1")!.carriedBy).toBe("w");
    // The same donor for the second child: one donor pair, so c1 and c2 stay full siblings.
    p = produce(p, d => { applyAddDonor(d, "c2", "egg", "sis", "hs2"); });
    expect(p.partnerships.filter(x => x.donorConception).length).toBe(1);
    expect(p.parentOf.hs).toEqual(["c1", "c2"]);
    expect(kinshipCoefficients(p).kinship("c1", "c2")).toBe(0.25);
    // She also carried c1: she is drawn as the donor only, and Wendy becomes a social parent.
    expect(addSurrogateProblem(p, "c1", "sis")).toBeNull();
    p = produce(p, d => { applyAddSurrogate(d, "c1", "sis"); });
    const c1 = p.individuals.find(i => i.id === "c1")!;
    expect(c1.carriedBy).toBe("sis");
    expect(c1.socialParents).toEqual(["w"]);
    expect(p.individuals.find(i => i.id === "sis")!.reproductiveRole).toBe("donor");
    // Wendy is linked by her couple line to Harry, the genetic father (NSGC Fig. 3 scenario 4b).
    expect(assistedLinks(p).filter(l => l.child === "c1")).toEqual([]);
  });

  it("an existing woman as surrogate; refusals", () => {
    const p0 = family();
    expect(addSurrogateProblem(p0, "c1", "h")).toMatch(/male/);
    expect(addSurrogateProblem(p0, "c1", "w")).toMatch(/genetic mother/);
    const p = produce(p0, d => { applyAddSurrogate(d, "c1", "gm"); });
    expect(p.individuals.length).toBe(p0.individuals.length);
    expect(p.individuals.find(i => i.id === "c1")!.carriedBy).toBe("gm");
    expect(p.individuals.find(i => i.id === "gm")!.reproductiveRole).toBe("surrogate");
  });

  it("a surrogate carries the child; a previous carrier becomes a social parent", () => {
    let p = produce(family(), d => { applyAddDonor(d, "c2", "egg", "d", "hd"); });
    p = produce(p, d => { applyAddSurrogate(d, "c2", "s"); });
    const c2 = p.individuals.find(i => i.id === "c2")!;
    expect(c2.carriedBy).toBe("s");
    expect(c2.socialParents).toEqual(["w"]);
    expect(p.individuals.find(i => i.id === "s")).toMatchObject({ sex: "female", reproductiveRole: "surrogate" });
    expect(addSurrogateProblem(p, "c2")).toMatch(/already/);
    expect(kinshipCoefficients(p).kinship("s", "c2")).toBe(0);
  });

  it("a carrier or social parent who is a genetic parent gets no extra line", () => {
    const p = produce(family(), d => {
      const c1 = d.individuals.find(i => i.id === "c1")!;
      c1.carriedBy = "w";               // the genetic mother: a donor who carried
      c1.socialParents = ["h", "gm"];   // h is the genetic father
    });
    expect(assistedLinks(p)).toEqual([{ from: "gm", child: "c1", kind: "social" }]);
  });
});

describe("assisted reproduction: store and removal (#45)", () => {
  beforeEach(() => usePedigreeStore.getState().initialize(family()));

  it("addDonor and addSurrogate are undoable", () => {
    const s = usePedigreeStore.getState();
    expect(s.addDonor("c1", "sperm")).toBeNull();
    expect(s.addSurrogate("c1")).toBeNull();
    const p = usePedigreeStore.getState().pedigree;
    expect(p.individuals.filter(i => i.reproductiveRole)).toHaveLength(2);
    usePedigreeStore.getState().undo();
    usePedigreeStore.getState().undo();
    expect(usePedigreeStore.getState().pedigree.individuals).toHaveLength(6);
  });

  it("deleting the surrogate or a social parent clears the child's link", () => {
    usePedigreeStore.getState().addSurrogate("c1");
    const s = usePedigreeStore.getState().pedigree.individuals.find(i => i.reproductiveRole === "surrogate")!;
    usePedigreeStore.getState().setSocialParents("c1", ["gf"]);
    usePedigreeStore.getState().deleteIndividual(s.id);
    usePedigreeStore.getState().removeWithAncestors(["gf"]);
    const c1 = usePedigreeStore.getState().pedigree.individuals.find(i => i.id === "c1")!;
    expect(c1.carriedBy).toBeUndefined();
    expect(c1.socialParents).toBeUndefined();
  });
});

describe("assisted reproduction: drawing (#45)", () => {
  it("lines leave a symbol's lower corner when the target is off to the side", () => {
    expect(symbolExitPoint({ x: 0, y: 0, sex: "male" }, 100)).toEqual([20, 20]);
    expect(symbolExitPoint({ x: 0, y: 0, sex: "male" }, 5)).toEqual([0, 20]);
    expect(symbolExitPoint({ x: 0, y: 0, sex: "unknown" }, -100)).toEqual([-19, 0]);
    expect(assistedLinkSegment({ x: 0, y: 0 }, { x: 0, y: 120 })).toEqual([0, 20, 0, 100]);
    expect(donorDescentSegments([{ x: 0, y: 0, sex: "male" }, { x: 80, y: 0, sex: "male" }], 40, 60))
      .toEqual([[20, 20, 40, 60], [60, 20, 40, 60]]);
    // A donor pair's only child (converge): a line from each parent straight to
    // the top of the child, no bar (NSGC Fig. 3); the mother above it, vertical.
    const parents = [{ x: 0, y: 0, sex: "male" as const }, { x: 80, y: 0, sex: "female" as const }];
    expect(sibshipSegments(40, 0, 0, [{ x: 80, y: 120 }], 0, parents, true))
      .toEqual([[20, 20, 80, 100], [80, 20, 80, 100]]);
    expect(sibshipSegments(40, 0, 0, [{ x: 80, y: 120 }, { x: 160, y: 120 }], 0, parents, true)).toHaveLength(5);
  });

  it("the canvas: no couple line between donor and parent, a line from each, and the extra lines", () => {
    const p = assisted();
    const flow = layoutToFlow(p);
    const ind = (nodeId: string) => flow.nodes.find(n => n.id === nodeId)!.data.individual.id;
    const couples = flow.coupleEdges.map(e => [ind(e.source), ind(e.target)].sort().join("="));
    expect(couples).not.toContain("ar_d1=ar_w1");
    expect(couples).not.toContain("ar_d2=ar_h2");
    expect(couples).toContain("ar_h1=ar_w1");
    const apart = flow.sibshipEdges.filter(e => e.data?.apart).map(e => e.data!.childIds.map(ind).join());
    expect(apart.sort()).toEqual(["ar_c1", "ar_c4", "ar_c5"]);
    expect(flow.sibshipEdges.filter(e => e.data?.converge).map(e => e.data!.childIds.map(ind).join()).sort()).toEqual(["ar_c1", "ar_c4", "ar_c5"]);
    expect(couples).toContain("ar_m5=ar_p5"); // the female couple (#105)
    // Scenario 1: no line from the intended father; scenario 2: the child hangs
    // from the couple and the egg donor has her own line; scenario 4: none from the wife.
    const links = flow.assistedEdges.map(e => `${e.data!.kind}:${ind(e.source)}>${e.data!.children.join()}`).sort();
    expect(links).toEqual(["carrier:ar_s3>ar_c3", "genetic:ar_d2>ar_c2"]);
    const hangs = flow.sibshipEdges.map(e => `${ind(e.data!.leftParentId)}=${ind(e.data!.rightParentId)}>${e.data!.childIds.map(ind).join()}`);
    expect(hangs.find(h => h.endsWith(">ar_c2"))!.split(">")[0]!.split("=").sort()).toEqual(["ar_h2", "ar_w2"]);
    // The pregnancy sits below the woman carrying it (NSGC Fig. 3), or below
    // the couple when she is half of it.
    const at = (id: string) => flow.nodes.find(n => n.data.individual.id === id)!.position;
    expect(at("ar_c1").x).toBeCloseTo(at("ar_w1").x, 3);
    expect(at("ar_c2").x).toBeCloseTo((at("ar_h2").x + at("ar_w2").x) / 2, 3);
    expect(at("ar_c3").x).toBeCloseTo(at("ar_s3").x, 3);
    expect(at("ar_c4").x).toBeCloseTo(at("ar_d4").x, 3);
    expect(at("ar_c5").x).toBeCloseTo(at("ar_m5").x, 3); // NSGC 2022 Fig. 5 1b (#105)
    // A line runs straight down through the labels of those carrying women: white backing.
    expect(flow.nodes.filter(n => n.data.labelsBacked).map(n => n.data.individual.id).sort()).toEqual(["ar_d4", "ar_m5", "ar_s3", "ar_w1"]);
    // Kinship and PED still follow the genetic parents.
    const k = kinshipCoefficients(p);
    expect(k.kinship("ar_d2", "ar_c2")).toBe(1 / 4);
    expect(k.kinship("ar_w2", "ar_c2")).toBe(0);
    expect(k.kinship("ar_w4", "ar_c4")).toBe(0);
    expect(lintFlow(p, flow)).toEqual([]);
    // The lint notices a missing line.
    expect(lintFlow(p, { ...flow, assistedEdges: [] }).map(f => f.code)).toContain("assisted-not-drawn");
  });

  it("the SVG export draws the letters, the lines and the key, and lints clean", () => {
    const p = assisted();
    const svg = exportSvg(p);
    expect(svg).toMatch(/>D<\/text>/);
    expect(svg).toMatch(/>S<\/text>/);
    const group = svg.slice(svg.indexOf('<g class="assisted-lines">'), svg.indexOf('<g class="duplicate-arcs">'));
    expect(group.match(/<line /g)).toHaveLength(2);
    expect(group.match(/stroke-dasharray/g)).toBeNull();
    // The carrying women's labels get a white backing under the line.
    expect(svg.slice(svg.indexOf('<g class="labels">')).match(/<rect [^>]*fill="white"/g)?.length).toBeGreaterThan(0);
    expect(lintExport(p)).toEqual([]);
    expect(lintExport(p, { deidentify: true })).toEqual([]);
    // With the lines taken out, the export lint notices.
    const flow = layoutToFlow(p);
    const stripped = svg.replace(/<g class="assisted-lines">[^]*?<\/g>/, '<g class="assisted-lines"></g>');
    expect(lintExportSvg(p, flow, stripped).map(f => f.code)).toContain("assisted-not-drawn");
    const key = renderExportKeySvg(p, 0, 0).markup.join("");
    for (const text of ["Sperm or egg donor (D)", "Surrogate (S)", "Carried the pregnancy"]) expect(key).toContain(text);
    // No dashed line in the example any more (the intended parents are linked by their couple lines).
    expect(key).not.toContain("Not a genetic parent");
  });

  it("the U-shape export draws a donor family without the donor couple line", () => {
    const p = produce(family(), d => { applyAddDonor(d, "c1", "sperm", "d", "wd"); });
    const svg = exportUShapeSvg(p);
    expect(svg).toMatch(/>D<\/text>/);
    // The intended father is linked by his couple line to the mother (NSGC Fig. 3 scenario 1), not dashed.
    expect(svg).not.toMatch(/stroke-dasharray="5 3"/);
    const q = produce(p, d => { d.individuals.find(i => i.id === "c1")!.socialParents = ["gf"]; });
    expect(exportUShapeSvg(q)).toMatch(/stroke-dasharray="5 3"/); // a social parent with no such link
    expect(renderExportKeySvg(q, 0, 0).markup.join("")).toContain("Not a genetic parent");
  });
});

describe("assisted reproduction: files (#45)", () => {
  it("JSON keeps every field; dangling references are dropped with a warning", () => {
    const p = assisted();
    const back = importJson(exportJson(p)).pedigree!;
    expect(back.individuals.find(i => i.id === "ar_c1")!.socialParents).toEqual(["ar_h1"]);
    expect(back.individuals.find(i => i.id === "ar_c3")!.carriedBy).toBe("ar_s3");
    expect(back.individuals.find(i => i.id === "ar_d1")!.reproductiveRole).toBe("donor");
    expect(back.partnerships.find(x => x.id === "ar_pd1")!.donorConception).toBe(true);

    const bad = JSON.parse(exportJson(p));
    const pedigree = bad.pedigree ?? bad;
    pedigree.individuals.find((i: { id: string }) => i.id === "ar_c3").carriedBy = "nobody";
    const r = importJson(JSON.stringify(bad));
    expect(r.pedigree!.individuals.find(i => i.id === "ar_c3")!.carriedBy).toBeUndefined();
    expect(r.issues.some(i => /carriedBy 'nobody' dropped/.test(i.message))).toBe(true);

    pedigree.individuals.find((i: { id: string }) => i.id === "ar_d1").reproductiveRole = "father";
    expect(importJson(JSON.stringify(bad)).pedigree).toBeNull();
  });

  it("PED writes the donor as the genetic parent and warns about the rest; CSV has the columns", () => {
    const p = assisted();
    const rows = exportPed(p).trim().split("\n").map(l => l.split(/\s+/));
    const row = (id: string) => rows.find(r => r[1] === id)!;
    expect(row("ar_c1").slice(2, 4)).toEqual(["ar_d1", "ar_w1"]);
    expect(row("ar_c2").slice(2, 4)).toEqual(["ar_h2", "ar_d2"]);
    expect(pedLostAssisted(p).map(i => i.id).sort()).toEqual(["ar_c1", "ar_c2", "ar_c3", "ar_c4", "ar_c5", "ar_d1", "ar_d2", "ar_d4", "ar_d5", "ar_s3"]);
    const [header, ...lines] = exportCsv(p).split("\n");
    const cols = header!.split(",");
    const c1 = lines.find(l => l.includes('"ar_c1"'))!.split(",");
    expect(c1[cols.indexOf("social_parent_ids")]).toBe('"ar_h1"');
    expect(c1[cols.indexOf("father_id")]).toBe('"ar_d1"');
  });
});
