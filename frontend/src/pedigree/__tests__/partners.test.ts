import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { linkPartnerProblem } from "../partners";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { lintScene } from "../renderLint";
import { buildScene } from "../scene";
import { consanguinityTest } from "../consanguinity";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { M, F, U, couple, build } from "../../fixtures/features";
import { expectNoEdit, expectOneUndoStep } from "../../store/__tests__/undoSteps";

/**
 * gf = gm → son, dau; son = wife → gc1; dau = hus → gc2 (gc1 and gc2 are
 * first cousins). loner and stranger have no relatives.
 */
function pedigree(): Pedigree {
  return build(
    [
      M("gf"),
      F("gm"),
      M("son"),
      F("dau"),
      F("wife"),
      M("hus"),
      M("gc1", { name: "Cousin A" }),
      F("gc2", { name: "Cousin B" }),
      U("loner"),
      F("stranger"),
      U("preg", { lifeStatus: "pregnancy" }),
    ],
    [
      couple("g", "gf", "gm"),
      couple("sw", "son", "wife"),
      couple("dh", "hus", "dau"),
    ],
    { g: ["son", "dau"], sw: ["gc1"], dh: ["gc2"] },
  );
}

describe("linkPartnerProblem (#84)", () => {
  const p = pedigree();
  it("rules", () => {
    expect(linkPartnerProblem(p, "gc1", "gc1")).toMatch(/own partner/);
    expect(linkPartnerProblem(p, "gc1", "nobody")).toMatch(/Unknown/);
    expect(linkPartnerProblem(p, "gc1", "preg")).toMatch(/pregnancy/);
    expect(linkPartnerProblem(p, "preg", "gc1")).toMatch(/pregnancy/);
    expect(linkPartnerProblem(p, "wife", "son")).toMatch(/already partners/);
    expect(linkPartnerProblem(p, "gc1", "son")).toBeNull(); // same sex (#105)
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
    expect(expectNoEdit(() => store().linkPartner("son", "wife"))).toMatch(/already partners/);
    expect(expectNoEdit(() => store().linkPartner("gc1", "preg"))).toMatch(/pregnancy/);
  });

  it("is one undo step", () => {
    expectOneUndoStep(() => store().linkPartner("gc1", "gc2"));
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
    expect(lintScene(ped(), buildScene(ped()))).toEqual([]);
    store().addChildren(a, 1, "unknown", ped().partnerships[3]!.id);
    expect(lintScene(ped(), buildScene(ped()))).toEqual([]);
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
    store().pickIndividual("preg");
    expect(store().notice!.text).toMatch(/pregnancy/);
    expect(store().picking).toMatchObject({ kind: "partner" });
    expect(store().pedigree.partnerships).toHaveLength(3);
    store().cancelPicking();
    expect(store().picking).toBeNull();
  });
});
