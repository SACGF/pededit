import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { exportJson, importJson, buildJsonEnvelope, JsonIssueCode, JSON_FORMAT, JSON_VERSION } from "../index.js";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../../fixtures/consanguineous";
import { largerFamily } from "../../../fixtures/largerFamily";
import { makeSyntheticFamily } from "../../../fixtures/syntheticFamily";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, "../../../../../docs");

/** A pedigree exercising every optional field in the data model. */
const fullFeatured: Pedigree = {
  individuals: [
    { id: "a", sex: "male", affected: false, sibOrder: 0, name: "Arthur", dob: "1950-01-02", notes: "founder" },
    { id: "b", sex: "female", affected: true, deceased: true, sibOrder: 0, hpoTerms: ["HP:0001250"], tags: ["t1", "t2"] },
    { id: "c", sex: "unknown", affected: false, carrier: true, proband: true, sibOrder: 0, name: "Child" },
  ],
  partnerships: [{ id: "p", individual1: "a", individual2: "b", consanguineous: false }],
  parentOf: { p: ["c"] },
  siblingOrder: { mode: "birthDate", affectedFirst: true },
  pinnedPositions: { c: { x: 120.5, y: 240 } },
  canvasSettings: { nodesMoveable: true, snapToGrid: true, snapGridSize: 20 },
  unlockedIndividuals: ["a"],
  tags: [
    { id: "t1", label: "Breast cancer", color: "#c0392b", style: "quadrant" },
    { id: "t2", label: "BRCA1 c.68_69del", color: "#2c3e50", style: "text", abbrev: "B1+" },
  ],
};

function roundtrip(ped: Pedigree) {
  const text = exportJson(ped, { title: "t" });
  const result = importJson(text);
  expect(result.hasErrors).toBe(false);
  expect(result.issues.filter(i => i.severity === "error")).toEqual([]);
  return result;
}

describe("JSON export", () => {
  it("writes the envelope with format, version, exportedAt, title and pedigree", () => {
    const text = exportJson(simpleFamily, { title: "Simple", exportedAt: "2026-01-01T00:00:00.000Z" });
    const doc = JSON.parse(text);
    expect(doc.format).toBe(JSON_FORMAT);
    expect(doc.version).toBe(JSON_VERSION);
    expect(doc.exportedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(doc.title).toBe("Simple");
    expect(doc.pedigree).toEqual(simpleFamily);
  });

  it("is pretty-printed", () => {
    expect(exportJson(simpleFamily).split("\n").length).toBeGreaterThan(10);
  });

  it("defaults exportedAt to a valid ISO timestamp", () => {
    const env = buildJsonEnvelope(simpleFamily);
    expect(Number.isNaN(Date.parse(env.exportedAt))).toBe(false);
  });
});

describe("JSON roundtrip", () => {
  it.each([
    ["simpleFamily", simpleFamily],
    ["consanguineousFamily", consanguineousFamily],
    ["largerFamily", largerFamily],
    ["syntheticFamily", makeSyntheticFamily()],
    ["fullFeatured", fullFeatured],
  ])("%s: export then import equals the original", (_name, ped) => {
    const result = roundtrip(ped);
    expect(result.pedigree).toEqual(ped);
    expect(result.title).toBe("t");
  });

  it("preserves every optional field losslessly", () => {
    const result = roundtrip(fullFeatured);
    const ped = result.pedigree!;
    expect(ped.pinnedPositions).toEqual({ c: { x: 120.5, y: 240 } });
    expect(ped.canvasSettings).toEqual({ nodesMoveable: true, snapToGrid: true, snapGridSize: 20 });
    expect(ped.unlockedIndividuals).toEqual(["a"]);
    expect(ped.individuals[1]!.hpoTerms).toEqual(["HP:0001250"]);
    expect(ped.siblingOrder).toEqual({ mode: "birthDate", affectedFirst: true });
    expect(ped.individuals[1]!.tags).toEqual(["t1", "t2"]);
    expect(ped.tags).toEqual(fullFeatured.tags);
  });

  it("unknown fields on individuals, partnerships and the pedigree survive the roundtrip", () => {
    const extended = JSON.parse(JSON.stringify(simpleFamily));
    extended.individuals[0].futureField = { nested: [1, 2, 3] };
    extended.individuals[1].tags = ["x"];
    extended.partnerships[0].separated = true;
    extended.customTopLevel = "kept";
    const result = roundtrip(extended as Pedigree);
    expect(result.pedigree).toEqual(extended);
  });
});

describe("JSON import: accepted inputs", () => {
  it("accepts a bare Pedigree object with an info issue", () => {
    const result = importJson(JSON.stringify(simpleFamily));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigree).toEqual(simpleFamily);
    expect(result.title).toBeNull();
    expect(result.issues.map(i => i.code)).toContain(JsonIssueCode.BARE_PEDIGREE);
  });

  it("defaults a missing siblingOrder with a warning", () => {
    const { siblingOrder: _dropped, ...noOrder } = simpleFamily;
    const result = importJson(JSON.stringify(noOrder));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigree!.siblingOrder).toEqual({ mode: "insertion", affectedFirst: false });
    expect(result.issues.find(i => i.code === JsonIssueCode.DEFAULT_APPLIED)?.severity).toBe("warning");
  });

  it("warns on a newer version but still imports", () => {
    const doc = buildJsonEnvelope(simpleFamily, { title: "v2" });
    const result = importJson(JSON.stringify({ ...doc, version: 99 }));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.find(i => i.code === JsonIssueCode.NEWER_VERSION)?.severity).toBe("warning");
  });

  it("warns on pinnedPositions and unlockedIndividuals that name unknown individuals", () => {
    const ped: Pedigree = { ...simpleFamily, pinnedPositions: { ghost: { x: 0, y: 0 } }, unlockedIndividuals: ["ghost2"] };
    const result = importJson(exportJson(ped));
    expect(result.hasErrors).toBe(false);
    const dangling = result.issues.filter(i => i.code === JsonIssueCode.DANGLING_REFERENCE);
    expect(dangling).toHaveLength(2);
  });

  it("warns when an individual names a tag that is not defined", () => {
    const ped: Pedigree = {
      ...simpleFamily,
      individuals: simpleFamily.individuals.map((ind, i) => (i === 0 ? { ...ind, tags: ["missing"] } : ind)),
    };
    const result = importJson(exportJson(ped));
    expect(result.hasErrors).toBe(false);
    const dangling = result.issues.filter(i => i.code === JsonIssueCode.DANGLING_REFERENCE);
    expect(dangling).toHaveLength(1);
    expect(dangling[0]!.affectedIds).toEqual(["missing"]);
  });

  it("the worked example in the JSON Schema file imports cleanly", () => {
    const schema = JSON.parse(readFileSync(join(DOCS, "pedigree-json-schema.json"), "utf-8"));
    expect(schema.$schema).toContain("2020-12");
    const result = importJson(JSON.stringify(schema.examples[0]));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.filter(i => i.severity === "warning")).toEqual([]);
  });
});

describe("JSON import: rejected inputs", () => {
  function errorsOf(doc: unknown): JsonIssueCode[] {
    const text = typeof doc === "string" ? doc : JSON.stringify(doc);
    const result = importJson(text);
    expect(result.hasErrors).toBe(true);
    expect(result.pedigree).toBeNull();
    return result.issues.filter(i => i.severity === "error").map(i => i.code);
  }

  function withPedigree(mutate: (p: any) => void): unknown {
    const doc = JSON.parse(exportJson(simpleFamily));
    mutate(doc.pedigree);
    return doc;
  }

  it("rejects invalid JSON text", () => {
    expect(errorsOf("{ not json")).toContain(JsonIssueCode.INVALID_JSON);
  });

  it("rejects a non-object root", () => {
    expect(errorsOf([1, 2])).toContain(JsonIssueCode.NOT_AN_OBJECT);
    expect(errorsOf("42")).toContain(JsonIssueCode.NOT_AN_OBJECT);
  });

  it("rejects an unknown envelope format", () => {
    const doc = JSON.parse(exportJson(simpleFamily));
    doc.format = "something-else";
    expect(errorsOf(doc)).toContain(JsonIssueCode.UNKNOWN_FORMAT);
  });

  it("rejects an envelope whose pedigree is missing", () => {
    expect(errorsOf({ format: JSON_FORMAT, version: 1 })).toContain(JsonIssueCode.MISSING_FIELD);
  });

  it("rejects missing required pedigree fields", () => {
    expect(errorsOf({ individuals: [] })).toContain(JsonIssueCode.MISSING_FIELD);
    expect(errorsOf({ individuals: [], partnerships: [] })).toContain(JsonIssueCode.MISSING_FIELD);
  });

  it("rejects wrong types for pedigree fields", () => {
    expect(errorsOf({ individuals: {}, partnerships: [], parentOf: {} })).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.parentOf = []; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.siblingOrder = { mode: "random", affectedFirst: false }; }))).toContain(JsonIssueCode.WRONG_TYPE);
  });

  it("rejects individuals with missing or badly typed required fields", () => {
    expect(errorsOf(withPedigree(p => { delete p.individuals[0].id; }))).toContain(JsonIssueCode.MISSING_FIELD);
    expect(errorsOf(withPedigree(p => { p.individuals[0].sex = "M"; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.individuals[0].affected = "yes"; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.individuals[0].sibOrder = "0"; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { delete p.individuals[0].sibOrder; }))).toContain(JsonIssueCode.MISSING_FIELD);
    expect(errorsOf(withPedigree(p => { p.individuals[0] = "i1"; }))).toContain(JsonIssueCode.WRONG_TYPE);
  });

  it("rejects badly typed optional individual fields", () => {
    expect(errorsOf(withPedigree(p => { p.individuals[0].deceased = 1; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.individuals[0].hpoTerms = "HP:0001250"; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.individuals[0].name = 5; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.individuals[0].tags = "t1"; }))).toContain(JsonIssueCode.WRONG_TYPE);
  });

  it("rejects malformed tag definitions", () => {
    expect(errorsOf(withPedigree(p => { p.tags = {}; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.tags = [{ id: "t", label: "x", color: "#000" }]; }))).toContain(JsonIssueCode.MISSING_FIELD);
    expect(errorsOf(withPedigree(p => { p.tags = [{ id: "t", label: "x", color: "#000", style: "stripe" }]; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => {
      p.tags = [
        { id: "t", label: "x", color: "#000", style: "dot" },
        { id: "t", label: "y", color: "#fff", style: "dot" },
      ];
    }))).toContain(JsonIssueCode.DUPLICATE_ID);
  });

  it("rejects duplicate individual and partnership ids", () => {
    expect(errorsOf(withPedigree(p => { p.individuals[1].id = "i1"; }))).toContain(JsonIssueCode.DUPLICATE_ID);
    expect(errorsOf(withPedigree(p => { p.partnerships[1].id = "p1"; }))).toContain(JsonIssueCode.DUPLICATE_ID);
  });

  it("rejects partnerships whose members do not exist or are the same person", () => {
    expect(errorsOf(withPedigree(p => { p.partnerships[0].individual2 = "nobody"; }))).toContain(JsonIssueCode.UNKNOWN_INDIVIDUAL);
    expect(errorsOf(withPedigree(p => { p.partnerships[0].individual2 = "i1"; }))).toContain(JsonIssueCode.SELF_PARTNERSHIP);
    expect(errorsOf(withPedigree(p => { delete p.partnerships[0].individual1; }))).toContain(JsonIssueCode.MISSING_FIELD);
  });

  it("rejects parentOf keys that are not partnership ids", () => {
    expect(errorsOf(withPedigree(p => { p.parentOf.p9 = ["i6"]; }))).toContain(JsonIssueCode.UNKNOWN_PARTNERSHIP);
  });

  it("rejects children that do not exist", () => {
    expect(errorsOf(withPedigree(p => { p.parentOf.p1.push("nobody"); }))).toContain(JsonIssueCode.UNKNOWN_INDIVIDUAL);
  });

  it("rejects an individual who is a child of two partnerships", () => {
    expect(errorsOf(withPedigree(p => { p.parentOf.p1.push("i6"); }))).toContain(JsonIssueCode.MULTIPLE_PARENT_SETS);
  });

  it("rejects a child listed twice under one partnership", () => {
    expect(errorsOf(withPedigree(p => { p.parentOf.p1.push("i3"); }))).toContain(JsonIssueCode.DUPLICATE_ID);
  });

  it("rejects an individual who is a child of their own partnership", () => {
    expect(errorsOf(withPedigree(p => { p.parentOf.p2.push("i3"); }))).toContain(JsonIssueCode.CHILD_OF_OWN_PARTNERSHIP);
  });

  it("rejects circular ancestry", () => {
    // i6 (child of p2) becomes a partner of i2 in a new partnership p3 whose child is i1 (a parent of i3, who is a parent of i6)
    const cyclic: Pedigree = {
      individuals: [
        { id: "a", sex: "male", affected: false, sibOrder: 0 },
        { id: "b", sex: "female", affected: false, sibOrder: 0 },
        { id: "c", sex: "male", affected: false, sibOrder: 0 },
        { id: "d", sex: "female", affected: false, sibOrder: 0 },
      ],
      partnerships: [
        { id: "ab", individual1: "a", individual2: "b" },
        { id: "cd", individual1: "c", individual2: "d" },
      ],
      parentOf: { ab: ["c"], cd: ["a"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    expect(errorsOf(cyclic)).toContain(JsonIssueCode.CIRCULAR_ANCESTRY);
  });

  it("rejects badly typed pinnedPositions and canvasSettings", () => {
    expect(errorsOf(withPedigree(p => { p.pinnedPositions = { i1: { x: "1", y: 2 } }; }))).toContain(JsonIssueCode.WRONG_TYPE);
    expect(errorsOf(withPedigree(p => { p.canvasSettings = { nodesMoveable: true }; }))).toContain(JsonIssueCode.MISSING_FIELD);
    expect(errorsOf(withPedigree(p => { p.unlockedIndividuals = "i1"; }))).toContain(JsonIssueCode.WRONG_TYPE);
  });

  it("reports a path for each issue", () => {
    const result = importJson(JSON.stringify(withPedigree(p => { p.individuals[2].sex = "x"; })));
    expect(result.issues.find(i => i.code === JsonIssueCode.WRONG_TYPE)?.path).toBe("pedigree.individuals[2].sex");
  });
});
