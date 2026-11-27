import { describe, it, expect } from "vitest";
import type { Individual, Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import { exportLosses, lossLines, type ExportFormat, type ExportLoss } from "../losses.js";
import { exportPed, exportIds } from "../ped/exporter.js";
import { importPed } from "../ped/index.js";
import { exportPhenopackets, importPhenopackets } from "../phenopackets/index.js";
import { isAffected, plainAffected } from "../../pedigree/conditions";
import { consanguinityTest } from "../../pedigree/consanguinity";
import { parentCoupleOf } from "../../pedigree/graph";
import { M, F, U, couple, build, SETTINGS_2022 } from "../../fixtures/features";

/**
 * Every field of the data model, through each lossy format and back: a field
 * either comes back unchanged or the export warning names it for that person,
 * couple or pedigree; and the warning names nothing that came back.
 */

// Generated ids, as the editor makes them: they mean nothing in a file, so an unnamed person is written as ind1.
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GF = u(1), GM = u(2), S1 = u(3), W1 = u(4), D1 = u(5), H2 = u(6), C1 = u(7), C2 = u(8), C3 = u(9), K1 = u(10), SUR = u(11), PAT = u(12);

const full: Pedigree = build(
  [
    M(GF, { name: "Arthur Penhallow", dob: "1930-05-01", dod: "2001", deceased: true, notes: "smoker", hpoTerms: ["HP:0001250"],
      evaluations: [{ result: "positive", detail: "BRCA1 c.68_69del", documented: true }] }),
    F(GM, { name: "Ada", deceased: true, age: "d. 72y", tags: ["bc"], tagOnset: { bc: "45y" }, familyHistoryUnknown: true }),
    M(S1, { name: "Ben", genderIdentity: "woman", carrier: true, age: "40s", consultand: true, adopted: "out" }),
    F(W1, { presymptomatic: true, carrierTags: ["bc"], dob: "1960" }),
    F(D1, { name: "Dora", affected: true, tags: ["bc", "dna", "cohort"], onset: "30s", tagOnset: { bc: "about 40" }, descendantsHidden: true }),
    M(H2, { name: "Hugo", reproductiveRole: "donor" }),
    F(C1, { name: "Cleo" }),
    F(C2, { name: "Cara", proband: true, genderIdentity: "nonbinary", hpoTerms: ["HP:0000006"], tags: ["oc"], tagOnset: { oc: "childhood" }, age: "34y", dob: "1990-02-03" }),
    U(C3, { name: "Baby", lifeStatus: "pregnancy", age: "20 wk" }),
    M(K1, { name: "Kai", proband: true, carriedBy: SUR, socialParents: [S1] }),
    F(SUR, { name: "Sue", reproductiveRole: "surrogate" }),
    M(PAT, { name: "Pat", placeholder: true }),
  ],
  [
    couple("g", GF, GM, { consanguineous: true, consanguinityLabel: "third cousins", leftPartner: GM, drawnBeside: GF }),
    couple("p1", S1, W1, { consanguineous: true, ended: true, twins: [{ members: [C1, C2], zygosity: "monozygotic" }] }),
    couple("p2", D1, H2, { donorConception: true }),
    couple("p3", C1, PAT, { childless: "byChoice", childlessReason: "career" }),
  ],
  { g: [S1, D1], p1: [C1, C2, C3], p2: [K1] },
  {
    siblingOrder: { mode: "manual", affectedFirst: true },
    pinnedPositions: { [GF]: { x: 10, y: 20 } },
    canvasSettings: { ...SETTINGS_2022, showNotes: false },
    unlockedIndividuals: [GF],
    tags: [
      { id: "bc", label: "Breast cancer", color: "#d62728", style: "quadrant" },
      { id: "oc", label: "Ovarian cancer", color: "#123456", style: "quadrant", fill: "diagonal", carrierFill: "dots", abbrev: "OC", kind: "condition" },
      { id: "dna", label: "DNA stored", color: "#2ca02c", style: "dot" },
      { id: "cohort", label: "Cohort", color: "#9467bd", style: "quadrant", kind: "trait" },
    ],
    chartTitle: "Penhallow family",
    clinicalDetails: { referralReason: "Family history of breast cancer", recordedBy: "JS" },
    filters: { bloodRelativesOnly: true },
  },
);

/** Absent, false, empty text, an empty list and an empty object all mean "not recorded". */
function norm(v: unknown): unknown {
  if (v === undefined || v === null || v === false || v === "") return undefined;
  if (Array.isArray(v)) return v.length === 0 ? undefined : v.map(norm);
  if (typeof v === "object") {
    const entries = Object.entries(v as object).map(([k, x]) => [k, norm(x)] as const).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b));
    return entries.length === 0 ? undefined : Object.fromEntries(entries);
  }
  return v;
}

interface Side { pedigree: Pedigree; id: (origId: string) => string | undefined }
/** What to compare of a field: its value as both sides read it. "skip" with the reason it is not compared. */
type Check<T> = `skip: ${string}` | ((x: T, side: Side) => unknown);

const same = <T, K extends keyof T>(key: K): Check<T> => x => x[key];
const mapped = (ids: readonly string[] | undefined, side: Side) => ids?.map(side.id);

const INDIVIDUAL_CHECKS: Record<keyof Individual, Check<Individual>> = {
  id: "skip: people are matched by the ID in the file",
  sex: same("sex"),
  genderIdentity: same("genderIdentity"),
  // Affected at all, and whether it is with a condition not recorded.
  affected: (ind, s) => [isAffected(ind, s.pedigree), plainAffected(ind, s.pedigree)],
  deceased: same("deceased"),
  carrier: same("carrier"),
  presymptomatic: same("presymptomatic"),
  evaluations: same("evaluations"),
  proband: same("proband"),
  consultand: same("consultand"),
  familyHistoryUnknown: same("familyHistoryUnknown"),
  sibOrder: "skip: read back from the order of the file",
  name: ind => ind.name?.trim(),
  dob: same("dob"),
  dod: same("dod"),
  age: same("age"),
  notes: same("notes"),
  hpoTerms: same("hpoTerms"),
  lifeStatus: same("lifeStatus"),
  adopted: same("adopted"),
  reproductiveRole: same("reproductiveRole"),
  carriedBy: (ind, s) => ind.carriedBy && s.id(ind.carriedBy),
  socialParents: (ind, s) => mapped(ind.socialParents, s),
  tags: ind => ind.tags?.slice().sort(),
  carrierTags: ind => ind.carrierTags?.slice().sort(),
  onset: same("onset"),
  tagOnset: same("tagOnset"),
  descendantsHidden: same("descendantsHidden"),
  placeholder: "skip: made automatically; an imported second parent is an ordinary person",
};

const PARTNERSHIP_CHECKS: Record<keyof Partnership, Check<Partnership>> = {
  id: "skip: couples are matched by their partners",
  individual1: "skip: couples are matched by their partners",
  individual2: "skip: couples are matched by their partners",
  // Drawn double: the flag is needed only where kinship does not show it.
  consanguineous: (p, s) => consanguinityTest(s.pedigree)(p.individual1, p.individual2),
  // Text is drawn only above a double line.
  consanguinityLabel: (p, s) => (consanguinityTest(s.pedigree)(p.individual1, p.individual2) ? p.consanguinityLabel?.trim() : undefined),
  childless: same("childless"),
  childlessReason: same("childlessReason"),
  twins: (p, s) => p.twins?.map(t => ({ ...t, members: mapped(t.members, s)!.sort() })),
  ended: same("ended"),
  donorConception: same("donorConception"),
  leftPartner: (p, s) => p.leftPartner && s.id(p.leftPartner),
  drawnBeside: (p, s) => p.drawnBeside && s.id(p.drawnBeside),
};

const PEDIGREE_CHECKS: Record<keyof Pedigree, Check<Pedigree>> = {
  individuals: "skip: compared person by person",
  partnerships: "skip: compared couple by couple",
  parentOf: "skip: compared as each person's parents",
  siblingOrder: same("siblingOrder"),
  pinnedPositions: (p, s) => p.pinnedPositions && Object.fromEntries(Object.entries(p.pinnedPositions).map(([id, xy]) => [s.id(id), xy])),
  // Exactly: a setting left out is not always the same as false (`showNotes`).
  canvasSettings: p => JSON.stringify(Object.entries(p.canvasSettings ?? {}).sort()),
  unlockedIndividuals: (p, s) => mapped(p.unlockedIndividuals, s),
  tags: same("tags"),
  chartTitle: same("chartTitle"),
  clinicalDetails: same("clinicalDetails"),
  filters: same("filters"),
};

function roundTrip(pedigree: Pedigree, format: ExportFormat): Pedigree {
  const result = format === "phenopackets" ? importPhenopackets(exportPhenopackets(pedigree)) : importPed(exportPed(pedigree, { dialect: format }));
  expect(result.issues.filter(i => i.severity === "error")).toEqual([]);
  expect(result.pedigrees).toHaveLength(1);
  return result.pedigrees[0]!.pedigree;
}

/** Every difference between `pedigree` and its round trip, as the field that differs. */
function differences(pedigree: Pedigree, format: ExportFormat) {
  const back = roundTrip(pedigree, format);
  const ids = exportIds(pedigree, format !== "plink");
  const original: Side = { pedigree, id: id => id };
  // Both sides in the file's IDs, so a reference to someone compares equal.
  const before: Side = { pedigree, id: id => ids.get(id) };
  const after: Side = { pedigree: back, id: id => id };
  void original;
  const found: { on: ExportLoss["on"]; id?: string; field: string }[] = [];
  const compare = <T,>(checks: Record<string, Check<T>>, a: T, b: T, on: ExportLoss["on"], id?: string) => {
    for (const [field, check] of Object.entries(checks)) {
      if (typeof check === "string") continue;
      if (JSON.stringify(norm(check(a, before))) !== JSON.stringify(norm(check(b, after)))) found.push({ on, id, field });
    }
  };

  for (const ind of pedigree.individuals) {
    const twin = back.individuals.find(i => i.id === ids.get(ind.id));
    expect(twin, `${ind.name ?? ind.id} comes back`).toBeDefined();
    compare(INDIVIDUAL_CHECKS, ind, twin!, "individual", ind.id);
    // The parents, which every format carries.
    const parents = (p: Pedigree, id: string, side: Side) => {
      const c = parentCoupleOf(p, id);
      return c ? [side.id(c.individual1), side.id(c.individual2)].sort() : null;
    };
    expect(parents(back, twin!.id, after), `${ind.name ?? ind.id}'s parents`).toEqual(parents(pedigree, ind.id, before));
  }
  const missing: string[] = [];
  for (const p of pedigree.partnerships) {
    const pair = [ids.get(p.individual1), ids.get(p.individual2)].sort().join("+");
    const twin = back.partnerships.find(q => [q.individual1, q.individual2].sort().join("+") === pair);
    if (!twin) {
      found.push({ on: "partnership", id: p.id, field: "id" });
      missing.push(p.id);
      continue;
    }
    // The other side's partner order may differ, so a check reads its own couple.
    compare(PARTNERSHIP_CHECKS, p, twin, "partnership", p.id);
  }
  compare(PEDIGREE_CHECKS, pedigree, back, "pedigree");
  return { found, missing, back };
}

const key = (l: { on: string; id?: string; field: string }) => `${l.on} ${l.id ?? ""} ${l.field}`;

describe.each(["plink", "r", "phenopackets"] as const)("%s export: every field comes back or is named", format => {
  it("the test pedigree sets every field of the data model", () => {
    const set = <T,>(checks: Record<string, unknown>, items: T[]) =>
      Object.keys(checks).filter(field => !items.some(x => norm((x as Record<string, unknown>)[field]) !== undefined));
    expect(set(INDIVIDUAL_CHECKS, full.individuals)).toEqual([]);
    expect(set(PARTNERSHIP_CHECKS, full.partnerships)).toEqual([]);
    expect(set(PEDIGREE_CHECKS, [full])).toEqual([]);
  });

  it("names every field that does not come back, and nothing that does", () => {
    const { found, missing } = differences(full, format);
    const losses = exportLosses(full, format);
    const named = new Set(losses.map(l => key({ on: l.on, id: l.on === "pedigree" ? undefined : l.id, field: l.field })));
    const changed = new Set(found.map(key));
    expect([...changed].filter(k => !named.has(k)), "changed but not named").toEqual([]);
    // A couple with no row is gone with all its fields; each is named, but none can be compared.
    const comparable = [...named].filter(k => !missing.some(id => k.startsWith(`partnership ${id} `) && !k.endsWith(" id")));
    expect(comparable.filter(k => !changed.has(k)), "named but unchanged").toEqual([]);
  });
});

describe("Phenopackets carries more than PED", () => {
  const { back } = differences(full, "phenopackets");
  const named = (name: string) => back.individuals.find(i => i.name === name)!;

  it("keeps deceased, dates, ages, gender identity, HPO terms, conditions with onset and the proband", () => {
    expect(named("Arthur Penhallow")).toMatchObject({ deceased: true, dob: "1930-05-01", dod: "2001", hpoTerms: ["HP:0001250"] });
    expect(named("Ada")).toMatchObject({ deceased: true, age: "d. 72y", tags: ["bc"], tagOnset: { bc: "45y" } });
    expect(named("Ben")).toMatchObject({ genderIdentity: "woman", age: "40s" });
    expect(named("Cara")).toMatchObject({ proband: true, genderIdentity: "nonbinary", tags: ["oc"], tagOnset: { oc: "childhood" }, age: "34y", dob: "1990-02-03" });
    expect(named("Baby").age).toBe("20 wk");
    expect(back.tags?.map(t => [t.id, t.label, t.style])).toEqual([["bc", "Breast cancer", "quadrant"], ["oc", "Ovarian cancer", "quadrant"]]);
  });

  it("brings someone affected only through a condition back with the condition, not the plain flag", () => {
    expect(named("Ada").affected).toBe(false);
    expect(isAffected(named("Ada"), back)).toBe(true);
  });

  it("brings an unnamed person back unnamed, where PED names them ind1", () => {
    const unnamed = back.individuals.find(i => i.id === "ind1")!;
    expect(unnamed.name).toBeUndefined();
    expect(roundTrip(full, "r").individuals.find(i => i.id === "ind1")!.name).toBe("ind1");
  });

  it("marks the proband's parents consanguineous when the drawing does not show them related", () => {
    const p1 = parentCoupleOf(back, named("Cara").id)!;
    expect(p1.consanguineous).toBe(true);
  });
});

describe("export warning lines", () => {
  it("are one per person, couple or pedigree", () => {
    const lines = lossLines(exportLosses(full, "phenopackets"));
    expect(lines.some(l => /Ada: .*family history not known/.test(l))).toBe(true);
    expect(lines).toContain("I-2, Arthur Penhallow: an evaluation; notes");
    expect(lines).toContain('II-2, Dora: affected (condition not recorded) beside Breast cancer: comes back with that condition only; tags (DNA stored, Cohort); age of onset "30s"; age of onset of Breast cancer "about 40"; people below hidden: comes back with them drawn');
    expect(lines.find(l => l.startsWith("The pedigree:"))).toMatch(/chart title/);
    expect(new Set(lines.map(l => l.split(":")[0])).size).toBe(lines.length);
  });

  it("with no proband marked, say who is written as the Family's proband", () => {
    const p = build([F("a", { name: "Amy" }), M("b", { name: "Bob" })], [], {});
    expect(exportLosses(p, "phenopackets").map(l => [l.on !== "pedigree" && l.id, l.field])).toEqual([["a", "proband"]]);
    expect(roundTrip(p, "phenopackets").individuals.find(i => i.id === "Amy")!.proband).toBe(true);
  });

  it("are empty for what both formats hold", () => {
    const p = build([M("a", { name: "Al" }), F("b", { name: "Bea" }), F("c", { name: "Cy", affected: true })], [couple("ab", "a", "b")], { ab: ["c"] });
    expect(exportLosses(p, "plink")).toEqual([]);
    expect(exportLosses({ ...p, individuals: p.individuals.map(i => (i.id === "c" ? { ...i, proband: true } : i)) }, "phenopackets")).toEqual([]);
  });
});
