import { describe, it, expect } from "vitest";
import { buildScene } from "../scene";
import { sceneToFlow } from "../sceneToFlow";
import { lintScene } from "../renderLint";
import { simpleFamily } from "../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../fixtures/consanguineous";
import { SLOT_WIDTH, ROW_HEIGHT, COUPLE_HOP, COUPLE_PORT_STEP, NODE_SIZE } from "../constants";
import { sibshipLineGeometry } from "../lineGeometry";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { M, build } from "../../fixtures/features";

// These look people and lines up by person, not by layout slot, and check
// relations (same row, between, under) rather than restating the layout's
// positions: where the layout puts people is the oracle tests' business.

/** A scene with lookups by person id. */
function sceneOf(p: Pedigree) {
  const scene = buildScene(p);
  const idOf = (nodeId: string) => scene.people.find(n => n.id === nodeId)!.individual.id;
  const at = (id: string) => scene.people.find(n => n.individual.id === id)!.position;
  /** Each couple line as "a=b" (person ids, sorted), with whether it is double. */
  const couples = scene.couples.map(e => ({ pair: [idOf(e.source), idOf(e.target)].sort().join("="), double: e.double }));
  /** The sibship line under the couple `a`, `b`, if there is one. */
  const sibshipOf = (a: string, b: string) => scene.sibships.find(e =>
    [idOf(e.data.leftParentId), idOf(e.data.rightParentId)].sort().join("=") === [a, b].sort().join("="));
  return { scene, idOf, at, couples, sibshipOf };
}

/** A sibship line joins its couple's line to each child's symbol, with the bar between the two rows. */
function expectSibshipJoins(s: ReturnType<typeof sceneOf>, parents: [string, string], children: string[]) {
  const edge = s.sibshipOf(...parents)!;
  expect(edge, parents.join("=")).toBeDefined();
  const { coupleX, coupleY, sibBarY, childXs, childY } = edge.data;
  expect(edge.data.childIds.map(s.idOf)).toEqual(children);
  const [a, b] = parents.map(s.at);
  expect(coupleY).toBe(a!.y);
  expect(coupleX).toBeCloseTo((a!.x + b!.x) / 2, 6);
  expect(childXs).toEqual(children.map(c => s.at(c).x));
  for (const c of children) expect(s.at(c).y).toBe(childY);
  // The bar is drawn halfway between the couple and their children.
  expect(sibBarY).toBeCloseTo((coupleY + childY) / 2, 6);
}

// ── simpleFamily ──────────────────────────────────────────────────────────────

describe("buildScene: simpleFamily", () => {
  const s = sceneOf(simpleFamily);
  const ids = (list: { individual: { id: string } }[]) => list.map(n => n.individual.id).sort();

  it("draws each of the 8 people once", () => {
    expect(ids(s.scene.people)).toEqual(["i1", "i2", "i3", "i4", "i5", "i6", "i7", "i8"]);
    expect(s.scene.people.every(n => n.glyph.copy === undefined && !n.branch)).toBe(true);
  });

  it("puts each generation on its own row, one ROW_HEIGHT apart, and siblings in birth order", () => {
    const row = (id: string) => s.at(id).y;
    expect(row("i2")).toBe(row("i1"));
    for (const id of ["i3", "i4", "i5"]) expect(row(id)).toBe(row("i1") + ROW_HEIGHT);
    for (const id of ["i6", "i7", "i8"]) expect(row(id)).toBe(row("i1") + 2 * ROW_HEIGHT);
    const x = (id: string) => s.at(id).x;
    expect(x("i3")).toBeLessThan(x("i4"));
    expect(x("i6")).toBeLessThan(x("i7"));
    expect(x("i7")).toBeLessThan(x("i8"));
  });

  it("draws a single line for each couple, between the partners", () => {
    expect(s.couples).toEqual(expect.arrayContaining([{ pair: "i1=i2", double: false }, { pair: "i3=i5", double: false }]));
    expect(s.couples).toHaveLength(2);
  });

  it("joins each couple to their children", () => {
    expect(s.scene.sibships).toHaveLength(2);
    expectSibshipJoins(s, ["i1", "i2"], ["i3", "i4"]);
    expectSibshipJoins(s, ["i3", "i5"], ["i6", "i7", "i8"]);
  });

  it("the canvas joins lines to the symbols' couple and sibship handles", () => {
    const flow = sceneToFlow(buildScene(simpleFamily));
    for (const edge of flow.coupleEdges) expect([edge.sourceHandle, edge.targetHandle]).toEqual(["couple-out", "couple-in"]);
    for (const edge of flow.sibshipEdges) expect([edge.sourceHandle, edge.targetHandle]).toEqual(["sibship-out", "sibship-in"]);
  });
});

// ── consanguineousFamily ──────────────────────────────────────────────────────

describe("buildScene: consanguineousFamily", () => {
  const s = sceneOf(consanguineousFamily);

  it("draws each of the 6 people once", () => {
    expect(s.scene.people.map(n => n.individual.id).sort()).toEqual(["i1", "i2", "i3", "i4", "i5", "i6"]);
    expect(s.scene.people.every(n => n.glyph.copy === undefined)).toBe(true);
  });

  it("draws the related couple's line double and the other single", () => {
    expect(s.couples).toEqual(expect.arrayContaining([{ pair: "i1=i2", double: false }, { pair: "i3=i4", double: true }]));
    expect(s.couples).toHaveLength(2);
  });

  it("joins each couple to their children", () => {
    expect(s.scene.sibships).toHaveLength(2);
    expectSibshipJoins(s, ["i1", "i2"], ["i3", "i4"]);
    expectSibshipJoins(s, ["i3", "i4"], ["i5", "i6"]);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("buildScene: edge cases", () => {
  it("empty pedigree returns no people or lines (alignPedigree throws on empty input, buildScene guards it)", () => {
    const { people, couples, sibships } = buildScene(build([], [], {}));
    expect([people, couples, sibships]).toEqual([[], [], []]);
  });

  it("single individual: one person, no lines", () => {
    const { people, couples, sibships } = buildScene(build([M("x1")], [], {}));
    expect(people.map(n => n.individual.id)).toEqual(["x1"]);
    expect([couples, sibships]).toEqual([[], []]);
  });
});

// ── Someone drawn more than once ──────────────────────────────────────────────

describe("buildScene: duplicated individuals", () => {
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
    const { people: nodes } = buildScene(dfc);
    const a1 = nodes.filter(n => n.individual.id === "a1");
    expect(a1).toHaveLength(2);
    expect(a1.map(n => (n.glyph.copy !== undefined))).toEqual([true, true]);
    expect(a1.map(n => n.glyph.copy)).toEqual([1, 2]);
  });

  it("joins the copies with one dashed duplicate edge", () => {
    const { people: nodes, duplicates: duplicateEdges } = buildScene(dfc);
    const a1 = nodes.filter(n => n.individual.id === "a1").map(n => n.id);
    expect(duplicateEdges).toHaveLength(1);
    expect([duplicateEdges[0]!.source, duplicateEdges[0]!.target]).toEqual(a1);
    expect(duplicateEdges[0]!.data.bulge).toBeGreaterThan(0);
  });

  it("the child copy hangs from its parents and the other copy has the couple line", () => {
    const { people: nodes, couples: coupleEdges, sibships: sibshipEdges } = buildScene(dfc);
    const idOf = (id: string) => nodes.find(n => n.id === id)!.individual.id;
    const [first, second] = nodes.filter(n => n.individual.id === "a1").map(n => n.id);
    const pA = sibshipEdges.find(e => idOf(e.data.leftParentId) === "A1")!;
    expect(pA.data.childIds).toContain(first);
    expect(coupleEdges.some(e => e.source === second || e.target === second)).toBe(true);
  });

  it("a pin moves only the copy laid out nearest to it", () => {
    const auto = buildScene(dfc).people.filter(n => n.individual.id === "a1");
    const pin = { x: auto[1]!.position.x + 10, y: auto[1]!.position.y + 5 };
    const { people: nodes } = buildScene({ ...dfc, pinnedPositions: { a1: pin } });
    const a1 = nodes.filter(n => n.individual.id === "a1");
    expect(a1[0]!.position).toEqual(auto[0]!.position);
    expect(a1[0]!.isPinned).toBe(false);
    expect(a1[1]!.position).toEqual(pin);
    expect(a1[1]!.isPinned).toBe(true);
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
    const { people: nodes, couples: coupleEdges } = buildScene(q);
    const count = (id: string) => nodes.filter(n => n.individual.id === id).length;
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
    const flow = buildScene(ped);
    const ids = new Set(flow.people.map(n => n.id));
    const idOf = (id: string) => flow.people.find(n => n.id === id)!.individual.id;
    for (const e of flow.couples) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    const pairs = new Set(flow.couples.map(e => [idOf(e.source), idOf(e.target)].sort().join("=")));
    expect([...pairs].sort()).toEqual(["h2=w2", "h3=w3", "m=w1", "m=w2", "m=w3"]);
    const kids = new Set(flow.sibships.flatMap(e => e.data.childIds.map(idOf)));
    expect([...kids].sort()).toEqual(["c1", "c2", "c3", "d2", "d3"]);
    expect(lintScene(ped, flow)).toEqual([]);
  });
});

// ── Someone with three partners ───────────────────────────────────────────────

describe("buildScene — man with three wives", () => {
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
  const { people: nodes, couples: coupleEdges, sibships: sibshipEdges } = buildScene(ped);
  const idOf = (nodeId: string) => nodes.find(n => n.id === nodeId)!.individual.id;

  it("draws each person once", () => {
    expect(nodes).toHaveLength(7);
  });

  it("joins the man to each wife; the far wife's edge hops over the near one", () => {
    const pairs = coupleEdges.map(e => ({ pair: [idOf(e.source), idOf(e.target)].sort().join("-"), hop: e.data.hopHeight }));
    expect(pairs.filter(p => p.hop === 0).map(p => p.pair).sort()).toEqual(["m-w1", "m-w2"]);
    const far = pairs.find(p => p.hop > 0)!;
    expect(far.pair).toBe("m-w3");
    expect(far.hop).toBe(COUPLE_HOP);
  });

  it("the hop leaves the man's side above the line to the wife beside him, and meets the far wife at her centre (#177)", () => {
    const far = coupleEdges.find(e => e.data.hopHeight > 0)!;
    const ends = far.data.hopEnds!;
    const [manEnd, wifeEnd] = idOf(far.source) === "m" ? [ends.source, ends.target] : [ends.target, ends.source];
    expect(manEnd).toMatchObject({ shape: "male", port: COUPLE_PORT_STEP });
    expect(wifeEnd).toMatchObject({ shape: "female", port: 0 });
    // It turns up as far before the wife it passes as it comes down after her.
    expect(manEnd.turn).toBe(wifeEnd.turn);
    // A line between neighbours is straight, at the centre.
    expect(coupleEdges.filter(e => e.data.hopHeight === 0).every(e => e.data.hopEnds === undefined)).toBe(true);
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
    const flow = buildScene(flagged);
    const idOfF = (nodeId: string) => flow.people.find(n => n.id === nodeId)!.individual.id;
    const types = Object.fromEntries(flow.couples.map(e =>
      [[idOfF(e.source), idOfF(e.target)].sort().join("-"), e.double]));
    expect(types).toEqual({ "m-w1": false, "m-w2": false, "m-w3": true });
  });

  it("with five wives, two hops from the man on one side leave it at different heights and rise at different x", () => {
    const five: Pedigree = {
      individuals: [ind("m", "male"), ...[1, 2, 3, 4, 5].map(i => ind(`w${i}`, "female")),
                    ...[1, 2, 3, 4, 5].map(i => ind(`k${i}`, "male"))],
      partnerships: [1, 2, 3, 4, 5].map(i => ({ id: `p${i}`, individual1: "m", individual2: `w${i}` })),
      parentOf: Object.fromEntries([1, 2, 3, 4, 5].map(i => [`p${i}`, [`k${i}`]])),
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    const flow = buildScene(five);
    const man = flow.people.find(n => n.individual.id === "m")!.id;
    // Hops that leave the man on the same side.
    const right = flow.couples.filter(e => e.source === man && e.data.hopHeight > 0);
    const left  = flow.couples.filter(e => e.target === man && e.data.hopHeight > 0);
    const sides = [right, left].filter(s => s.length > 1);
    expect(sides.length).toBeGreaterThan(0);
    for (const side of sides) {
      const turns = side.map(e => (e.source === man ? e.data.hopEnds!.source : e.data.hopEnds!.target).turn);
      expect(new Set(turns).size).toBe(turns.length);
      const ports = side.map(e => (e.source === man ? e.data.hopEnds!.source : e.data.hopEnds!.target).port);
      expect(new Set(ports).size).toBe(ports.length);
      expect(Math.min(...ports)).toBeGreaterThan(0);
    }
    // Two hops pass over one gap: each child's drop reaches its own parents' line.
    expect(lintScene(five, flow)).toEqual([]);
  });

  it("the far wife's child hangs from the level end of the hop, beside her", () => {
    const hopping = sibshipEdges.filter(e => e.data.hopDrop);
    expect(hopping).toHaveLength(1);
    expect(hopping[0]!.data.childIds.map(idOf)).toEqual(["c3"]);
    const { parentId, dx } = hopping[0]!.data.hopDrop!;
    expect(idOf(parentId)).toBe("w3");

    // The couple line comes down past the wife in between, before the drop.
    const far = coupleEdges.find(e => e.data.hopHeight > 0)!;
    const wifeEnd = far.source === parentId ? far.data.hopEnds!.source : far.data.hopEnds!.target;
    const wife = nodes.find(n => n.id === parentId)!;
    const gapToBetween = Math.min(...nodes
      .filter(n => n !== wife && n.position.y === wife.position.y)
      .map(n => Math.abs(wife.position.x - n.position.x)));
    expect(Math.abs(dx)).toBe(gapToBetween / 2);
    expect(wifeEnd.drop).toBe(Math.abs(dx));
    expect(wifeEnd.turn!).toBeGreaterThan(Math.abs(dx) + 4);
    expect(wifeEnd.turn!).toBeLessThan(gapToBetween - NODE_SIZE / 2 - 4);
    // The drop starts at the row, on the level stretch: nothing hangs from the raised part.
    const geometry = sibshipLineGeometry(hopping[0]!.data, id => nodes.find(x => x.id === id))!;
    expect(geometry.solid[0]!.slice(0, 2)).toEqual([wife.position.x + dx, wife.position.y]);
  });
});

// ── compact mode ──────────────────────────────────────────────────────────────

describe("buildScene: compact option", () => {
  const ROW_SCALE  = 0.7;
  const SLOT_SCALE = 0.85;

  const at = (p: Pedigree, compact: boolean, id: string) =>
    buildScene(p, compact ? { compact: true } : {}).people.find(n => n.individual.id === id)!.position;

  it("default (no options) keeps the normal spacing: siblings one slot apart, rows one row apart", () => {
    expect(at(simpleFamily, false, "i7").x - at(simpleFamily, false, "i6").x).toBeCloseTo(SLOT_WIDTH);
    expect(at(simpleFamily, false, "i6").y - at(simpleFamily, false, "i3").y).toBeCloseTo(ROW_HEIGHT);
  });

  it("compact=true scales every position: slots to 85%, rows to 70%", () => {
    expect(at(simpleFamily, true, "i7").x - at(simpleFamily, true, "i6").x).toBeCloseTo(SLOT_WIDTH * SLOT_SCALE);
    expect(at(simpleFamily, true, "i6").y - at(simpleFamily, true, "i3").y).toBeCloseTo(ROW_HEIGHT * ROW_SCALE);
    for (const { id } of simpleFamily.individuals) {
      expect(at(simpleFamily, true, id).x).toBeCloseTo(at(simpleFamily, false, id).x * SLOT_SCALE);
      expect(at(simpleFamily, true, id).y).toBeCloseTo(at(simpleFamily, false, id).y * ROW_SCALE);
    }
  });

  it("compact=true derives sibship geometry from the compact positions", () => {
    const s = sceneOf(simpleFamily);
    const compact = buildScene(simpleFamily, { compact: true });
    const idOf = (nodeId: string) => compact.people.find(n => n.id === nodeId)!.individual.id;
    const atC = (id: string) => compact.people.find(n => n.individual.id === id)!.position;
    const gen1 = compact.sibships.find(e => idOf(e.data.childIds[0]!) === "i3")!.data;
    expect(gen1.coupleY).toBeCloseTo(atC("i1").y);
    expect(gen1.childY).toBeCloseTo(atC("i3").y);
    expect(gen1.sibBarY).toBeCloseTo((gen1.coupleY + gen1.childY) / 2);
    expect(gen1.childY).toBeCloseTo(s.at("i3").y * ROW_SCALE);
  });

  it("compact=true scales pinned positions by the same factors", () => {
    const pinned: Pedigree = {
      ...simpleFamily,
      pinnedPositions: { i6: { x: 300, y: 240 } },
    };
    const { people: nodes } = buildScene(pinned, { compact: true });
    const n6 = nodes.find((n) => n.individual.id === "i6")!;
    expect(n6.isPinned).toBe(true);
    expect(n6.position.x).toBeCloseTo(300 * SLOT_SCALE);
    expect(n6.position.y).toBeCloseTo(240 * ROW_SCALE);

    // Without compact the pin is used as stored.
    const n6normal = buildScene(pinned).people.find((n) => n.individual.id === "i6")!;
    expect(n6normal.position).toEqual({ x: 300, y: 240 });
  });
});
