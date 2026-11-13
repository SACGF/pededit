/**
 * Layout regression against kinship2.
 *
 * Every fixture listed below was run through R's `kinship2::align.pedigree()` by
 * `layout-engine/scripts/kinship2-oracle.R`, which wrote the n, nid, pos, fam and
 * spouse matrices to `layout-engine/tests/oracle/<name>.json`. This test imports
 * the same PED file with the frontend importer, lays it out with `alignPedigree`,
 * and compares slot for slot.
 *
 * Where the port matches R the comparison is exact (positions to 1e-6). Where it
 * does not, the fixture is listed in STRUCTURE_DIVERGENCES or POSITION_DIVERGENCES
 * with a one-line description, the structural invariants that still hold are
 * asserted, and the test fails if the divergence disappears so the list stays
 * honest. Known deliberate departures from R (see claude/layout_engine_guide.md):
 * isolated individuals are appended to their row instead of dropped, and a
 * post-QP centering pass shifts sibships under their parents.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { alignPedigree, isAffected } from "@pedigree-editor/layout-engine";
import type { LayoutResult, Pedigree } from "@pedigree-editor/layout-engine";
import { importPed } from "../ped/index.js";
import { EXAMPLES } from "../../data/examples.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA = join(__dirname, "../../../../test-data/ped");
const ORACLE_DIR = join(__dirname, "../../../../layout-engine/tests/oracle");

/** Oracle JSON name (without .json) to PED path relative to test-data/ped. */
const FIXTURES: Record<string, string> = {
  habsburg: "historic/habsburg.ped",
  queen_victoria: "historic/queen_victoria.ped",
  tutankhamun: "historic/tutankhamun.ped",
  targaryen: "fiction/targaryen.ped",
  buendia: "fiction/buendia.ped",
  atreides: "fiction/atreides.ped",
  three_quarter_siblings: "classic/three_quarter_siblings.ped",
  five_eighths_siblings: "classic/five_eighths_siblings.ped",
  full_sib_mating: "classic/full_sib_mating.ped",
  half_sib_triangle: "classic/half_sib_triangle.ped",
  double_first_cousins: "classic/double_first_cousins.ped",
  double_second_cousins_a: "classic/double_second_cousins_a.ped",
  double_second_cousins_b: "classic/double_second_cousins_b.ped",
  quad_half_first_cousins: "classic/quad_half_first_cousins.ped",
  grandparent_grandchild_partner: "classic/grandparent_grandchild_partner.ped",
  two_lineages_joined_twice: "classic/two_lineages_joined_twice.ped",
  sibling_mating: "consanguineous/sibling_mating.ped",
  first_cousin: "consanguineous/first_cousin.ped",
  double_first_cousin: "consanguineous/double_first_cousin.ped",
  uncle_niece: "consanguineous/uncle_niece.ped",
  half_sibling_mating: "consanguineous/half_sibling_mating.ped",
  kinship2_sample: "large/kinship2_sample.ped",
};

/**
 * Fixtures (keyed "<name>/<family id>") whose slot structure (n, nid, fam,
 * spouse) differs from R, with how it differs. Positions are not compared for
 * these.
 */
const STRUCTURE_DIVERGENCES: Record<string, string> = {};

/**
 * Fixtures whose slot structure matches R exactly but whose positions differ
 * (beyond 1e-6), with how they differ.
 */
const POSITION_DIVERGENCES: Record<string, string> = {
  "habsburg/HABS":
    "post-QP centering shifts sibships in rows 1 and 3 to 6 toward their parent midpoints, up to 0.47 units from R",
  "queen_victoria/VICT":
    "post-QP centering shifts Irene's three sons 0.5 units left, centred under Henry~Irene",
  "first_cousin/1":
    "post-QP centering spreads cousins 7 and 8 to 0.5 and 2.5 (under their parents); R keeps them adjacent at 1 and 2",
  "double_first_cousin/1":
    "post-QP centering spreads cousins 9 and 10 to 1.5 and 3.5 (under their parents); R keeps them adjacent at 2 and 3",
  "kinship2_sample/1":
    "post-QP centering shifts the sibship 121 to 124 one unit left, centred under 109~110",
  "quad_half_first_cousins/CLAS":
    "post-QP centering moves M2 from 3.17 to 3.5 and Y from 2.67 to 2.83, centred under their parents",
  "atreides/ATRE":
    "post-QP centering moves Alia and Paul 0.74 units left under Leto~Jessica, Paul's children 1.21 left under Paul~Chani, and Farad'n 0.48 right under his parents",
  "targaryen/TARG":
    "post-QP centering moves Rhaenys and Aemma in row 6 (up to 0.35 units) and Daeron II's and Maekar's lines in rows 13 and 14 (0.05 units) under their parents",
};

interface OracleFamily {
  ids: string[];
  n: number[];
  nid: number[][];
  pos: number[][];
  fam: number[][];
  spouse: number[][];
  inbreeding: number[];
}

interface OracleFile {
  source: string;
  kinship2: string;
  families: Record<string, OracleFamily>;
}

function readOracle(name: string): OracleFile {
  return JSON.parse(readFileSync(join(ORACLE_DIR, `${name}.json`), "utf-8")) as OracleFile;
}

/** Individuals with no parents and no partnership. R drops them; we append them. */
function isolatedIndices(ped: Pedigree): Set<number> {
  const linked = new Set<string>();
  for (const p of ped.partnerships) {
    linked.add(p.individual1);
    linked.add(p.individual2);
    for (const c of ped.parentOf[p.id] ?? []) linked.add(c);
  }
  const out = new Set<number>();
  ped.individuals.forEach((ind, i) => {
    if (!linked.has(ind.id)) out.add(i + 1);
  });
  return out;
}

/**
 * Drop the isolated individuals the port appends to the right end of each row,
 * so the remaining slots can be compared with R. Anything else that extends a
 * row beyond R's count is left in place and will show up as a divergence.
 */
function withoutIsolated(result: LayoutResult, isolated: Set<number>): LayoutResult {
  const keep = result.nid.map(row => row.map(nid => !isolated.has(nid)));
  const filter = <T>(rows: T[][]) => rows.map((row, lev) => row.filter((_, s) => keep[lev]![s]));
  return {
    n: keep.map(row => row.filter(Boolean).length),
    nid: filter(result.nid),
    pos: filter(result.pos),
    fam: filter(result.fam),
    spouse: filter(result.spouse),
  };
}

/** One line per level: "<id>[~ or =]/f<fam>" per slot, for readable diffs. */
function structureRows(
  r: { n: number[]; nid: number[][]; fam: number[][]; spouse: number[][] },
  ids: string[],
): string[] {
  return r.n.map((count, lev) => {
    const parts: string[] = [];
    for (let s = 0; s < count; s++) {
      const nid = r.nid[lev]![s]!;
      const sp = r.spouse[lev]![s] ?? 0;
      const mark = sp === 2 ? "=" : sp === 1 ? "~" : "";
      parts.push(`${ids[nid - 1] ?? `#${nid}`}${mark}/f${r.fam[lev]![s]}`);
    }
    return parts.join(" ");
  });
}

function assertInvariants(result: LayoutResult, ped: Pedigree, label: string) {
  // Every individual is placed at least once.
  const placed = new Set(result.nid.flat());
  for (let i = 1; i <= ped.individuals.length; i++) {
    expect(placed.has(i), `${label}: individual ${ped.individuals[i - 1]!.id} not placed`).toBe(true);
  }
  for (let lev = 0; lev < result.n.length; lev++) {
    const count = result.n[lev]!;
    expect(result.nid[lev]!.length, `${label}: nid row ${lev} length`).toBe(count);
    for (let s = 0; s < count; s++) {
      // Positions increase along a row, at least one slot apart (#73).
      if (s > 0) {
        expect(result.pos[lev]![s]! - result.pos[lev]![s - 1]!, `${label}: lev ${lev} slot ${s} spacing`)
          .toBeGreaterThanOrEqual(1 - 1e-6);
      }
      // fam points at a valid couple in the row above, and both parents sit in
      // the run of marriage-linked slots around it. (With three or more
      // partners kinship2 draws one run, e.g. "A~ B~ D", and children of A+D
      // hang from the B-D gap; see "pass-through markers" in the guide.)
      const f = result.fam[lev]![s]!;
      if (f > 0) {
        expect(lev, `${label}: lev ${lev} slot ${s} has parents but is in the top row`).toBeGreaterThan(0);
        expect(f + 1, `${label}: lev ${lev} slot ${s} fam pointer`).toBeLessThanOrEqual(result.n[lev - 1]!);
        const child = ped.individuals[result.nid[lev]![s]! - 1]!;
        const parents = ped.partnerships.find(p => (ped.parentOf[p.id] ?? []).includes(child.id));
        expect(parents, `${label}: ${child.id} has fam but no partnership`).toBeDefined();
        const above = result.nid[lev - 1]!;
        const marks = result.spouse[lev - 1]!;
        let lo = f - 1;
        while (lo > 0 && (marks[lo - 1] ?? 0) > 0) lo--;
        let hi = f;
        while ((marks[hi] ?? 0) > 0) hi++;
        const run = new Set(above.slice(lo, hi + 1).map(nid => ped.individuals[nid - 1]!.id));
        expect(run.has(parents!.individual1) && run.has(parents!.individual2),
          `${label}: fam of ${child.id} points at ${[...run].join("~")}`).toBe(true);
      }
      // A spouse marker means the next slot exists.
      if ((result.spouse[lev]![s] ?? 0) > 0) {
        expect(s + 1, `${label}: lev ${lev} slot ${s} spouse marker at row end`).toBeLessThan(count);
      }
    }
  }
}

describe("kinship2 align.pedigree oracle", () => {
  for (const [name, pedPath] of Object.entries(FIXTURES)) {
    const oracle = readOracle(name);
    const imported = importPed(readFileSync(join(TEST_DATA, pedPath), "utf-8"));

    it(`${name}: imports without errors`, () => {
      expect(imported.hasErrors).toBe(false);
      expect(Object.keys(oracle.families).sort())
        .toEqual(imported.pedigrees.map(p => p.familyId).sort());
    });

    for (const [fid, R] of Object.entries(oracle.families)) {
      const key = `${name}/${fid}`;
      const entry = imported.pedigrees.find(p => p.familyId === fid);

      it(`${key}: matches R or is a recorded divergence`, () => {
        expect(entry, `${key}: family not imported`).toBeDefined();
        const ped = entry!.pedigree;
        // The oracle used file order for indices; so does the importer.
        expect(ped.individuals.map(i => i.id)).toEqual(R.ids);

        const full = alignPedigree(ped);
        assertInvariants(full, ped, key);

        const ours = withoutIsolated(full, isolatedIndices(ped));
        const ourRows = structureRows(ours, R.ids);
        const rRows = structureRows(R, R.ids);
        const structureMatches = JSON.stringify(ourRows) === JSON.stringify(rRows);

        if (key in STRUCTURE_DIVERGENCES) {
          expect(structureMatches,
            `${key} now matches R structurally; remove it from STRUCTURE_DIVERGENCES`).toBe(false);
          return;
        }
        expect(ourRows, `${key}: slot structure differs from R`).toEqual(rRows);

        let maxDiff = 0;
        for (let lev = 0; lev < R.n.length; lev++) {
          for (let s = 0; s < R.n[lev]!; s++) {
            maxDiff = Math.max(maxDiff, Math.abs(ours.pos[lev]![s]! - R.pos[lev]![s]!));
          }
        }
        if (key in POSITION_DIVERGENCES) {
          expect(maxDiff,
            `${key} positions now match R; remove it from POSITION_DIVERGENCES`).toBeGreaterThan(1e-6);
          return;
        }
        if (maxDiff > 1e-6) {
          const show = (p: number[][]) => p.map(row => row.map(x => x.toFixed(4)).join(" "));
          expect(show(ours.pos), `${key}: positions differ from R (max ${maxDiff})`).toEqual(show(R.pos));
        }
      });
    }
  }
});

/** In-app example label to the PED fixture it was written from. */
const EXAMPLE_FIXTURES: Record<string, string> = {
  "Spanish Habsburgs": "habsburg",
  "Queen Victoria · haemophilia B": "queen_victoria",
  "Tutankhamun's family": "tutankhamun",
  "House Targaryen": "targaryen",
  "The Buendías": "buendia",
  "House Atreides": "atreides",
  "3/4 siblings": "three_quarter_siblings",
  "5/8 siblings": "five_eighths_siblings",
  "Full-sib mating": "full_sib_mating",
  "Half-sib triangle": "half_sib_triangle",
  "Double first cousins": "double_first_cousins",
  "Double second cousins (A)": "double_second_cousins_a",
  "Double second cousins (B)": "double_second_cousins_b",
  "Quadruple half first cousins": "quad_half_first_cousins",
  "Grandparent and grandchild's partner": "grandparent_grandchild_partner",
  "Two lineages joined twice": "two_lineages_joined_twice",
};

describe("in-app historic and classic examples", () => {
  const grouped = EXAMPLES.filter(e => e.group);

  it("every grouped example has a PED fixture", () => {
    expect(grouped.map(e => e.label).sort()).toEqual(Object.keys(EXAMPLE_FIXTURES).sort());
  });

  for (const ex of grouped) {
    it(`${ex.label}: lays out like its PED fixture`, () => {
      const name = EXAMPLE_FIXTURES[ex.label]!;
      const oracle = readOracle(name);
      const R = Object.values(oracle.families)[0]!;
      expect(ex.data.individuals.map(i => i.id)).toEqual(R.ids);

      const ours = alignPedigree(ex.data);
      assertInvariants(ours, ex.data, ex.label);
      expect(structureRows(ours, R.ids)).toEqual(structureRows(R, R.ids));

      const fixture = importPed(readFileSync(join(TEST_DATA, FIXTURES[name]!), "utf-8")).pedigrees[0]!.pedigree;
      const fromPed = alignPedigree(fixture);
      expect(ours.pos).toEqual(fromPed.pos);
      // PED carries affected overall (#118): the flag or a condition; traits are not affected.
      expect(ex.data.individuals.map(i => isAffected(i, ex.data))).toEqual(fixture.individuals.map(i => i.affected));
    });
  }
});
