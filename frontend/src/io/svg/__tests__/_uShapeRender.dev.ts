// Dev-only render harness for the U-shape exporter. Run via ../../../render-u.sh
// (NOT part of the normal test suite — file name avoids the .test.ts glob).
// Renders a battery of pedigrees to test-output/*.svg for visual iteration.
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { exportUShapeSvg } from "../uShapeExporter";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../../fixtures/consanguineous";
import { largerFamily } from "../../../fixtures/largerFamily";
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

function write(name: string, p: Pedigree, debug = true) {
  const svg = exportUShapeSvg(labelIds(structuredClone(p)), { debugSpine: debug });
  writeFileSync(join(OUT, `${name}.svg`), svg, "utf-8");
  console.log(`wrote ${name}.svg`);
}

function loadPed(rel: string): Pedigree {
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
write("dev-fame", loadPed("test-data/ped/public_data/FAME_80237.ped"));
write("dev-kinship2", loadPed("test-data/ped/large/kinship2_sample.ped"));

console.log("done");
