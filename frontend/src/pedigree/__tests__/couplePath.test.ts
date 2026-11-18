import { describe, it, expect } from "vitest";
import { consanguineousPathsD, couplePathD, couplePortHeights, hopRisers, hopTurn, pathPoints, symbolSideDx } from "../couplePath";
import { COUPLE_PORT_MAX, COUPLE_PORT_STEP, NODE_SIZE } from "../constants";

const half = NODE_SIZE / 2;

describe("couplePortHeights (#177)", () => {
  it("the nearest line leaves at the centre, each further one higher up the side", () => {
    expect(couplePortHeights(1)).toEqual([0]);
    expect(couplePortHeights(2)).toEqual([0, COUPLE_PORT_STEP]);
  });

  it("many lines close up to stay on the side of the symbol", () => {
    for (const count of [3, 4, 6]) {
      const heights = couplePortHeights(count);
      expect(new Set(heights).size).toBe(count);
      expect(Math.max(...heights)).toBeLessThanOrEqual(COUPLE_PORT_MAX);
    }
  });

  it("double lines get room for both of their lines", () => {
    const [near, far] = couplePortHeights(2, true);
    // The facing lines of the two pairs are further apart than the lines of one pair.
    expect(far! - near! - 4).toBeGreaterThan(4);
    // Three on a side still do not touch.
    const three = couplePortHeights(3, true);
    expect(three[1]! - three[0]!).toBeGreaterThanOrEqual(8);
    expect(Math.max(...three) + 2).toBeLessThan(half);
  });
});

describe("symbolSideDx", () => {
  it("is where each outline is, off the centre line", () => {
    expect(symbolSideDx("male", 8)).toBe(19);
    expect(symbolSideDx("female", 0)).toBe(19);
    expect(symbolSideDx("female", 8)).toBeCloseTo(Math.sqrt(19 * 19 - 64));
    expect(symbolSideDx("unknown", 8)).toBe(11);
    expect(symbolSideDx("unknown", -8)).toBe(11);
  });
});

describe("couplePathD", () => {
  const left = { x: 100, y: 50 }, right = { x: 260, y: 50 };

  it("a straight line runs between the edges of the two symbol boxes", () => {
    expect(couplePathD(left, right)).toBe(`M ${100 + half} 50 L ${260 - half} 50`);
  });

  it("a hop leaves the side of the symbol above the line beside it, never the top", () => {
    for (const shape of ["male", "female", "unknown"] as const) {
      const pts = pathPoints(couplePathD({ ...left, shape, port: 8 }, { ...right, shape: "female", port: 0 }, 28));
      const [start, out, up] = pts;
      // On the outline of the side facing the partner, 8px above the centre.
      expect(start).toEqual([100 + symbolSideDx(shape, 8), 42]);
      // It runs level out of the symbol box before it turns up.
      expect(out).toEqual([100 + half + 10, 42]);
      expect(up).toEqual([100 + half + 10, 22]);
      // The far partner has nothing else on that side: the line comes in at the centre.
      expect(pts.slice(-2)).toEqual([[260 - half - 10, 50], [260 - half, 50]]);
    }
  });

  it("a hop turns clear of the person next to each partner, the same distance at both ends", () => {
    const { turn, drop } = hopTurn(80);
    // Past the person in between (their box ends 60px from the partner's centre), before the drop.
    expect(turn).toBeLessThan(60 - 4);
    expect(turn).toBeGreaterThan(drop + 4);
    expect(drop).toBe(40);
    // Hops over more slots turn further from the people they pass, so risers never coincide.
    expect(hopTurn(80, 3).turn).toBeLessThan(turn);
    expect(hopTurn(80, 4).turn).toBeLessThan(hopTurn(80, 3).turn);

    // Three slots 80px apart: the line passes over the middle one.
    const from = { ...left, shape: "male" as const, port: 8, turn }, to = { ...right, shape: "female" as const, port: 0, turn };
    const pts = pathPoints(couplePathD(from, to, 28));
    const [up, down] = hopRisers(from, to);
    expect([up, down]).toEqual([100 + turn, 260 - turn]);
    expect(180 - up).toBe(down - 180);
    // It comes down and runs level into the further partner's side.
    expect(pts.slice(-3)).toEqual([[down, 22], [down, 50], [260 - half, 50]]);
    // The same the other way round, when the further partner is on the left.
    const back = pathPoints(couplePathD({ ...left, shape: "female", port: 0, turn }, { ...right, shape: "male", port: 8, turn }, 28));
    expect(back.slice(0, 3)).toEqual([[100 + half, 50], [100 + turn, 50], [100 + turn, 22]]);
  });

  it("a hop stays level above the higher partner when one is dragged to another height", () => {
    // The left partner dragged down a row: the raised part must still clear
    // the person in between, who stays on the right partner's row.
    for (const dy of [90, -30]) {
      const from = { x: 100, y: 50 + dy, shape: "female" as const, port: 0 }, to = { ...right, shape: "male" as const, port: 8 };
      const pts = pathPoints(couplePathD(from, to, 28));
      const top = Math.min(50 + dy, 50) - 28;
      expect(pts[2]).toEqual([100 + half + 10, top]);
      expect(pts[3]).toEqual([260 - half - 10, top]);
      // Each end still leaves its own symbol's side at its own height.
      expect(pts[0]![1]).toBe(50 + dy);
      expect(pts.at(-1)![1]).toBe(42);
    }
  });

  it("the two lines of a double line that hops stay 4px apart all the way", () => {
    const from = { ...left, shape: "female" as const, port: 12 }, to = { ...right, shape: "male" as const, port: 0 };
    const [outer, inner] = consanguineousPathsD(from, to, 28, 4).map(pathPoints);
    expect(outer).toHaveLength(inner!.length);
    // Leaving the side, along the top and arriving: 4px apart in y.
    for (const i of [0, 2, 3, 5]) expect(inner![i]![1] - outer![i]![1]).toBe(4);
    // The risers: 2px either side of where a single line would turn.
    expect(outer![1]![0]).toBe(100 + half + 8);
    expect(inner![1]![0]).toBe(100 + half + 12);
    expect(outer![4]![0]).toBe(260 - half - 8);
    expect(inner![4]![0]).toBe(260 - half - 12);
  });

  it("a straight double line is two lines 4px apart", () => {
    expect(consanguineousPathsD(left, right)).toEqual([
      `M ${100 + half} 48 L ${260 - half} 48`,
      `M ${100 + half} 52 L ${260 - half} 52`,
    ]);
  });
});
