import { describe, it, expect } from "vitest";
import { layoutToFlow } from "../layoutToFlow";
import { simpleFamily } from "../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../fixtures/consanguineous";
import { SLOT_WIDTH, ROW_HEIGHT, SIB_BAR_FACTOR } from "../constants";

// Concrete layout engine output for these fixtures (verified by running alignPedigree):
//
// simpleFamily:
//   n       = [2, 3, 3]
//   nid     = [[1,2], [3,5,4], [6,7,8]]
//   pos     = [[0,1], [0,1,2], [0,1,2]]
//   fam     = [[0,0], [1,0,1], [1,1,1]]
//   spouse  = [[1,0], [1,0,0], [0,0,0]]
//
// consanguineousFamily:
//   n       = [2, 2, 2]
//   nid     = [[1,2], [3,4], [5,6]]
//   pos     = [[0,1], [0,1], [0,1]]
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
      expect(n00.position).toEqual({ x: px(0), y: py(0) });
      expect(n01.position).toEqual({ x: px(1), y: py(0) });
      expect(n12.position).toEqual({ x: px(2), y: py(1) });
      expect(n22.position).toEqual({ x: px(2), y: py(2) });
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
      // parents at pos[0][0]=0 and pos[0][1]=1 → midpoint = 0.5 → × SLOT_WIDTH = 40
      expect(coupleX).toBe(0.5 * SLOT_WIDTH);
      expect(coupleY).toBe(py(0));
      expect(sibBarY).toBe((1 - SIB_BAR_FACTOR) * ROW_HEIGHT);
      expect(childY).toBe(py(1));
      // children at slots 0 (i3, pos=0) and 2 (i4, pos=2) — slot 1 (i5) has fam=0
      expect(childXs).toEqual([px(0), px(2)]);
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
      // parents i3 and i5 at pos[1][0]=0 and pos[1][1]=1 → midpoint = 0.5 → 40px
      expect(coupleX).toBe(0.5 * SLOT_WIDTH);
      expect(coupleY).toBe(py(1));
      expect(sibBarY).toBe((2 - SIB_BAR_FACTOR) * ROW_HEIGHT);
      expect(childY).toBe(py(2));
      expect(childXs).toEqual([px(0), px(1), px(2)]);
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
      expect(coupleX).toBe(0.5 * SLOT_WIDTH);
      expect(sibBarY).toBe((1 - SIB_BAR_FACTOR) * ROW_HEIGHT);
      expect(childXs).toEqual([px(0), px(1)]);
    });

    it("gen-2 sibship: i5+i6 under i3–i4", () => {
      const edge = sibshipEdges.find((e) => e.id === "sibship-2-1")!;
      expect(edge).toBeDefined();
      const { coupleX, coupleY, sibBarY, childXs, childY } = edge.data!;
      expect(coupleX).toBe(0.5 * SLOT_WIDTH);
      expect(coupleY).toBe(py(1));
      expect(sibBarY).toBe((2 - SIB_BAR_FACTOR) * ROW_HEIGHT);
      expect(childY).toBe(py(2));
      expect(childXs).toEqual([px(0), px(1)]);
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
    });
    expect(nodes).toHaveLength(0);
    expect(coupleEdges).toHaveLength(0);
    expect(sibshipEdges).toHaveLength(0);
  });

  it("single individual: one node, no edges", () => {
    const { nodes, coupleEdges, sibshipEdges } = layoutToFlow({
      individuals: [{ id: "x1", sex: "male", affected: false }],
      partnerships: [],
      parentOf: {},
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.data.individual.id).toBe("x1");
    expect(coupleEdges).toHaveLength(0);
    expect(sibshipEdges).toHaveLength(0);
  });

  it.todo(
    // TODO Phase 6: autohint stub does not yet produce duplicate slots for multi-partner individuals.
    // When full autohint is implemented, an individual with two partnerships should appear in two
    // adjacent slots (one per partner). buildNodes must mark both with isDuplicate=true and
    // assign duplicateIndex 1 and 2 respectively. Re-enable this test in Phase 6.
    "isDuplicate detection: individual in two slots gets isDuplicate=true on both",
  );
});
