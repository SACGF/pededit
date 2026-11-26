import { describe, it, expect } from "vitest";
import { pedigreeToGeometry } from "@pedigree-editor/layout-engine";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { buildScene } from "../scene";
import { coupleLineGeometry, sibshipLineGeometry } from "../lineGeometry";
import { pathPoints } from "../couplePath";
import { build, couple, F, M } from "../../fixtures/features";

/**
 * The layout engine's pedigreeToGeometry describes a couple line that hops
 * over a partner the way the editor draws it (#206): same route, same drop
 * to the children. The engine draws the outline 0px inside the symbol box
 * and the editor 1px (its stroke), so where a line meets a circle off its
 * centre the two may differ by about a pixel.
 */
function compare(pedigree: Pedigree) {
  const geo = pedigreeToGeometry(pedigree);
  const flow = buildScene(pedigree, { improveLayout: false });
  const pos = new Map(flow.people.map(n => [n.id, n.position]));
  // Same layout, possibly translated.
  const first = geo.nodes[0]!, p0 = pos.get(`${first.level}-${first.slot}`)!;
  const dx = p0.x - first.cx, dy = p0.y - first.cy;
  for (const n of geo.nodes) {
    const p = pos.get(`${n.level}-${n.slot}`)!;
    expect([p.x - dx, p.y - dy]).toEqual([n.cx, n.cy]);
  }

  const hops = geo.couples.filter(c => c.hopHeight > 0);
  expect(hops.length).toBeGreaterThan(0);
  const idOf = new Map(flow.people.map(n => [n.id, n.individual.id]));
  for (const c of hops) {
    const edge = flow.couples.find(e => idOf.get(e.source) === c.leftId && idOf.get(e.target) === c.rightId)!;
    expect(edge, `${c.leftId}-${c.rightId}`).toBeDefined();
    const line = coupleLineGeometry(edge.data, false, pos.get(edge.source)!, pos.get(edge.target)!);
    const drawn = pathPoints(line.course).map(([x, y]) => [x - dx, y - dy]);
    expect(drawn).toHaveLength(c.points.length);
    drawn.forEach(([x, y], i) => {
      const [ex, ey] = c.points[i]!;
      expect(Math.abs(x! - ex), `${c.leftId}-${c.rightId} point ${i}`).toBeLessThan(1.5);
      expect(y).toBeCloseTo(ey);
    });
  }

  for (const e of flow.sibships) {
    const data = e.data;
    const lines = sibshipLineGeometry(data, id => {
      const n = flow.people.find(m => m.id === id);
      return n;
    })!;
    const [x, y] = lines.solid[0]!;
    const s = geo.sibships.find(t => Math.abs(t.coupleX - (x - dx)) < 1e-6 && t.coupleY + dy < y + 1 && t.childY + dy > y)!;
    expect(s, `sibship ${e.id}`).toBeDefined();
    expect(y - dy).toBeCloseTo(s.dropY);
  }
}

describe("pedigreeToGeometry draws a hopping couple line as the editor does (#206)", () => {
  it("a man with three wives", () => {
    compare(build(
      [M("m"), F("w1"), F("w2"), F("w3"), M("k1"), F("k2"), M("k3")],
      [couple("p1", "m", "w1"), couple("p2", "m", "w2"), couple("p3", "m", "w3")],
      { p1: ["k1"], p2: ["k2"], p3: ["k3"] },
    ));
  });

  it("a woman with five husbands: two hops from one side of a circle", () => {
    compare(build(
      [F("a"), M("a1"), M("a2"), M("a3"), M("a4"), M("a5"), M("k1"), F("k2"), M("k3"), F("k4"), M("k5")],
      [1, 2, 3, 4, 5].map(i => couple(`p${i}`, `a${i}`, "a")),
      { p1: ["k1"], p2: ["k2"], p3: ["k3"], p4: ["k4"], p5: ["k5"] },
    ));
  });
});
