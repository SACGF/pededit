import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { linkPartnerProblem } from "../partners";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { lintFlow } from "../renderLint";
import { layoutToFlow } from "../layoutToFlow";
import { consanguinityTest } from "../consanguinity";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * gf = gm → son, dau; son = wife → gc1; dau = hus → gc2 (gc1 and gc2 are
 * first cousins). loner and stranger have no relatives.
 */
function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "gf", sex: "male", affected: false, sibOrder: 0 },
      { id: "gm", sex: "female", affected: false, sibOrder: 1 },
      { id: "son", sex: "male", affected: false, sibOrder: 0 },
      { id: "dau", sex: "female", affected: false, sibOrder: 1 },
      { id: "wife", sex: "female", affected: false, sibOrder: 2 },
      { id: "hus", sex: "male", affected: false, sibOrder: 3 },
      { id: "gc1", sex: "male", affected: false, sibOrder: 0, name: "Cousin A" },
      { id: "gc2", sex: "female", affected: false, sibOrder: 0, name: "Cousin B" },
      { id: "loner", sex: "unknown", affected: false, sibOrder: 4 },
      { id: "stranger", sex: "female", affected: false, sibOrder: 5 },
      { id: "preg", sex: "unknown", affected: false, sibOrder: 6, lifeStatus: "pregnancy" },
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm" },
      { id: "sw", individual1: "son", individual2: "wife" },
      { id: "dh", individual1: "hus", individual2: "dau" },
    ],
    parentOf: { g: ["son", "dau"], sw: ["gc1"], dh: ["gc2"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

describe("linkPartnerProblem (#84)", () => {
  const p = pedigree();
  it("rules", () => {
    expect(linkPartnerProblem(p, "gc1", "gc1")).toMatch(/own partner/);
    expect(linkPartnerProblem(p, "gc1", "nobody")).toMatch(/Unknown/);
    expect(linkPartnerProblem(p, "gc1", "preg")).toMatch(/pregnancy/);
    expect(linkPartnerProblem(p, "preg", "gc1")).toMatch(/pregnancy/);
    expect(linkPartnerProblem(p, "wife", "son")).toMatch(/already partners/);
    expect(linkPartnerProblem(p, "gc1", "son")).toMatch(/both be male/);
    expect(linkPartnerProblem(p, "gc1", "gc2")).toBeNull(); // cousins
    expect(linkPartnerProblem(p, "gf", "dau")).toBeNull(); // parent and child
    expect(linkPartnerProblem(p, "son", "dau")).toBeNull(); // siblings
    expect(linkPartnerProblem(p, "gc1", "loner")).toBeNull(); // unknown sex
    expect(linkPartnerProblem(p, "son", "stranger")).toBeNull(); // a second partner
  });
});

describe("linkPartner (#84)", () => {
  const store = () => usePedigreeStore.getState();
  const ped = () => store().pedigree;
  beforeEach(() => {
    store().initialize(pedigree());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("joins two relatives with a childless partnership drawn double, and adds nobody", () => {
    expect(store().linkPartner("gc2", "gc1")).toBeNull();
    expect(ped().individuals).toHaveLength(11);
    expect(ped().partnerships).toHaveLength(4);
    const p = ped().partnerships[3]!;
    // Father role first, whichever of the two the menu was opened on.
    expect(p).toMatchObject({ individual1: "gc1", individual2: "gc2" });
    // Nothing is stored: the double line comes from their kinship (#85).
    expect(p.consanguineous).toBeUndefined();
    expect(consanguinityTest(ped())("gc1", "gc2")).toBe(true);
    expect(ped().parentOf[p.id]).toEqual([]);
    expect(store().notice).toMatchObject({ kind: "info", undoable: true });
    expect(store().notice!.text).toMatch(/Cousin B and Cousin A are now partners \(related, so drawn with a double line\)/);
  });

  it("does not flag unrelated people", () => {
    expect(store().linkPartner("gc1", "stranger")).toBeNull();
    const p = ped().partnerships[3]!;
    expect(p).toMatchObject({ individual1: "gc1", individual2: "stranger" });
    expect(p.consanguineous).toBeUndefined();
    expect(consanguinityTest(ped())("gc1", "stranger")).toBe(false);
    expect(store().notice!.text).not.toMatch(/double line/);
  });

  it("puts a known male first when the other is of unknown sex", () => {
    store().linkPartner("loner", "gc1");
    expect(ped().partnerships[3]).toMatchObject({ individual1: "gc1", individual2: "loner" });
  });

  it("refuses with the reason and changes nothing", () => {
    expect(store().linkPartner("son", "wife")).toMatch(/already partners/);
    expect(store().linkPartner("gc1", "son")).toMatch(/both be male/);
    expect(ped()).toEqual(pedigree());
    expect(store().past).toHaveLength(0);
  });

  it("is one undo step", () => {
    store().linkPartner("gc1", "gc2");
    store().undo();
    expect(ped()).toEqual(pedigree());
  });

  it("children can then be added to the linked couple", () => {
    store().linkPartner("gc1", "gc2");
    const pid = ped().partnerships[3]!.id;
    store().addChildren("gc1", 2, "unknown", pid);
    expect(ped().parentOf[pid]).toHaveLength(2);
    expect(ped().individuals).toHaveLength(13);
  });

  it.each([
    ["cousins", "gc1", "gc2"],
    ["siblings", "son", "dau"],
    ["parent and child", "gf", "dau"],
    ["uncle and niece", "son", "gc2"],
    ["unrelated", "gc1", "stranger"],
  ])("draws cleanly after linking %s, childless and with a child", (_what, a, b) => {
    expect(store().linkPartner(a, b)).toBeNull();
    expect(lintFlow(ped(), layoutToFlow(ped()))).toEqual([]);
    store().addChildren(a, 1, "unknown", ped().partnerships[3]!.id);
    expect(lintFlow(ped(), layoutToFlow(ped()))).toEqual([]);
  });
});

describe("picking a partner (#84)", () => {
  const store = () => usePedigreeStore.getState();
  beforeEach(() => {
    store().initialize(pedigree());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("one click links and leaves picking, with the first person selected", () => {
    store().startPickingPartner("gc1");
    expect(store().picking).toEqual({ kind: "partner", individualId: "gc1" });
    expect(store().selectedId).toBe("gc1");
    expect(store().pickIndividual("gc2")).toBe(true);
    expect(store().picking).toBeNull();
    expect(store().selectedId).toBe("gc1");
    expect(store().pedigree.partnerships).toHaveLength(4);
  });

  it("refuses a bad pick with a notice and keeps picking", () => {
    store().startPickingPartner("gc1");
    store().pickIndividual("gc1");
    expect(store().notice).toMatchObject({ kind: "error" });
    expect(store().notice!.text).toMatch(/own partner/);
    store().pickIndividual("son");
    expect(store().notice!.text).toMatch(/both be male/);
    expect(store().picking).toMatchObject({ kind: "partner" });
    expect(store().pedigree.partnerships).toHaveLength(3);
    store().cancelPicking();
    expect(store().picking).toBeNull();
  });
});
