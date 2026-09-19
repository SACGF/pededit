// Dev-only render harness for the U-shape exporter. Run via ../../../render-u.sh
// (NOT part of the normal test suite — file name avoids the .test.ts glob).
// Renders a battery of pedigrees to test-output/*.svg for visual iteration.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { exportUShapeSvg } from "../uShapeExporter";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../../fixtures/consanguineous";
import { largerFamily } from "../../../fixtures/largerFamily";
import { makeSyntheticFamily } from "../../../fixtures/syntheticFamily";
import { EXAMPLES } from "../../../data/examples";
import { parsePed } from "../../../io/ped/parser";
import { convertFamily } from "../../../io/ped/converter";
import type { Pedigree } from "@pedigree-editor/layout-engine";

// Run from the frontend/ dir (render-u.sh cds there); paths are cwd-relative
// because esbuild bundles this file so __dirname is not the source location.
const ROOT = process.cwd();              // .../frontend
const OUT = join(ROOT, "test-output");
mkdirSync(OUT, { recursive: true });

function labelIds(p: Pedigree): Pedigree {
  for (const ind of p.individuals) if (!ind.name) ind.name = ind.id;
  return p;
}

function write(name: string, p: Pedigree | null, debug = true) {
  if (!p) return;
  const svg = exportUShapeSvg(labelIds(structuredClone(p)), { debugSpine: debug });
  writeFileSync(join(OUT, `${name}.svg`), svg, "utf-8");
  console.log(`wrote ${name}.svg`);
}

function loadPed(rel: string): Pedigree | null {
  if (!existsSync(join(ROOT, "..", rel))) { console.log(`skip ${rel} (missing)`); return null; }
  const text = readFileSync(join(ROOT, "..", rel), "utf-8");
  const { rows } = parsePed(text);
  // single-family files: take the first family id present
  const firstFam = rows[0]?.familyId;
  const fam = rows.filter(r => r.familyId === firstFam);
  return convertFamily(fam);
}

write("dev-simple", simpleFamily);
write("dev-larger", largerFamily);
write("dev-consang", consanguineousFamily);
const threeGen = EXAMPLES.find(e => e.label === "Three generations");
if (threeGen) write("dev-threegen", threeGen.data);
const large = EXAMPLES.find(e => e.label === "Large family");
if (large) write("dev-largeexample", large.data);
write("dev-kinship2", loadPed("test-data/ped/large/kinship2_sample.ped"));

write("dev-synth-wide", makeSyntheticFamily({ seed: 8, generations: 5, minChildren: 2, maxChildren: 5, partnerRate: 0.65 }));
write("dev-synth-mid", makeSyntheticFamily({ seed: 26, generations: 4, minChildren: 1, maxChildren: 4 }));
write("dev-synth-skewed", makeSyntheticFamily({ seed: 20, generations: 6, minChildren: 1, maxChildren: 4, partnerRate: 0.5 }));

// Realistic labels: names and dates of birth, which widen the slots and the tracks.
const FIRST = ["Margaret", "Bartholomew", "Ann", "Christopher", "Li", "Evangeline", "Tom", "Siobhan", "Maximilian", "Jo"];
const named = makeSyntheticFamily({ seed: 12, generations: 5, minChildren: 2, maxChildren: 5, partnerRate: 0.65 });
named.individuals.forEach((ind, i) => {
  ind.name = FIRST[i % FIRST.length];
  ind.dob = `${1900 + (i * 7) % 110}-0${1 + (i % 9)}-1${i % 9}`;
});
write("dev-named", named, false);
writeFileSync(join(OUT, "dev-named-deident.svg"), exportUShapeSvg(named, { deidentify: true, title: "De-identified, no debug overlay" }), "utf-8");

console.log("done");
