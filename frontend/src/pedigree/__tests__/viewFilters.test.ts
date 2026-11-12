import { describe, it, expect, beforeEach } from "vitest";
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";
import { affectedOnlyKept, affectedOnlySeeds, filterHidden, filterBannerText } from "../viewFilters";
import { collapseInfo, drawnPedigree, branchPlaceholderId, branchTooltip, isBranchPlaceholderId, filterHidingNew } from "../collapse";
import { layoutToFlow, pedigreeNumbers } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { lintExport } from "../../io/svg/exportLint";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportCsv } from "../../io/csv/exporter";
import { EXAMPLES } from "../../data/examples";
import { usePedigreeStore } from "../../store/usePedigreeStore";

type Spec = [id: string, sex: Individual["sex"], extra?: Partial<Individual>];

/** A pedigree from individuals, couples "id:a+b" and their children. */
function build(people: Spec[], couples: Record<string, [string, string, string[]]>, on = true): Pedigree {
  const p: Pedigree = {
    individuals: people.map(([id, sex, extra], i) => ({ id, sex, affected: false, sibOrder: i, ...extra })),
    partnerships: Object.entries(couples).map(([id, [a, b]]) => ({ id, individual1: a, individual2: b })),
    parentOf: Object.fromEntries(Object.entries(couples).map(([id, [, , kids]]) => [id, kids])),
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
  if (on) p.filters = { affectedOnly: true };
  return p;
}

const sorted = (s: Iterable<string>) => [...s].sort();
const drawnIds = (p: Pedigree) => sorted(drawnPedigree(p).individuals.map(i => i.id).filter(id => !isBranchPlaceholderId(id)));
const groupOf = (p: Pedigree, partnership: string) => collapseInfo(p).placeholders.get(branchPlaceholderId(partnership));

/**
 * Consanguinity loop:
 *   gf = gm
 *   ├ a = wa → c1, s1
 *   └ b = wb → c2, s2, s3
 *   c1 = c2 → x (affected), y, z
 *   gm also has an unaffected brother u (parents ggf = ggm).
 */
function loop(on = true): Pedigree {
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
  }, on);
}

describe("affectedOnlyKept (#4)", () => {
  it("keeps the affected person and both lines of ancestors in a consanguinity loop", () => {
    expect(sorted(affectedOnlyKept(loop()))).toEqual(sorted(["x", "c1", "c2", "a", "wa", "b", "wb", "gf", "gm", "ggf", "ggm"]));
  });

  it("groups each kept sibship's other children into one numbered symbol", () => {
    const p = loop();
    expect(drawnIds(p)).toEqual(sorted(affectedOnlyKept(p)));
    expect(groupOf(p, "cc")!.children).toEqual(["y", "z"]);
    expect(groupOf(p, "pa")!.children).toEqual(["s1"]);
    expect(groupOf(p, "pb")!.children).toEqual(["s2", "s3"]);
    expect(groupOf(p, "gg")!.children).toEqual(["u"]);
    expect(groupOf(p, "g")).toBeUndefined(); // both children drawn
    // Siblings of mixed sex: a diamond; one sex: that sex's symbol.
    const sym = (pid: string) => drawnPedigree(p).individuals.find(i => i.id === branchPlaceholderId(pid))!.sex;
    expect(sym("pb")).toBe("unknown");
    expect(sym("cc")).toBe("female");
    expect(sym("gg")).toBe("male");
    // A filter's group is not a collapsed branch: no flag to clear.
    expect(groupOf(p, "cc")!.roots).toEqual([]);
    expect(branchTooltip(groupOf(p, "cc")!)).toContain('Turn off "Affected only"');
    // Nothing is deleted from the stored pedigree.
    expect(p.individuals).toHaveLength(17);
    expect(collapseInfo(p).filtered).toBe(6);
  });

  it("keeps the double couple line's partnership and lints clean", () => {
    const p = loop();
    expect(drawnPedigree(p).partnerships.map(q => q.id).sort()).toEqual(["cc", "g", "gg", "pa", "pb"]);
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  });

  it("half sibs: keeps the kept child's parents; the other partner's children are not drawn", () => {
    const p = build([
      ["dad", "male"], ["m1", "female"], ["m2", "female"],
      ["k1", "female", { affected: true }], ["k2", "male"], ["h1", "male"], ["h2", "female"],
    ], { p1: ["dad", "m1", ["k1", "k2"]], p2: ["dad", "m2", ["h1", "h2"]] });
    expect(sorted(affectedOnlyKept(p))).toEqual(["dad", "k1", "m1"]);
    expect(groupOf(p, "p1")!.children).toEqual(["k2"]);
    expect(groupOf(p, "p2")).toBeUndefined();
    expect(drawnPedigree(p).partnerships.map(q => q.id)).toEqual(["p1"]);
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  });

  it("an affected founder with unaffected children keeps their partner, and the children are one symbol", () => {
    const p = build([
      ["f", "male", { affected: true }], ["m", "female"], ["k1", "male"], ["k2", "male"], ["gk", "female"], ["kw", "female"],
    ], { fm: ["f", "m", ["k1", "k2"]], kk: ["k1", "kw", ["gk"]] });
    expect(sorted(affectedOnlyKept(p))).toEqual(["f", "m"]);
    const g = groupOf(p, "fm")!;
    expect(g.children).toEqual(["k1", "k2"]);
    // The grouped children, their partners and descendants.
    expect(sorted(g.hidden)).toEqual(["gk", "k1", "k2", "kw"]);
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  });

  it("an affected person who married in keeps their partner and the partner's ancestors", () => {
    const p = build([
      ["gf", "male"], ["gm", "female"], ["son", "male"], ["dau", "female"],
      ["wife", "female", { affected: true }], ["gc", "male"],
    ], { g: ["gf", "gm", ["son", "dau"]], sw: ["son", "wife", ["gc"]] });
    expect(sorted(affectedOnlyKept(p))).toEqual(["gf", "gm", "son", "wife"]);
    expect(groupOf(p, "g")!.children).toEqual(["dau"]);
    expect(groupOf(p, "sw")!.children).toEqual(["gc"]);
  });

  it("starts from carriers, condition tags, the proband and a consultand, not from dot or text tags", () => {
    const p = build([
      ["a", "male", { carrier: true }], ["b", "female", { proband: true }],
      ["c", "male", { tags: ["cond"] }], ["d", "female", { tags: ["dna"] }],
      ["e", "male", { consultand: true }], ["f", "female"], ["g", "female", { presymptomatic: true }],
    ], {});
    p.tags = [
      { id: "cond", label: "Cancer", color: "#000", style: "quadrant" },
      { id: "dna", label: "DNA", color: "#000", style: "dot" },
    ];
    expect(sorted(affectedOnlySeeds(p))).toEqual(["a", "b", "c", "e", "g"]);
  });

  it("nobody affected: the filter draws everyone, and the banner says why", () => {
    const p = build([["a", "male"], ["b", "female"], ["c", "male"]], { ab: ["a", "b", ["c"]] });
    expect(affectedOnlyKept(p).size).toBe(0);
    expect(filterHidden(p).size).toBe(0);
    expect(drawnPedigree(p)).toBe(p);
    expect(filterBannerText(p, 0)).toBe("Affected only: nobody is affected, so everyone is drawn");
    expect(filterBannerText(loop(), 6)).toBe("Affected only: 6 people not drawn");
    expect(filterBannerText(loop(false), 0)).toBeNull();
  });

  it("is off when the flag is off", () => {
    expect(drawnPedigree(loop(false)).individuals).toHaveLength(17);
  });
});

describe("affected only with hidden descendants (#94, #1)", () => {
  it("hiding descendants of a kept person groups their kept child too", () => {
    const p = loop();
    p.individuals.find(i => i.id === "a")!.descendantsHidden = true;
    // c1 is hidden under a's collapsed branch, so x (under c1) is too, and
    // the loop's couple goes; c2 stays, kept by the filter.
    const drawn = drawnIds(p);
    expect(drawn).not.toContain("c1");
    expect(drawn).not.toContain("x");
    expect(drawn).toContain("c2");
    const g = groupOf(p, "pa")!;
    expect(g.roots).toEqual(["a"]);
    expect(g.children).toEqual(["c1", "s1"]);
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  });

  it("a collapsed person the filter leaves out hides nothing of their own", () => {
    const p = loop();
    p.individuals.find(i => i.id === "u")!.descendantsHidden = true;
    expect(collapseInfo(p).branches.size).toBe(0);
    expect(drawnIds(p)).toEqual(sorted(affectedOnlyKept(p)));
  });
});

describe("drawing and exporting with affected only (#4)", () => {
  it("numbers only drawn people and skips group symbols (#8)", () => {
    const p = loop();
    const numbers = pedigreeNumbers(p);
    expect([...numbers.keys()].some(isBranchPlaceholderId)).toBe(false);
    expect(numbers.has("y")).toBe(false);
    expect(numbers.get("x")).toBe("V-1");
  });

  it("the SVG draws the group counts and not the hidden people; CSV keeps everyone", () => {
    const p = loop();
    const svg = exportSvg(p);
    expect(svg.match(/class="branch-count"/g)).toHaveLength(4);
    expect(svg).not.toContain('data-id="y"');
    expect(svg).toContain("descendants not shown");
    expect(exportCsv(p).trim().split("\n")).toHaveLength(18);
  });

  for (const ex of EXAMPLES) {
    it(`${ex.label}: canvas and export lint clean with the filter on`, () => {
      const p: Pedigree = { ...ex.data, filters: { affectedOnly: true } };
      expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
      expect(lintFlow(p, layoutToFlow(p, { compact: true }))).toEqual([]);
      expect(lintExport(p).map(f => `${f.code}: ${f.message}`)).toEqual([]);
      expect(lintExport(p, { deidentify: true, title: "T" }).map(f => `${f.code}: ${f.message}`)).toEqual([]);
    });
  }
});

describe("setViewFilter (#4)", () => {
  const store = () => usePedigreeStore.getState();
  beforeEach(() => store().initialize(loop(false)));

  it("switches the filter as one undo step, dropping hidden people from the selection", () => {
    store().setSelection(["x", "y"], "y");
    store().setViewFilter("affectedOnly", true);
    expect(store().pedigree.filters).toEqual({ affectedOnly: true });
    expect(store().selectedIds).toEqual(["x"]);
    expect(store().past).toHaveLength(1);
    store().setViewFilter("affectedOnly", true);
    expect(store().past).toHaveLength(1);
    store().setViewFilter("affectedOnly", false);
    expect(store().pedigree.filters).toBeUndefined();
    store().undo();
    expect(store().pedigree.filters).toEqual({ affectedOnly: true });
  });

  it("turns the filter off rather than let an edit hide someone", () => {
    store().setViewFilter("affectedOnly", true);
    store().addChildren("x", 1, "male"); // an unaffected child of x would not be drawn
    expect(store().pedigree.filters).toBeUndefined();
  });

  it("keeps the filter on for an edit that hides nobody new", () => {
    store().setViewFilter("affectedOnly", true);
    store().updateIndividual("y", { affected: true });
    expect(store().pedigree.filters).toEqual({ affectedOnly: true });
    expect(drawnIds(store().pedigree)).toContain("y");
  });

  it("filterHidingNew compares who is drawn before and after", () => {
    const before = loop();
    const after = loop();
    after.individuals.find(i => i.id === "x")!.affected = false; // nobody affected: draws everyone
    expect(filterHidingNew(before, after)).toBe(false);
    const after2 = loop();
    after2.individuals.push({ id: "n", sex: "male", affected: false, sibOrder: 9 });
    after2.parentOf.cc = [...after2.parentOf.cc!, "n"];
    expect(filterHidingNew(before, after2)).toBe(true);
  });
});
