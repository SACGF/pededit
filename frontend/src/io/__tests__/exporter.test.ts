import { describe, it, expect } from "vitest";
import { exportPed } from "../ped/exporter.js";
import { importPed } from "../ped/index.js";
import type { Pedigree } from "@pedigree-editor/layout-engine";

function makePedigree(overrides: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...overrides,
  };
}

describe("exportPed", () => {
  it("exports nuclear family with correct columns", () => {
    const ped: Pedigree = makePedigree({
      individuals: [
        { id: "1", sex: "male",   affected: false, sibOrder: 0 },
        { id: "2", sex: "female", affected: false, sibOrder: 1 },
        { id: "3", sex: "male",   affected: true,  sibOrder: 0 },
        { id: "4", sex: "female", affected: false, sibOrder: 1 },
      ],
      partnerships: [
        { id: "p_1__2", individual1: "1", individual2: "2" },
      ],
      parentOf: { "p_1__2": ["3", "4"] },
    });

    const text = exportPed(ped);
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(4);
    // Parents are founders
    expect(lines[0]).toBe("1\t1\t0\t0\t1\t1");
    expect(lines[1]).toBe("1\t2\t0\t0\t2\t1");
    // Children
    expect(lines[2]).toBe("1\t3\t1\t2\t1\t2");  // affected
    expect(lines[3]).toBe("1\t4\t1\t2\t2\t1");  // unaffected
  });

  it("exports founders with PAT=0 MAT=0", () => {
    const ped = makePedigree({
      individuals: [
        { id: "1", sex: "male", affected: false, sibOrder: 0 },
        { id: "2", sex: "female", affected: false, sibOrder: 1 },
      ],
    });
    const text = exportPed(ped);
    const lines = text.trim().split("\n");
    for (const line of lines) {
      const cols = line.split("\t");
      expect(cols[2]).toBe("0"); // PAT
      expect(cols[3]).toBe("0"); // MAT
    }
  });

  it("maps sex correctly: male→1, female→2, unknown→0", () => {
    const ped = makePedigree({
      individuals: [
        { id: "1", sex: "male",    affected: false, sibOrder: 0 },
        { id: "2", sex: "female",  affected: false, sibOrder: 1 },
        { id: "3", sex: "unknown", affected: false, sibOrder: 2 },
      ],
    });
    const lines = exportPed(ped).trim().split("\n");
    expect(lines[0]!.split("\t")[4]).toBe("1");
    expect(lines[1]!.split("\t")[4]).toBe("2");
    expect(lines[2]!.split("\t")[4]).toBe("0");
  });

  it("maps affection correctly: affected→2, unaffected→1", () => {
    const ped = makePedigree({
      individuals: [
        { id: "1", sex: "male",   affected: true,  sibOrder: 0 },
        { id: "2", sex: "female", affected: false, sibOrder: 1 },
      ],
    });
    const lines = exportPed(ped).trim().split("\n");
    expect(lines[0]!.split("\t")[5]).toBe("2");
    expect(lines[1]!.split("\t")[5]).toBe("1");
  });

  it("uses default FID '1' when not specified", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const lines = exportPed(ped).trim().split("\n");
    expect(lines[0]!.split("\t")[0]).toBe("1");
  });

  it("respects custom familyId option", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const lines = exportPed(ped, { familyId: "FAM_A" }).trim().split("\n");
    expect(lines[0]!.split("\t")[0]).toBe("FAM_A");
  });

  it("includes header when includeHeader: true", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const text = exportPed(ped, { includeHeader: true });
    expect(text.startsWith("#FID\tIID\tPAT\tMAT\tSEX\tPHENO\n")).toBe(true);
  });

  it("does not include header by default", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const text = exportPed(ped);
    expect(text.startsWith("#")).toBe(false);
  });

  it("round-trip: export → import preserves structure", () => {
    const original: Pedigree = makePedigree({
      individuals: [
        { id: "1", sex: "male",   affected: false, sibOrder: 0 },
        { id: "2", sex: "female", affected: false, sibOrder: 1 },
        { id: "3", sex: "male",   affected: true,  sibOrder: 0 },
        { id: "4", sex: "female", affected: false, sibOrder: 1 },
      ],
      partnerships: [{ id: "p_1__2", individual1: "1", individual2: "2" }],
      parentOf: { "p_1__2": ["3", "4"] },
    });

    const text = exportPed(original);
    const result = importPed(text);
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees).toHaveLength(1);

    const roundtripped = result.pedigrees[0]!.pedigree;
    expect(roundtripped.individuals).toHaveLength(4);
    expect(roundtripped.partnerships).toHaveLength(1);
    const p = roundtripped.partnerships[0]!;
    expect(roundtripped.parentOf[p.id]).toHaveLength(2);

    // Verify sex and affected preserved
    const byId = Object.fromEntries(roundtripped.individuals.map(i => [i.id, i]));
    expect(byId["1"]!.sex).toBe("male");
    expect(byId["2"]!.sex).toBe("female");
    expect(byId["3"]!.affected).toBe(true);
    expect(byId["4"]!.affected).toBe(false);
  });

  it("output ends with a newline", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    expect(exportPed(ped).endsWith("\n")).toBe(true);
  });
});
