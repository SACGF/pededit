import { describe, it, expect, beforeEach } from "vitest";
import { usePedigreeStore } from "../usePedigreeStore";
import type { Pedigree, Sex } from "@pedigree-editor/layout-engine";

/** Add partner makes a partner of the opposite sex, father role first (#119). */

const get = () => usePedigreeStore.getState();

function base(): Pedigree {
  return {
    individuals: [
      { id: "m", sex: "male", affected: false, sibOrder: 0 },
      { id: "f", sex: "female", affected: false, sibOrder: 1 },
      { id: "u", sex: "unknown", affected: false, sibOrder: 2 },
    ],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

function added(id: string) {
  get().addPartner(id);
  const p = get().pedigree.partnerships.at(-1)!;
  const otherId = p.individual1 === id ? p.individual2 : p.individual1;
  const other = get().pedigree.individuals.find(i => i.id === otherId)!;
  return { p, other };
}

describe("addPartner (#119)", () => {
  beforeEach(() => get().initialize(base()));

  it.each<[string, Sex]>([["m", "female"], ["f", "male"], ["u", "unknown"]])(
    "partner of %s is %s", (id, sex) => {
      expect(added(id).other.sex).toBe(sex);
    });

  it("puts the father role first", () => {
    const a = added("m");
    expect(a.p.individual1).toBe("m");
    const b = added("f");
    expect(b.p.individual1).toBe(b.other.id);
    expect(b.p.individual2).toBe("f");
    expect(get().pedigree.parentOf[b.p.id]).toEqual([]);
  });

  it("is one undo step", () => {
    added("f");
    get().undo();
    expect(get().pedigree.individuals).toHaveLength(3);
    expect(get().pedigree.partnerships).toHaveLength(0);
  });
});
