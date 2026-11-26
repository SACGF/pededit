import { describe, it, expect } from "vitest";
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";
import { selectionLabel, selectionPedigree, selectionSubset } from "../selectionSubset";
import { branchPlaceholderId, collapseInfo, drawnPedigree, isBranchPlaceholderId } from "../collapse";
import { buildScene } from "../scene";
import { lintScene } from "../renderLint";
import { keyRows } from "../keyRows";
import { lintExport } from "../../io/svg/exportLint";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { exportCsv } from "../../io/csv/exporter";
import { EXAMPLES } from "../../data/examples";

type Spec = [id: string, sex: Individual["sex"], extra?: Partial<Individual>];

function build(people: Spec[], couples: Record<string, [string, string, string[]]>): Pedigree {
  return {
    individuals: people.map(([id, sex, extra], i) => ({ id, name: id.toUpperCase() + "name", sex, affected: false, sibOrder: i, ...extra })),
    partnerships: Object.entries(couples).map(([id, [a, b]]) => ({ id, individual1: a, individual2: b })),
    parentOf: Object.fromEntries(Object.entries(couples).map(([id, [, , kids]]) => [id, kids])),
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const sorted = (s: Iterable<string>) => [...s].sort();
const figure = (p: Pedigree, ids: string[]) => selectionPedigree(p, selectionSubset(p, ids));

/**
 * First cousins who marry:
 *   gf = gm
 *   ├ a = wa → c1, s1
 *   └ b = wb → c2, s2, s3
 *   c1 = c2 → x (affected), y, z
 *   gm has a brother u (parents ggf = ggm).
 */
function loop(): Pedigree {
  return build([
    ["ggf", "male"], ["ggm", "female"], ["u", "male"],
    ["gf", "male"], ["gm", "female"],
    ["a", "male"], ["wa", "female"], ["b", "female"], ["wb", "male"],
    ["c1", "male"], ["s1", "female"], ["c2", "female"], ["s2", "male"], ["s3", "female"],
    ["x", "male", { affected: true }], ["y", "female"], ["z", "female"],
  ], {
    gg: ["ggf", "ggm", ["gm", "u"]],
    g: ["gf", "gm", ["a", "b"]],
    pa: ["a", "wa", ["c1", "s1"]],
    pb: ["wb", "b", ["c2", "s2", "s3"]],
    cc: ["c1", "c2", ["x", "y", "z"]],
  });
}

describe("selectionSubset (#215)", () => {
  it("adds both parents of selected children who have nothing else to join them", () => {
    const s = selectionSubset(loop(), ["s2", "s3"]);
    expect(s.joined).toBe(true);
    expect(s.selected).toEqual(["s2", "s3"]);
    expect(sorted(s.added)).toEqual(["b", "wb"]);
    expect(selectionLabel(s)).toBe("Only the 2 selected people (+2 to connect them)");
  });

  it("adds the other parent when a child and one parent are selected", () => {
    const s = selectionSubset(loop(), ["a", "c1"]);
    expect(s.added).toEqual(["wa"]);
  });

  it("adds nobody to a couple and their children, and leaves the other children out", () => {
    const s = selectionSubset(loop(), ["c1", "c2", "x"]);
    expect(s.added).toEqual([]);
    expect(selectionLabel(s)).toBe("Only the 3 selected people");
    const drawn = selectionPedigree(loop(), s);
    expect(sorted(drawn.individuals.map(i => i.id))).toEqual(["c1", "c2", "x"]);
    expect(drawn.parentOf.cc).toEqual(["x"]);
    expect(collapseInfo(drawn).placeholders.size).toBe(0);
  });

  it("joins cousins through their parents and the grandparents they share", () => {
    const s = selectionSubset(loop(), ["s1", "s2"]);
    expect(sorted(s.added)).toEqual(["a", "b", "gf", "gm", "wa", "wb"]);
  });

  it("takes the shorter way across a consanguineous loop", () => {
    // s1 and s3 are cousins (six people to add) and in-laws through c1 = c2 (four).
    const s = selectionSubset(loop(), ["s1", "s3", "c1", "c2"]);
    expect(sorted(s.added)).toEqual(["a", "b", "wa", "wb"]);
    expect(s.joined).toBe(true);
  });

  it("keeps the double line of a related couple whose common ancestors are left out", () => {
    const drawn = figure(loop(), ["c1", "c2", "x", "y"]);
    expect(drawn.individuals).toHaveLength(4);
    expect(buildScene(drawn).couples.filter(e => e.double)).toHaveLength(1);
    expect(lintExport(drawn, {})).toEqual([]);
    expect(lintScene(drawn, buildScene(drawn))).toEqual([]);
  });

  it("says so when the selected people cannot be joined", () => {
    const p = loop();
    p.individuals.push({ id: "q1", sex: "male", affected: false, sibOrder: 0 }, { id: "q2", sex: "female", affected: false, sibOrder: 1 });
    p.partnerships.push({ id: "qq", individual1: "q1", individual2: "q2" });
    const s = selectionSubset(p, ["x", "q1"]);
    expect(s.joined).toBe(false);
    expect(s.selected).toEqual(["x", "q1"]);
  });

  it("counts only selected people who are drawn", () => {
    const p = loop();
    p.individuals.find(i => i.id === "c1")!.descendantsHidden = true;
    // y and z are behind the group symbol; a stale selection of them counts for nothing.
    const s = selectionSubset(p, ["c1", "c2", "y", "nobody"]);
    expect(s.selected).toEqual(["c1", "c2"]);
    expect(s.added).toEqual([]);
  });

  it("keeps a selected group symbol as a group symbol, with its parents", () => {
    const p = loop();
    p.individuals.find(i => i.id === "c1")!.descendantsHidden = true;
    const group = branchPlaceholderId("cc");
    const s = selectionSubset(p, ["x", group]);
    expect(s.selected).toEqual(["x"]);
    expect(sorted(s.added)).toEqual(["c1", "c2"]);
    const drawn = selectionPedigree(p, s);
    expect(collapseInfo(drawn).placeholders.get(group)?.children).toEqual(["y", "z"]);
    expect(exportSvg(drawn, {})).toContain('data-branch-count=');
    // Without the group symbol selected, the figure has none and the key no row for it.
    const without = figure(p, ["c1", "c2", "x"]);
    expect(without.individuals.some(i => isBranchPlaceholderId(i.id))).toBe(false);
    expect(keyRows(without, "export").symbols.some(r => r.kind === "collapsedBranch")).toBe(false);
  });

  it("selects within what a view filter draws", () => {
    const p = { ...loop(), filters: { affectedOnly: true } };
    const s = selectionSubset(p, ["x", "a", "s1"]);
    expect(s.selected).toEqual(["x", "a"]);
    expect(sorted(s.added)).toEqual(["c1", "c2", "wa"]);
  });

  it("does not change the pedigree or what the canvas draws", () => {
    const p = loop();
    const before = JSON.stringify(p);
    const whole = drawnPedigree(p);
    figure(p, ["s2", "s3"]);
    expect(JSON.stringify(p)).toBe(before);
    expect(drawnPedigree(p)).toBe(whole);
    expect(exportCsv(p).trim().split("\n")).toHaveLength(p.individuals.length + 1);
  });
});

describe("a figure of the selected people (#215)", () => {
  it("draws only them in the SVG, de-identified and U-shape exports", () => {
    const drawn = figure(loop(), ["s2", "s3"]);
    const svg = exportSvg(drawn, {});
    for (const id of ["b", "wb", "s2", "s3"]) expect(svg).toContain(`${id.toUpperCase()}name`);
    for (const id of ["c2", "gf", "x", "a"]) expect(svg).not.toContain(`${id.toUpperCase()}name`);
    const anon = exportSvg(drawn, { deidentify: true });
    expect(anon).toContain(">II-2<");
    expect(anon).not.toContain(">III-1<");
    const u = exportUShapeSvg(drawn, {});
    expect(u).toContain("S3name");
    expect(u).not.toContain("GFname");
  });

  it("lists in the key only the conditions that appear in it", () => {
    const p = loop();
    p.tags = [
      { id: "t1", label: "Condition one", style: "quadrant", color: "#c00" },
      { id: "t2", label: "Condition two", style: "quadrant", color: "#00c" },
    ] as Pedigree["tags"];
    p.individuals.find(i => i.id === "x")!.tags = ["t1"];
    p.individuals.find(i => i.id === "s3")!.tags = ["t2"];
    const svg = exportSvg(figure(p, ["s2", "s3"]), {});
    expect(svg).toContain("Condition two");
    expect(svg).not.toContain("Condition one");
    expect(exportSvg(p, {})).toContain("Condition one");
  });

  it("draws someone once, with no dashed line, when the loop that drew them twice is cut", () => {
    const example = EXAMPLES.find(e => buildScene(e.data).duplicates.length > 0)!;
    const full = buildScene(example.data);
    const twice = full.duplicates[0]!;
    const id = full.people.find(n => n.id === twice.source)!.individual.id as string;
    // The person drawn twice with the family they were born into.
    const parents = example.data.partnerships.find(p => (example.data.parentOf[p.id] ?? []).includes(id))!;
    const drawn = figure(example.data, [id, parents.individual1, parents.individual2]);
    const flow = buildScene(drawn);
    expect(flow.duplicates).toEqual([]);
    expect(flow.people.filter(n => n.individual?.id === id)).toHaveLength(1);
    expect(exportSvg(drawn, {})).toContain('<g class="duplicate-arcs">\n</g>');
    expect(lintExport(drawn, {})).toEqual([]);
  });

  it("draws every example's middle generations without a lint finding", () => {
    for (const example of EXAMPLES) {
      const p = example.data;
      const ids = p.individuals.map(i => i.id).filter((_, i) => i % 3 !== 0);
      const s = selectionSubset(p, ids);
      if (!s.joined) continue;
      const drawn = selectionPedigree(p, s);
      expect(lintScene(drawn, buildScene(drawn)), example.label).toEqual([]);
      expect(lintExport(drawn, {}), example.label).toEqual([]);
    }
  });
});
