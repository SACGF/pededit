import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { isAffected, type Pedigree } from "@pedigree-editor/layout-engine";
import { importPhenopackets, exportPhenopackets, isPhenopacketsJson, PhenopacketsIssueCode, type PhenopacketsPerson } from "../index.js";
import { exportJson } from "../../json/index.js";
import { ValidationIssueCode } from "../../ped/index.js";
import { isPhantomId } from "../../ped/converter.js";
import { M, F, U, couple, build } from "../../../fixtures/features";

const TEST_DATA = join(dirname(fileURLToPath(import.meta.url)), "../../../../../test-data/phenopackets");
const read = (file: string) => readFileSync(join(TEST_DATA, file), "utf-8");

const doc = (persons: Partial<PhenopacketsPerson>[] | Record<string, unknown>[]) => JSON.stringify({ persons });
const only = (text: string) => {
  const result = importPhenopackets(text);
  expect(result.hasErrors).toBe(false);
  expect(result.pedigrees).toHaveLength(1);
  return result.pedigrees[0]!.pedigree;
};
const byName = (p: Pedigree, name: string) => p.individuals.find(i => i.name === name)!;
/** The [father, mother] names of a person, or null for a founder. */
function parentsOf(p: Pedigree, name: string): [string, string] | null {
  const id = byName(p, name).id;
  const part = p.partnerships.find(x => (p.parentOf[x.id] ?? []).includes(id));
  if (!part) return null;
  const nameOf = (pid: string) => p.individuals.find(i => i.id === pid)!.name ?? pid;
  return [nameOf(part.individual1), nameOf(part.individual2)];
}

describe("Phenopackets import", () => {
  it("reads a bare Pedigree message, the specification's example", () => {
    const p = only(read("pedigree.json"));
    expect(p.individuals).toHaveLength(4);
    expect(parentsOf(p, "kindred 1A")).toEqual(["FATHER", "MOTHER"]);
    expect(parentsOf(p, "FATHER")).toBeNull();
    expect(byName(p, "MOTHER").sex).toBe("female");
    expect(byName(p, "kindred 1B")).toMatchObject({ sex: "male", affected: true });
    expect(p.canvasSettings?.notation).toBe("nsgc2022");
  });

  it("reads the pedigree of a Family message and says the rest is not read", () => {
    const result = importPhenopackets(read("family.json"));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees.map(f => f.familyId)).toEqual(["FAM-0042"]);
    const info = result.issues.find(i => i.code === PhenopacketsIssueCode.FAMILY_FIELDS_IGNORED);
    expect(info?.severity).toBe("info");
    expect(info?.message).toMatch(/proband/);
    const p = result.pedigrees[0]!.pedigree;
    expect(parentsOf(p, "Ines")).toEqual(["Pavel", "Rosa"]);
    expect(parentsOf(p, "Pavel")).toEqual(["Tomas", "Greta"]);
  });

  it("takes a parent left out, empty or \"0\" as missing", () => {
    const p = only(read("family.json"));
    for (const founder of ["Tomas", "Greta", "Rosa"]) expect(parentsOf(p, founder)).toBeNull();
  });

  it("gives a child with one parent an invented partner, as PED does", () => {
    const result = importPhenopackets(read("family.json"));
    expect(result.issues.map(i => i.code)).toContain(ValidationIssueCode.SINGLE_PARENT);
    const p = result.pedigrees[0]!.pedigree;
    const [father, mother] = parentsOf(p, "Noor")!;
    expect(mother).toBe("Rosa");
    expect(isPhantomId(father)).toBe(true);
  });

  it("reads unknown sex, a sex left out and OTHER_SEX as unknown sex", () => {
    const result = importPhenopackets(doc([
      { individualId: "a", sex: "UNKNOWN_SEX" },
      { individualId: "b" },
      { individualId: "c", sex: "OTHER_SEX" },
    ]));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees[0]!.pedigree.individuals.map(i => i.sex)).toEqual(["unknown", "unknown", "unknown"]);
    const warned = result.issues.filter(i => i.code === PhenopacketsIssueCode.OTHER_SEX);
    expect(warned).toHaveLength(1);
    expect(warned[0]!.message).toMatch(/'c'/);
    expect(result.issues.some(i => i.code === ValidationIssueCode.UNKNOWN_SEX_CODE)).toBe(false);
  });

  it("reads enums written as numbers, which are not PED's codes", () => {
    const p = only(doc([
      { individualId: "f", sex: 1, affectedStatus: 2 },
      { individualId: "m", sex: 2, affectedStatus: 1 },
    ] as unknown as Record<string, unknown>[]));
    expect(byName(p, "f")).toMatchObject({ sex: "female", affected: true });
    expect(byName(p, "m")).toMatchObject({ sex: "male", affected: false });
  });

  it("reads the proto field names too", () => {
    const p = only(doc([
      { individual_id: "dad", sex: "MALE" },
      { individual_id: "mum", sex: "FEMALE" },
      { family_id: "", individual_id: "kid", paternal_id: "dad", maternal_id: "mum", affected_status: "AFFECTED" },
    ]));
    expect(parentsOf(p, "kid")).toEqual(["dad", "mum"]);
    expect(byName(p, "kid").affected).toBe(true);
  });

  it("refuses what is not a pedigree, and a person with no individualId", () => {
    expect(importPhenopackets("{ nope").issues[0]!.code).toBe(PhenopacketsIssueCode.INVALID_JSON);
    expect(importPhenopackets(JSON.stringify({ individuals: [] })).issues[0]!.code).toBe(PhenopacketsIssueCode.NO_PERSONS);
    expect(importPhenopackets(doc([])).issues[0]!.code).toBe(PhenopacketsIssueCode.NO_PERSONS);
    const missing = importPhenopackets(doc([{ individualId: "a" }, { sex: "MALE" }]));
    expect(missing.hasErrors).toBe(true);
    expect(missing.issues.map(i => i.code)).toEqual([PhenopacketsIssueCode.MISSING_INDIVIDUAL_ID]);
  });

  it("runs the PED checks: a parent of both sexes is refused", () => {
    const result = importPhenopackets(doc([
      { individualId: "x", sex: "MALE" },
      { individualId: "y", sex: "FEMALE" },
      { individualId: "a", paternalId: "x", maternalId: "y" },
      { individualId: "b", paternalId: "y", maternalId: "x" },
    ]));
    expect(result.hasErrors).toBe(true);
    expect(result.issues.map(i => i.code)).toContain(ValidationIssueCode.PARENT_BOTH_SEXES);
  });

  it("is told apart from a PedEdit JSON file", () => {
    expect(isPhenopacketsJson(read("pedigree.json"))).toBe(true);
    expect(isPhenopacketsJson(read("family.json"))).toBe(true);
    const pededit = exportJson(build([M("a")], [], {}), { title: "t" });
    expect(isPhenopacketsJson(pededit)).toBe(false);
    expect(isPhenopacketsJson("FAM1 a 0 0 1 2")).toBe(false);
  });
});

describe("Phenopackets export", () => {
  // An unnamed person with a generated id: neither means anything outside PedEdit.
  const BABY = "8c1e6f0a-0000-4000-8000-000000000001";
  const family = build(
    [F("mum", { name: "Ada Lovelace" }), M("dad", { name: "William" }), F("girl", { name: "Annabella", affected: true }), U(BABY)],
    // The mother first: the father must still go in paternalId.
    [couple("p1", "mum", "dad")],
    { p1: ["girl", BABY] },
  );

  it("writes a Pedigree message with camelCase fields and enum strings", () => {
    const out = JSON.parse(exportPhenopackets(family, { familyId: "F7" }));
    expect(Object.keys(out)).toEqual(["persons"]);
    expect(out.persons).toEqual([
      { familyId: "F7", individualId: "Ada Lovelace", paternalId: "0", maternalId: "0", sex: "FEMALE", affectedStatus: "UNAFFECTED" },
      { familyId: "F7", individualId: "William", paternalId: "0", maternalId: "0", sex: "MALE", affectedStatus: "UNAFFECTED" },
      { familyId: "F7", individualId: "Annabella", paternalId: "William", maternalId: "Ada Lovelace", sex: "FEMALE", affectedStatus: "AFFECTED" },
      { familyId: "F7", individualId: "ind1", paternalId: "William", maternalId: "Ada Lovelace", sex: "UNKNOWN_SEX", affectedStatus: "UNAFFECTED" },
    ]);
  });

  it("writes biological sex, not gender identity", () => {
    const p = build([F("a", { genderIdentity: "man" })], [], {});
    expect(JSON.parse(exportPhenopackets(p)).persons[0].sex).toBe("FEMALE");
  });

  it("round trips: the same people, parents, sexes and affected status", () => {
    const back = only(exportPhenopackets(family));
    const summary = (p: Pedigree) => p.individuals
      .map(i => [i.name ?? "", i.sex, isAffected(i, p), parentsOf(p, i.name ?? "")?.slice().sort().join("+") ?? ""].join(" "))
      .sort();
    const named: Pedigree = { ...family, individuals: family.individuals.map(i => ({ ...i, name: i.name ?? "ind1" })) };
    expect(summary(back)).toEqual(summary(named));
    expect(only(exportPhenopackets(back))).toEqual(back);
  });

  it("round trips the test files", () => {
    for (const file of ["pedigree.json", "family.json"]) {
      const first = only(read(file));
      const out = exportPhenopackets(first, { familyId: importPhenopackets(read(file)).pedigrees[0]!.familyId });
      expect(JSON.parse(out).persons.map((p: PhenopacketsPerson) => p.familyId)).toContain(file === "family.json" ? "FAM-0042" : "family 1");
      const again = only(out);
      // The invented partner of a single parent is written as a person, as PED does, so it comes back named.
      const named = first.individuals.filter(i => i.name);
      const facts = (p: Pedigree, name: string) => {
        const i = byName(p, name);
        const parents = parentsOf(p, name);
        return [i.sex, i.affected, parents?.[1] ?? null];
      };
      expect(named.map(i => facts(again, i.name!))).toEqual(named.map(i => facts(first, i.name!)));
    }
  });
});
