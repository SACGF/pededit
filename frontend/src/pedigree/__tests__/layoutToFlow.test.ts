import { describe, it, expect } from "vitest";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { simpleFamily } from "../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../fixtures/consanguineous";
import { SLOT_WIDTH, ROW_HEIGHT, SIB_BAR_FACTOR, COUPLE_HOP } from "../constants";
import type { Pedigree } from "@pedigree-editor/layout-engine";

// Concrete layout engine output for these fixtures (verified by running alignPedigree):
//
// simpleFamily:
//   n       = [2, 3, 3]
//   nid     = [[1,2], [3,5,4], [6,7,8]]
//   pos     = [[1,2], [0.5,1.5,2.5], [0,1,2]]   ← QP centres gen-0 over gen-1 children
//   fam     = [[0,0], [1,0,1], [1,1,1]]
//   spouse  = [[1,0], [1,0,0], [0,0,0]]
//
// consanguineousFamily:
//   n       = [2, 2, 2]
//   nid     = [[1,2], [3,4], [5,6]]
//   pos     = [[0,1], [0,1], [0,1]]              ← compact symmetric family; QP leaves at 0/1
//   fam     = [[0,0], [1,1], [1,1]]
//   spouse  = [[1,0], [2,0], [0,0]]

// ── Helpers ────────────────────────────���─────────────────���─────────────────────

/** x-coordinate in canvas px for a given pos value. */
const px = (pos: number) => pos * SLOT_WIDTH;
/** y-coordinate in canvas px for a given level. */
const py = (level: number) => level * ROW_HEIGHT;

// ── simpleFamily ──────────────────────────���─────────────────────────────��─────

describe("layoutToFlow — simpleFamily", () => {
  const { nodes, coupleEdges, sibshipEdges } = layoutToFlow(simpleFamily);

  describe("nodes", () => {
    it("produces 8 nodes (2 + 3 + 3 across three generations)", () => {
      expect(nodes).toHaveLength(8);
    });

    it("node ids follow level-slot scheme", () => {
      const ids = nodes.map((n) => n.id);
      expect(ids).toContain("0-0");
      expect(ids).toContain("0-1");
      expect(ids).toContain("1-0");
      expect(ids).toContain("1-1");
      expect(ids).toContain("1-2");
      expect(ids).toContain("2-0");
      expect(ids).toContain("2-1");
      expect(ids).toContain("2-2");
    });

    it("node type is pedigreeSymbol for all nodes", () => {
      expect(nodes.every((n) => n.type === "pedigreeSymbol")).toBe(true);
    });

    it("gen-0 nodes carry the correct individuals", () => {
      const n00 = nodes.find((n) => n.id === "0-0")!;
      const n01 = nodes.find((n) => n.id === "0-1")!;
      expect(n00.data.individual.id).toBe("i1");
      expect(n01.data.individual.id).toBe("i2");
    });

    it("gen-1 nodes carry the correct individuals (nid=[3,5,4])", () => {
      // i3 at slot 0, i5 at slot 1, i4 at slot 2
      const n10 = nodes.find((n) => n.id === "1-0")!;
      const n11 = nodes.find((n) => n.id === "1-1")!;
      const n12 = nodes.find((n) => n.id === "1-2")!;
      expect(n10.data.individual.id).toBe("i3");
      expect(n11.data.individual.id).toBe("i5");
      expect(n12.data.individual.id).toBe("i4");
    });

    it("gen-2 nodes carry the correct individuals", () => {
      const n20 = nodes.find((n) => n.id === "2-0")!;
      const n21 = nodes.find((n) => n.id === "2-1")!;
      const n22 = nodes.find((n) => n.id === "2-2")!;
      expect(n20.data.individual.id).toBe("i6");
      expect(n21.data.individual.id).toBe("i7");
      expect(n22.data.individual.id).toBe("i8");
    });

    it("positions match pos × SLOT_WIDTH / level × ROW_HEIGHT", () => {
      const n00 = nodes.find((n) => n.id === "0-0")!;
      const n01 = nodes.find((n) => n.id === "0-1")!;
      const n12 = nodes.find((n) => n.id === "1-2")!;
      const n22 = nodes.find((n) => n.id === "2-2")!;
      // QP centres grandparents over their two children at slots 0.5 and 2.5,
      // shifting them from [0,1] to ≈[1,2]; use toBeCloseTo for QP-optimised x values.
      expect(n00.position.x).toBeCloseTo(px(1), 0);
      expect(n00.position.y).toBe(py(0));
      expect(n01.position.x).toBeCloseTo(px(2), 0);
      expect(n01.position.y).toBe(py(0));
      expect(n12.position.x).toBeCloseTo(px(2.5), 0);
      expect(n12.position.y).toBe(py(1));
      // gen-2 grandchildren: QP may introduce tiny floating-point errors
      expect(n22.position.x).toBeCloseTo(px(2), 3);
      expect(n22.position.y).toBe(py(2));
    });

    it("no individual appears in two slots → isDuplicate is false for all", () => {
      expect(nodes.every((n) => n.data.isDuplicate === false)).toBe(true);
    });

    it("isDuplicate=false → duplicateIndex is undefined", () => {
      expect(nodes.every((n) => n.data.duplicateIndex === undefined)).toBe(true);
    });
  });

  describe("coupleEdges", () => {
    it("produces exactly 2 couple edges", () => {
      expect(coupleEdges).toHaveLength(2);
    });

    it("i1–i2 couple edge exists at gen 0 (coupleEdge type)", () => {
      const edge = coupleEdges.find((e) => e.id === "couple-0-0");
      expect(edge).toBeDefined();
      expect(edge!.source).toBe("0-0");
      expect(edge!.target).toBe("0-1");
      expect(edge!.type).toBe("coupleEdge");
    });

    it("i3–i5 couple edge exists at gen 1 (coupleEdge type)", () => {
      const edge = coupleEdges.find((e) => e.id === "couple-1-0");
      expect(edge).toBeDefined();
      expect(edge!.source).toBe("1-0");
      expect(edge!.target).toBe("1-1");
      expect(edge!.type).toBe("coupleEdge");
    });

    it("all couple edges use correct handles", () => {
      for (const edge of coupleEdges) {
        expect(edge.sourceHandle).toBe("couple-out");
        expect(edge.targetHandle).toBe("couple-in");
      }
    });
  });

  describe("sibshipEdges", () => {
    it("produces exactly 2 sibship edges", () => {
      expect(sibshipEdges).toHaveLength(2);
    });

    it("gen-1 sibship edge: i3+i4 under i1–i2 (fam=1)", () => {
      const edge = sibshipEdges.find((e) => e.id === "sibship-1-1");
      expect(edge).toBeDefined();
      expect(edge!.type).toBe("sibshipEdge");
      expect(edge!.source).toBe("0-0");  // left parent slot
      expect(edge!.target).toBe("1-0");  // leftmost child slot
    });

    it("gen-1 sibship geometry: coupleX midpoint, correct bar and child positions", () => {
      const edge = sibshipEdges.find((e) => e.id === "sibship-1-1")!;
      const { coupleX, coupleY, sibBarY, childXs, childY } = edge.data!;
      // grandparents at pos≈[1,2] → midpoint ≈ 1.5 × SLOT_WIDTH
      expect(coupleX).toBeCloseTo(1.5 * SLOT_WIDTH, 0);
      expect(coupleY).toBe(py(0));
      expect(sibBarY).toBe((1 - SIB_BAR_FACTOR) * ROW_HEIGHT);
      expect(childY).toBe(py(1));
      // children i3 at pos≈0.5, i4 at pos≈2.5 (slot 1 = i5 has fam=0, not a child here)
      expect(childXs[0]).toBeCloseTo(0.5 * SLOT_WIDTH, 0);
      expect(childXs[1]).toBeCloseTo(2.5 * SLOT_WIDTH, 0);
    });

    it("gen-2 sibship edge: i6+i7+i8 under i3–i5 (fam=1)", () => {
      const edge = sibshipEdges.find((e) => e.id === "sibship-2-1");
      expect(edge).toBeDefined();
      expect(edge!.source).toBe("1-0");
      expect(edge!.target).toBe("2-0");
    });

    it("gen-2 sibship geometry: three children, correct positions", () => {
      const edge = sibshipEdges.find((e) => e.id === "sibship-2-1")!;
      const { coupleX, coupleY, sibBarY, childXs, childY } = edge.data!;
      // parents i3 at pos≈0.5 and i5 at pos≈1.5 → midpoint ≈ 1.0 × SLOT_WIDTH
      expect(coupleX).toBeCloseTo(1.0 * SLOT_WIDTH, 0);
      expect(coupleY).toBe(py(1));
      expect(sibBarY).toBe((2 - SIB_BAR_FACTOR) * ROW_HEIGHT);
      expect(childY).toBe(py(2));
      // grandchildren at positions ≈[0,1,2] × SLOT_WIDTH (QP may add tiny float error)
      expect(childXs[0]).toBeCloseTo(px(0), 3);
      expect(childXs[1]).toBeCloseTo(px(1), 3);
      expect(childXs[2]).toBeCloseTo(px(2), 3);
    });

    it("all sibship edges use correct handles", () => {
      for (const edge of sibshipEdges) {
        expect(edge.sourceHandle).toBe("sibship-out");
        expect(edge.targetHandle).toBe("sibship-in");
      }
    });
  });
});

// ── consanguineousFamily ──────────────────────────────────────────────────────

describe("layoutToFlow — consanguineousFamily", () => {
  const { nodes, coupleEdges, sibshipEdges } = layoutToFlow(consanguineousFamily);

  describe("nodes", () => {
    it("produces 6 nodes (2 + 2 + 2)", () => {
      expect(nodes).toHaveLength(6);
    });

    it("i1 and i2 are at gen 0", () => {
      expect(nodes.find((n) => n.id === "0-0")!.data.individual.id).toBe("i1");
      expect(nodes.find((n) => n.id === "0-1")!.data.individual.id).toBe("i2");
    });

    it("i3 and i4 are at gen 1", () => {
      expect(nodes.find((n) => n.id === "1-0")!.data.individual.id).toBe("i3");
      expect(nodes.find((n) => n.id === "1-1")!.data.individual.id).toBe("i4");
    });

    it("i5 (proband) and i6 are at gen 2", () => {
      expect(nodes.find((n) => n.id === "2-0")!.data.individual.id).toBe("i5");
      expect(nodes.find((n) => n.id === "2-1")!.data.individual.id).toBe("i6");
    });

    it("no duplicates", () => {
      expect(nodes.every((n) => n.data.isDuplicate === false)).toBe(true);
    });
  });

  describe("coupleEdges", () => {
    it("produces exactly 2 couple edges", () => {
      expect(coupleEdges).toHaveLength(2);
    });

    it("i1–i2 couple is a single line (coupleEdge)", () => {
      const edge = coupleEdges.find((e) => e.id === "couple-0-0")!;
      expect(edge.type).toBe("coupleEdge");
    });

    it("i3–i4 couple is a double line (consanguineousEdge)", () => {
      const edge = coupleEdges.find((e) => e.id === "couple-1-0")!;
      expect(edge).toBeDefined();
      expect(edge.source).toBe("1-0");
      expect(edge.target).toBe("1-1");
      expect(edge.type).toBe("consanguineousEdge");
    });
  });

  describe("sibshipEdges", () => {
    it("produces exactly 2 sibship edges", () => {
      expect(sibshipEdges).toHaveLength(2);
    });

    it("gen-1 sibship: i3+i4 under i1–i2", () => {
      const edge = sibshipEdges.find((e) => e.id === "sibship-1-1")!;
      expect(edge).toBeDefined();
      const { coupleX, sibBarY, childXs } = edge.data!;
      expect(coupleX).toBeCloseTo(0.5 * SLOT_WIDTH, 5);
      expect(sibBarY).toBeCloseTo((1 - SIB_BAR_FACTOR) * ROW_HEIGHT, 5);
      expect(childXs[0]).toBeCloseTo(px(0), 5);
      expect(childXs[1]).toBeCloseTo(px(1), 5);
    });

    it("gen-2 sibship: i5+i6 under i3–i4", () => {
      const edge = sibshipEdges.find((e) => e.id === "sibship-2-1")!;
      expect(edge).toBeDefined();
      const { coupleX, coupleY, sibBarY, childXs, childY } = edge.data!;
      expect(coupleX).toBeCloseTo(0.5 * SLOT_WIDTH, 5);
      expect(coupleY).toBeCloseTo(py(1), 5);
      expect(sibBarY).toBeCloseTo((2 - SIB_BAR_FACTOR) * ROW_HEIGHT, 5);
      expect(childY).toBeCloseTo(py(2), 5);
      expect(childXs[0]).toBeCloseTo(px(0), 5);
      expect(childXs[1]).toBeCloseTo(px(1), 5);
    });
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("layoutToFlow — edge cases", () => {
  it("empty pedigree returns no nodes or edges (alignPedigree throws on empty input, layoutToFlow guards it)", () => {
    const { nodes, coupleEdges, sibshipEdges } = layoutToFlow({
      individuals: [],
      partnerships: [],
      parentOf: {},
      siblingOrder: { mode: "insertion", affectedFirst: false },
    });
    expect(nodes).toHaveLength(0);
    expect(coupleEdges).toHaveLength(0);
    expect(sibshipEdges).toHaveLength(0);
  });

  it("single individual: one node, no edges", () => {
    const { nodes, coupleEdges, sibshipEdges } = layoutToFlow({
      individuals: [{ id: "x1", sex: "male", affected: false, sibOrder: 0 }],
      partnerships: [],
      parentOf: {},
      siblingOrder: { mode: "insertion", affectedFirst: false },
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.data.individual.id).toBe("x1");
    expect(coupleEdges).toHaveLength(0);
    expect(sibshipEdges).toHaveLength(0);
  });

});

// ── Someone drawn more than once ──────────────────────────────────────────────

describe("layoutToFlow: duplicated individuals", () => {
  const ind = (id: string, sex: "male" | "female") => ({ id, sex, affected: false, sibOrder: 0 });
  const so = { mode: "insertion" as const, affectedFirst: false };

  // Double first cousins: a1 is a child of A1 = A2 and the partner of b2,
  // while his sister a2 marries b2's sister b1. kinship2 draws a1 twice.
  const dfc: Pedigree = {
    individuals: [ind("A1", "male"), ind("A2", "female"), ind("B1", "male"), ind("B2", "female"),
                  ind("a1", "male"), ind("a2", "female"), ind("b1", "male"), ind("b2", "female"),
                  ind("Y", "female"), ind("X", "male")],
    partnerships: [
      { id: "pA", individual1: "A1", individual2: "A2" },
      { id: "pB", individual1: "B1", individual2: "B2" },
      { id: "p1", individual1: "b1", individual2: "a2" },
      { id: "p2", individual1: "a1", individual2: "b2" },
    ],
    parentOf: { pA: ["a1", "a2"], pB: ["b1", "b2"], p1: ["Y"], p2: ["X"] },
    siblingOrder: so,
  };

  it("draws every copy that carries a line, numbered in reading order", () => {
    const { nodes } = layoutToFlow(dfc);
    const a1 = nodes.filter(n => n.data.individual.id === "a1");
    expect(a1).toHaveLength(2);
    expect(a1.map(n => n.data.isDuplicate)).toEqual([true, true]);
    expect(a1.map(n => n.data.duplicateIndex)).toEqual([1, 2]);
  });

  it("joins the copies with one dashed duplicate edge", () => {
    const { nodes, duplicateEdges } = layoutToFlow(dfc);
    const a1 = nodes.filter(n => n.data.individual.id === "a1").map(n => n.id);
    expect(duplicateEdges).toHaveLength(1);
    expect([duplicateEdges[0]!.source, duplicateEdges[0]!.target]).toEqual(a1);
    expect(duplicateEdges[0]!.type).toBe("duplicateEdge");
  });

  it("the child copy hangs from its parents and the other copy has the couple line", () => {
    const { nodes, coupleEdges, sibshipEdges } = layoutToFlow(dfc);
    const idOf = (id: string) => nodes.find(n => n.id === id)!.data.individual.id;
    const [first, second] = nodes.filter(n => n.data.individual.id === "a1").map(n => n.id);
    const pA = sibshipEdges.find(e => idOf(e.data!.leftParentId) === "A1")!;
    expect(pA.data!.childIds).toContain(first);
    expect(coupleEdges.some(e => e.source === second || e.target === second)).toBe(true);
  });

  it("a pin moves only the copy laid out nearest to it", () => {
    const auto = layoutToFlow(dfc).nodes.filter(n => n.data.individual.id === "a1");
    const pin = { x: auto[1]!.position.x + 10, y: auto[1]!.position.y + 5 };
    const { nodes } = layoutToFlow({ ...dfc, pinnedPositions: { a1: pin } });
    const a1 = nodes.filter(n => n.data.individual.id === "a1");
    expect(a1[0]!.position).toEqual(auto[0]!.position);
    expect(a1[0]!.data.isPinned).toBe(false);
    expect(a1[1]!.position).toEqual(pin);
    expect(a1[1]!.data.isPinned).toBe(true);
  });

  it("leaves out a copy with no line at all", () => {
    // Quadruple half first cousins: A-B, C-D, A-D, C-B. kinship2 leaves a
    // spare copy of D at the end of the founder row with nothing attached.
    const q: Pedigree = {
      individuals: [ind("A", "male"), ind("B", "female"), ind("C", "male"), ind("D", "female"),
                    ind("F1", "male"), ind("M1", "female"), ind("F2", "male"), ind("M2", "female"),
                    ind("X", "male"), ind("Y", "female")],
      partnerships: [
        { id: "ab", individual1: "A", individual2: "B" },
        { id: "cd", individual1: "C", individual2: "D" },
        { id: "ad", individual1: "A", individual2: "D" },
        { id: "cb", individual1: "C", individual2: "B" },
        { id: "x", individual1: "F1", individual2: "M1" },
        { id: "y", individual1: "F2", individual2: "M2" },
      ],
      parentOf: { ab: ["F1"], cd: ["M1"], ad: ["F2"], cb: ["M2"], x: ["X"], y: ["Y"] },
      siblingOrder: so,
    };
    const { nodes, coupleEdges } = layoutToFlow(q);
    const count = (id: string) => nodes.filter(n => n.data.individual.id === id).length;
    expect(count("D")).toBe(2);
    const ids = new Set(nodes.map(n => n.id));
    for (const e of coupleEdges) {
      expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    }
  });

  it("man with three wives where two remarry: every marriage and child is drawn", () => {
    const ped: Pedigree = {
      individuals: [ind("m", "male"), ind("w1", "female"), ind("w2", "female"), ind("w3", "female"),
                    ind("h2", "male"), ind("h3", "male"),
                    ind("c1", "male"), ind("c2", "female"), ind("c3", "male"), ind("d2", "female"), ind("d3", "male")],
      partnerships: [
        { id: "p1", individual1: "m", individual2: "w1" },
        { id: "p2", individual1: "m", individual2: "w2" },
        { id: "p3", individual1: "m", individual2: "w3" },
        { id: "q2", individual1: "h2", individual2: "w2" },
        { id: "q3", individual1: "h3", individual2: "w3" },
      ],
      parentOf: { p1: ["c1"], p2: ["c2"], p3: ["c3"], q2: ["d2"], q3: ["d3"] },
      siblingOrder: so,
    };
    const flow = layoutToFlow(ped);
    const ids = new Set(flow.nodes.map(n => n.id));
    const idOf = (id: string) => flow.nodes.find(n => n.id === id)!.data.individual.id;
    for (const e of flow.coupleEdges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    const pairs = new Set(flow.coupleEdges.map(e => [idOf(e.source), idOf(e.target)].sort().join("=")));
    expect([...pairs].sort()).toEqual(["h2=w2", "h3=w3", "m=w1", "m=w2", "m=w3"]);
    const kids = new Set(flow.sibshipEdges.flatMap(e => e.data!.childIds.map(idOf)));
    expect([...kids].sort()).toEqual(["c1", "c2", "c3", "d2", "d3"]);
    expect(lintFlow(ped, flow)).toEqual([]);
  });
});

// ── Someone with three partners ───────────────────────────────────────────────

describe("layoutToFlow — man with three wives", () => {
  // Layout (kinship2): wife2 ~ man ~ wife3 ~ wife4. The marker between wife3
  // and wife4 is the man's line passing through to wife4.
  const ind = (id: string, sex: "male" | "female") => ({ id, sex, affected: false, sibOrder: 0 });
  const ped: Pedigree = {
    individuals: [ind("m", "male"), ind("w1", "female"), ind("w2", "female"), ind("w3", "female"),
                  ind("c1", "male"), ind("c2", "female"), ind("c3", "male")],
    partnerships: [
      { id: "p1", individual1: "m", individual2: "w1" },
      { id: "p2", individual1: "m", individual2: "w2" },
      { id: "p3", individual1: "m", individual2: "w3" },
    ],
    parentOf: { p1: ["c1"], p2: ["c2"], p3: ["c3"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
  const { nodes, coupleEdges, sibshipEdges } = layoutToFlow(ped);
  const idOf = (nodeId: string) => nodes.find(n => n.id === nodeId)!.data.individual.id;

  it("draws each person once", () => {
    expect(nodes).toHaveLength(7);
  });

  it("joins the man to each wife; the far wife's edge hops over the near one", () => {
    const pairs = coupleEdges.map(e => ({ pair: [idOf(e.source), idOf(e.target)].sort().join("-"), hop: e.data!.hopHeight }));
    expect(pairs.filter(p => p.hop === 0).map(p => p.pair).sort()).toEqual(["m-w1", "m-w2"]);
    const far = pairs.find(p => p.hop > 0)!;
    expect(far.pair).toBe("m-w3");
    expect(far.hop).toBe(COUPLE_HOP);
  });

  it("never draws a couple edge between two wives", () => {
    for (const e of coupleEdges) {
      expect([idOf(e.source), idOf(e.target)]).toContain("m");
    }
  });

  it("line style comes from the real partners, not the slots a hop passes over", () => {
    // Flag the far marriage only: its hopping line is double, the near ones single.
    const flagged: Pedigree = {
      ...ped,
      partnerships: ped.partnerships.map(p => p.id === "p3" ? { ...p, consanguineous: true } : p),
    };
    const flow = layoutToFlow(flagged);
    const idOfF = (nodeId: string) => flow.nodes.find(n => n.id === nodeId)!.data.individual.id;
    const types = Object.fromEntries(flow.coupleEdges.map(e =>
      [[idOfF(e.source), idOfF(e.target)].sort().join("-"), e.type]));
    expect(types).toEqual({ "m-w1": "coupleEdge", "m-w2": "coupleEdge", "m-w3": "consanguineousEdge" });
  });

  it("with five wives, two hops from the man on one side rise at different x", () => {
    const five: Pedigree = {
      individuals: [ind("m", "male"), ...[1, 2, 3, 4, 5].map(i => ind(`w${i}`, "female")),
                    ...[1, 2, 3, 4, 5].map(i => ind(`k${i}`, "male"))],
      partnerships: [1, 2, 3, 4, 5].map(i => ({ id: `p${i}`, individual1: "m", individual2: `w${i}` })),
      parentOf: Object.fromEntries([1, 2, 3, 4, 5].map(i => [`p${i}`, [`k${i}`]])),
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const flow = layoutToFlow(five);
    const man = flow.nodes.find(n => n.data.individual.id === "m")!.id;
    // Hops that leave the man on the same side.
    const right = flow.coupleEdges.filter(e => e.source === man && e.data!.hopHeight > 0);
    const left  = flow.coupleEdges.filter(e => e.target === man && e.data!.hopHeight > 0);
    const sides = [right, left].filter(s => s.length > 1);
    expect(sides.length).toBeGreaterThan(0);
    for (const side of sides) {
      const insets = side.map(e => e.data!.hopInset);
      expect(new Set(insets).size).toBe(insets.length);
    }
  });

  it("the far wife's child drops from the raised line", () => {
    const raised = sibshipEdges.filter(e => e.data!.hopHeight > 0);
    expect(raised).toHaveLength(1);
    expect(raised[0]!.data!.childIds.map(idOf)).toEqual(["c3"]);
    expect(sibshipEdges.filter(e => e.data!.hopHeight === 0)).toHaveLength(2);
  });
});

// ── compact mode ──────────────────────────────────────────────────────────────

describe("layoutToFlow: compact option", () => {
  const ROW_SCALE  = 0.7;
  const SLOT_SCALE = 0.85;

  it("default (no options) keeps the normal spacing", () => {
    const { nodes } = layoutToFlow(simpleFamily);
    const n20 = nodes.find((n) => n.id === "2-0")!;
    const n21 = nodes.find((n) => n.id === "2-1")!;
    expect(n21.position.x - n20.position.x).toBeCloseTo(SLOT_WIDTH);
    expect(n20.position.y).toBeCloseTo(2 * ROW_HEIGHT);
  });

  it("compact=true places rows at 70% of ROW_HEIGHT", () => {
    const { nodes } = layoutToFlow(simpleFamily, { compact: true });
    for (const level of [0, 1, 2]) {
      const node = nodes.find((n) => n.id === `${level}-0`)!;
      expect(node.position.y).toBeCloseTo(level * ROW_HEIGHT * ROW_SCALE);
    }
  });

  it("compact=true places slots at 85% of SLOT_WIDTH", () => {
    const { nodes } = layoutToFlow(simpleFamily, { compact: true });
    // gen-2 children sit at pos 0, 1, 2 (one slot apart).
    const n20 = nodes.find((n) => n.id === "2-0")!;
    const n21 = nodes.find((n) => n.id === "2-1")!;
    const n22 = nodes.find((n) => n.id === "2-2")!;
    expect(n21.position.x - n20.position.x).toBeCloseTo(SLOT_WIDTH * SLOT_SCALE);
    expect(n22.position.x - n21.position.x).toBeCloseTo(SLOT_WIDTH * SLOT_SCALE);
    // Every position is the normal position scaled by the same factors.
    const normal = layoutToFlow(simpleFamily).nodes;
    for (const node of nodes) {
      const ref = normal.find((n) => n.id === node.id)!;
      expect(node.position.x).toBeCloseTo(ref.position.x * SLOT_SCALE);
      expect(node.position.y).toBeCloseTo(ref.position.y * ROW_SCALE);
    }
  });

  it("compact=true derives sibship geometry from the compact positions", () => {
    const { sibshipEdges } = layoutToFlow(simpleFamily, { compact: true });
    const gen1 = sibshipEdges.find((e) => e.id === "sibship-1-1")!;
    const data = gen1.data!;
    expect(data.coupleY).toBeCloseTo(0);
    expect(data.childY).toBeCloseTo(ROW_HEIGHT * ROW_SCALE);
    expect(data.sibBarY).toBeCloseTo(ROW_HEIGHT * ROW_SCALE * SIB_BAR_FACTOR);
  });

  it("compact=true scales pinned positions by the same factors", () => {
    const pinned: Pedigree = {
      ...simpleFamily,
      pinnedPositions: { i6: { x: 300, y: 240 } },
    };
    const { nodes } = layoutToFlow(pinned, { compact: true });
    const n6 = nodes.find((n) => n.data.individual.id === "i6")!;
    expect(n6.data.isPinned).toBe(true);
    expect(n6.position.x).toBeCloseTo(300 * SLOT_SCALE);
    expect(n6.position.y).toBeCloseTo(240 * ROW_SCALE);

    // Without compact the pin is used as stored.
    const n6normal = layoutToFlow(pinned).nodes.find((n) => n.data.individual.id === "i6")!;
    expect(n6normal.position).toEqual({ x: 300, y: 240 });
  });
});
