import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { EXAMPLES } from "../../../data/examples";
import { FEATURE_FIXTURES } from "../../../fixtures/features";
import { DATASET_TODAY } from "../../../fixtures/dataset";
import { exportSvg } from "../svgExporter";
import { exportUShapeSvg } from "../uShapeExporter";

/*
 * SVG snapshots (#69). The render and export lints check structure (who is
 * joined to whom); these catch a change in how anything looks: symbol detail,
 * label placement, duplicate arcs, hop risers, the key. Every example and
 * every feature fixture (#140) is exported and compared with a committed
 * file in ./snapshots, as text.
 *
 * When one fails:
 *  - not meant to change anything (a refactoring): the diff is the bug;
 *  - meant to change the drawing: `npm -w frontend run test -- -u svgSnapshots`
 *    rewrites the files. Look at what changed before committing, by rendering
 *    the old and new file (`node frontend/scripts/browser/shot.mjs FILE.svg`,
 *    or compare.mjs between the two commits), and say what changed in the
 *    commit message.
 *
 * PNG and PDF are made from the standard SVG, so they are covered by it.
 */

const SNAPSHOTS = join(__dirname, "snapshots");

/**
 * Coordinates come out of the layout as doubles ("39.99999076426501"). Round
 * anything with four or more decimals to two, so a snapshot does not depend
 * on the last bits of a float and a diff shows only moves a reader could see.
 */
const normalise = (svg: string) => svg.replace(/-?\d+\.\d{4,}(e-?\d+)?/g, n => String(Math.round(Number(n) * 100) / 100));

const fileSlug = (label: string) =>
  label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface Case { name: string; title: string; data: Pedigree; fixture: boolean }
const CASES: Case[] = [
  ...EXAMPLES.map(e => ({ name: `example-${fileSlug(e.label)}`, title: e.label, data: e.data, fixture: false })),
  ...FEATURE_FIXTURES.map(f => ({ name: `fixture-${f.slug}`, title: f.label, data: f.data, fixture: true })),
];

async function check(file: string, svg: string) {
  await expect(normalise(svg)).toMatchFileSnapshot(join(SNAPSHOTS, file));
}

describe("SVG export snapshots", () => {
  // A de-identified export writes ages as decades counted from today, so
  // today is fixed: the files must not change as the people in them age.
  beforeAll(() => { vi.useFakeTimers({ now: new Date(`${DATASET_TODAY}T12:00:00Z`), toFake: ["Date"] }); });
  afterAll(() => { vi.useRealTimers(); });

  for (const c of CASES) {
    it(`${c.name}: standard, compact${c.fixture ? ", de-identified" : ""} and U-shape`, async () => {
      // With the chart title, as the export dialog passes it.
      await check(`${c.name}.svg`, exportSvg(c.data, { title: c.title }));
      await check(`${c.name}.compact.svg`, exportSvg(c.data, { title: c.title, compact: true }));
      // De-identification rewrites the pedigree before drawing; the fixtures carry the text it acts on.
      if (c.fixture) await check(`${c.name}.deidentified.svg`, exportSvg(c.data, { deidentify: true, ageBuckets: true }));
      await check(`${c.name}.ushape.svg`, exportUShapeSvg(c.data, { title: c.title }));
    });
  }

  it("is the same on a second run", () => {
    for (const c of CASES) {
      expect(exportSvg(c.data, { title: c.title }), c.name).toBe(exportSvg(c.data, { title: c.title }));
      expect(exportUShapeSvg(c.data), c.name).toBe(exportUShapeSvg(c.data));
    }
  });

  it("gives every case its own file name", () => {
    expect(new Set(CASES.map(c => c.name)).size).toBe(CASES.length);
  });

  it("has no snapshot file left over from a removed example or fixture", () => {
    const names = new Set(CASES.flatMap(c => [
      `${c.name}.svg`, `${c.name}.compact.svg`, `${c.name}.ushape.svg`, ...(c.fixture ? [`${c.name}.deidentified.svg`] : []),
    ]));
    const files = existsSync(SNAPSHOTS) ? readdirSync(SNAPSHOTS) : [];
    expect(files.filter(f => !names.has(f))).toEqual([]);
  });
});
