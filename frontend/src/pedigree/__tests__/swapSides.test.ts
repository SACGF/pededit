import { describe, it, expect, beforeEach } from "vitest";
import { alignPedigreeByFamily, drawnLeftPartner } from "@pedigree-editor/layout-engine";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { swapSidesPlan } from "../partners";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { importJson, exportJson } from "../../io/json";
import { EXAMPLES } from "../../data/examples";

/** Swap sides (#106). */

/** H1 = W = H2: W has a child with each husband; W's parents F, M are drawn. */
function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "F", sex: "male", affected: false, sibOrder: 0 },
      { id: "M", sex: "female", affected: false, sibOrder: 1 },
      { id: "W", sex: "female", affected: false, sibOrder: 0 },
      { id: "S", sex: "male", affected: false, sibOrder: 1 },
      { id: "H1", sex: "male", affected: false, sibOrder: 2 },
      { id: "H2", sex: "male", affected: false, sibOrder: 3 },
      { id: "a", sex: "male", affected: false, sibOrder: 0 },
      { id: "b", sex: "female", affected: false, sibOrder: 0 },
      { id: "x", sex: "male", affected: false, sibOrder: 4 },
      { id: "y", sex: "female", affected: false, sibOrder: 5 },
    ],
    partnerships: [
      { id: "FM", individual1: "F", individual2: "M" },
      { id: "W1", individual1: "H1", individual2: "W" },
      { id: "W2", individual1: "H2", individual2: "W" },
      { id: "xy", individual1: "x", individual2: "y" },
    ],
    parentOf: { FM: ["W", "S"], W1: ["a"], W2: ["b"], xy: [] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const store = () => usePedigreeStore.getState();
const leftOf = (p: Pedigree, pid: string) => drawnLeftPartner(p, alignPedigreeByFamily(p), pid);

describe("swap sides (#106)", () => {
  beforeEach(() => store().initialize(pedigree()));

  it("swaps a childless couple, as one undo step, pinning nobody", () => {
    expect(leftOf(store().pedigree, "xy")).toBe("x");
    expect(store().swapPartnerSides("xy")).toBeNull();
    expect(store().pedigree.partnerships.find(p => p.id === "xy")!.leftPartner).toBe("y");
    expect(leftOf(store().pedigree, "xy")).toBe("y");
    expect(store().pedigree.pinnedPositions ?? {}).toEqual({});
    store().swapPartnerSides("xy");
    expect(leftOf(store().pedigree, "xy")).toBe("x");
    store().undo();
    expect(leftOf(store().pedigree, "xy")).toBe("y");
    store().undo();
    expect(store().pedigree.partnerships.find(p => p.id === "xy")!.leftPartner).toBeUndefined();
  });

  it("trades the places of a person's two partners", () => {
    const before = layoutToFlow(store().pedigree);
    const x0 = (id: string) => before.nodes.find(n => n.data.individual.id === id)!.position.x;
    expect(x0("H1")).toBeLessThan(x0("W"));
    expect(x0("H2")).toBeGreaterThan(x0("W"));
    expect(store().swapPartnerSides("W1")).toBeNull();
    const sides = Object.fromEntries(store().pedigree.partnerships.map(p => [p.id, p.leftPartner]));
    expect(sides).toMatchObject({ W1: "W", W2: "H2" });
    const after = layoutToFlow(store().pedigree);
    const x1 = (id: string) => after.nodes.find(n => n.data.individual.id === id)!.position.x;
    expect(x1("H2")).toBeLessThan(x1("W"));
    expect(x1("H1")).toBeGreaterThan(x1("W"));
    expect(lintFlow(store().pedigree, after)).toEqual([]);
    // And back again.
    expect(store().swapPartnerSides("W2")).toBeNull();
    const again = layoutToFlow(store().pedigree);
    const x2 = (id: string) => again.nodes.find(n => n.data.individual.id === id)!.position.x;
    expect(x2("H1")).toBeLessThan(x2("W"));
    expect(x2("H2")).toBeGreaterThan(x2("W"));
  });

  it("refuses, with a notice and no undo step, a swap that would draw someone twice", () => {
    const ex = EXAMPLES.find(e => e.label === "Half-sib triangle")!;
    const refused = ex.data.partnerships.find(p => "problem" in swapSidesPlan(ex.data, p.id))!;
    store().initialize(ex.data);
    const problem = store().swapPartnerSides(refused.id);
    expect(problem).toMatch(/cannot swap sides/);
    expect(store().notice?.text).toBe(problem);
    expect(store().past.length).toBe(0);
    expect(store().pedigree.partnerships.some(p => p.leftPartner)).toBe(false);
  });

  it("survives a JSON round trip, and the importer checks the id", () => {
    store().swapPartnerSides("xy");
    const back = importJson(exportJson(store().pedigree));
    expect(back.hasErrors).toBe(false);
    expect(back.pedigree!.partnerships.find(p => p.id === "xy")!.leftPartner).toBe("y");
    const bad = JSON.parse(exportJson(store().pedigree));
    const doc = bad.pedigree ?? bad;
    doc.partnerships.find((p: { id: string }) => p.id === "xy").leftPartner = "W";
    expect(importJson(JSON.stringify(doc)).hasErrors).toBe(true);
  });

  it("every drawn couple of every example either swaps cleanly or is refused with a reason", () => {
    let swapped = 0, refused = 0;
    for (const ex of EXAMPLES) {
      for (const p of ex.data.partnerships) {
        if (p.donorConception) continue;
        const plan = swapSidesPlan(ex.data, p.id);
        if ("problem" in plan) { refused++; expect(plan.problem).toMatch(/\S/); continue; }
        swapped++;
        const next = { ...ex.data, partnerships: ex.data.partnerships.map(q => plan.sides[q.id] ? { ...q, leftPartner: plan.sides[q.id] } : q) };
        expect(leftOf(next, p.id), `${ex.label} ${p.id}`).toBe(plan.sides[p.id]);
      }
    }
    console.log(`swap sides over the examples: ${swapped} swapped, ${refused} refused`);
    expect(swapped).toBeGreaterThan(refused);
  });
});
