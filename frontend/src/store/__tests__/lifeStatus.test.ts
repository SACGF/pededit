import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { usePedigreeStore, hasPartnerOrChild } from "../usePedigreeStore";
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

/** Parents "dad" and "mum" with one child "kid" and one unrelated "solo". */
function familyPedigree(): Pedigree {
  return makePedigree({
    individuals: [
      { id: "dad",  sex: "male",    affected: false, sibOrder: 0 },
      { id: "mum",  sex: "female",  affected: false, sibOrder: 1 },
      { id: "kid",  sex: "unknown", affected: false, sibOrder: 0 },
      { id: "solo", sex: "female",  affected: false, sibOrder: 2 },
    ],
    partnerships: [{ id: "p1", individual1: "dad", individual2: "mum" }],
    parentOf: { p1: ["kid"] },
  });
}

const store = () => usePedigreeStore.getState();
const find = (id: string) => store().pedigree.individuals.find(i => i.id === id)!;

describe("setLifeStatus", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store().initialize(familyPedigree());
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("sets each status on a child with no partner or children", () => {
    for (const status of ["pregnancy", "miscarriage", "termination", "stillbirth", "ectopic"] as const) {
      store().setLifeStatus("kid", status);
      expect(find("kid").lifeStatus).toBe(status);
    }
  });

  it("clears the status with undefined and removes the key", () => {
    store().setLifeStatus("kid", "miscarriage");
    store().setLifeStatus("kid", undefined);
    expect(find("kid").lifeStatus).toBeUndefined();
    expect("lifeStatus" in find("kid")).toBe(false);
  });

  it("is undoable and redoable", () => {
    store().setLifeStatus("kid", "stillbirth");
    store().undo();
    expect(find("kid").lifeStatus).toBeUndefined();
    store().redo();
    expect(find("kid").lifeStatus).toBe("stillbirth");
  });

  it("leaves sex, affected and deceased untouched", () => {
    store().setAffected("kid", true);
    store().setDeceased("kid", true);
    store().setLifeStatus("kid", "pregnancy");
    const kid = find("kid");
    expect(kid.sex).toBe("unknown");
    expect(kid.affected).toBe(true);
    expect(kid.deceased).toBe(true);
  });

  it("allows setting a sex on a miscarriage", () => {
    store().setLifeStatus("kid", "miscarriage");
    store().setSex("kid", "female");
    expect(find("kid").sex).toBe("female");
    expect(find("kid").lifeStatus).toBe("miscarriage");
  });

  it("refuses to mark an individual with a partner or children", () => {
    const before = store().past.length;
    store().setLifeStatus("dad", "miscarriage");
    expect(find("dad").lifeStatus).toBeUndefined();
    expect(store().past.length).toBe(before);   // no undo entry, no-op
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("allows clearing even when the individual has a partner (defensive)", () => {
    store().setLifeStatus("dad", undefined);
    expect(warn).not.toHaveBeenCalled();
  });

  it("marks a solo individual who then cannot gain a partner or child", () => {
    store().setLifeStatus("solo", "termination");
    expect(find("solo").lifeStatus).toBe("termination");
  });
});

describe("add child / add partner on a pregnancy or loss", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store().initialize(familyPedigree());
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it.each(["pregnancy", "miscarriage", "termination", "stillbirth", "ectopic"] as const)(
    "addChild is refused for a %s", (status) => {
      store().setLifeStatus("kid", status);
      const n = store().pedigree.individuals.length;
      const before = store().past.length;
      store().addChild("kid", "male");
      expect(store().pedigree.individuals.length).toBe(n);
      expect(store().pedigree.partnerships).toHaveLength(1);
      expect(store().past.length).toBe(before);
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  it("addPartner is refused for a miscarriage", () => {
    store().setLifeStatus("kid", "miscarriage");
    const n = store().pedigree.individuals.length;
    store().addPartner("kid");
    expect(store().pedigree.individuals.length).toBe(n);
    expect(store().pedigree.partnerships).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("addParent and addSibling still work for a miscarriage", () => {
    store().setLifeStatus("solo", "miscarriage");
    store().addParent("solo", "male");
    expect(hasPartnerOrChild(store().pedigree, "solo")).toBe(false);
    const parentPid = Object.keys(store().pedigree.parentOf).find(pid =>
      store().pedigree.parentOf[pid].includes("solo"))!;
    expect(parentPid).toBeDefined();
    store().addSibling("solo");
    expect(store().pedigree.parentOf[parentPid]).toHaveLength(2);
  });

  it("addChild still works for a born individual", () => {
    const n = store().pedigree.individuals.length;
    store().addChild("dad", "female");
    expect(store().pedigree.individuals.length).toBe(n + 1);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("hasPartnerOrChild", () => {
  it("is true for a partner, false for a child or a solo individual", () => {
    const p = familyPedigree();
    expect(hasPartnerOrChild(p, "dad")).toBe(true);
    expect(hasPartnerOrChild(p, "mum")).toBe(true);
    expect(hasPartnerOrChild(p, "kid")).toBe(false);
    expect(hasPartnerOrChild(p, "solo")).toBe(false);
  });
});
