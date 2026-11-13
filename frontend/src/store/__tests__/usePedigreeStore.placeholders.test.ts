import { describe, it, expect, beforeEach } from "vitest";
import { usePedigreeStore } from "../usePedigreeStore";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { isUntouchedPlaceholder } from "../../pedigree/placeholders";

/** Placeholder partners are removed once their couple has no children left (#107). */

const get = () => usePedigreeStore.getState();
const ids = () => get().pedigree.individuals.map(i => i.id).sort();
const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id);

/** A child "c", a mother "m" and a free couple "f" + "g" to move the child to. */
function base(): Pedigree {
  return {
    individuals: [
      { id: "c", sex: "male", affected: false, sibOrder: 0, name: "", notes: "" },
      { id: "m", sex: "female", affected: false, sibOrder: 1, name: "Mum", notes: "" },
      { id: "f", sex: "male", affected: false, sibOrder: 2, name: "Dad2", notes: "" },
      { id: "g", sex: "female", affected: false, sibOrder: 3, name: "Mum2", notes: "" },
    ],
    partnerships: [{ id: "fg", individual1: "f", individual2: "g" }],
    parentOf: { fg: [] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

/** Make "m" the only known parent of "c" with Set parents, which adds a placeholder father. Returns its id. */
function singleParent(): string {
  expect(get().setParents("c", ["m"])).toBeNull();
  const p = get().pedigree.partnerships.find(x => get().pedigree.parentOf[x.id]?.includes("c"))!;
  const ph = p.individual1 === "m" ? p.individual2 : p.individual1;
  expect(ind(ph)!.placeholder).toBe(true);
  return ph;
}

describe("placeholder partners (#107)", () => {
  beforeEach(() => get().initialize(base()));

  it("marks the partner made by Add parent, Add child, Add children and Set parents, not the parent asked for", () => {
    get().addParent("c", "female");
    const ped = get().pedigree;
    const added = ped.individuals.filter(i => !["c", "m", "f", "g"].includes(i.id));
    expect(added.map(i => [i.sex, !!i.placeholder]).sort()).toEqual([["female", false], ["male", true]]);

    get().addChild("m", "male");
    const p1 = get().pedigree.partnerships.find(p => p.individual1 === "m" || p.individual2 === "m")!;
    expect(ind(p1.individual1 === "m" ? p1.individual2 : p1.individual1)!.placeholder).toBe(true);

    get().addChildren("g", 2, "unknown");  // g has a partner: no placeholder
    expect(get().pedigree.individuals.filter(i => i.placeholder)).toHaveLength(2);
    get().addPartner("f");                 // Add partner makes a person the user asked for
    expect(get().pedigree.individuals.filter(i => i.placeholder)).toHaveLength(2);
  });

  it("Replace parents removes the placeholder and its couple line in one undo step", () => {
    const ph = singleParent();
    const before = get().pedigree;
    get().setParents("c", ["f", "g"]);
    expect(ind(ph)).toBeUndefined();
    expect(get().pedigree.partnerships.map(p => p.id)).toEqual(["fg"]);
    expect(Object.keys(get().pedigree.parentOf)).toEqual(["fg"]);
    expect(ids()).toEqual(["c", "f", "g", "m"]);
    get().undo();
    expect(get().pedigree).toEqual(before);
  });

  it("Detach from parents removes the placeholder", () => {
    const ph = singleParent();
    get().detachFromParents("c");
    expect(ind(ph)).toBeUndefined();
    expect(ids()).toEqual(["c", "f", "g", "m"]);
    expect(get().pedigree.partnerships.map(p => p.id)).toEqual(["fg"]);
  });

  it("deleting the last child removes the placeholder; deleting one of two does not", () => {
    get().addChild("m", "female");
    const ph = get().pedigree.individuals.find(i => i.placeholder)!.id;
    const kids = Object.values(get().pedigree.parentOf).find(k => k.length === 1)!;
    get().addSibling(kids[0]!);
    const [k1, k2] = Object.values(get().pedigree.parentOf).find(k => k.length === 2)!;
    get().deleteIndividual(k1!);
    expect(ind(ph)).toBeDefined();
    get().deleteIndividual(k2!);
    expect(ind(ph)).toBeUndefined();
    expect(ind("m")).toBeDefined();
    expect(get().pedigree.partnerships.map(p => p.id)).toEqual(["fg"]);
  });

  it("deleteIndividuals and remove with descendants clean up too, and count the placeholder", () => {
    get().addChild("m", "female");
    const ph = get().pedigree.individuals.find(i => i.placeholder)!.id;
    const kid = Object.values(get().pedigree.parentOf).find(k => k.length === 1)!;
    expect(get().deleteIndividuals(kid)).toBe(2);
    expect(ind(ph)).toBeUndefined();
  });

  it("deleting the known parent removes the placeholder left alone", () => {
    const ph = singleParent();
    get().deleteIndividual("m");
    expect(ind(ph)).toBeUndefined();
    expect(ids()).toEqual(["c", "f", "g"]);
  });

  it("Remove partnership on a childless placeholder couple removes the placeholder", () => {
    const ped = base();
    ped.individuals.push({ id: "x", sex: "male", affected: false, sibOrder: 0, name: "", notes: "", placeholder: true });
    ped.partnerships.push({ id: "mx", individual1: "x", individual2: "m" });
    ped.parentOf.mx = [];
    get().initialize(ped);
    expect(get().removePartnership("mx")).toBeNull();
    expect(ind("x")).toBeUndefined();
    expect(ind("m")).toBeDefined();
  });

  it.each([
    ["a name", { name: "John" }],
    ["notes", { notes: "maybe" }],
    ["affected", { affected: true }],
    ["deceased", { deceased: true }],
    ["a tag", { tags: ["t1"] }],
    ["a date of birth", { dob: "1950-01-01" }],
    ["a gender identity", { genderIdentity: "man" as const }],
  ])("keeps a placeholder with %s", (_label, patch) => {
    const ph = singleParent();
    const ped = structuredClone(get().pedigree);
    Object.assign(ped.individuals.find(i => i.id === ph)!, patch);
    get().initialize(ped);
    get().setParents("c", ["f", "g"]);
    expect(ind(ph)).toBeDefined();
  });

  it("keeps a placeholder whose sex the user set, and one filled in by Add parent", () => {
    const ph = singleParent();
    get().setSex(ph, "male");
    expect(ind(ph)!.placeholder).toBeUndefined();
    get().setParents("c", ["f", "g"]);
    expect(ind(ph)).toBeDefined();

    get().initialize(base());
    get().addParent("c", "unknown");
    const p = get().pedigree.partnerships.find(x => get().pedigree.parentOf[x.id]?.includes("c"))!;
    get().addParent("c", "male");
    const filled = [p.individual1, p.individual2].map(id => ind(id)!).find(i => i.sex === "male")!;
    expect(filled.placeholder).toBeUndefined();
  });

  it("keeps a placeholder who has another partner or other children", () => {
    const ph = singleParent();
    get().linkPartner(ph, "g");
    get().setParents("c", ["f", "g"]);
    expect(ind(ph)).toBeDefined();

    get().initialize(base());
    const ph2 = singleParent();
    const pid = get().pedigree.partnerships.find(x => get().pedigree.parentOf[x.id]?.includes("c"))!.id;
    get().addChildren(ph2, 1, "male", pid);
    get().setParents("c", ["f", "g"]);
    expect(ind(ph2)).toBeDefined();
  });

  it("keeps a placeholder who is a child's social parent", () => {
    const ph = singleParent();
    const ped = structuredClone(get().pedigree);
    ped.individuals.find(i => i.id === "f")!.socialParents = [ph];
    get().initialize(ped);
    get().setParents("c", ["f", "g"]);
    expect(ind(ph)).toBeDefined();
  });

  it("never removes a person without the flag (older saves, Add partner)", () => {
    get().addPartner("m");
    const partner = get().pedigree.individuals.find(i => !["c", "m", "f", "g"].includes(i.id))!;
    const pid = get().pedigree.partnerships.find(p => p.individual1 === partner.id || p.individual2 === partner.id)!.id;
    expect(get().removePartnership(pid)).toBeNull();
    expect(ind(partner.id)).toBeDefined();
  });

  it("isUntouchedPlaceholder ignores empty values and bookkeeping", () => {
    expect(isUntouchedPlaceholder({ id: "x", sex: "male", affected: false, sibOrder: 3, name: " ", notes: "", tags: [], placeholder: true })).toBe(true);
    expect(isUntouchedPlaceholder({ id: "x", sex: "male", affected: false, sibOrder: 0 })).toBe(false);
    expect(isUntouchedPlaceholder({ id: "x", sex: "male", affected: false, sibOrder: 0, placeholder: true, carrier: true })).toBe(false);
  });
});
