import { describe, it, expect } from "vitest";
import { convertFamily, isPhantomId } from "../ped/converter.js";
import type { PedRow } from "../ped/types.js";
import { consanguinityTest } from "../../pedigree/consanguinity";

function makeRow(overrides: Partial<PedRow> & { individualId: string }): PedRow {
  return {
    familyId: "1",
    individualId: overrides.individualId,
    fatherId: overrides.fatherId ?? "0",
    motherId: overrides.motherId ?? "0",
    sex: overrides.sex ?? "1",
    affection: overrides.affection ?? "1",
    lineNumber: overrides.lineNumber ?? 1,
    extraColumns: [],
  };
}

describe("convertFamily", () => {
  it("nuclear family: 2 parents + 2 children → 1 partnership, 4 individuals", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2", sex: "1" }),
      makeRow({ individualId: "4", fatherId: "1", motherId: "2", sex: "2" }),
    ];
    const ped = convertFamily(rows);
    expect(ped.individuals).toHaveLength(4);
    expect(ped.partnerships).toHaveLength(1);
    const p = ped.partnerships[0]!;
    expect(Object.values(ped.parentOf)[0]).toHaveLength(2);
    expect(ped.parentOf[p.id]).toContain("3");
    expect(ped.parentOf[p.id]).toContain("4");
  });

  it("maps sex codes correctly", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", sex: "0" }),
    ];
    const ped = convertFamily(rows);
    const byId = Object.fromEntries(ped.individuals.map(i => [i.id, i]));
    expect(byId["1"]!.sex).toBe("male");
    expect(byId["2"]!.sex).toBe("female");
    expect(byId["3"]!.sex).toBe("unknown");
  });

  it("maps affection codes correctly (2=affected, others=false)", () => {
    const rows = [
      makeRow({ individualId: "1", affection: "2" }),
      makeRow({ individualId: "2", affection: "1" }),
      makeRow({ individualId: "3", affection: "0" }),
      makeRow({ individualId: "4", affection: "-9" }),
    ];
    const ped = convertFamily(rows);
    const byId = Object.fromEntries(ped.individuals.map(i => [i.id, i]));
    expect(byId["1"]!.affected).toBe(true);
    expect(byId["2"]!.affected).toBe(false);
    expect(byId["3"]!.affected).toBe(false);
    expect(byId["4"]!.affected).toBe(false);
  });

  it("creates phantom Individual for phantom father", () => {
    // Father "1" is referenced but has no row
    const rows = [
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2" }),
    ];
    const ped = convertFamily(rows);
    // Should have 3 individuals: "2", "3", and phantom "1"
    expect(ped.individuals).toHaveLength(3);
    const phantom = ped.individuals.find(i => i.id === "1");
    expect(phantom).toBeDefined();
    expect(phantom!.sex).toBe("male");
  });

  it("creates phantom Individual for phantom mother", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "99" }),
    ];
    const ped = convertFamily(rows);
    expect(ped.individuals).toHaveLength(3);
    const phantom = ped.individuals.find(i => i.id === "99");
    expect(phantom).toBeDefined();
    expect(phantom!.sex).toBe("female");
  });

  it("creates phantom partner for single-parent (father only)", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "0" }),
    ];
    const ped = convertFamily(rows);
    // Should create a phantom mother for ind "3"
    expect(ped.individuals.length).toBeGreaterThan(3);
    const phantomMother = ped.individuals.find(i => i.id.startsWith("__phantom_mother"));
    expect(phantomMother).toBeDefined();
    expect(phantomMother!.sex).toBe("female");
    // Partnership should exist between "1" and the phantom
    expect(ped.partnerships).toHaveLength(1);
  });

  it("creates phantom partner for single-parent (mother only)", () => {
    const rows = [
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "4", fatherId: "0", motherId: "2" }),
    ];
    const ped = convertFamily(rows);
    const phantomFather = ped.individuals.find(i => i.id.startsWith("__phantom_father"));
    expect(phantomFather).toBeDefined();
    expect(phantomFather!.sex).toBe("male");
  });

  // The double line comes from kinship at draw time (#85); import stores no flag.
  it("a sibling mating is drawn double, with no flag stored", () => {
    // 1+2 → 3 (son) + 4 (daughter); 3+4 → 5
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2", sex: "1" }),
      makeRow({ individualId: "4", fatherId: "1", motherId: "2", sex: "2" }),
      makeRow({ individualId: "5", fatherId: "3", motherId: "4" }),
    ];
    const ped = convertFamily(rows);
    const p = ped.partnerships.find(p => p.individual1 === "3" && p.individual2 === "4");
    expect(p).toBeDefined();
    expect(p!.consanguineous).toBeUndefined();
    expect(consanguinityTest(ped)("3", "4")).toBe(true);
    expect(consanguinityTest(ped)("1", "2")).toBe(false);
  });

  it("a first-cousin mating is drawn double, with no flag stored", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2", sex: "1" }),
      makeRow({ individualId: "4", fatherId: "1", motherId: "2", sex: "2" }),
      makeRow({ individualId: "5", sex: "2" }),   // wife of son 3
      makeRow({ individualId: "6", sex: "1" }),   // husband of daughter 4
      makeRow({ individualId: "7", fatherId: "3", motherId: "5", sex: "1" }),
      makeRow({ individualId: "8", fatherId: "6", motherId: "4", sex: "2" }),
      makeRow({ individualId: "9", fatherId: "7", motherId: "8" }),
    ];
    const ped = convertFamily(rows);
    const p = ped.partnerships.find(p => p.individual1 === "7" && p.individual2 === "8");
    expect(p).toBeDefined();
    expect(p!.consanguineous).toBeUndefined();
    const double = consanguinityTest(ped);
    expect(double("7", "8")).toBe(true);
    expect(double("3", "5")).toBe(false);
    expect(double("6", "4")).toBe(false);
  });

  it("an unrelated couple is drawn single", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2" }),
    ];
    const ped = convertFamily(rows);
    const p = ped.partnerships[0]!;
    expect(p.consanguineous).toBeUndefined();
    expect(consanguinityTest(ped)(p.individual1, p.individual2)).toBe(false);
  });

  it("assigns sibOrder by file order within sibling group", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2" }),
      makeRow({ individualId: "4", fatherId: "1", motherId: "2" }),
      makeRow({ individualId: "5", fatherId: "1", motherId: "2" }),
    ];
    const ped = convertFamily(rows);
    const byId = Object.fromEntries(ped.individuals.map(i => [i.id, i]));
    expect(byId["3"]!.sibOrder).toBe(0);
    expect(byId["4"]!.sibOrder).toBe(1);
    expect(byId["5"]!.sibOrder).toBe(2);
  });

  it("builds two partnerships for three-generation chain", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", fatherId: "1", motherId: "2", sex: "1" }),
      makeRow({ individualId: "4", sex: "2" }),
      makeRow({ individualId: "5", fatherId: "3", motherId: "4" }),
    ];
    const ped = convertFamily(rows);
    expect(ped.partnerships).toHaveLength(2);
  });

  it("half-siblings: shared father, different mothers → two partnerships", () => {
    const rows = [
      makeRow({ individualId: "1", sex: "1" }),
      makeRow({ individualId: "2", sex: "2" }),
      makeRow({ individualId: "3", sex: "2" }),
      makeRow({ individualId: "4", fatherId: "1", motherId: "2" }),
      makeRow({ individualId: "5", fatherId: "1", motherId: "3" }),
    ];
    const ped = convertFamily(rows);
    expect(ped.partnerships).toHaveLength(2);
    // Half-siblings by shared father: should not be consanguineous partnerships
    for (const p of ped.partnerships) {
      expect(p.consanguineous).toBeUndefined();
    }
  });
});

describe("convertFamily: phantom IDs", () => {
  it("marks invented single-parent partners with the phantom prefix", () => {
    const ped = convertFamily([
      { familyId: "1", individualId: "1", fatherId: "0", motherId: "0", sex: "1", affection: "1", lineNumber: 1, extraColumns: [] },
      { familyId: "1", individualId: "2", fatherId: "1", motherId: "0", sex: "1", affection: "1", lineNumber: 2, extraColumns: [] },
    ]);
    expect(ped.individuals.filter(i => isPhantomId(i.id))).toHaveLength(1);
    expect(isPhantomId("1")).toBe(false);
  });
});
