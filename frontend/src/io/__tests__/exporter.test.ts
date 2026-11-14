import { describe, it, expect } from "vitest";
import { exportPed, pedLostLifeStatus, pedLostConsanguinity } from "../ped/exporter.js";
import { importPed } from "../ped/index.js";
import type { Pedigree } from "@pedigree-editor/layout-engine";

function makePedigree(overrides: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...overrides,
  };
}

describe("exportPed", () => {
  it("writes the male partner in PAT even when the partnership lists the female first", () => {
    const ped: Pedigree = makePedigree({
      individuals: [
        { id: "mum", sex: "female", affected: false, sibOrder: 0 },
        { id: "dad", sex: "male",   affected: false, sibOrder: 1 },
        { id: "kid", sex: "male",   affected: false, sibOrder: 0 },
      ],
      partnerships: [{ id: "p", individual1: "mum", individual2: "dad" }],
      parentOf: { p: ["kid"] },
    });
    const line = exportPed(ped).trim().split("\n").find(l => l.includes("\tkid\t"))!;
    expect(line.split("\t").slice(2, 4)).toEqual(["dad", "mum"]);
  });

  it("keeps partnership order when neither partner is male", () => {
    const ped: Pedigree = makePedigree({
      individuals: [
        { id: "a", sex: "unknown", affected: false, sibOrder: 0 },
        { id: "b", sex: "unknown", affected: false, sibOrder: 1 },
        { id: "kid", sex: "female", affected: false, sibOrder: 0 },
      ],
      partnerships: [{ id: "p", individual1: "a", individual2: "b" }],
      parentOf: { p: ["kid"] },
    });
    const line = exportPed(ped).trim().split("\n").find(l => l.includes("\tkid\t"))!;
    expect(line.split("\t").slice(2, 4)).toEqual(["a", "b"]);
  });

  it("exports nuclear family with correct columns", () => {
    const ped: Pedigree = makePedigree({
      individuals: [
        { id: "1", sex: "male",   affected: false, sibOrder: 0 },
        { id: "2", sex: "female", affected: false, sibOrder: 1 },
        { id: "3", sex: "male",   affected: true,  sibOrder: 0 },
        { id: "4", sex: "female", affected: false, sibOrder: 1 },
      ],
      partnerships: [
        { id: "p_1__2", individual1: "1", individual2: "2" },
      ],
      parentOf: { "p_1__2": ["3", "4"] },
    });

    const text = exportPed(ped);
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(4);
    // Parents are founders
    expect(lines[0]).toBe("1\t1\t0\t0\t1\t1");
    expect(lines[1]).toBe("1\t2\t0\t0\t2\t1");
    // Children
    expect(lines[2]).toBe("1\t3\t1\t2\t1\t2");  // affected
    expect(lines[3]).toBe("1\t4\t1\t2\t2\t1");  // unaffected
  });

  it("exports founders with PAT=0 MAT=0", () => {
    const ped = makePedigree({
      individuals: [
        { id: "1", sex: "male", affected: false, sibOrder: 0 },
        { id: "2", sex: "female", affected: false, sibOrder: 1 },
      ],
    });
    const text = exportPed(ped);
    const lines = text.trim().split("\n");
    for (const line of lines) {
      const cols = line.split("\t");
      expect(cols[2]).toBe("0"); // PAT
      expect(cols[3]).toBe("0"); // MAT
    }
  });

  it("maps sex correctly: male→1, female→2, unknown→0", () => {
    const ped = makePedigree({
      individuals: [
        { id: "1", sex: "male",    affected: false, sibOrder: 0 },
        { id: "2", sex: "female",  affected: false, sibOrder: 1 },
        { id: "3", sex: "unknown", affected: false, sibOrder: 2 },
      ],
    });
    const lines = exportPed(ped).trim().split("\n");
    expect(lines[0]!.split("\t")[4]).toBe("1");
    expect(lines[1]!.split("\t")[4]).toBe("2");
    expect(lines[2]!.split("\t")[4]).toBe("0");
  });

  it("maps affection correctly: affected→2, unaffected→1", () => {
    const ped = makePedigree({
      individuals: [
        { id: "1", sex: "male",   affected: true,  sibOrder: 0 },
        { id: "2", sex: "female", affected: false, sibOrder: 1 },
      ],
    });
    const lines = exportPed(ped).trim().split("\n");
    expect(lines[0]!.split("\t")[5]).toBe("2");
    expect(lines[1]!.split("\t")[5]).toBe("1");
  });

  it("uses default FID '1' when not specified", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const lines = exportPed(ped).trim().split("\n");
    expect(lines[0]!.split("\t")[0]).toBe("1");
  });

  it("respects custom familyId option", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const lines = exportPed(ped, { familyId: "FAM_A" }).trim().split("\n");
    expect(lines[0]!.split("\t")[0]).toBe("FAM_A");
  });

  it("includes header when includeHeader: true", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const text = exportPed(ped, { includeHeader: true });
    expect(text.startsWith("#FID\tIID\tPAT\tMAT\tSEX\tPHENO\n")).toBe(true);
  });

  it("does not include header by default", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const text = exportPed(ped);
    expect(text.startsWith("#")).toBe(false);
  });

  it("round-trip: export → import preserves structure", () => {
    const original: Pedigree = makePedigree({
      individuals: [
        { id: "1", sex: "male",   affected: false, sibOrder: 0 },
        { id: "2", sex: "female", affected: false, sibOrder: 1 },
        { id: "3", sex: "male",   affected: true,  sibOrder: 0 },
        { id: "4", sex: "female", affected: false, sibOrder: 1 },
      ],
      partnerships: [{ id: "p_1__2", individual1: "1", individual2: "2" }],
      parentOf: { "p_1__2": ["3", "4"] },
    });

    const text = exportPed(original);
    const result = importPed(text);
    expect(result.hasErrors).toBe(false);
    expect(result.pedigrees).toHaveLength(1);

    const roundtripped = result.pedigrees[0]!.pedigree;
    expect(roundtripped.individuals).toHaveLength(4);
    expect(roundtripped.partnerships).toHaveLength(1);
    const p = roundtripped.partnerships[0]!;
    expect(roundtripped.parentOf[p.id]).toHaveLength(2);

    // Verify sex and affected preserved
    const byId = Object.fromEntries(roundtripped.individuals.map(i => [i.id, i]));
    expect(byId["1"]!.sex).toBe("male");
    expect(byId["2"]!.sex).toBe("female");
    expect(byId["3"]!.affected).toBe(true);
    expect(byId["4"]!.affected).toBe(false);
  });

  it("output ends with a newline", () => {
    const ped = makePedigree({
      individuals: [{ id: "1", sex: "male", affected: false, sibOrder: 0 }],
    });
    expect(exportPed(ped).endsWith("\n")).toBe(true);
  });

  it("drops pregnancy / loss status silently (PED cannot carry it)", () => {
    const ped = makePedigree({
      individuals: [
        { id: "1", sex: "male",    affected: false, sibOrder: 0 },
        { id: "2", sex: "female",  affected: false, sibOrder: 1 },
        { id: "3", sex: "unknown", affected: true,  sibOrder: 0, lifeStatus: "miscarriage" },
      ],
      partnerships: [{ id: "p", individual1: "1", individual2: "2" }],
      parentOf: { p: ["3"] },
    });
    const text = exportPed(ped);
    const line = text.trim().split("\n").find(l => l.includes("\t3\t"))!;
    expect(line.split("\t")).toEqual(["1", "3", "1", "2", "0", "2"]);
    expect(text).not.toContain("miscarriage");
    expect(importPed(text).hasErrors).toBe(false);
  });
});

describe("exportPed: r dialect", () => {
  const ped: Pedigree = makePedigree({
    individuals: [
      { id: "dad", sex: "male",   affected: false, sibOrder: 0 },
      { id: "mum", sex: "female", affected: false, sibOrder: 1 },
      { id: "kid", sex: "female", affected: true,  sibOrder: 0 },
    ],
    partnerships: [{ id: "p", individual1: "dad", individual2: "mum" }],
    parentOf: { p: ["kid"] },
  });

  it("writes an id fid mid sex aff header by default", () => {
    const lines = exportPed(ped, { dialect: "r" }).trim().split("\n");
    expect(lines[0]).toBe("id\tfid\tmid\tsex\taff");
    expect(lines).toContain("kid\tdad\tmum\t2\t2");
    expect(lines).toHaveLength(4);
  });

  it("can prepend famid and drop aff", () => {
    const lines = exportPed(ped, {
      dialect: "r", familyId: "F1", includeFamilyId: true, includeAffection: false,
    }).trim().split("\n");
    expect(lines[0]).toBe("famid\tid\tfid\tmid\tsex");
    expect(lines).toContain("F1\tkid\tdad\tmum\t2");
  });

  it("round-trips through importPed", () => {
    const result = importPed(exportPed(ped, { dialect: "r" }));
    expect(result.hasErrors).toBe(false);
    const ped2 = result.pedigrees[0]!.pedigree;
    expect(ped2.individuals.map(i => i.id)).toEqual(["dad", "mum", "kid"]);
    expect(ped2.individuals.find(i => i.id === "kid")!.affected).toBe(true);
    expect(ped2.partnerships).toHaveLength(1);
  });

  describe("IDs come from names (#66)", () => {
    const U1 = "7f48c99b-5fd5-4a4d-8839-749c0022547a";
    const U2 = "e52ca3b0-9513-4089-a945-db2c2b51ea9f";
    const U3 = "f952755d-2644-441b-9b24-ddfe0c6fa02c";
    const U4 = "0cc4daef-f6ca-46f7-8f82-7a3ab3db16ca";
    const family = (names: (string | undefined)[]) => makePedigree({
      individuals: [
        { id: U1, sex: "male",   affected: false, sibOrder: 0, name: names[0] },
        { id: U2, sex: "female", affected: true,  sibOrder: 0, name: names[1] },
        { id: U3, sex: "male",   affected: false, sibOrder: 0, name: names[2] },
        { id: U4, sex: "female", affected: false, sibOrder: 1, name: names[3] },
      ],
      partnerships: [{ id: "p", individual1: U1, individual2: U2 }],
      parentOf: { p: [U3, U4] },
    });
    const rows = (text: string) => text.trim().split("\n").map(l => l.split("\t"));

    it("writes names in IID, PAT and MAT instead of UUIDs", () => {
      const text = exportPed(family(["35", "40", "1125", "Echo_F60"]));
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
      expect(rows(text).map(r => r.slice(1, 4))).toEqual([
        ["35", "0", "0"], ["40", "0", "0"], ["1125", "35", "40"], ["Echo_F60", "35", "40"],
      ]);
    });

    it("gives unnamed people short sequential IDs, not UUIDs", () => {
      const ids = rows(exportPed(family(["35", undefined, "", "  "]))).map(r => r[1]);
      expect(ids).toEqual(["35", "ind1", "ind2", "ind3"]);
    });

    it("keeps non-UUID internal IDs of unnamed people (PED imports round-trip)", () => {
      const ped = makePedigree({
        individuals: [{ id: "A12", sex: "male", affected: false, sibOrder: 0 }],
      });
      expect(rows(exportPed(ped))[0]![1]).toBe("A12");
    });

    it("makes repeated names unique", () => {
      const ids = rows(exportPed(family(["x", "x", "x_2", "x"]))).map(r => r[1]);
      expect(ids).toEqual(["x", "x_3", "x_2", "x_4"]);
    });

    it("never uses an ID that means no parent", () => {
      const ids = rows(exportPed(family(["0", "NA", "a", "b"]))).map(r => r[1]);
      expect(ids).toEqual(["ind1", "ind2", "a", "b"]);
    });

    it("replaces spaces in PLINK but keeps them in the tab-only R dialect", () => {
      const names = ["Charles V", "Isabella of Portugal", "Philip II", "Maria"];
      expect(rows(exportPed(family(names)))[2]!.slice(1, 4)).toEqual(["Philip_II", "Charles_V", "Isabella_of_Portugal"]);
      const r = rows(exportPed(family(names), { dialect: "r" }));
      expect(r[3]!.slice(0, 3)).toEqual(["Philip II", "Charles V", "Isabella of Portugal"]);
    });

    it("re-imports with the names as IDs and the same structure", () => {
      for (const dialect of ["plink", "r"] as const) {
        const pedigree = importPed(exportPed(family(["35", "40", "Carol Ann", "d"]), { dialect })).pedigrees[0]?.pedigree;
        expect(pedigree!.individuals.map(i => i.id).sort()).toEqual(
          (dialect === "r" ? ["35", "40", "Carol Ann", "d"] : ["35", "40", "Carol_Ann", "d"]).sort());
        expect(pedigree!.partnerships).toHaveLength(1);
      }
    });
  });
});

describe("pedLostLifeStatus", () => {
  it("lists pregnancies and losses, which PED writes as ordinary children", () => {
    const ped: Pedigree = {
      individuals: [
        { id: "a", sex: "male", affected: false, sibOrder: 0 },
        { id: "b", sex: "unknown", affected: false, sibOrder: 1, lifeStatus: "miscarriage" },
        { id: "c", sex: "female", affected: false, sibOrder: 2, lifeStatus: "pregnancy" },
      ],
      partnerships: [],
      parentOf: {},
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    expect(pedLostLifeStatus(ped).map(i => i.id)).toEqual(["b", "c"]);
  });
});

describe("pedLostConsanguinity (#97)", () => {
  const person = (id: string, sex: "male" | "female") => ({ id, sex, affected: false, sibOrder: 0 });
  // gf = gm, their children s1 and s2 marry in, and the grandchildren c1 and c2 are a couple: first cousins.
  const cousins = (overrides: { g?: object; pc?: object; out?: object } = {}): Pedigree => makePedigree({
    individuals: ["gf", "s1", "h2", "c1", "o1"].map(id => person(id, "male"))
      .concat(["gm", "w1", "s2", "c2", "o2"].map(id => person(id, "female"))),
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm", ...overrides.g },
      { id: "p1", individual1: "s1", individual2: "w1" },
      { id: "p2", individual1: "h2", individual2: "s2" },
      { id: "pc", individual1: "c1", individual2: "c2", ...overrides.pc },
      { id: "out", individual1: "o1", individual2: "o2", ...overrides.out },
    ],
    parentOf: { g: ["s1", "s2"], p1: ["c1"], p2: ["c2"] },
  });

  it("says nothing when the double line follows from the parents", () => {
    expect(pedLostConsanguinity(cousins())).toEqual([]);
    expect(pedLostConsanguinity(cousins({ pc: { consanguineous: true } }))).toEqual([]);
  });

  it("lists the text above the double line and the override for a couple not shown to be related", () => {
    const lost = pedLostConsanguinity(cousins({ pc: { consanguinityLabel: "first cousins" }, out: { consanguineous: true }, g: { consanguineous: true, consanguinityLabel: "second cousins" } }));
    expect(lost.map(l => [l.partnership.id, l.what])).toEqual([
      ["g", 'consanguineous ("second cousins")'],
      ["pc", '"first cousins" above the double line'],
      ["out", "marked consanguineous"],
    ]);
  });

  it("ignores text on a couple whose line is not drawn double", () => {
    expect(pedLostConsanguinity(cousins({ out: { consanguinityLabel: "third cousins" } }))).toEqual([]);
  });
});
