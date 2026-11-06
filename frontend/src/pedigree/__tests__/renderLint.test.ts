import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../data/examples";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Examples the canvas currently draws wrong, by label, with the lint codes
 * they raise. Each is a known bug (see claude/agent_harness_testing_bugs.md):
 * when a fix makes one draw cleanly this test fails until it is removed here,
 * and any new problem in any example fails straight away.
 */
const KNOWN_BROKEN: Record<string, string[]> = {
  // duplicate individuals dropped or moved by layoutToFlow (P1 in the bug list)
  "Spanish Habsburgs": ["couple-lines-overlap", "couple-through-symbol"],
  "3/4 siblings": ["child-without-parents", "missing-node", "partnership-not-drawn"],
  "Double first cousins": ["couple-lines-overlap", "couple-through-symbol"],
  "Double second cousins (A)": ["couple-lines-overlap", "couple-through-symbol"],
  "Double second cousins (B)": ["couple-lines-overlap", "couple-through-symbol"],
  "Quadruple half first cousins": ["child-without-parents", "missing-node", "partnership-not-drawn"],
  "Two lineages joined twice": ["couple-through-symbol"],
};

/** Extra findings in compact mode: the duplicate fixup puts these symbols on top of each other. */
const KNOWN_BROKEN_COMPACT_EXTRA: Record<string, string[]> = {
  "Double first cousins": ["symbols-overlap"],
  "Double second cousins (B)": ["symbols-overlap"],
};

const codes = (p: Pedigree, compact = false) =>
  [...new Set(lintFlow(p, layoutToFlow(p, { compact })).map(f => f.code))].sort();

describe("render lint over every example", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.label} draws ${KNOWN_BROKEN[ex.label] ? "with its known problems only" : "cleanly"}`, () => {
      expect(codes(ex.data)).toEqual(KNOWN_BROKEN[ex.label] ?? []);
    });
  }

  it("compact mode raises the same findings, plus its known extras", () => {
    for (const ex of EXAMPLES) {
      const want = [...new Set([...codes(ex.data), ...(KNOWN_BROKEN_COMPACT_EXTRA[ex.label] ?? [])])].sort();
      expect({ label: ex.label, codes: codes(ex.data, true) }).toEqual({ label: ex.label, codes: want });
    }
  });

  it("names every known-broken label that still exists", () => {
    const labels = new Set(EXAMPLES.map(e => e.label));
    const named = [...Object.keys(KNOWN_BROKEN), ...Object.keys(KNOWN_BROKEN_COMPACT_EXTRA)];
    expect(named.filter(l => !labels.has(l))).toEqual([]);
  });
});

describe("lintFlow", () => {
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
    expect(lintFlow(base, layoutToFlow(base))).toEqual([]);
  });

  it("reports a child whose parent line is gone", () => {
    const flow = layoutToFlow(base);
    flow.sibshipEdges = [];
    expect(lintFlow(base, flow).map(f => f.code)).toEqual(["child-without-parents"]);
  });

  it("reports a couple line to a node that is not drawn and the missing person", () => {
    const flow = layoutToFlow(base);
    const mother = flow.nodes.find(n => n.data.individual.id === "m")!;
    flow.nodes = flow.nodes.filter(n => n !== mother);
    const found = lintFlow(base, flow).map(f => f.code);
    expect(found).toContain("missing-individual");
    expect(found).toContain("missing-node");
  });

  it("reports a slanted couple line but not a child off its siblings' row", () => {
    const sibs: Pedigree = {
      ...base,
      individuals: [...base.individuals, { id: "d", sex: "male", affected: false, sibOrder: 1 }],
      parentOf: { p: ["c", "d"] },
    } as Pedigree;
    const flow = layoutToFlow(sibs);
    const mother = flow.nodes.find(n => n.data.individual.id === "m")!;
    mother.position = { ...mother.position, y: mother.position.y + 30 };
    const d = flow.nodes.find(n => n.data.individual.id === "d")!;
    d.position = { ...d.position, y: d.position.y + 40 };
    const found = lintFlow(sibs, flow).map(f => f.code);
    expect(found).toContain("couple-line-slanted");
    // Each child has its own drop (sibshipPath.ts), so an off-row child is still reached.
    expect(found).not.toContain("child-off-row");
  });

  it("reports overlapping symbols", () => {
    const flow = layoutToFlow(base);
    flow.nodes[1]!.position = { ...flow.nodes[0]!.position };
    expect(lintFlow(base, flow).map(f => f.code)).toContain("symbols-overlap");
  });
});
