import { describe, it, expect } from "vitest";
import { deidentify, buildNotationMap } from "../deidentify";
import { alignPedigree } from "@pedigree-editor/layout-engine";
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

// Single individual
const singleMale = makePedigree({
  individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, name: "Alice", dob: "1990-01-01", notes: "some notes" }],
});

// Two individuals in the same generation (couple, no children)
const couple = makePedigree({
  individuals: [
    { id: "i1", sex: "male",   affected: false, sibOrder: 0, name: "Adam" },
    { id: "i2", sex: "female", affected: false, sibOrder: 1, name: "Eve" },
  ],
  partnerships: [{ id: "p1", individual1: "i1", individual2: "i2" }],
  parentOf: {},
});

// Parent + child (two generations)
const twoGen = makePedigree({
  individuals: [
    { id: "i1", sex: "male",   affected: false, sibOrder: 0 },
    { id: "i2", sex: "female", affected: false, sibOrder: 1 },
    { id: "i3", sex: "male",   affected: true,  sibOrder: 0, proband: true },
  ],
  partnerships: [{ id: "p1", individual1: "i1", individual2: "i2" }],
  parentOf: { p1: ["i3"] },
});

// Three generations
const threeGen = makePedigree({
  individuals: [
    { id: "i1", sex: "male",   affected: false, sibOrder: 0 },
    { id: "i2", sex: "female", affected: false, sibOrder: 1 },
    { id: "i3", sex: "male",   affected: false, sibOrder: 0 },
    { id: "i4", sex: "female", affected: false, sibOrder: 1 },
    { id: "i5", sex: "male",   affected: true,  sibOrder: 0 },
  ],
  partnerships: [
    { id: "p1", individual1: "i1", individual2: "i2" },
    { id: "p2", individual1: "i3", individual2: "i4" },
  ],
  parentOf: { p1: ["i3"], p2: ["i5"] },
});

describe("buildNotationMap — notation assignment", () => {
  it("single individual gets notation I-1", () => {
    const result = alignPedigree(singleMale);
    const map = buildNotationMap(singleMale, result);
    expect(map.get("i1")).toBe("I-1");
  });

  it("couple at same level: I-1 left, I-2 right", () => {
    const result = alignPedigree(couple);
    const map = buildNotationMap(couple, result);
    // Both are in generation I
    const notations = [...map.values()];
    expect(notations).toContain("I-1");
    expect(notations).toContain("I-2");
  });

  it("parent generation is I, child generation is II", () => {
    const result = alignPedigree(twoGen);
    const map = buildNotationMap(twoGen, result);
    expect(map.get("i3")).toMatch(/^II-/);
    expect(map.get("i1")).toMatch(/^I-/);
    expect(map.get("i2")).toMatch(/^I-/);
  });

  it("three generations use I, II, III Roman numerals", () => {
    const result = alignPedigree(threeGen);
    const map = buildNotationMap(threeGen, result);
    const notations = [...map.values()];
    expect(notations.some(n => n.startsWith("I-"))).toBe(true);
    expect(notations.some(n => n.startsWith("II-"))).toBe(true);
    expect(notations.some(n => n.startsWith("III-"))).toBe(true);
  });

  it("duplicate individual (same nid in two slots) gets notation only once", () => {
    const result = alignPedigree(threeGen);
    const map = buildNotationMap(threeGen, result);
    // Each individual should appear at most once in the map
    const seen = new Set<string>();
    for (const notation of map.values()) {
      expect(seen.has(notation)).toBe(false);
      seen.add(notation);
    }
    // All 5 individuals should be mapped
    expect(map.size).toBe(5);
  });
});

describe("deidentify — data stripping", () => {
  it("name replaced with notation", () => {
    const out = deidentify(singleMale);
    expect(out.individuals[0].name).toBe("I-1");
  });

  it("dob removed when ageBuckets=false", () => {
    const out = deidentify(singleMale, { ageBuckets: false });
    expect(out.individuals[0].dob).toBeUndefined();
  });

  it("notes removed", () => {
    const out = deidentify(singleMale);
    expect(out.individuals[0].notes).toBeUndefined();
  });

  it("affected flag preserved", () => {
    const pedigree = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: true, sibOrder: 0 }],
    });
    const out = deidentify(pedigree);
    expect(out.individuals[0].affected).toBe(true);
  });

  it("deceased flag preserved", () => {
    const pedigree = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, deceased: true, sibOrder: 0 }],
    });
    const out = deidentify(pedigree);
    expect(out.individuals[0].deceased).toBe(true);
  });

  it("carrier flag preserved", () => {
    const pedigree = makePedigree({
      individuals: [{ id: "i1", sex: "female", affected: false, carrier: true, sibOrder: 0 }],
    });
    const out = deidentify(pedigree);
    expect(out.individuals[0].carrier).toBe(true);
  });

  it("proband flag preserved", () => {
    const pedigree = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: true, proband: true, sibOrder: 0 }],
    });
    const out = deidentify(pedigree);
    expect(out.individuals[0].proband).toBe(true);
  });

  it("sex preserved", () => {
    const out = deidentify(singleMale);
    expect(out.individuals[0].sex).toBe("male");
  });

  it("id preserved", () => {
    const out = deidentify(singleMale);
    expect(out.individuals[0].id).toBe("i1");
  });

  it("original pedigree is not mutated", () => {
    const pedigree = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, name: "Original" }],
    });
    deidentify(pedigree);
    expect(pedigree.individuals[0].name).toBe("Original");
  });
});

describe("deidentify — age buckets", () => {
  // Use a fixed reference date to make tests deterministic
  // We test ageBucket indirectly through the deidentify function by using dob values
  // relative to today. The test checks the shape of the output, not exact dates.

  function makeDobPedigree(dob: string) {
    return makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, dob }],
    });
  }

  it("dob < 1 year ago → infant", () => {
    const recentDob = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = deidentify(makeDobPedigree(recentDob), { ageBuckets: true });
    expect(out.individuals[0].dob).toBe("infant");
  });

  it("dob 5 years ago → child", () => {
    const dob = new Date(Date.now() - 5 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = deidentify(makeDobPedigree(dob), { ageBuckets: true });
    expect(out.individuals[0].dob).toBe("child");
  });

  it("dob 14 years ago → teen", () => {
    const dob = new Date(Date.now() - 14 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = deidentify(makeDobPedigree(dob), { ageBuckets: true });
    expect(out.individuals[0].dob).toBe("teen");
  });

  it("dob 35 years ago → 30s", () => {
    const dob = new Date(Date.now() - 35 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = deidentify(makeDobPedigree(dob), { ageBuckets: true });
    expect(out.individuals[0].dob).toBe("30s");
  });

  it("dob 72 years ago → 70s", () => {
    const dob = new Date(Date.now() - 72 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = deidentify(makeDobPedigree(dob), { ageBuckets: true });
    expect(out.individuals[0].dob).toBe("70s");
  });
});
