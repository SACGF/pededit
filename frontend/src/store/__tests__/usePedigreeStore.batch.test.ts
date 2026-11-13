import { describe, it, expect, beforeEach } from "vitest";
import { usePedigreeStore } from "../usePedigreeStore";
import type { Individual, Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { batchSexProblem, batchStatus } from "../../pedigree/batch";

const person = (id: string, sex: Sex, extra: Partial<Individual> = {}): Individual =>
  ({ id, sex, affected: false, sibOrder: 0, name: id, notes: "", ...extra });

/** Couple f + m with children a, b (monozygotic twins) and c; d unrelated. */
function family(): Pedigree {
  return {
    individuals: [
      person("f", "male"),
      person("m", "female", { carrier: true, onset: "40y" }),
      person("a", "female", { sibOrder: 1 }),
      person("b", "female", { sibOrder: 2 }),
      person("c", "male", { sibOrder: 3, presymptomatic: true, deceased: true, dod: "2001" }),
      person("d", "unknown", { tags: ["t1"], tagOnset: { t1: "30y" } }),
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m", twins: [{ members: ["a", "b"], zygosity: "monozygotic" }] }],
    parentOf: { p: ["a", "b", "c"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    tags: [
      { id: "t1", label: "Breast cancer", color: "#f00", style: "quadrant" },
      { id: "t2", label: "Ovarian cancer", color: "#00f", style: "quadrant" },
    ],
  };
}

const get = () => usePedigreeStore.getState();
const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id)!;

describe("batch status changes (#35)", () => {
  beforeEach(() => get().initialize(family()));

  it("marks everyone affected in one undo step, and undo restores all", () => {
    get().setAffectedMany(["a", "c", "d"], true);
    expect(["a", "c", "d"].map(id => ind(id).affected)).toEqual([true, true, true]);
    expect(ind("b").affected).toBe(false);
    expect(get().past).toHaveLength(1);
    expect(get().notice?.text).toBe("Marked 3 affected.");
    get().undo();
    expect(["a", "c", "d"].map(id => ind(id).affected)).toEqual([false, false, false]);
  });

  it("marking unaffected drops the age of onset, as the single setter does", () => {
    get().setAffectedMany(["m", "a"], true);
    get().setAffectedMany(["m", "a"], false);
    expect(ind("m").onset).toBeUndefined();
    expect(ind("m").affected).toBe(false);
  });

  it("counts only the people who change, and does nothing when nobody would", () => {
    get().setAffectedMany(["a"], true);
    get().setAffectedMany(["a", "b"], true);
    expect(get().notice?.text).toBe("Marked 1 affected.");
    const steps = get().past.length;
    get().setAffectedMany(["a", "b"], true);
    get().setAffectedMany(["nope"], true);
    expect(get().past).toHaveLength(steps);
  });

  it("marks deceased and living; living clears the date of death", () => {
    get().setDeceasedMany(["a", "c"], true);
    expect(ind("a").deceased).toBe(true);
    expect(ind("c").dod).toBe("2001");
    get().setDeceasedMany(["a", "c"], false);
    expect(ind("a").deceased).toBe(false);
    expect(ind("c").deceased).toBe(false);
    expect(ind("c").dod).toBeUndefined();
    get().undo();
    expect(ind("c").dod).toBe("2001");
    expect(ind("a").deceased).toBe(true);
  });

  it("keeps carrier and presymptomatic exclusive", () => {
    get().setCarrierStatusMany(["m", "c", "d"], "presymptomatic");
    for (const id of ["m", "c", "d"]) {
      expect(ind(id).presymptomatic).toBe(true);
      expect(ind(id).carrier).toBeFalsy();
    }
    get().setCarrierStatusMany(["m", "c", "d"], "carrier");
    for (const id of ["m", "c", "d"]) {
      expect(ind(id).carrier).toBe(true);
      expect(ind(id).presymptomatic).toBeUndefined();
    }
    get().setCarrierStatusMany(["m", "c"], "none");
    expect(ind("m").carrier).toBe(false);
    expect(ind("c").presymptomatic).toBeUndefined();
    expect(ind("d").carrier).toBe(true);
    expect(get().past).toHaveLength(3);
    get().undo();
    get().undo();
    get().undo();
    expect(ind("m").carrier).toBe(true);
    expect(ind("c").presymptomatic).toBe(true);
    expect(ind("d").carrier).toBeUndefined();
  });

  it("sets sex, monozygotic twins following, as one undo step", () => {
    expect(get().setSexMany(["a", "d"], "male")).toBeNull();
    expect(["a", "b", "d"].map(id => ind(id).sex)).toEqual(["male", "male", "male"]);
    expect(get().past).toHaveLength(1);
    get().undo();
    expect(["a", "b", "d"].map(id => ind(id).sex)).toEqual(["female", "female", "unknown"]);
  });

  it("refuses a sex that would give a child two genetic parents of the same known sex", () => {
    const why = get().setSexMany(["f", "m"], "male");
    expect(why).toMatch(/genetic parents/);
    expect(get().notice?.kind).toBe("error");
    expect(ind("m").sex).toBe("female");
    expect(get().past).toHaveLength(0);
    // One partner alone, into the other's sex: refused as the single Sex menu greys it out.
    expect(get().setSexMany(["m", "d"], "male")).not.toBeNull();
    // Unknown is always allowed.
    expect(get().setSexMany(["f", "m"], "unknown")).toBeNull();
    expect(ind("f").sex).toBe("unknown");
    expect(ind("m").sex).toBe("unknown");
  });

  it("adds a tag to all, in pedigree tag order, and removes it with its onset", () => {
    get().setIndividualTagMany(["a", "d"], "t2", true);
    get().setIndividualTagMany(["a", "d"], "t1", true);
    expect(ind("a").tags).toEqual(["t1", "t2"]);
    expect(ind("d").tags).toEqual(["t1", "t2"]);
    expect(get().notice?.text).toBe("Added Breast cancer to 1.");
    get().setIndividualTagMany(["a", "d"], "t1", false);
    expect(ind("a").tags).toEqual(["t2"]);
    expect(ind("d").tags).toEqual(["t2"]);
    expect(ind("d").tagOnset).toBeUndefined();
    get().setIndividualTagMany(["a", "d"], "t2", false);
    expect(ind("a").tags).toBeUndefined();
    get().undo();
    get().undo();
    expect(ind("d").tagOnset).toEqual({ t1: "30y" });
    expect(ind("d").tags).toEqual(["t1", "t2"]);
  });

  it("ignores an unknown tag", () => {
    get().setIndividualTagMany(["a"], "nope", true);
    expect(get().past).toHaveLength(0);
  });

  it("deletes a selection in one step through deleteIndividuals", () => {
    get().setSelection(["a", "c"]);
    expect(get().deleteIndividuals(["a", "c"])).toBe(2);
    expect(get().pedigree.individuals.map(i => i.id)).toEqual(["f", "m", "b", "d"]);
    expect(get().selectedIds).toEqual([]);
    get().undo();
    expect(get().pedigree.individuals).toHaveLength(6);
  });
});

describe("batchStatus / batchSexProblem", () => {
  it("counts each status over the existing selected people", () => {
    const st = batchStatus(family(), ["m", "c", "d", "gone", "m"]);
    expect(st.ids).toEqual(["m", "c", "d"]);
    expect(st.deceased).toBe(1);
    expect(st.carrier).toEqual({ carrier: 1, presymptomatic: 1, none: 1 });
    expect(st.sex).toEqual({ male: 1, female: 1, unknown: 1 });
    expect(st.tags).toEqual({ t1: 1 });
  });

  it("allows swapping a couple's sexes only one at a time", () => {
    expect(batchSexProblem(family(), ["f"], "female")).not.toBeNull();
    expect(batchSexProblem(family(), ["f", "m"], "female")).not.toBeNull();
    expect(batchSexProblem(family(), ["a", "c"], "female")).toBeNull();
    expect(batchSexProblem(family(), ["gone"], "male")).toBe("Nobody selected.");
  });

  it("allows partners of the same sex when they have no genetic children together (#105)", () => {
    const childless = { ...family(), parentOf: {} };
    expect(batchSexProblem(childless, ["f"], "female")).toBeNull();
    expect(batchSexProblem(childless, ["f", "m"], "male")).toBeNull();
  });
});
