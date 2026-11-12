/**
 * Kinship coefficients against kinship2 (#32).
 *
 * `layout-engine/scripts/kinship-oracle.R` ran R's `kinship2::kinship()` over
 * the PED corpus and wrote every non-zero pair to
 * `layout-engine/tests/oracle/kinship.json`. Each file is imported here with
 * the app's own PED importer and every pair of individuals is compared,
 * including the pairs R says are unrelated. The monozygotic twin cases in the
 * same file are checked in `layout-engine/tests/kinship.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { kinshipCoefficients } from "@pedigree-editor/layout-engine";
import { importPed } from "../ped/index.js";
import { EXAMPLES } from "../../data/examples.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

interface OracleFamily { ids: string[]; pairs: [number, number, number][]; pairs_x?: [number, number, number][] }
interface Oracle { files: Record<string, { source: string; families: Record<string, OracleFamily> }> }
const ORACLE = JSON.parse(readFileSync(join(ROOT, "layout-engine/tests/oracle/kinship.json"), "utf-8")) as Oracle;

describe("kinship2 kinship() oracle", () => {
  it("covers the corpus", () => {
    expect(Object.keys(ORACLE.files).length).toBeGreaterThanOrEqual(26);
  });

  let pairsCompared = 0;
  let relatedPairs = 0;
  for (const [name, file] of Object.entries(ORACLE.files)) {
    const imported = importPed(readFileSync(join(ROOT, file.source), "utf-8"));
    for (const [fid, R] of Object.entries(file.families)) {
      it(`${name}/${fid}: every pair matches R`, () => {
        const pedigree = imported.pedigrees.find(p => p.familyId === fid)?.pedigree;
        expect(pedigree, "family imported").toBeDefined();
        const ours = kinshipCoefficients(pedigree!);
        const expected = new Map(R.pairs.map(([i, j, v]) => [`${i},${j}`, v]));
        const wrong: string[] = [];
        for (let i = 1; i <= R.ids.length; i++) {
          for (let j = i; j <= R.ids.length; j++) {
            const want = expected.get(`${i},${j}`) ?? 0;
            const got = ours.kinship(R.ids[i - 1]!, R.ids[j - 1]!);
            pairsCompared++;
            if (want > 0 && i !== j) relatedPairs++;
            if (Math.abs(got - want) > 1e-10) wrong.push(`${R.ids[i - 1]} x ${R.ids[j - 1]}: ours ${got}, R ${want}`);
            // Symmetric.
            if (ours.kinship(R.ids[j - 1]!, R.ids[i - 1]!) !== got) wrong.push(`${R.ids[i - 1]} x ${R.ids[j - 1]}: not symmetric`);
          }
        }
        expect(wrong).toEqual([]);
        // The inbreeding coefficient is the diagonal: F = 2 * kinship(i, i) - 1.
        for (let i = 1; i <= R.ids.length; i++) {
          expect(ours.inbreeding(R.ids[i - 1]!)).toBeCloseTo(2 * (expected.get(`${i},${i}`) ?? 0) - 1, 10);
        }
      });
    }
  }

  it("compared a meaningful number of related pairs", () => {
    expect(pairsCompared).toBeGreaterThan(10000);
    expect(relatedPairs).toBeGreaterThan(5000);
  });
});

// X-linked (#87): kinship(ped, chrtype = "x"), written for every family whose
// sexes are all known (see the R script for why the others are left out).
describe("kinship2 kinship(chrtype = \"x\") oracle", () => {
  let pairsCompared = 0;
  let differFromAutosomal = 0;
  for (const [name, file] of Object.entries(ORACLE.files)) {
    const imported = importPed(readFileSync(join(ROOT, file.source), "utf-8"));
    for (const [fid, R] of Object.entries(file.families)) {
      if (!R.pairs_x) continue;
      it(`${name}/${fid}: every X-linked pair matches R`, () => {
        const pedigree = imported.pedigrees.find(p => p.familyId === fid)!.pedigree;
        const ours = kinshipCoefficients(pedigree, { chromosome: "X" });
        const autosomal = kinshipCoefficients(pedigree);
        const expected = new Map(R.pairs_x!.map(([i, j, v]) => [`${i},${j}`, v]));
        const wrong: string[] = [];
        for (let i = 1; i <= R.ids.length; i++) {
          for (let j = i; j <= R.ids.length; j++) {
            const a = R.ids[i - 1]!, b = R.ids[j - 1]!;
            const want = expected.get(`${i},${j}`) ?? 0;
            const got = ours.kinship(a, b);
            pairsCompared++;
            if (i !== j && Math.abs(want - autosomal.kinship(a, b)) > 1e-10) differFromAutosomal++;
            if (!(Math.abs(got - want) <= 1e-10)) wrong.push(`${a} x ${b}: ours ${got}, R ${want}`);
            if (ours.kinship(b, a) !== got) wrong.push(`${a} x ${b}: not symmetric`);
          }
        }
        expect(wrong).toEqual([]);
        // F on the X is 2 * kinship(i, i) - 1 for a female and not defined for a male.
        for (const ind of pedigree.individuals) {
          const f = ours.inbreeding(ind.id);
          if (ind.sex === "male") expect(f).toBeNaN();
          else expect(f).toBeCloseTo(2 * ours.kinship(ind.id, ind.id) - 1, 12);
        }
      });
    }
  }

  it("compared a meaningful number of pairs, many unlike the autosomal ones", () => {
    expect(pairsCompared).toBeGreaterThan(10000);
    expect(differFromAutosomal).toBeGreaterThan(1000);
  });
});

describe("published inbreeding coefficients", () => {
  it("Charles II of Spain: about 0.22 from the generations the example holds", () => {
    // Alvarez et al. 2009 give 0.254 from 16 generations of ancestry; the
    // example holds the last seven, where most of it arises.
    const ex = EXAMPLES.find(e => e.label === "Spanish Habsburgs");
    expect(ex, "example").toBeDefined();
    const charles = ex!.data.individuals.find(i => i.id === "Charles_II" || i.name === "Charles II");
    expect(charles, "Charles II").toBeDefined();
    const f = kinshipCoefficients(ex!.data).inbreeding(charles!.id);
    expect(f).toBeCloseTo(0.2172, 4);
  });
});
