// The layout cache (#189): the engine is given `layoutInput(pedigree)` and its
// result is kept under that input. These tests hold the two halves of that:
// leaving fields out never changes the layout, and edits that change no
// structure reuse it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { alignPedigreeByFamily } from "@pedigree-editor/layout-engine";
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../data/examples";
import { DATASET, datasetFileText } from "../../fixtures/dataset";
import { FEATURE_FIXTURES } from "../../fixtures/features";
import { importJson } from "../../io/json";
import {
  cachedLayout, clearLayoutCache, layoutCacheStats, layoutInput,
  COUPLE_FIELDS_NOT_LAID_OUT, PERSON_FIELDS_NOT_LAID_OUT,
} from "../layoutCache";
import { buildScene, pedigreeNumbers } from "../scene";

const SCHEMA = JSON.parse(readFileSync(join(__dirname, "../../../../docs/pedigree-json-schema.json"), "utf-8"));

/** Every example, feature fixture and valid test data file except the ones for timing. */
function everyPedigree(): { name: string; pedigree: Pedigree }[] {
  const out = [
    ...EXAMPLES.map(e => ({ name: `example ${e.label}`, pedigree: e.data })),
    ...FEATURE_FIXTURES.map(f => ({ name: `fixture ${f.slug}`, pedigree: f.data })),
  ];
  for (const c of DATASET) {
    if (c.group === "size") continue;
    const result = importJson(datasetFileText(c));
    if (!result.hasErrors && result.pedigree) out.push({ name: c.file, pedigree: result.pedigree });
  }
  return out;
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as number[]) : v)));
const reset = () => { clearLayoutCache(); Object.assign(layoutCacheStats, { hits: 0, misses: 0, familyHits: 0, familyMisses: 0 }); };

describe("layoutInput", () => {
  const all = everyPedigree();

  it("covers enough pedigrees to mean something", () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it("gives the engine the same layout as the whole pedigree, in every sibling order", () => {
    for (const { name, pedigree } of all) {
      for (const mode of ["insertion", "birthDate"] as const) {
        for (const affectedFirst of [false, true]) {
          const p: Pedigree = { ...pedigree, siblingOrder: { ...pedigree.siblingOrder, mode, affectedFirst } };
          let whole;
          try { whole = alignPedigreeByFamily(p); } catch { continue; }
          expect(plain(alignPedigreeByFamily(layoutInput(p))), `${name} ${mode} affectedFirst=${affectedFirst}`).toEqual(plain(whole));
          expect(plain(cachedLayout(p)), `${name} cached`).toEqual(plain(whole));
        }
      }
    }
  });

  it("between them the pedigrees set every field it leaves out, so the sweep above tests each", () => {
    const people = all.flatMap(a => a.pedigree.individuals);
    const couples = all.flatMap(a => a.pedigree.partnerships);
    for (const field of PERSON_FIELDS_NOT_LAID_OUT) expect(people.some(i => i[field] !== undefined && i[field] !== false), field).toBe(true);
    for (const field of COUPLE_FIELDS_NOT_LAID_OUT) expect(couples.some(c => c[field] !== undefined && c[field] !== false), field).toBe(true);
  });

  it("names only fields the data model has", () => {
    const defs = SCHEMA.$defs ?? SCHEMA.definitions;
    for (const field of PERSON_FIELDS_NOT_LAID_OUT) expect(Object.keys(defs.Individual.properties), field).toContain(field);
    for (const field of COUPLE_FIELDS_NOT_LAID_OUT) expect(Object.keys(defs.Partnership.properties), field).toContain(field);
  });

  it("leaves out what does not order or space the chart, and keeps it when a setting reads it", () => {
    const base = FEATURE_FIXTURES[0]!.data;
    const first = base.individuals[0]!;
    const edit = (patch: Partial<Individual>, settings: Partial<Pedigree["siblingOrder"]> = {}): string =>
      JSON.stringify(layoutInput({
        ...base,
        siblingOrder: { ...base.siblingOrder, ...settings },
        individuals: [{ ...first, ...patch }, ...base.individuals.slice(1)],
      }));
    const same = (patch: Partial<Individual>, settings: Partial<Pedigree["siblingOrder"]> = {}) =>
      edit(patch, settings) === edit({}, settings);

    expect(same({ name: "Someone Else", notes: "x", deceased: !first.deceased })).toBe(true);
    expect(same({ affected: !first.affected }, { affectedFirst: false })).toBe(true);
    expect(same({ affected: !first.affected }, { affectedFirst: true })).toBe(false);
    expect(same({ dob: "1901-02-03" }, { mode: "insertion" })).toBe(true);
    expect(same({ dob: "1901-02-03" }, { mode: "birthDate" })).toBe(false);
    expect(same({ sex: first.sex === "male" ? "female" : "male" })).toBe(false);
    expect(same({ sibOrder: first.sibOrder + 100 })).toBe(false);
  });
});

describe("cachedLayout", () => {
  const targaryen = EXAMPLES.find(e => e.slug === "targaryen")!.data;

  it("lays out once for the canvas, the pedigree numbers and an edit that changes no structure", () => {
    reset();
    buildScene(targaryen);
    expect(layoutCacheStats).toMatchObject({ misses: 1, hits: 0 });

    pedigreeNumbers({ ...targaryen });
    const renamed: Pedigree = {
      ...targaryen,
      chartTitle: "Another title",
      pinnedPositions: { [targaryen.individuals[3]!.id]: { x: 10, y: 20 } },
      individuals: targaryen.individuals.map((ind, i) => (i === 0 ? { ...ind, name: "Renamed", affected: !ind.affected, deceased: true } : ind)),
    };
    const flow = buildScene(renamed);
    expect(layoutCacheStats.misses).toBe(1);
    expect(layoutCacheStats.hits).toBe(2);
    // What is drawn still follows the edit: only the engine's result is reused.
    expect(JSON.stringify(flow.people)).toContain("Renamed");
  });

  it("lays out again when the structure changes, and reuses the families that did not", () => {
    reset();
    const two: Pedigree = {
      ...targaryen,
      individuals: [
        ...targaryen.individuals,
        { id: "x1", sex: "male", affected: false, sibOrder: 0 },
        { id: "x2", sex: "female", affected: false, sibOrder: 0 },
        { id: "x3", sex: "female", affected: false, sibOrder: 0 },
      ],
      partnerships: [...targaryen.partnerships, { id: "xp", individual1: "x1", individual2: "x2" }],
      parentOf: { ...targaryen.parentOf, xp: ["x3"] },
    };
    cachedLayout(two);
    expect(layoutCacheStats).toMatchObject({ misses: 1, familyMisses: 2, familyHits: 0 });

    // A child added to the small family: the large one is not laid out again.
    const grown: Pedigree = {
      ...two,
      individuals: [...two.individuals, { id: "x4", sex: "male", affected: false, sibOrder: 1 }],
      parentOf: { ...two.parentOf, xp: ["x3", "x4"] },
    };
    const fresh = plain(alignPedigreeByFamily(grown));
    expect(plain(cachedLayout(grown))).toEqual(fresh);
    expect(layoutCacheStats).toMatchObject({ misses: 2, familyMisses: 3, familyHits: 1 });
  });

  it("keeps a few structures, so undo and redo do not lay out again", () => {
    reset();
    const other: Pedigree = { ...targaryen, individuals: targaryen.individuals.map((ind, i) => (i === 5 ? { ...ind, sibOrder: ind.sibOrder + 50 } : ind)) };
    cachedLayout(targaryen); cachedLayout(other); cachedLayout(targaryen); cachedLayout(other);
    expect(layoutCacheStats).toMatchObject({ misses: 2, hits: 2 });
  });
});
