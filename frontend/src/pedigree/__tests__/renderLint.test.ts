import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../data/examples";
import { buildScene, highestAboveSymbols } from "../scene";
import { lintScene } from "../renderLint";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Examples the canvas currently draws wrong, by label, with the lint codes
 * they raise. Each is a known bug, with a GitHub issue:
 * when a fix makes one draw cleanly this test fails until it is removed here,
 * and any new problem in any example fails straight away.
 */
const KNOWN_BROKEN: Record<string, string[]> = {};

/** Extra findings in compact mode only, by label, as for KNOWN_BROKEN. */
const KNOWN_BROKEN_COMPACT_EXTRA: Record<string, string[]> = {};

// With the example's name as the chart title, as the canvas draws it (#188).
const codes = (p: Pedigree, compact = false, title?: string) =>
  [...new Set(lintScene(p, buildScene(p, { compact }), { title }).map(f => f.code))].sort();

describe("render lint over every example", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.label} draws ${KNOWN_BROKEN[ex.label] ? "with its known problems only" : "cleanly"}`, () => {
      expect(codes(ex.data, false, ex.label)).toEqual(KNOWN_BROKEN[ex.label] ?? []);
    });
  }

  it("compact mode raises the same findings, plus its known extras", () => {
    for (const ex of EXAMPLES) {
      const want = [...new Set([...codes(ex.data, false, ex.label), ...(KNOWN_BROKEN_COMPACT_EXTRA[ex.label] ?? [])])].sort();
      expect({ label: ex.label, codes: codes(ex.data, true, ex.label) }).toEqual({ label: ex.label, codes: want });
    }
  });

  it("names every known-broken label that still exists", () => {
    const labels = new Set(EXAMPLES.map(e => e.label));
    const named = [...Object.keys(KNOWN_BROKEN), ...Object.keys(KNOWN_BROKEN_COMPACT_EXTRA)];
    expect(named.filter(l => !labels.has(l))).toEqual([]);
  });
});

describe("lintScene", () => {
  const base: Pedigree = {
    individuals: [
      { id: "f", sex: "male", affected: false, sibOrder: 0 },
      { id: "m", sex: "female", affected: false, sibOrder: 1 },
      { id: "c", sex: "female", affected: false, sibOrder: 0 },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  } as Pedigree;

  it("is clean on a trio", () => {
    expect(lintScene(base, buildScene(base))).toEqual([]);
    expect(lintScene(base, buildScene(base), { title: "A family" })).toEqual([]);
  });

  it("checks the chart title against a couple line hopping high above the top row", () => {
    const titleFindings = (scene: ReturnType<typeof buildScene>, title?: string) =>
      lintScene(base, scene, { title }).filter(f => f.code === "title-collides");
    // A hop added after the scene worked out how high the drawing reaches
    // (`aboveTop`), so the title stays where it was and is drawn through it (#188).
    const scene = buildScene(base);
    scene.couples = scene.couples.map(e => ({ ...e, data: { ...e.data, hopHeight: 50 } }));
    const found = titleFindings(scene, "A family");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("couple line hopping");
    // No title, no check.
    expect(titleFindings(scene)).toEqual([]);
    // With the hop counted, as buildScene counts it, the title is raised clear.
    scene.aboveTop = highestAboveSymbols(scene);
    expect(titleFindings(scene, "A family")).toEqual([]);
  });

  it("reports a child whose parent line is gone", () => {
    const flow = buildScene(base);
    flow.sibships = [];
    expect(lintScene(base, flow).map(f => f.code)).toEqual(["child-without-parents"]);
  });

  it("reports a couple line to a node that is not drawn and the missing person", () => {
    const flow = buildScene(base);
    const mother = flow.people.find(n => n.individual.id === "m")!;
    flow.people = flow.people.filter(n => n !== mother);
    const found = lintScene(base, flow).map(f => f.code);
    expect(found).toContain("missing-individual");
    expect(found).toContain("missing-node");
    const msg = lintScene(base, flow).find(f => f.code === "missing-node")!.message;
    expect(msg).toContain(`slot ${mother.id}, m`);
  });

  it("reports a slanted couple line but not a child off its siblings' row", () => {
    const sibs: Pedigree = {
      ...base,
      individuals: [...base.individuals, { id: "d", sex: "male", affected: false, sibOrder: 1 }],
      parentOf: { p: ["c", "d"] },
    } as Pedigree;
    const flow = buildScene(sibs);
    const mother = flow.people.find(n => n.individual.id === "m")!;
    mother.position = { ...mother.position, y: mother.position.y + 30 };
    const d = flow.people.find(n => n.individual.id === "d")!;
    d.position = { ...d.position, y: d.position.y + 40 };
    const found = lintScene(sibs, flow).map(f => f.code);
    expect(found).toContain("couple-line-slanted");
    // Each child has its own drop (sibshipPath.ts), so an off-row child is still reached.
    expect(found).not.toContain("child-off-row");
  });

  it("reports overlapping symbols", () => {
    const flow = buildScene(base);
    flow.people[1]!.position = { ...flow.people[0]!.position };
    expect(lintScene(base, flow).map(f => f.code)).toContain("symbols-overlap");
  });

  it("reports symbols that touch (#74)", () => {
    const flow = buildScene(base);
    const [a, b] = flow.people;
    b!.position = { x: a!.position.x + 40, y: a!.position.y };
    const found = lintScene(base, flow).filter(f => f.code === "symbols-overlap");
    expect(found.map(f => f.message)).toEqual(["f and m touch"]);
  });
});
