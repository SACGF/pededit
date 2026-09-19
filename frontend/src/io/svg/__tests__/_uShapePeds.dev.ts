// Dev-only: run every test PED file (test-data/ped/**) and every in-app example
// through the U-shape exporter. Writes test-output/ped-*.svg for render-u.sh to
// screenshot, and prints sanity checks: exceptions, NaN, overlapping symbols,
// and who was omitted. NOT part of the normal test suite.
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { exportUShapeSvg, layoutUShape } from "../uShapeExporter";
import { importPed } from "../../ped";
import { EXAMPLES } from "../../../data/examples";
import type { Pedigree } from "@pedigree-editor/layout-engine";

const ROOT = process.cwd();
const PEDDIR = join(ROOT, "..", "test-data", "ped");
const OUT = join(ROOT, "test-output");
mkdirSync(OUT, { recursive: true });

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ped") ? [p] : [];
  });
}

function check(name: string, p: Pedigree) {
  const problems: string[] = [];
  let layout;
  try { layout = layoutUShape(p); } catch (e) { problems.push(`layout threw: ${e}`); }
  let svg = "";
  try { svg = exportUShapeSvg(p, { title: name }); } catch (e) { problems.push(`export threw: ${e}`); }
  if (/NaN|Infinity/.test(svg)) problems.push("NaN/Infinity in SVG");
  if (layout) {
    const nodes = [...layout.nodes.values(), ...layout.duplicates];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < 44) problems.push(`overlap ${nodes[i].id}/${nodes[j].id} d=${d.toFixed(1)}`);
    }
    const w = svg.match(/width="(\d+)"/)?.[1], h = svg.match(/height="(\d+)"/)?.[1];
    console.log(`${name}: n=${p.individuals.length} drawn=${layout.nodes.size} dup=${layout.duplicates.length} omitted=${layout.omitted.length} [${layout.omitted.join(",")}] size=${w}x${h}`);
  } else console.log(`${name}: layout null (n=${p.individuals.length})`);
  for (const pr of problems) console.log(`   !! ${pr}`);
  const labelled = structuredClone(p);
  for (const ind of labelled.individuals) if (!ind.name) ind.name = ind.id.replace(/^__phantom_/, "ph_");
  writeFileSync(join(OUT, `ped-${name}.svg`), exportUShapeSvg(labelled, { debugSpine: true }), "utf-8");
}

for (const f of files(PEDDIR)) {
  const rel = relative(PEDDIR, f).replace(/\.ped$/, "").replace(/\//g, "__");
  const res = importPed(readFileSync(f, "utf-8"));
  if (res.hasErrors) { console.log(`${rel}: import errors (${res.issues.filter(i => i.severity === "error").map(i => i.code).join(",")})`); continue; }
  for (const { familyId, pedigree } of res.pedigrees) {
    check(res.pedigrees.length > 1 ? `${rel}__${familyId}` : rel, pedigree);
  }
}
for (const e of EXAMPLES) check(`example__${e.label.replace(/\W+/g, "_")}`, e.data);
