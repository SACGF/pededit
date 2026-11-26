import { describe, it, expect, beforeEach } from "vitest";
import { drawnBesideConflict } from "@pedigree-editor/layout-engine";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { coupleOfPair, couplePartnerLabel, drawBesideOptions, drawBesidePlan } from "../partners";
import { buildScene } from "../scene";
import { lintScene } from "../renderLint";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { importJson, exportJson } from "../../io/json";
import { EXAMPLES } from "../../data/examples";
import { FEATURE_FIXTURES } from "../../fixtures/features";

/** "Draw this couple beside" (#205). */

const store = () => usePedigreeStore.getState();
const couple = (p: Pedigree, id: string) => p.partnerships.find(q => q.id === id)!;

/** Ids along each row as drawn, a "*" on every copy of someone drawn more than once. */
function rows(p: Pedigree): string[] {
  const by = new Map<number, string[]>();
  for (const n of [...buildScene(p).people].sort((a, b) => a.position.x - b.position.x)) {
    const y = Math.round(n.position.y);
    by.set(y, [...(by.get(y) ?? []), n.individual.id + ((n.glyph.copy !== undefined) ? "*" : "")]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(r => r[1].join(" "));
}
const twicePerRow = (p: Pedigree) => rows(p).map(r => r.split(" ").filter(s => s.endsWith("*")).length / 2);

const example = () => EXAMPLES.find(e => e.slug === "quadruple-half-first-cousins")!.data;
/** The example as the layout draws it with nothing chosen. */
function ring(): Pedigree {
  const p = example();
  return { ...p, partnerships: p.partnerships.map(({ leftPartner: _l, drawnBeside: _b, ...q }) => q) };
}

describe("the Quadruple half first cousins example", () => {
  it("draws three people twice, all in the grandparents' row", () => {
    expect(twicePerRow(example())).toEqual([3, 0, 0]);
    expect(rows(example())[1]).toBe("F1 M1 M2 F2");
    expect(lintScene(example(), buildScene(example()))).toEqual([]);
  });

  it("drew four people twice, over two rows, before the couples were placed", () => {
    expect(twicePerRow(ring())).toEqual([3, 1, 0]);
  });
});

describe("draw this couple beside (#205)", () => {
  beforeEach(() => store().initialize(ring()));

  it("is offered for a couple whose partners both have a place of their own, and no other", () => {
    for (const c of ring().partnerships) expect(drawBesideOptions(ring(), c.id).sort()).toEqual([c.individual1, c.individual2].sort());
    const simple = EXAMPLES.find(e => e.label === "Simple family")!.data;
    for (const c of simple.partnerships) expect(drawBesideOptions(simple, c.id)).toEqual([]);
  });

  it("two menu choices reach the example's drawing, each one undo step, nobody pinned", () => {
    expect(store().swapPartnerSides("C+D")).toBeNull();
    expect(store().setCoupleDrawnBeside("C+B", "C")).toBeNull();
    const chosen = couple(store().pedigree, "C+B");
    expect([chosen.drawnBeside, chosen.leftPartner]).toEqual(["C", "C"]);
    expect(rows(store().pedigree)).toEqual(rows(example()));
    expect(store().notice).toMatchObject({ kind: "info", text: "3 people are drawn twice now; 4 were before.", undoable: true });
    expect(store().pedigree.pinnedPositions ?? {}).toEqual({});
    store().undo();
    expect(couple(store().pedigree, "C+B").drawnBeside).toBeUndefined();
    expect(couple(store().pedigree, "C+D").leftPartner).toBe("D");
  });

  it("may draw someone twice who was drawn once, which a swap never does", () => {
    const before = twicePerRow(store().pedigree);
    expect(store().setCoupleDrawnBeside("A+D", "D")).toBeNull();
    expect(twicePerRow(store().pedigree)).not.toEqual(before);
    expect(lintScene(store().pedigree, buildScene(store().pedigree))).toEqual([]);
  });

  it("names the people in the notice when they have names", () => {
    const named: Pedigree = { ...ring(), individuals: ring().individuals.map(i => ({ ...i, name: `N${i.id}` })) };
    const plan = drawBesidePlan(named, "C+D", "D");
    expect("notice" in plan && plan.notice).toMatch(/^N\w+(, N\w+)* and N\w+ are drawn twice now; 4 were before\.$/);
  });

  it("Automatic hands the couple back to the layout, side included", () => {
    store().setCoupleDrawnBeside("C+B", "C");
    expect(store().setCoupleDrawnBeside("C+B", null)).toBeNull();
    const c = couple(store().pedigree, "C+B");
    expect("drawnBeside" in c || "leftPartner" in c).toBe(false);
    expect(rows(store().pedigree)).toEqual(rows(ring()));
  });

  it("stores nothing and says why when there is nothing to change", () => {
    const untouched = store().pedigree;
    expect(store().setCoupleDrawnBeside("C+B", null)).toMatch(/already chooses/);
    store().setCoupleDrawnBeside("C+B", "C");
    const once = store().pedigree;
    expect(store().setCoupleDrawnBeside("C+B", "C")).toMatch(/already drawn beside partner [12] \(male\)/);
    expect(store().pedigree).toBe(once);
    expect(store().notice).toMatchObject({ kind: "info" });
    expect(untouched).not.toBe(once);
    // A partner who married in has no place of their own.
    const simple = EXAMPLES.find(e => e.label === "Simple family")!.data;
    const c = simple.partnerships[0]!;
    expect(drawBesidePlan(simple, c.id, c.individual1)).toHaveProperty("unchanged");
  });

  it("refuses a choice the layout cannot draw together with the others, keeping them", () => {
    // With these sides chosen, C and B beside B would leave A and B's couple line reading as another couple's.
    const sided: Pedigree = {
      ...ring(),
      partnerships: ring().partnerships.map(q =>
        q.id === "A+B" ? { ...q, leftPartner: "A", drawnBeside: "B" }
        : q.id === "C+D" ? { ...q, leftPartner: "D" }
        : q.id === "C+B" ? { ...q, leftPartner: "C" } : q),
    };
    store().initialize(sided);
    expect(store().setCoupleDrawnBeside("C+B", "B")).toMatch(/cannot be drawn beside partner [12] \(female\) together with the choices made for other couples/);
    expect(store().pedigree).toBe(sided);
    expect(lintScene(sided, buildScene(sided))).toEqual([]);
  });

  it("any two choices on the ring are drawn cleanly or change nothing", () => {
    for (const first of ring().partnerships.slice(0, 4)) for (const a of [first.individual1, first.individual2]) {
      store().initialize(ring());
      if (store().setCoupleDrawnBeside(first.id, a) !== null) continue;
      const afterFirst = store().pedigree;
      for (const second of ring().partnerships.slice(0, 4)) for (const b of [second.individual1, second.individual2]) {
        if (second.id === first.id) continue;
        store().initialize(afterFirst);
        const said = store().setCoupleDrawnBeside(second.id, b);
        const p = store().pedigree;
        expect(drawnBesideConflict(p), `${first.id} ${a}, ${second.id} ${b}`).toBe(false);
        expect(lintScene(p, buildScene(p)), `${first.id} ${a}, ${second.id} ${b}`).toEqual([]);
        if (said !== null) expect(p).toBe(afterFirst);
      }
    }
  });

  it("names an unnamed partner by the side drawn on and sex, seen from the couple or from one of them, and a named one by name", () => {
    expect(couplePartnerLabel(ring(), "C+B", "C")).toBe("partner 1 (male)");
    expect(couplePartnerLabel(ring(), "C+B", "B", { start: true })).toBe("Partner 2 (female)");
    expect(couplePartnerLabel(ring(), "C+B", "B", { fromId: "B", start: true })).toBe("This person");
    expect(couplePartnerLabel(ring(), "C+B", "C", { fromId: "B" })).toMatch(/^partner \d \(male\)$/);
    const named: Pedigree = { ...ring(), individuals: ring().individuals.map(i => (i.id === "C" ? { ...i, name: "Cy" } : i)) };
    expect(couplePartnerLabel(named, "C+B", "C")).toBe("Cy");
  });

  it("survives a JSON round trip, and a value that is not one of the couple is reported", () => {
    const p = example();
    const back = importJson(exportJson(p)).pedigree!;
    expect(couple(back, "C+B").drawnBeside).toBe("C");
    expect(rows(back)).toEqual(rows(p));
    const bad = JSON.parse(exportJson(p));
    bad.pedigree.partnerships.find((q: { id: string }) => q.id === "C+B").drawnBeside = "X";
    expect(importJson(JSON.stringify(bad)).issues.some(i => i.message.includes("drawnBeside"))).toBe(true);
  });
});

describe("drawnBeside on every couple of every example and fixture", () => {
  const all: [string, Pedigree][] = [
    ...EXAMPLES.map(e => [e.label, e.data] as [string, Pedigree]),
    ...FEATURE_FIXTURES.map(f => [`fixture:${f.slug}`, f.data] as [string, Pedigree]),
  ];
  const STRUCTURE = new Set(["missing-individual", "missing-node", "couple-not-partners", "partnership-not-drawn", "child-without-parents", "child-wrong-parents", "assisted-not-drawn"]);
  const broken = (p: Pedigree) => lintScene(p, buildScene(p)).filter(f => STRUCTURE.has(f.code)).map(f => f.code).sort();

  it("never loses a couple or a child's line, whichever partner is chosen, offered or not", () => {
    let offered = 0;
    for (const [name, p] of all) {
      if (p.individuals.length > 60) continue; // the large examples take the quadratic program too long to try every couple
      const base = broken(p);
      for (const c of p.partnerships) {
        const options = drawBesideOptions(p, c.id);
        offered += options.length;
        for (const drawnBeside of [c.individual1, c.individual2]) {
          const q: Pedigree = { ...p, partnerships: p.partnerships.map(x => (x.id === c.id ? { ...x, drawnBeside } : x)) };
          expect(broken(q), `${name} ${c.id} beside ${drawnBeside}`).toEqual(base);
          // One choice alone is never more than the layout can draw.
          if (!p.partnerships.some(x => x.drawnBeside)) expect(drawnBesideConflict(q), `${name} ${c.id} beside ${drawnBeside}`).toBe(false);
        }
      }
    }
    expect(offered).toBeGreaterThan(20);
  });
});

describe("the couple two selected people are", () => {
  it("is found for the two partners in either order, and for nobody else", () => {
    const p = example();
    expect(coupleOfPair(p, ["C", "B"])?.id).toBe("C+B");
    expect(coupleOfPair(p, ["B", "C"])?.id).toBe("C+B");
    expect(coupleOfPair(p, ["A", "C"])).toBeUndefined();
    expect(coupleOfPair(p, ["C"])).toBeUndefined();
    expect(coupleOfPair(p, ["C", "B", "D"])).toBeUndefined();
  });

  it("is not a donor and the parent they share a child with, who have no couple line", () => {
    const p = example();
    const donor = { ...p, partnerships: p.partnerships.map(q => q.id === "C+B" ? { ...q, donorConception: true } : q) };
    expect(coupleOfPair(donor, ["C", "B"])).toBeUndefined();
  });
});
