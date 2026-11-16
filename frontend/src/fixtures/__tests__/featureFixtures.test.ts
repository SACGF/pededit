import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { FEATURE_FIXTURES } from "../features";
import { layoutToFlow } from "../../pedigree/layoutToFlow";
import { lintFlow } from "../../pedigree/renderLint";
import { lintExport } from "../../io/svg/exportLint";
import { lintUShape } from "../../io/svg/uShapeLint";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { importJson, exportJson } from "../../io/json";
import { findProblems } from "../../pedigree/validation";

/*
 * Feature fixtures (#140). Two promises:
 *
 * 1. Coverage. Every field of the data model that changes the drawing is set
 *    by at least one fixture, and every value of every enum is used. The list
 *    of fields comes from docs/pedigree-json-schema.json (itself held to
 *    types.ts by io/json/__tests__/schemaDrift.test.ts), so a new field fails
 *    here until a fixture draws it or it is added to DRAWS_NOTHING.
 * 2. They draw cleanly: render lint, export lint and U-shape lint.
 */

const schema = JSON.parse(readFileSync(join(__dirname, "../../../../docs/pedigree-json-schema.json"), "utf8"));

/** Fields that change nothing on the canvas or in a figure export. */
const DRAWS_NOTHING = new Set([
  "Individual.notes",       // Person tab and CSV only
  "Individual.hpoTerms",    // no UI yet (#46)
  "Individual.placeholder", // editor bookkeeping for an auto-made partner (#107)
  "CanvasSettings.nodesMoveable", // makes nodes draggable, draws nothing
  "Pedigree.unlockedIndividuals", // likewise, per person
]);

/** Enum values with nothing of their own to draw. */
const VALUE_DRAWS_NOTHING = new Set<string>([]);

type Json = Record<string, unknown>;
const objects: Record<string, Json[]> = {
  Pedigree: [], Individual: [], Partnership: [], Tag: [], CanvasSettings: [], ClinicalDetails: [],
  ViewFilters: [], Evaluation: [], TwinSet: [], SiblingOrderSettings: [],
};
for (const { data } of FEATURE_FIXTURES) {
  objects.Pedigree!.push(data as unknown as Json);
  objects.Individual!.push(...(data.individuals as unknown as Json[]));
  objects.Partnership!.push(...(data.partnerships as unknown as Json[]));
  objects.Tag!.push(...((data.tags ?? []) as unknown as Json[]));
  if (data.canvasSettings) objects.CanvasSettings!.push(data.canvasSettings as unknown as Json);
  if (data.clinicalDetails) objects.ClinicalDetails!.push(data.clinicalDetails as unknown as Json);
  if (data.filters) objects.ViewFilters!.push(data.filters as unknown as Json);
  objects.SiblingOrderSettings!.push(data.siblingOrder as unknown as Json);
  for (const i of data.individuals) objects.Evaluation!.push(...((i.evaluations ?? []) as unknown as Json[]));
  for (const p of data.partnerships) objects.TwinSet!.push(...((p.twins ?? []) as unknown as Json[]));
}

/** A value that says something: not absent, false, empty text, or an empty list or map. */
function isSet(v: unknown): boolean {
  if (v === undefined || v === null || v === false || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

describe("feature fixtures cover the data model", () => {
  it("has a schema definition for every kind of object collected", () => {
    expect(Object.keys(schema.$defs).sort()).toEqual(Object.keys(objects).sort());
  });

  for (const [name, found] of Object.entries(objects)) {
    it(`${name}: every drawn field is set by a fixture`, () => {
      const missing = Object.keys(schema.$defs[name].properties)
        .filter(field => !DRAWS_NOTHING.has(`${name}.${field}`))
        .filter(field => !found.some(o => isSet(o[field])));
      expect(missing).toEqual([]);
    });

    it(`${name}: every enum value is used`, () => {
      const missing: string[] = [];
      for (const [field, def] of Object.entries<{ enum?: string[] }>(schema.$defs[name].properties)) {
        if (DRAWS_NOTHING.has(`${name}.${field}`)) continue;
        for (const value of def.enum ?? []) {
          const key = `${name}.${field}=${value}`;
          if (!VALUE_DRAWS_NOTHING.has(key) && !found.some(o => o[field] === value)) missing.push(key);
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it("lists as drawing nothing only fields the schema has", () => {
    const known = new Set(Object.entries(schema.$defs).flatMap(([name, def]) =>
      Object.keys((def as { properties: object }).properties).map(f => `${name}.${f}`)));
    expect([...DRAWS_NOTHING].filter(f => !known.has(f))).toEqual([]);
    expect([...VALUE_DRAWS_NOTHING].filter(v => !known.has(v.split("=")[0]!))).toEqual([]);
  });

  it("has unique slugs that are safe in a file name", () => {
    const slugs = FEATURE_FIXTURES.map(f => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.filter(s => !/^[a-z0-9-]+$/.test(s))).toEqual([]);
  });
});

/**
 * Lint findings a fixture is known to raise, by slug, as `target: code`.
 * Empty: every fixture draws cleanly. A fix that removes a listed finding
 * fails the test until it is taken out of here.
 */
const KNOWN_FINDINGS: Record<string, string[]> = {};

const named = (p: Pedigree): Pedigree =>
  ({ ...p, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 5, ...p.canvasSettings, relationshipLabels: true } });

describe("feature fixtures draw cleanly", () => {
  for (const fx of FEATURE_FIXTURES) {
    it(`${fx.slug}: canvas, export and U-shape`, () => {
      const p = fx.data;
      const found = new Set<string>();
      const add = (target: string, codes: { code: string }[]) => codes.forEach(c => found.add(`${target}: ${c.code}`));
      add("canvas", lintFlow(p, layoutToFlow(p)));
      add("canvas compact", lintFlow(p, layoutToFlow(p, { compact: true })));
      add("export", lintExport(p, { title: fx.label }));
      add("export compact", lintExport(p, { compact: true }));
      add("export de-identified", lintExport(p, { deidentify: true }));
      add("export named", lintExport(named(p), { compact: true }));
      add("u-shape", lintUShape(named(p), { uShapePartners: true }));
      add("u-shape", lintUShape(named(p), { uShapePartners: false }));
      expect([...found].sort()).toEqual([...(KNOWN_FINDINGS[fx.slug] ?? [])].sort());
      expect(exportUShapeSvg(p)).toContain("<svg");
    });
  }

  it("names known findings only for fixtures that exist", () => {
    const slugs = new Set(FEATURE_FIXTURES.map(f => f.slug));
    expect(Object.keys(KNOWN_FINDINGS).filter(s => !slugs.has(s))).toEqual([]);
  });
});

describe("feature fixtures are valid pedigrees", () => {
  for (const fx of FEATURE_FIXTURES) {
    it(`${fx.slug}: survives Download JSON and import unchanged`, () => {
      const result = importJson(exportJson(fx.data, { title: fx.label }));
      expect(result.issues.filter(i => i.severity === "error")).toEqual([]);
      expect(result.pedigree).toEqual(fx.data);
    });
  }

  it("the editor's checks run on every one", () => {
    for (const fx of FEATURE_FIXTURES) expect(() => findProblems(fx.data), fx.slug).not.toThrow();
  });
});
