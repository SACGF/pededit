import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { kinshipCoefficients } from "@pedigree-editor/layout-engine";
import type { Individual, Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { assistedLinks } from "../assisted";
import { isSameSexCouple, donorPairFor } from "../sameSex";
import { setParentsProblem } from "../parents";
import { batchSexProblem } from "../batch";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { lintExport } from "../../io/svg/exportLint";
import { exportPed } from "../../io/ped/exporter";
import { importJson, exportJson } from "../../io/json";
import { EXAMPLES } from "../../data/examples";

/**
 * Same-sex couples (#105). Partners may share a sex; a child's genetic
 * parents may not, so a same-sex couple's child is one partner's and a
 * donor's, the other partner a social parent (NSGC 2022 Fig. 5, 1b).
 */
const person = (id: string, sex: Sex, extra: Partial<Individual> = {}): Individual =>
  ({ id, sex, affected: false, sibOrder: 0, name: id, notes: "", ...extra });

/** gf = gm → ann; ann and bea unpartnered; cal a man; kid a child of x = y. */
function family(): Pedigree {
  return {
    individuals: [
      person("gf", "male"), person("gm", "female"),
      person("ann", "female", { name: "Ann" }), person("bea", "female", { name: "Bea" }),
      person("cal", "male", { name: "Cal" }), person("dan", "male", { name: "Dan" }),
      person("x", "male"), person("y", "female", { placeholder: true, name: "", notes: "" }), person("kid", "unknown", { name: "Kid" }),
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm" },
      { id: "xy", individual1: "x", individual2: "y" },
    ],
    parentOf: { g: ["ann"], xy: ["kid"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const store = () => usePedigreeStore.getState();
const ped = () => store().pedigree;
const ind = (id: string) => ped().individuals.find(i => i.id === id)!;
const parentsOf = (p: Pedigree, id: string) => {
  const q = p.partnerships.find(x => (p.parentOf[x.id] ?? []).includes(id));
  return q ? [q.individual1, q.individual2] : [];
};
const newKids = (before: Pedigree) => ped().individuals.filter(i => !before.individuals.some(b => b.id === i.id));
const clean = (p: Pedigree) => {
  expect(lintFlow(p, layoutToFlow(p))).toEqual([]);
  expect(lintExport(p)).toEqual([]);
  expect(lintExport(p, { deidentify: true })).toEqual([]);
};

describe("same-sex couples: partners (#105)", () => {
  beforeEach(() => { store().initialize(family()); vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it("Add existing partner links two women and two men", () => {
    store().startPickingPartner("ann");
    store().pickIndividual("bea");
    expect(store().picking).toBeNull();
    expect(store().notice).toMatchObject({ kind: "info" });
    const ab = ped().partnerships.at(-1)!;
    expect([ab.individual1, ab.individual2].sort()).toEqual(["ann", "bea"]);
    expect(isSameSexCouple(ped(), ab)).toBe(true);
    expect(store().linkPartner("cal", "dan")).toBeNull();
    clean(ped());
  });

  it("the Sex menu makes partners the same sex unless they have a child together", () => {
    store().linkPartner("ann", "cal");
    expect(batchSexProblem(ped(), ["cal"], "female")).toBeNull();
    store().setSex("cal", "female");
    expect(ind("cal").sex).toBe("female");
    // x and y are kid's genetic parents.
    expect(batchSexProblem(ped(), ["y"], "male")).toMatch(/genetic parents/);
    store().setSex("y", "male");
    expect(ind("y").sex).toBe("female");
    expect(store().notice).toMatchObject({ kind: "error" });
  });

  it("Set parents still refuses two genetic parents of the same sex, pointing a couple at Add child", () => {
    store().linkPartner("ann", "bea");
    expect(setParentsProblem(ped(), "kid", ["ann", "bea"])).toMatch(/couple line/);
    expect(setParentsProblem(ped(), "kid", ["ann", "gm"])).toMatch(/cannot both be female/);
  });
});

describe("same-sex couples: children (#105)", () => {
  let ab: string;
  beforeEach(() => {
    store().initialize(family());
    store().linkPartner("ann", "bea");
    ab = ped().partnerships.at(-1)!.id;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("Add child from a partner: hers and a new sperm donor's, her partner a social parent (Fig. 5, 1b)", () => {
    store().setPartnershipChildless(ab, "by-choice");
    const before = ped();
    store().addChild("ann", "male");
    const [donor, child] = [newKids(before).find(i => i.reproductiveRole === "donor")!, newKids(before).find(i => !i.reproductiveRole)!];
    expect(donor).toMatchObject({ sex: "male", reproductiveRole: "donor" });
    expect(child.sex).toBe("male");
    expect(parentsOf(ped(), child.id)).toEqual([donor.id, "ann"]);
    expect(ped().partnerships.find(p => (ped().parentOf[p.id] ?? []).includes(child.id))!.donorConception).toBe(true);
    expect(child.socialParents).toEqual(["bea"]);
    expect(ped().parentOf[ab]).toEqual([]);
    expect(ped().partnerships.find(p => p.id === ab)!.childless).toBeUndefined();
    // Bea is joined by the couple line only; nobody else gets a line.
    expect(assistedLinks(ped())).toEqual([]);
    expect(store().notice!.text).toMatch(/sperm donor/);
    expect(store().past).toHaveLength(3); // link, childless mark, add: one step each

    const k = kinshipCoefficients(ped());
    expect(k.kinship("ann", child.id)).toBe(1 / 4);
    expect(k.kinship("bea", child.id)).toBe(0);
    expect(k.kinship("gm", child.id)).toBe(1 / 8);
    clean(ped());

    store().undo();
    expect(ped()).toEqual(before);
  });

  it("a second child by the same partner shares the donor (full siblings); by the other partner, a new donor", () => {
    store().addChild("ann", "female");
    store().addChildren("ann", 2, "unknown", ab);
    const pair = donorPairFor(ped(), "ann", "bea")!;
    expect(ped().parentOf[pair.id]).toHaveLength(3);
    expect(ped().individuals.filter(i => i.reproductiveRole === "donor")).toHaveLength(1);
    const [c1, c2] = ped().parentOf[pair.id]!;
    expect(kinshipCoefficients(ped()).kinship(c1!, c2!)).toBe(1 / 4);
    expect(ped().parentOf[pair.id]!.map(id => ind(id).sibOrder)).toEqual([0, 1, 2]);

    store().addChild("bea", "male");
    const beaPair = donorPairFor(ped(), "bea", "ann")!;
    expect(beaPair.id).not.toBe(pair.id);
    const c3 = ped().parentOf[beaPair.id]![0]!;
    expect(ind(c3).socialParents).toEqual(["ann"]);
    expect(kinshipCoefficients(ped()).kinship(c1!, c3)).toBe(0);
    clean(ped());
  });

  it("a male couple's child gets an egg donor", () => {
    store().linkPartner("cal", "dan");
    const cd = ped().partnerships.at(-1)!.id;
    const before = ped();
    store().addChildren("dan", 1, "female", cd);
    const donor = newKids(before).find(i => i.reproductiveRole === "donor")!;
    const child = newKids(before).find(i => !i.reproductiveRole)!;
    expect(donor.sex).toBe("female");
    expect(parentsOf(ped(), child.id)).toEqual(["dan", donor.id]);
    expect(child.socialParents).toEqual(["cal"]);
    expect(store().notice!.text).toMatch(/egg donor/);
    expect(kinshipCoefficients(ped(), { chromosome: "X" }).kinship(donor.id, child.id)).toBe(1 / 4);
    clean(ped());
  });

  it("Add existing child from the couple line: the chosen genetic parent and a donor; the old placeholder goes", () => {
    store().startPickingChild(ab, "bea");
    expect(store().pickIndividual("kid")).toBe(true);
    expect(store().picking).toBeNull();
    expect(parentsOf(ped(), "kid")[1]).toBe("bea");
    expect(ind(parentsOf(ped(), "kid")[0]!).reproductiveRole).toBe("donor");
    expect(ind("kid").socialParents).toEqual(["ann"]);
    expect(ped().individuals.some(i => i.id === "y")).toBe(false); // placeholder left alone (#107)
    expect(ped().parentOf.xy).toBeUndefined();
    clean(ped());
  });

  it("Add existing child refuses an ancestor and keeps picking", () => {
    store().startPickingChild(ab, "ann");
    store().pickIndividual("gm");
    expect(store().notice).toMatchObject({ kind: "error" });
    expect(store().picking).toMatchObject({ kind: "child" });
  });

  it("PED writes the donor as father and the genetic mother as mother", () => {
    store().addChild("ann", "female");
    const pair = donorPairFor(ped(), "ann", "bea")!;
    const child = ped().parentOf[pair.id]![0]!;
    store().updateIndividual(child, { name: "Baby" });
    const rows = exportPed(ped(), { dialect: "r" }).trim().split("\n").map(l => l.split("\t"));
    const header = rows[0]!;
    const col = (r: string[], name: string) => r[header.indexOf(name)]!;
    const row = rows.find(r => col(r, "id") === "Baby")!;
    const fid = col(row, "fid"), mid = col(row, "mid");
    expect(mid).toBe("Ann");
    expect(col(rows.find(r => col(r, "id") === fid)!, "sex")).toBe("1");
  });

  it("survives a JSON round trip", () => {
    store().addChild("ann", "female");
    const back = importJson(exportJson(ped())).pedigree;
    expect(back.partnerships).toEqual(ped().partnerships);
    expect(back.individuals.find(i => i.socialParents)?.socialParents).toEqual(["bea"]);
  });
});

describe("same-sex couples: the assisted reproduction example (#105)", () => {
  const example = () => EXAMPLES.find(e => e.label === "Assisted reproduction")!.data;
  it("has a female couple with a donor-conceived child, drawn cleanly", () => {
    const p = example();
    const couple = p.partnerships.find(q => isSameSexCouple(p, q));
    expect(couple).toBeDefined();
    expect(p.individuals.some(i => i.socialParents?.length && [couple!.individual1, couple!.individual2].some(id => i.socialParents!.includes(id)))).toBe(true);
    clean(p);
  });
});
