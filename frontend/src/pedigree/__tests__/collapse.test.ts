import { describe, it, expect, beforeEach } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { collapseInfo, drawnPedigree, asDrawn, rootsHidingNew, hasDescendants, branchPlaceholderId, isBranchPlaceholderId, branchTooltip } from "../collapse";
import { batchCollapseState } from "../selection";
import { parseExportSvg } from "../../io/svg/exportLint";
import { layoutToFlow, pedigreeNumbers } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { renderExportKeySvg } from "../tags";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { deidentify } from "../../io/svg/deidentify";
import { lintExport } from "../../io/svg/exportLint";
import { usePedigreeStore } from "../../store/usePedigreeStore";

/**
 *   gf = gm             (founders)
 *   ├ son = wife        wife married in; twins son and dau
 *   │   └ gc1, gc2      gc2 is pinned
 *   └ dau = cousin      cousin is gf's nephew: parents uncle = aunt
 *       └ gc3
 *   uncle = aunt → cousin
 *   loner               unrelated
 */
function pedigree(flags: Record<string, true> = {}): Pedigree {
  const p: Pedigree = {
    individuals: [
      { id: "gf", sex: "male", affected: false, sibOrder: 0 },
      { id: "gm", sex: "female", affected: false, sibOrder: 1 },
      { id: "son", sex: "male", affected: false, sibOrder: 0 },
      { id: "dau", sex: "female", affected: false, sibOrder: 1 },
      { id: "wife", sex: "female", affected: true, sibOrder: 2 },
      { id: "uncle", sex: "male", affected: false, sibOrder: 3 },
      { id: "aunt", sex: "female", affected: false, sibOrder: 4 },
      { id: "cousin", sex: "male", affected: false, sibOrder: 0 },
      { id: "gc1", sex: "male", affected: false, sibOrder: 0 },
      { id: "gc2", sex: "female", affected: false, sibOrder: 1 },
      { id: "gc3", sex: "unknown", affected: false, sibOrder: 0 },
      { id: "loner", sex: "unknown", affected: false, sibOrder: 5 },
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm", twins: [{ members: ["son", "dau"], zygosity: "dizygotic" }] },
      { id: "sw", individual1: "son", individual2: "wife" },
      { id: "ua", individual1: "uncle", individual2: "aunt" },
      { id: "dc", individual1: "dau", individual2: "cousin" },
    ],
    parentOf: { g: ["son", "dau"], sw: ["gc1", "gc2"], ua: ["cousin"], dc: ["gc3"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    pinnedPositions: { gc2: { x: 10, y: 20 } },
  };
  for (const i of p.individuals) if (flags[i.id]) i.descendantsHidden = true;
  return p;
}

const ids = (p: Pedigree) => p.individuals.map(i => i.id).sort();
const sorted = (s: Iterable<string>) => [...s].sort();

describe("collapseInfo / drawnPedigree (#94)", () => {
  it("returns the pedigree itself when nothing is hidden", () => {
    const p = pedigree();
    expect(drawnPedigree(p)).toBe(p);
    expect(collapseInfo(p).hidden.size).toBe(0);
  });

  it("hides the descendants, keeps the collapsed person's partner and couple line", () => {
    const p = pedigree({ son: true });
    const { drawn, hidden, branches } = collapseInfo(p);
    expect(sorted(hidden)).toEqual(["gc1", "gc2"]);
    expect(ids(drawn)).not.toContain("gc1");
    expect(ids(drawn)).toContain("wife");
    expect(drawn.partnerships.map(q => q.id)).toContain("sw");
    expect(drawn.parentOf.sw).toEqual([branchPlaceholderId("sw")]);
    expect(drawn.pinnedPositions).toBeUndefined();
    expect(sorted(branches.get("son")!)).toEqual(["gc1", "gc2"]);
    expect(drawn.individuals.find(i => i.id === "son")!.descendantsHidden).toBe(true);
  });

  it("does not touch the stored pedigree", () => {
    const p = pedigree({ gm: true });
    collapseInfo(p);
    expect(p).toEqual(pedigree({ gm: true }));
  });

  it("hides married-in partners of hidden people, keeps blood relatives from another line", () => {
    const { drawn, hidden, branches } = collapseInfo(pedigree({ gm: true }));
    // wife married in to son only, so she goes; cousin has parents of his own, so he stays.
    expect(sorted(hidden)).toEqual(["dau", "gc1", "gc2", "gc3", "son", "wife"]);
    expect(ids(drawn)).toEqual(["aunt", branchPlaceholderId("g"), "cousin", "gf", "gm", "loner", "uncle"]);
    expect(drawn.partnerships.map(q => q.id).sort()).toEqual(["g", "ua"]);
    expect(drawn.partnerships.find(q => q.id === "g")!.twins).toBeUndefined();
    expect(sorted(branches.get("gm")!)).toEqual(["dau", "gc1", "gc2", "gc3", "son", "wife"]);
  });

  it("hides a child of the collapsed line and a visible line (consanguinity loop)", () => {
    // gc3 is below dau (collapsed) and below cousin (drawn): everything below dau goes.
    const { drawn, hidden } = collapseInfo(pedigree({ dau: true }));
    expect(sorted(hidden)).toEqual(["gc3"]);
    expect(ids(drawn)).toContain("cousin");
    expect(drawn.parentOf.dc).toEqual([branchPlaceholderId("dc")]);
  });

  it("folds a collapsed person who is hidden into the branch above", () => {
    const { hidden, branches } = collapseInfo(pedigree({ gf: true, son: true }));
    expect(sorted(hidden)).toEqual(["dau", "gc1", "gc2", "gc3", "son", "wife"]);
    expect([...branches.keys()]).toEqual(["gf"]);
  });

  it("drops a flag that hides nobody, so no mark is drawn", () => {
    const p = pedigree({ loner: true });
    expect(hasDescendants(p, "loner")).toBe(false);
    expect(drawnPedigree(p).individuals.find(i => i.id === "loner")!.descendantsHidden).toBeUndefined();
    expect(exportSvg(p)).not.toContain("branch-count");
  });

  it("clears a childless mark on a couple whose children are hidden", () => {
    const p = pedigree({ son: true });
    p.partnerships.find(q => q.id === "sw")!.childless = "byChoice";
    expect(drawnPedigree(p).partnerships.find(q => q.id === "sw")!.childless).toBeUndefined();
  });

  it("gives the same answer for the drawn copy and for a derived copy marked as drawn", () => {
    const p = pedigree({ son: true });
    const drawn = drawnPedigree(p);
    expect(drawnPedigree(drawn)).toBe(drawn);
    expect(collapseInfo(drawn).branches.get("son")!.size).toBe(2);
    const derived = asDrawn({ ...drawn, individuals: drawn.individuals.map(i => ({ ...i, name: "x" })) }, drawn);
    expect(drawnPedigree(derived)).toBe(derived);
    expect(collapseInfo(derived).branches.get("son")!.size).toBe(2);
  });
});

describe("drawing with hidden descendants (#94)", () => {
  it("lays out and draws only the drawn people, lint clean", () => {
    const p = pedigree({ gm: true });
    const flow = layoutToFlow(p);
    expect(new Set(flow.nodes.map(n => n.data.individual.id))).toEqual(new Set(ids(drawnPedigree(p))));
    expect(lintFlow(p, flow)).toEqual([]);
    expect(flow.nodes.find(n => n.data.individual.id === "gm")!.data.individual.descendantsHidden).toBe(true);
  });

  it("exports draw the mark and the key row, and not the hidden people", () => {
    // Without the twin set and the pin, which the export lint flags in this
    // fixture whether or not anything is hidden.
    const plain = (flags: Record<string, true>) => {
      const p = pedigree(flags);
      delete p.partnerships[0]!.twins;
      delete p.pinnedPositions;
      return p;
    };
    expect(lintExport(plain({}))).toEqual([]);
    for (const p of [plain({ son: true }), plain({ dau: true }), plain({ gm: true })]) {
      const svg = exportSvg(p);
      expect(svg.match(/class="branch-count"/g)).toHaveLength(1);
      expect(svg).toContain("descendants not shown");
      expect(lintExport(p)).toEqual([]);
      expect(lintExport(p, { deidentify: true })).toEqual([]);
    }
    // The U-shape draws one family, the proband's.
    const u = plain({ son: true });
    u.individuals.find(i => i.id === "dau")!.proband = true;
    expect(exportUShapeSvg(u).match(/class="branch-count"/g)).toHaveLength(1);
    expect(exportUShapeSvg(u)).not.toContain('data-id="gc1"');
    // wife is the only affected person and is hidden with gm's branch: no Affected key row.
    expect(renderExportKeySvg(drawnPedigree(pedigree({ gm: true })), 0, 0).markup.join("")).not.toContain(">Affected<");
    expect(exportSvg(pedigree({ gm: true }))).not.toContain('data-id="wife"');
  });

  it("de-identified export numbers only the drawn people and keeps the diamond", () => {
    const d = deidentify(pedigree({ gm: true }));
    expect(d.individuals).toHaveLength(7); // six people and the diamond
    const diamond = d.individuals.find(i => isBranchPlaceholderId(i.id))!;
    expect(diamond.name).toBeUndefined();
    // The diamond takes no number: generation II has only the cousin.
    expect(d.individuals.filter(i => i.name?.startsWith("II-")).map(i => i.id)).toEqual(["cousin"]);
    expect(collapseInfo(d).placeholders.get(diamond.id)!.hidden.size).toBe(6);
    const svg = exportSvg(pedigree({ gm: true }), { deidentify: true });
    // The number of siblings grouped (son and dau), not of everyone hidden.
    expect(svg).toMatch(/class="branch-count"[^>]*>2</);
    expect(svg).not.toContain(" affected<");
  });
});

describe("rootsHidingNew (#94)", () => {
  it("names the collapsed person a new child would vanish under", () => {
    const before = pedigree({ son: true });
    const after = pedigree({ son: true });
    after.individuals.push({ id: "gc4", sex: "male", affected: false, sibOrder: 2 });
    after.parentOf.sw = [...after.parentOf.sw!, "gc4"];
    expect(rootsHidingNew(before, after)).toEqual(["son"]);
    expect(rootsHidingNew(before, pedigree({ son: true }))).toEqual([]);
  });
});

describe("setDescendantsHidden (#94)", () => {
  const store = () => usePedigreeStore.getState();
  beforeEach(() => store().initialize(pedigree()));

  it("hides and shows as one undo step each, dropping hidden people from the selection", () => {
    store().setSelection(["gc1", "son"], "gc1");
    store().setDescendantsHidden(["son"], true);
    expect(store().pedigree.individuals.find(i => i.id === "son")!.descendantsHidden).toBe(true);
    expect(store().pedigree.individuals).toHaveLength(12); // nothing deleted
    expect(store().selectedIds).toEqual(["son"]);
    expect(store().past).toHaveLength(1);
    store().setDescendantsHidden(["son"], true); // no change, no undo entry
    expect(store().past).toHaveLength(1);
    store().setDescendantsHidden(["son"], false);
    expect(store().pedigree.individuals.find(i => i.id === "son")!.descendantsHidden).toBeUndefined();
    store().undo();
    expect(store().pedigree.individuals.find(i => i.id === "son")!.descendantsHidden).toBe(true);
  });

  it("shows the branch again when a child is added under a collapsed person", () => {
    store().setDescendantsHidden(["son"], true);
    store().addChildren("wife", 1, "male");
    expect(store().pedigree.individuals.find(i => i.id === "son")!.descendantsHidden).toBeUndefined();
    expect(collapseInfo(store().pedigree).hidden.size).toBe(0);
  });
});

describe("collapsed branch diamond (#1)", () => {
  it("counts the hidden people under each couple, with sex and affected breakdown", () => {
    const { placeholders, drawn } = collapseInfo(pedigree({ gm: true }));
    expect([...placeholders.keys()]).toEqual([branchPlaceholderId("g")]);
    const b = placeholders.get(branchPlaceholderId("g"))!;
    expect(b.roots).toEqual(["gm"]);
    expect(b.partnershipId).toBe("g");
    expect(sorted(b.hidden)).toEqual(["dau", "gc1", "gc2", "gc3", "son", "wife"]);
    expect(b.children).toEqual(["son", "dau"]);
    expect([b.male, b.female, b.unknownSex, b.affected]).toEqual([1, 1, 0, 1]);
    expect(branchTooltip(b)).toBe("2 unaffected children (1 male, 1 female). 6 people not shown in all, 1 of them affected. Click to show.");
    const diamond = drawn.individuals.find(i => i.id === branchPlaceholderId("g"))!;
    expect(diamond).toEqual({ id: branchPlaceholderId("g"), sex: "unknown", affected: false, sibOrder: 0 });
  });

  it("is never in the stored pedigree, and not in data exports' input", () => {
    const p = pedigree({ son: true });
    collapseInfo(p);
    expect(p.individuals.some(i => isBranchPlaceholderId(i.id))).toBe(false);
  });

  it("names both partners when both are collapsed, so one click shows the branch", () => {
    const b = collapseInfo(pedigree({ son: true, wife: true })).placeholders.get(branchPlaceholderId("sw"))!;
    expect(b.roots).toEqual(["son", "wife"]);
    expect(b.hidden.size).toBe(2);
  });

  it("draws one diamond per couple for someone with children by two partners", () => {
    const p = pedigree();
    p.individuals.push({ id: "wife2", sex: "female", affected: false, sibOrder: 6 }, { id: "gc5", sex: "male", affected: true, sibOrder: 0 });
    p.partnerships.push({ id: "sw2", individual1: "son", individual2: "wife2" });
    p.parentOf.sw2 = ["gc5"];
    p.individuals.find(i => i.id === "son")!.descendantsHidden = true;
    const { placeholders, branches } = collapseInfo(p);
    expect(placeholders.get(branchPlaceholderId("sw"))!.hidden.size).toBe(2);
    // gc5 is affected: drawn as himself, so sw2 has no group symbol.
    expect(placeholders.has(branchPlaceholderId("sw2"))).toBe(false);
    expect(drawnPedigree(p).parentOf.sw2).toEqual(["gc5"]);
    expect(branches.get("son")!.size).toBe(2);
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  });

  it("sits on the row below the couple, under them, joined by their sibship line", () => {
    const p = pedigree({ son: true });
    const flow = layoutToFlow(p);
    const node = (id: string) => flow.nodes.find(n => n.data.individual.id === id)!;
    const diamond = node(branchPlaceholderId("sw"));
    expect(diamond.type).toBe("collapsedBranch");
    expect(diamond.draggable).toBe(false);
    expect(diamond.selectable).toBe(false);
    expect(diamond.data.branch!.hidden.size).toBe(2);
    const son = node("son"), wife = node("wife");
    expect(diamond.position.y).toBeGreaterThan(son.position.y);
    const lo = Math.min(son.position.x, wife.position.x), hi = Math.max(son.position.x, wife.position.x);
    expect(diamond.position.x).toBeGreaterThanOrEqual(lo);
    expect(diamond.position.x).toBeLessThanOrEqual(hi);
    const sib = flow.sibshipEdges.find(e => e.data!.childIds.includes(diamond.id))!;
    expect(new Set([sib.data!.leftParentId, sib.data!.rightParentId])).toEqual(new Set([son.id, wife.id]));
    expect(sib.data!.childIds).toEqual([diamond.id]);
    expect(lintFlow(p, flow)).toEqual([]);
    // No affected people hidden: no note under the diamond.
    expect(diamond.data.detailLines).toEqual([]);
    expect(node(branchPlaceholderId("sw")).data.nameLines).toEqual([]);
  });

  it("puts the count inside the diamond in the export", () => {
    const p = pedigree({ son: true });
    delete p.partnerships[0]!.twins;
    delete p.pinnedPositions;
    const svg = exportSvg(p);
    // In the symbols group, centred on the symbol's own origin (its centre).
    const symbols = svg.slice(svg.indexOf('<g class="symbols">'), svg.indexOf('<g class="labels">'));
    expect(symbols).toMatch(/<text class="branch-count" x="0" y="[\d.]+"[^>]*>2<\/text>/);
    expect(parseExportSvg(svg).symbols).toHaveLength(drawnPedigree(p).individuals.length);
    expect(svg).not.toContain(">1 affected<");
  });

  it("the export key has a diamond row only while a branch is collapsed", () => {
    expect(renderExportKeySvg(pedigree({ son: true }), 0, 0).markup.join("")).toContain("descendants not shown");
    expect(renderExportKeySvg(pedigree({ loner: true }), 0, 0).markup.join("")).not.toContain("descendants not shown");
  });
});

/**
 *   p1 = p2                      p1 collapsed
 *   ├ a, b, e  unaffected        grouped into one symbol
 *   ├ c        affected = h      drawn as herself; h (married in) and k hidden
 *   │            └ k
 *   └ d        condition tag     drawn as herself
 */
function sibship(sexOfE: "male" | "female" = "female"): Pedigree {
  return {
    individuals: [
      { id: "p1", sex: "male", affected: false, sibOrder: 0, descendantsHidden: true },
      { id: "p2", sex: "female", affected: false, sibOrder: 1 },
      { id: "a", sex: "male", affected: false, sibOrder: 0 },
      { id: "b", sex: "male", affected: false, sibOrder: 1 },
      { id: "c", sex: "female", affected: true, sibOrder: 2, deceased: true },
      { id: "d", sex: "female", affected: false, sibOrder: 3, tags: ["t1"] },
      { id: "e", sex: sexOfE, affected: false, sibOrder: 4 },
      { id: "h", sex: "male", affected: false, sibOrder: 5 },
      { id: "k", sex: "male", affected: true, sibOrder: 0 },
    ],
    partnerships: [
      { id: "pp", individual1: "p1", individual2: "p2" },
      { id: "ch", individual1: "c", individual2: "h" },
    ],
    parentOf: { pp: ["a", "b", "c", "d", "e"], ch: ["k"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    tags: [{ id: "t1", label: "Cancer", color: "#d62728", style: "quadrant" }],
  };
}

describe("affected children of a collapsed couple (#1, NSGC Fig. 1)", () => {
  it("groups only the unaffected children; affected and tagged ones are drawn as themselves", () => {
    const p = sibship();
    const { drawn, hidden, placeholders } = collapseInfo(p);
    expect(sorted(hidden)).toEqual(["a", "b", "e", "h", "k"]);
    expect(ids(drawn)).toEqual(sorted(["p1", "p2", "c", "d", branchPlaceholderId("pp")]));
    const b = placeholders.get(branchPlaceholderId("pp"))!;
    expect(b.children).toEqual(["a", "b", "e"]);
    expect(sorted(b.hidden)).toEqual(["a", "b", "e", "h", "k"]);
    expect(b.affected).toBe(1);
    expect(branchTooltip(b)).toBe("3 unaffected children (2 male, 1 female). 5 people not shown in all, 1 of them affected. Click to show.");
    // Mixed sex: a diamond. The affected child keeps her own symbol state.
    expect(drawn.individuals.find(i => i.id === branchPlaceholderId("pp"))!.sex).toBe("unknown");
    expect(drawn.individuals.find(i => i.id === "c")).toEqual(p.individuals.find(i => i.id === "c"));
    // Her partner and child are hidden, and so is the partnership.
    expect(drawn.partnerships.map(q => q.id)).toEqual(["pp"]);
    expect(drawn.parentOf.ch).toBeUndefined();
  });

  it("draws a square or circle with the number when the grouped children share a sex", () => {
    const { drawn } = collapseInfo(sibship("male"));
    expect(drawn.individuals.find(i => i.id === branchPlaceholderId("pp"))!.sex).toBe("male");
  });

  it("draws no group symbol when every child is drawn as themselves", () => {
    const p = sibship();
    p.parentOf.pp = ["c", "d"];
    p.individuals = p.individuals.filter(i => !["a", "b", "e"].includes(i.id));
    const { drawn, placeholders, hidden } = collapseInfo(p);
    expect(placeholders.size).toBe(0);
    expect(sorted(hidden)).toEqual(["h", "k"]);
    expect(drawn.parentOf.pp).toEqual(["c", "d"]);
    expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  });

  it("lays the symbol out on the sibship line in the first grouped child's birth order place", () => {
    const p = sibship();
    p.individuals.find(i => i.id === "a")!.sibOrder = 9; // b is now the first grouped child
    p.individuals.find(i => i.id === "b")!.sibOrder = 3;
    p.individuals.find(i => i.id === "d")!.sibOrder = 1;
    const flow = layoutToFlow(p);
    const x = (id: string) => flow.nodes.find(n => n.data.individual.id === id)!.position.x;
    const sym = branchPlaceholderId("pp");
    // c (2) and d (1) come before b (3), so the group symbol is last.
    expect(x("d")).toBeLessThan(x("c"));
    expect(x("c")).toBeLessThan(x(sym));
    const sib = flow.sibshipEdges.find(e => e.data!.childIds.length === 3)!;
    expect(sib).toBeDefined();
    expect(lintFlow(p, flow)).toEqual([]);
    const node = flow.nodes.find(n => n.data.individual.id === sym)!;
    expect(node.type).toBe("collapsedBranch");
    expect(node.data.detailLines).toEqual([]);
  });

  it("numbers the drawn affected children and skips the group symbol (#8)", () => {
    // The group symbol is first (a, sibOrder 0), and takes no number.
    const numbers = pedigreeNumbers(sibship());
    expect(numbers.has(branchPlaceholderId("pp"))).toBe(false);
    expect([...numbers].filter(([, n]) => n.startsWith("II-")).map(([id, n]) => `${id}:${n}`).sort())
      .toEqual(["c:II-1", "d:II-2"]);
  });

  it("exports the number of grouped siblings, the affected child, and lints clean", () => {
    const p = sibship();
    const svg = exportSvg(p);
    expect(svg).toMatch(/class="branch-count"[^>]*>3</);
    // p1, p2, the group symbol, c and d.
    expect(parseExportSvg(svg).symbols).toHaveLength(5);
    expect(lintExport(p)).toEqual([]);
    expect(lintExport(p, { deidentify: true })).toEqual([]);
  });

  it("shows the branch again when an edit would hide a drawn affected child", () => {
    const before = sibship();
    const after = sibship();
    after.individuals.find(i => i.id === "c")!.affected = false;
    expect(rootsHidingNew(before, after)).toEqual(["p1"]);
  });
});

describe("pedigree numbers with a collapsed branch (#1, #8)", () => {
  it("skip the diamond", () => {
    const numbers = pedigreeNumbers(pedigree({ gm: true }));
    expect(numbers.has(branchPlaceholderId("g"))).toBe(false);
    expect([...numbers].filter(([, n]) => n.startsWith("II-")).map(([id]) => id)).toEqual(["cousin"]);
  });
});

describe("batchCollapseState (#1)", () => {
  it("hides the topmost selected people with descendants, shows the collapsed ones", () => {
    const p = pedigree({ dau: true });
    expect(batchCollapseState(p, ["gf", "son", "loner"])).toEqual({ toHide: ["gf"], toShow: [] });
    expect(batchCollapseState(p, ["son", "dau", "uncle"])).toEqual({ toHide: ["son", "uncle"], toShow: ["dau"] });
  });
});
