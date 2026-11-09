import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { layoutCost } from "../layoutCost";
import { importPed } from "../../io/ped/index.js";
import { EXAMPLES } from "../../data/examples";
import type { Pedigree } from "@pedigree-editor/layout-engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PED = join(__dirname, "../../../../test-data/ped");

/** Every example and every PED fixture the oracle covers, as [name, pedigree]. */
function corpus(): [string, Pedigree][] {
  const out: [string, Pedigree][] = EXAMPLES.map(e => [e.label, e.data]);
  for (const dir of ["historic", "fiction", "classic", "consanguineous", "large"]) {
    for (const f of readdirSync(join(PED, dir))) {
      if (!f.endsWith(".ped")) continue;
      const r = importPed(readFileSync(join(PED, dir, f), "utf8"));
      for (const fam of r.pedigrees) out.push([`${dir}/${f}#${fam.familyId}`, fam.pedigree]);
    }
  }
  return out;
}

const rowOf = (flow: ReturnType<typeof layoutToFlow>, name: string) => {
  const node = flow.nodes.find(n => n.data.individual.name === name && !n.data.isDuplicate)!;
  return flow.nodes
    .filter(n => Math.abs(n.position.y - node.position.y) < 1)
    .sort((a, b) => a.position.x - b.position.x)
    .map(n => n.data.individual.name);
};

describe("spouse-hint balancing (#76)", () => {
  const targaryen = corpus().find(([n]) => n.startsWith("fiction/targaryen"))![1];

  it("puts Rhaenyra between Daemon and Laenor with no pass-through line", () => {
    const on = layoutToFlow(targaryen);
    const row = rowOf(on, "Rhaenyra");
    const i = row.indexOf("Rhaenyra");
    expect(new Set([row[i - 1], row[i + 1]])).toEqual(new Set(["Daemon", "Laenor_Velaryon"]));
    expect(layoutCost(on).hops).toBe(0);
    expect(lintFlow(targaryen, on)).toEqual([]);
    // The plain port (what R draws) has the hop and both husbands on one side.
    const off = layoutToFlow(targaryen, { improveLayout: false });
    expect(layoutCost(off).hops).toBe(1);
    expect(rowOf(off, "Rhaenyra").slice(-3)).toEqual(["Daemon", "Laenor_Velaryon", "Rhaenyra"]);
  });

  it("is no worse than the plain port on every fixture, and changes nothing else", () => {
    for (const [name, p] of corpus()) {
      const off = layoutToFlow(p, { improveLayout: false });
      const on = layoutToFlow(p);
      const a = layoutCost(off), b = layoutCost(on);
      expect(b.duplicates, name).toBeLessThanOrEqual(a.duplicates);
      expect(b.hops, name).toBeLessThanOrEqual(a.hops);
      expect(lintFlow(p, on).length, name).toBeLessThanOrEqual(lintFlow(p, off).length);
      if (!/targaryen/i.test(name)) {
        expect(on.nodes.map(n => [n.id, n.position]), name).toEqual(off.nodes.map(n => [n.id, n.position]));
      }
    }
  });
});
