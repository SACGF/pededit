/**
 * Geometric invariant tests.
 *
 * Each test verifies a structural property that should hold for any valid
 * pedigree layout — independent of the specific scenario. These tests are
 * the primary regression harness for the layout algorithm.
 *
 * Helpers at the bottom make it easy to add new scenario-specific tests.
 */

import { describe, it, expect } from "vitest";
import { pedigreeToGeometry } from "../src/pedigreeToGeometry.js";
import { buildPedigreeFromFlat } from "../src/utils.js";
import type { PedigreeGeometry, NodeGeometry } from "../src/pedigreeToGeometry.js";

// ── Invariant checkers ────────────────────────────────────────────────────────

/** No two nodes at the same level should overlap (centres must be ≥ nodeSize apart). */
function assertNoOverlap(geo: PedigreeGeometry, label: string) {
  const byLevel = new Map<number, NodeGeometry[]>();
  for (const n of geo.nodes) {
    if (!byLevel.has(n.level)) byLevel.set(n.level, []);
    byLevel.get(n.level)!.push(n);
  }
  for (const [lev, row] of byLevel) {
    const sorted = [...row].sort((a, b) => a.cx - b.cx);
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1]!.cx - sorted[i]!.cx;
      const minGap = sorted[i]!.half + sorted[i + 1]!.half; // = nodeSize
      expect(gap, `${label}: level ${lev} slot ${i}→${i + 1} overlap`).toBeGreaterThanOrEqual(minGap - 1e-6);
    }
  }
}

/** Children of each family should be horizontally centred under their parent couple. */
function assertChildrenCentred(geo: PedigreeGeometry, label: string) {
  for (const sib of geo.sibships) {
    if (sib.childXs.length === 0) continue;
    const childMid = sib.childXs.reduce((a, b) => a + b, 0) / sib.childXs.length;
    expect(childMid, `${label}: children not centred (childMid=${childMid.toFixed(2)}, coupleX=${sib.coupleX.toFixed(2)})`).toBeCloseTo(sib.coupleX, 0);
  }
}

/** sibBarY should lie strictly between coupleY and childY. */
function assertSibBarBetween(geo: PedigreeGeometry, label: string) {
  for (const sib of geo.sibships) {
    expect(sib.sibBarY, `${label}: sibBarY not above childY`).toBeLessThan(sib.childY);
    expect(sib.sibBarY, `${label}: sibBarY not below coupleY`).toBeGreaterThan(sib.coupleY);
  }
}

/** Couple line endpoints should sit exactly at the nodes' inner edges. */
function assertCoupleLinesFit(geo: PedigreeGeometry, label: string) {
  const nodeAt = new Map(geo.nodes.map(n => [n.id, n]));
  for (const e of geo.couples) {
    const left  = nodeAt.get(e.leftId)!;
    const right = nodeAt.get(e.rightId)!;
    expect(e.x1, `${label}: couple left endpoint`).toBeCloseTo(left.cx + left.half, 3);
    expect(e.x2, `${label}: couple right endpoint`).toBeCloseTo(right.cx - right.half, 3);
    expect(e.y,  `${label}: couple y`).toBeCloseTo(left.cy, 3);
    expect(e.y,  `${label}: couple y same for both`).toBeCloseTo(right.cy, 3);
  }
}

/** All individuals appear in the geometry (duplicates are allowed, but everyone is placed). */
function assertAllPlaced(geo: PedigreeGeometry, expectedCount: number, label: string) {
  const ids = new Set(geo.nodes.map(n => n.id));
  expect(ids.size, `${label}: not all individuals placed`).toBe(expectedCount);
}

/** Run all standard invariants against a geometry object. */
function assertInvariants(geo: PedigreeGeometry, label: string, expectedIndividualCount: number) {
  assertNoOverlap(geo, label);
  assertChildrenCentred(geo, label);
  assertSibBarBetween(geo, label);
  assertCoupleLinesFit(geo, label);
  assertAllPlaced(geo, expectedIndividualCount, label);
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

describe("geometry invariants", () => {

  it("single individual", () => {
    const ped = buildPedigreeFromFlat([{ id: 1, father: 0, mother: 0, sex: 1 }]);
    const geo = pedigreeToGeometry(ped);
    assertAllPlaced(geo, 1, "single");
    expect(geo.nodes).toHaveLength(1);
    expect(geo.couples).toHaveLength(0);
    expect(geo.sibships).toHaveLength(0);
  });

  it("couple only (no children)", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
    ]);
    // Need to mark as a couple — use a pedigree with partnership
    // buildPedigreeFromFlat doesn't create partnerships with no children; skip couple check
    const geo = pedigreeToGeometry(ped);
    assertAllPlaced(geo, 2, "couple-only");
    assertNoOverlap(geo, "couple-only");
  });

  it("linear 3-gen: grandparents → parent+partner → 2 children (the original bug case)", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },  // grandpa
      { id: 2, father: 0, mother: 0, sex: 2 },  // grandma
      { id: 3, father: 1, mother: 2, sex: 1 },  // sibling
      { id: 4, father: 1, mother: 2, sex: 1 },  // proband
      { id: 5, father: 0, mother: 0, sex: 2 },  // partner
      { id: 6, father: 4, mother: 5, sex: 1 },  // child1
      { id: 7, father: 4, mother: 5, sex: 2 },  // child2
    ]);
    const geo = pedigreeToGeometry(ped);
    assertInvariants(geo, "3gen-bug-case", 7);

    // Specific check: children must be under proband+partner, not sibling+proband
    // buildPedigreeFromFlat gives IDs "4" and "5" (the numeric strings)
    const proband = geo.nodes.find(n => n.id === "4")!;
    const partner = geo.nodes.find(n => n.id === "5")!;
    const child1  = geo.nodes.find(n => n.id === "6")!;
    const child2  = geo.nodes.find(n => n.id === "7")!;
    const parentMid = (proband.cx + partner.cx) / 2;
    const childMid  = (child1.cx + child2.cx) / 2;
    expect(childMid, "children centred under proband+partner").toBeCloseTo(parentMid, 0);
  });

  it("3-gen simple family (simpleFamily fixture equivalent)", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },  // grandpa
      { id: 2, father: 0, mother: 0, sex: 2 },  // grandma
      { id: 3, father: 1, mother: 2, sex: 1 },  // father
      { id: 4, father: 1, mother: 2, sex: 2 },  // aunt
      { id: 5, father: 0, mother: 0, sex: 2 },  // mother (marry-in)
      { id: 6, father: 3, mother: 5, sex: 2 },  // child1
      { id: 7, father: 3, mother: 5, sex: 1 },  // child2
      { id: 8, father: 3, mother: 5, sex: 2 },  // child3
    ]);
    const geo = pedigreeToGeometry(ped);
    assertInvariants(geo, "3gen-simple", 8);
  });

  it("consanguineous couple", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 1, mother: 2, sex: 2 },
      { id: 5, father: 3, mother: 4, sex: 1 },
      { id: 6, father: 3, mother: 4, sex: 2 },
    ]);
    const geo = pedigreeToGeometry(ped);
    assertInvariants(geo, "consanguineous", 6);
    const consangEdge = geo.couples.find(e => e.kind === "consanguineous");
    expect(consangEdge, "consanguineous couple edge").toBeDefined();
  });

  it("two separate families (no shared ancestors)", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 0, mother: 0, sex: 1 },  // founder 2
      { id: 5, father: 0, mother: 0, sex: 2 },  // founder 2's wife
      { id: 6, father: 4, mother: 5, sex: 2 },
    ]);
    const geo = pedigreeToGeometry(ped);
    assertInvariants(geo, "two-families", 6);
  });

  it("4 siblings under one couple", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 1, mother: 2, sex: 2 },
      { id: 5, father: 1, mother: 2, sex: 1 },
      { id: 6, father: 1, mother: 2, sex: 2 },
    ]);
    const geo = pedigreeToGeometry(ped);
    assertInvariants(geo, "4-siblings", 6);
    expect(geo.sibships).toHaveLength(1);
    expect(geo.sibships[0]!.childXs).toHaveLength(4);
  });

  it("parent with two partnerships", () => {
    // i1 (male) has children with two different partners (i2 and i4).
    // Layout places all three in one generation row; all individuals must appear and not overlap.
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 2 },
      { id: 4, father: 0, mother: 0, sex: 2 },
      { id: 5, father: 1, mother: 4, sex: 1 },
    ]);
    const geo = pedigreeToGeometry(ped);
    assertNoOverlap(geo, "two-partnerships");
    assertSibBarBetween(geo, "two-partnerships");
    assertAllPlaced(geo, 5, "two-partnerships");
  });

});
