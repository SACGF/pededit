import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isAffected, kinshipCoefficients, type Pedigree } from "@pedigree-editor/layout-engine";
import { DATASET, DATASET_TODAY, datasetFileText, type DatasetCase } from "../dataset";
import { importJson, exportJson } from "../../io/json";
import { JsonIssueCode } from "../../io/json/types";
import { importPed, exportPed } from "../../io/ped";
import { buildScene } from "../../pedigree/scene";
import { lintScene } from "../../pedigree/renderLint";
import { lintExport } from "../../io/svg/exportLint";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { findProblems, RULES } from "../../pedigree/validation";
import { notationOf } from "../../pedigree/notation";

/*
 * The test data set (#167, test-data/pedigrees/). Three jobs:
 *
 * 1. Write. Each case of fixtures/dataset.ts is a committed file, and
 *    manifest.json holds what the code does with it today: importer issues,
 *    number of people, editor problems, lint findings, and whether the server
 *    takes it. A change in any of those fails here until the manifest is
 *    rewritten on purpose (`npm -w frontend run test -- -u dataset`) and the
 *    diff read. backend/api/tests.py and the page checks read the same files.
 * 2. Sweep. Checks that hold for every file with no expectation written:
 *    import then export gives the same pedigree, the layout and both lints
 *    run, PED keeps what PED can carry.
 * 3. Coverage. Every rule in RULES and every importer issue code is
 *    exercised by at least one file.
 */

const DIR = join(__dirname, "../../../../test-data/pedigrees");
const TODAY = new Date(`${DATASET_TODAY}T12:00:00Z`);

interface ManifestEntry {
  file: string;
  group: string;
  purpose: string;
  /** Importer issues as "severity:CODE", sorted, one per code. */
  import: string[];
  /** Whether the importer takes the file. */
  valid: boolean;
  /**
   * What POST /api/pedigrees/ does with the file's pedigree: "accepted" (and
   * returned unchanged), "refused" (400: a field missing or mistyped, or a
   * structure that does not fit together, `structure_errors` in
   * backend/api/serializers.py), or "not-sent" when the fault is in the file
   * or its envelope, which the server never sees.
   */
  server: "accepted" | "refused" | "not-sent";
  /** Left out of the browser sweep. */
  timingOnly?: true;
  people?: number;
  /** Editor problems (pedigree/validation.ts) as "rule:subject", on DATASET_TODAY. */
  problems?: string[];
  /** Render lint and export lint codes; empty when it draws cleanly. */
  lint?: string[];
  exportLint?: string[];
}

const unique = (xs: string[]) => [...new Set(xs)].sort();

/** The pedigree object a client would send to the server for this document, or null. */
function serverPayload(c: DatasetCase): unknown {
  if (c.text !== undefined) return null;
  const doc = c.document as Record<string, unknown> | unknown[];
  if (Array.isArray(doc) || typeof doc !== "object" || doc === null) return null;
  return "format" in doc || "pedigree" in doc ? (doc as { pedigree?: unknown }).pedigree ?? null : doc;
}

/** Importer errors that are about the file or envelope, not the pedigree in it. */
const ENVELOPE_ERRORS = new Set<string>([JsonIssueCode.INVALID_JSON, JsonIssueCode.NOT_AN_OBJECT, JsonIssueCode.UNKNOWN_FORMAT]);
const imported = new Map<string, ReturnType<typeof importJson>>();
const importOf = (c: DatasetCase) => {
  if (!imported.has(c.file)) imported.set(c.file, importJson(datasetFileText(c)));
  return imported.get(c.file)!;
};

function describeCase(c: DatasetCase): ManifestEntry {
  const result = importOf(c);
  const errors = result.issues.filter(i => i.severity === "error").map(i => i.code as string);
  const entry: ManifestEntry = {
    file: c.file, group: c.group, purpose: c.purpose,
    import: unique(result.issues.map(i => `${i.severity}:${i.code}`)),
    valid: !result.hasErrors,
    server: !result.hasErrors ? "accepted" : errors.every(e => ENVELOPE_ERRORS.has(e)) ? "not-sent" : "refused",
    ...(c.timingOnly ? { timingOnly: true as const } : {}),
  };
  const p = result.pedigree;
  if (!p) return entry;
  entry.people = p.individuals.length;
  entry.problems = findProblems(p, RULES, TODAY).map(x => x.id).sort();
  entry.lint = unique(lintScene(p, buildScene(p)).map(f => f.code));
  if (!c.timingOnly) entry.exportLint = unique(lintExport(p, {}).map(f => f.code));
  return entry;
}

const at = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);

describe("test data set: files and manifest", () => {
  const entries: ManifestEntry[] = [];

  for (const c of DATASET) {
    it(c.file, async () => {
      await expect(datasetFileText(c)).toMatchFileSnapshot(join(DIR, c.file));
      const entry = describeCase(c);
      entries.push(entry);
      const result = importOf(c);
      const must = c.must ?? {};

      // What the case is there to show.
      for (const code of must.importCodes ?? []) expect(result.issues.map(i => i.code), `${c.file} importer issues`).toContain(code);
      if (c.group === "refused") expect(result.hasErrors, `${c.file} is refused`).toBe(true);
      else expect(result.issues.filter(i => i.severity === "error"), `${c.file} imports`).toEqual([]);
      const p = result.pedigree;
      if (!p) return;
      const rules = new Set(entry.problems!.map(id => id.split(":")[0]));
      for (const rule of must.rules ?? []) expect([...rules], `${c.file} problems`).toContain(rule);
      if (must.kinship) {
        const k = kinshipCoefficients(p);
        for (const [a, b, value] of must.kinship) expect(k.kinship(a, b), `${c.file} kinship ${a}, ${b}`).toBeCloseTo(value, 10);
      }
      if (must.notation) expect(notationOf(p)).toBe(must.notation);
      for (const path of must.keeps ?? []) expect(at(p, path), `${c.file} keeps ${path}`).toBeDefined();

      // Sweeps: hold for every valid file.
      const again = importJson(exportJson(p, { title: result.title ?? undefined }));
      // A dangling reference is kept, so it is warned about again; nothing new may appear.
      const before = new Set(result.issues.map(i => i.code));
      expect(again.issues.filter(i => i.severity !== "info" && !before.has(i.code)).map(i => i.code), `${c.file} exports and imports again`).toEqual([]);
      expect(again.pedigree).toEqual(p);
      expect(buildScene(p, { compact: true }).people.length).toBeGreaterThan(0);
      if (!c.timingOnly) expect(exportUShapeSvg(p)).toContain("<svg");
    }, 120_000);
  }

  it("manifest.json says what each file does", async () => {
    expect(entries.length).toBe(DATASET.length);
    const manifest = { today: DATASET_TODAY, files: entries };
    await expect(JSON.stringify(manifest, null, 2) + "\n").toMatchFileSnapshot(join(DIR, "manifest.json"));
  });

  it("every file in the folder is a case, with its own name", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(f =>
      statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [relative(DIR, join(dir, f))]);
    const files = existsSync(DIR) ? walk(DIR).filter(f => f.endsWith(".json") && f !== "manifest.json") : [];
    expect(files.sort()).toEqual(DATASET.map(c => c.file).sort());
    expect(new Set(DATASET.map(c => c.file)).size).toBe(DATASET.length);
  });
});

describe("test data set: PED keeps what PED can carry", () => {
  for (const c of DATASET.filter(c => c.group !== "refused" && !c.timingOnly)) {
    it(c.file, () => {
      const p = importOf(c).pedigree!;
      const back = importPed(exportPed(p));
      expect(back.issues.filter(i => i.severity === "error").map(i => i.message), "PED import errors").toEqual([]);
      const people = back.pedigrees.flatMap(f => f.pedigree.individuals.map(i => ({ i, ped: f.pedigree })));
      const count = (ped: Pedigree, list = ped.individuals) => ({
        people: list.length,
        male: list.filter(i => i.sex === "male").length,
        female: list.filter(i => i.sex === "female").length,
        affected: list.filter(i => isAffected(i, ped)).length,
        withParents: new Set(Object.values(ped.parentOf).flat()).size,
      });
      const got = back.pedigrees.map(f => count(f.pedigree)).reduce((a, b) => ({
        people: a.people + b.people, male: a.male + b.male, female: a.female + b.female, affected: a.affected + b.affected, withParents: a.withParents + b.withParents,
      }), { people: 0, male: 0, female: 0, affected: 0, withParents: 0 });
      expect(people.length).toBe(got.people);
      expect(got).toEqual(count(p));
    });
  }
});

describe("test data set: coverage", () => {
  const all = DATASET.map(c => ({ c, result: importOf(c) }));

  it("every rule in RULES reports a problem in some file", () => {
    const seen = new Set(all.flatMap(({ result }) => (result.pedigree ? findProblems(result.pedigree, RULES, TODAY).map(p => p.rule) : [])));
    expect(RULES.map(r => r.id).filter(id => !seen.has(id))).toEqual([]);
  });

  it("every importer issue code is reported for some file", () => {
    /** Declared in JsonIssueCode but never reported by the importer. */
    const NEVER_REPORTED = new Set<string>([JsonIssueCode.INVALID_VALUE]);
    const seen = new Set(all.flatMap(({ result }) => result.issues.map(i => i.code as string)));
    expect(Object.values(JsonIssueCode).filter(code => !seen.has(code) && !NEVER_REPORTED.has(code))).toEqual([]);
    expect([...NEVER_REPORTED].filter(code => seen.has(code)), "now reported: take it out of NEVER_REPORTED").toEqual([]);
  });

  it("every refused file is refused for the reason it is there for", () => {
    for (const { c, result } of all.filter(x => x.c.group === "refused")) {
      const errors = unique(result.issues.filter(i => i.severity === "error").map(i => i.code as string));
      expect(errors, c.file).toEqual(c.must!.importCodes);
    }
  });
});

export type { ManifestEntry };
