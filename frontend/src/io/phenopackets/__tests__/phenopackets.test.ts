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
function parentsOf(p: Pedigree, nameOrId: string): [string, string] | null {
  const id = (p.individuals.find(i => i.name === nameOrId) ?? p.individuals.find(i => i.id === nameOrId))!.id;
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

  it("reads a Family message: its pedigree and the proband's phenopacket", () => {
    const result = importPhenopackets(read("family.json"));
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees.map(f => f.familyId)).toEqual(["FAM-0042"]);
    expect(result.issues.some(i => i.code === PhenopacketsIssueCode.FAMILY_FIELDS_IGNORED)).toBe(false);
    const p = result.pedigrees[0]!.pedigree;
    expect(parentsOf(p, "Ines")).toEqual(["Pavel", "Rosa"]);
    expect(parentsOf(p, "Pavel")).toEqual(["Tomas", "Greta"]);
    expect(byName(p, "Ines")).toMatchObject({ proband: true, hpoTerms: ["HP:0001250"] });
    expect(p.individuals.filter(i => i.proband).map(i => i.name)).toEqual(["Ines"]);
  });

  it("reads another tool's Family: conditions, onsets, vital status, ages, gender and consanguinity", () => {
    const result = importPhenopackets(read("family_full.json"));
    expect(result.hasErrors).toBe(false);
    const p = result.pedigrees[0]!.pedigree;
    expect(p.tags?.map(t => [t.id, t.label, t.style])).toEqual([
      ["MONDO:0016419", "hereditary breast carcinoma", "quadrant"],
      ["MONDO:0008170", "ovarian cancer", "quadrant"],
    ]);
    expect(new Set(p.tags!.map(t => t.color)).size).toBe(2);
    expect(byName(p, "Maya")).toMatchObject({ proband: true, affected: false, dob: "1985-04-12", age: "38y", hpoTerms: ["HP:0003002"], tags: ["MONDO:0016419"], tagOnset: { "MONDO:0016419": "35y" } });
    expect(isAffected(byName(p, "Maya"), p)).toBe(true);
    expect(byName(p, "Lena")).toMatchObject({ deceased: true, age: "d. 52y", tags: ["MONDO:0016419", "MONDO:0008170"], tagOnset: { "MONDO:0016419": "40s", "MONDO:0008170": "50y" } });
    expect(byName(p, "Omar")).toMatchObject({ genderIdentity: "man" });
    expect(byName(p, "Omar").tags).toBeUndefined();
    expect(byName(p, "Sam")).toMatchObject({ genderIdentity: "nonbinary" });
    expect(byName(p, "Sam").deceased).toBeUndefined();
    expect(byName(p, "Ruth")).toMatchObject({ deceased: true, dod: "1999-06-01" });
    // Omar and Lena are not related in the drawing, so the Family's word makes their line double.
    const parents = p.partnerships.find(x => (p.parentOf[x.id] ?? []).includes(byName(p, "Maya").id))!;
    expect(parents.consanguineous).toBe(true);
    // The file is not PedEdit's, so every person keeps their ID as their name.
    expect(p.individuals.filter(i => !isPhantomId(i.id)).every(i => i.name === i.id)).toBe(true);
    const info = result.issues.find(i => i.code === PhenopacketsIssueCode.FAMILY_FIELDS_IGNORED);
    expect(info?.severity).toBe("info");
    for (const what of ["phenopacket.interpretations", "subject.taxonomy", "phenotypicFeatures.onset"]) expect(info?.message).toContain(what);
  });

  it("warns of a phenopacket about someone not in the pedigree", () => {
    const family = { proband: { id: "x", subject: { id: "nobody" } }, pedigree: { persons: [{ individualId: "a" }] } };
    const result = importPhenopackets(JSON.stringify(family));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.find(i => i.code === PhenopacketsIssueCode.NO_SUCH_PERSON)?.message).toMatch(/'nobody'/);
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

  const exported = (p: Pedigree, options = {}) => JSON.parse(exportPhenopackets(p, { created: "2026-11-27T00:00:00.000Z", ...options }));

  it("writes a Family message whose pedigree has camelCase fields and enum strings", () => {
    const out = exported(family, { familyId: "F7" });
    expect(Object.keys(out)).toEqual(["id", "proband", "relatives", "consanguinousParents", "pedigree", "metaData"]);
    expect(out.id).toBe("F7");
    expect(out.pedigree.persons).toEqual([
      { familyId: "F7", individualId: "Ada Lovelace", paternalId: "0", maternalId: "0", sex: "FEMALE", affectedStatus: "UNAFFECTED" },
      { familyId: "F7", individualId: "William", paternalId: "0", maternalId: "0", sex: "MALE", affectedStatus: "UNAFFECTED" },
      { familyId: "F7", individualId: "Annabella", paternalId: "William", maternalId: "Ada Lovelace", sex: "FEMALE", affectedStatus: "AFFECTED" },
      { familyId: "F7", individualId: "ind1", paternalId: "William", maternalId: "Ada Lovelace", sex: "UNKNOWN_SEX", affectedStatus: "UNAFFECTED" },
    ]);
    expect(out.metaData).toEqual({ created: "2026-11-27T00:00:00.000Z", createdBy: "PedEdit", resources: [], phenopacketSchemaVersion: "2.0" });
  });

  it("writes a phenopacket for everyone: the proband (or the first person) and the relatives", () => {
    const out = exported(family);
    expect(out.proband.subject).toEqual({ id: "Ada Lovelace", sex: "FEMALE" });
    expect(out.relatives.map((r: { id: string }) => r.id)).toEqual(["William", "Annabella", "ind1"]);
    const marked = exported({ ...family, individuals: family.individuals.map(i => (i.id === "girl" ? { ...i, proband: true } : i)) });
    expect(marked.proband.id).toBe("Annabella");
    expect(marked.relatives.map((r: { id: string }) => r.id)).toEqual(["Ada Lovelace", "William", "ind1"]);
    for (const packet of [out.proband, ...out.relatives]) expect(packet.metaData.createdBy).toBe("PedEdit");
  });

  it("writes conditions as diseases, affected or excluded, with the onset, and names their ontologies", () => {
    const p = build(
      [F("a", { name: "Amy", tags: ["bc"], tagOnset: { bc: "45y" }, deceased: true, age: "d. 60y", genderIdentity: "nonbinary", hpoTerms: ["HP:0003002"] }), M("b", { name: "Bob", dob: "1950-03-04", dod: "2010-05" })],
      [], {},
      { tags: [{ id: "bc", label: "Breast cancer", color: "#d62728", style: "quadrant" }, { id: "dna", label: "DNA", color: "#000000", style: "dot" }] },
    );
    const out = exported(p);
    expect(out.proband).toMatchObject({
      subject: {
        id: "Amy",
        vitalStatus: { status: "DECEASED", timeOfDeath: { age: { iso8601duration: "P60Y" } } },
        sex: "FEMALE",
        gender: { id: "SNOMEDCT:33791000087105", label: "Identifies as nonbinary gender" },
      },
      phenotypicFeatures: [{ type: { id: "HP:0003002", label: "HP:0003002" } }],
      diseases: [{ term: { id: "PEDEDIT:bc", label: "Breast cancer" }, onset: { age: { iso8601duration: "P45Y" } } }],
    });
    expect(out.relatives[0].subject).toEqual({
      id: "Bob",
      dateOfBirth: "1950-03-04T00:00:00Z",
      vitalStatus: { status: "DECEASED", timeOfDeath: { interval: { start: "2010-05-01T00:00:00Z", end: "2010-06-01T00:00:00Z" } } },
      sex: "MALE",
    });
    expect(out.relatives[0].diseases).toEqual([{ term: { id: "PEDEDIT:bc", label: "Breast cancer" }, excluded: true }]);
    expect(out.metaData.resources.map((r: { namespacePrefix: string }) => r.namespacePrefix)).toEqual(["SNOMEDCT", "HP", "PEDEDIT"]);
    // PedEdit's own terms have no page; the prefix can never resolve.
    const local = out.metaData.resources.find((r: { namespacePrefix: string }) => r.namespacePrefix === "PEDEDIT");
    expect(new URL(local.iriPrefix).hostname).toMatch(/\.invalid$/);
  });

  it("writes biological sex, not gender identity", () => {
    const p = build([F("a", { genderIdentity: "man" })], [], {});
    const out = exported(p);
    expect(out.pedigree.persons[0].sex).toBe("FEMALE");
    expect(out.proband.subject.sex).toBe("FEMALE");
    expect(out.proband.subject.gender.id).toBe("SNOMEDCT:446151000124109");
  });

  it("round trips: the same people, parents, sexes and affected status, and is stable", () => {
    const back = only(exportPhenopackets(family));
    const summary = (p: Pedigree) => p.individuals
      .map(i => [i.name ?? "", i.sex, isAffected(i, p), parentsOf(p, i.id)?.slice().sort().join("+") ?? ""].join(" "))
      .sort();
    // With no proband marked, the first person is written as the Family's proband.
    expect(back.individuals.filter(i => i.proband).map(i => i.name)).toEqual(["Ada Lovelace"]);
    expect(summary(back)).toEqual(summary(family));
    expect(only(exportPhenopackets(back))).toEqual(back);
  });

  it("round trips the test files", () => {
    for (const file of ["pedigree.json", "family.json", "family_full.json"]) {
      const first = only(read(file));
      const familyId = importPhenopackets(read(file)).pedigrees[0]!.familyId;
      const out = exportPhenopackets(first, { familyId });
      expect(JSON.parse(out).pedigree.persons.map((p: PhenopacketsPerson) => p.familyId)).toContain(familyId);
      const again = only(out);
      // The invented partner of a single parent is written as a person, as PED does.
      const named = first.individuals.filter(i => i.name);
      // A file with no proband gets its first person as the Family's proband.
      const hasProband = first.individuals.some(i => i.proband);
      const facts = (p: Pedigree, name: string) => {
        const { id: _id, sibOrder: _s, proband, ...rest } = byName(p, name);
        return { ...rest, ...(hasProband && { proband }), mother: parentsOf(p, name)?.[1] ?? null };
      };
      expect(named.map(i => facts(again, i.name!))).toEqual(named.map(i => facts(first, i.name!)));
      expect(again.tags).toEqual(first.tags);
    }
  });
});
