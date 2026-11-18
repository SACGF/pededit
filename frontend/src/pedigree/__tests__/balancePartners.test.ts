import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { layoutCost } from "../layoutCost";
import { importPed } from "../../io/ped/index.js";
import { EXAMPLES } from "../../data/examples";
import { alignPedigreeByFamily, drawnLeftPartner, type Pedigree } from "@pedigree-editor/layout-engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PED = join(__dirname, "../../../../test-data/ped");

/** Every example and every PED fixture the oracle covers, as [name, pedigree]. */
function corpus(): [string, Pedigree][] {
  // The passes are measured on the family alone: an example's own choices of
  // how its couples are drawn (leftPartner, drawnBeside) are not theirs.
  const out: [string, Pedigree][] = EXAMPLES.map(e =>
    [e.label, { ...e.data, partnerships: e.data.partnerships.map(({ leftPartner: _l, drawnBeside: _b, ...c }) => c) }]);
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
  const targaryen = corpus().find(([n]) => n === "fiction/targaryen.ped#TARG")![1];

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

  it("every pass together is no worse than the plain port on every fixture, and moves nobody without a gain", () => {
    for (const [name, p] of corpus()) {
      const off = layoutToFlow(p, { improveLayout: false });
      const on = layoutToFlow(p);
      const a = layoutCost(off), b = layoutCost(on);
      expect(b.duplicates, name).toBeLessThanOrEqual(a.duplicates);
      expect(b.hops, name).toBeLessThanOrEqual(a.hops);
      expect(lintFlow(p, on).length, name).toBeLessThanOrEqual(lintFlow(p, off).length);
      if (b.duplicates === a.duplicates && b.hops === a.hops) {
        expect(on.nodes.map(n => [n.id, n.position]), name).toEqual(off.nodes.map(n => [n.id, n.position]));
      }
    }
  });
});

describe("family swaps (#77)", () => {
  const all = corpus();
  const named = (label: string) => all.find(([n]) => n === label)![1];
  const copiesOf = (flow: ReturnType<typeof layoutToFlow>, name: string) =>
    flow.nodes.filter(n => n.data.individual.name === name).length;

  it("draws Rhaenyra's sibship beside the Velaryons, so Laenor is drawn once", () => {
    const p = named("fiction/targaryen.ped#TARG");
    const off = layoutToFlow(p, { improveLayout: false }), on = layoutToFlow(p);
    expect(copiesOf(off, "Laenor_Velaryon")).toBe(2);
    expect(copiesOf(on, "Laenor_Velaryon")).toBe(1);
    // Laenor is in his parents' sibship and beside his wife: the two
    // sibships touch.
    const row = rowOf(on, "Rhaenyra");
    expect(row.slice(row.indexOf("Daemon"), row.indexOf("Daemon") + 5))
      .toEqual(["Daemon", "Rhaenyra", "Laenor_Velaryon", "Daemon", "Laena_Velaryon"]);
    const a = layoutCost(off), b = layoutCost(on);
    expect([a.duplicates, b.duplicates]).toEqual([5, 3]);
    expect(b.arcLength).toBeLessThan(a.arcLength * 0.6);
    expect(lintFlow(p, on)).toEqual([]);
  });

  it("removes a duplicate on the other examples it changes, and only on those", () => {
    const fewer = all.filter(([, p]) =>
      layoutCost(layoutToFlow(p)).duplicates < layoutCost(layoutToFlow(p, { improveLayout: false })).duplicates).map(([n]) => n);
    expect(fewer.filter(n => !n.includes("/")).sort()).toEqual(["Double second cousins (A)", "House Targaryen", "The Buendías"]);
    expect(fewer).toContain("large/kinship2_sample.ped#1");
    const buendia = named("The Buendías");
    expect(copiesOf(layoutToFlow(buendia, { improveLayout: false }), "Úrsula")).toBe(2);
    expect(copiesOf(layoutToFlow(buendia), "Úrsula")).toBe(1);
  });

  it("leaves a couple whose side the user chose as it was drawn without the pass", () => {
    const base = named("Double second cousins (A)");
    const idx = new Set(Object.keys(base.parentOf).flatMap(k => base.parentOf[k]!));
    for (const couple of base.partnerships.filter(c => idx.has(c.individual1) && idx.has(c.individual2))) {
      for (const leftPartner of [couple.individual1, couple.individual2]) {
        const p: Pedigree = { ...base, partnerships: base.partnerships.map(c => (c.id === couple.id ? { ...c, leftPartner } : c)) };
        const plain = drawnLeftPartner(p, alignPedigreeByFamily(p, { improve: false }), couple.id);
        expect(drawnLeftPartner(p, alignPedigreeByFamily(p), couple.id), `${couple.id} ${leftPartner}`).toBe(plain);
      }
    }
  });
});
