import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { usePedigreeStore } from "../usePedigreeStore";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/** "dad" = "mum" with child "kid"; "dad" = "wife2" with no children. */
function familyPedigree(): Pedigree {
  return {
    individuals: [
      { id: "dad",   sex: "male",    affected: false, sibOrder: 0 },
      { id: "mum",   sex: "female",  affected: false, sibOrder: 1 },
      { id: "wife2", sex: "female",  affected: false, sibOrder: 2 },
      { id: "kid",   sex: "unknown", affected: false, sibOrder: 0 },
    ],
    partnerships: [
      { id: "p1", individual1: "dad", individual2: "mum" },
      { id: "p2", individual1: "dad", individual2: "wife2" },
    ],
    parentOf: { p1: ["kid"], p2: [] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const store = () => usePedigreeStore.getState();
const partnership = (id: string) => store().pedigree.partnerships.find(p => p.id === id)!;

describe("setPartnershipChildless (#15)", () => {
  beforeEach(() => {
    store().initialize(familyPedigree());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("sets each status on a couple with no children", () => {
    store().setPartnershipChildless("p2", "infertility");
    expect(partnership("p2").childless).toBe("infertility");
    store().setPartnershipChildless("p2", "byChoice");
    expect(partnership("p2").childless).toBe("byChoice");
  });

  it("clearing removes the key and the reason", () => {
    store().setPartnershipChildless("p2", "byChoice");
    store().setPartnershipChildlessReason("p2", "vasectomy");
    expect(partnership("p2")).toMatchObject({ childless: "byChoice", childlessReason: "vasectomy" });
    store().setPartnershipChildless("p2", undefined);
    expect(partnership("p2")).not.toHaveProperty("childless");
    expect(partnership("p2")).not.toHaveProperty("childlessReason");
  });

  it("an empty reason removes the key", () => {
    store().setPartnershipChildless("p2", "infertility");
    store().setPartnershipChildlessReason("p2", "x");
    store().setPartnershipChildlessReason("p2", "");
    expect(partnership("p2")).not.toHaveProperty("childlessReason");
  });

  it("refuses a couple with children", () => {
    const before = store().past.length;
    store().setPartnershipChildless("p1", "infertility");
    expect(partnership("p1").childless).toBeUndefined();
    expect(store().past.length).toBe(before);
    expect(console.warn).toHaveBeenCalled();
  });

  it("adding a child clears the mark and reason", () => {
    store().setPartnershipChildless("p2", "byChoice");
    store().setPartnershipChildlessReason("p2", "reason");
    store().addChildren("dad", 1, "male", "p2");
    expect(store().pedigree.parentOf.p2).toHaveLength(1);
    expect(partnership("p2")).not.toHaveProperty("childless");
    expect(partnership("p2")).not.toHaveProperty("childlessReason");
  });

  it("addChild on a fresh partner clears the mark of the partnership it uses", () => {
    store().initialize({
      ...familyPedigree(),
      partnerships: [{ id: "p2", individual1: "dad", individual2: "wife2", childless: "infertility" }],
      parentOf: { p2: [] },
    });
    store().addChild("wife2", "female");
    expect(partnership("p2").childless).toBeUndefined();
  });

  it("is undoable and redoable", () => {
    store().setPartnershipChildless("p2", "infertility");
    store().undo();
    expect(partnership("p2").childless).toBeUndefined();
    store().redo();
    expect(partnership("p2").childless).toBe("infertility");
  });

  it("is a no-op for an unknown partnership", () => {
    store().setPartnershipChildless("nope", "infertility");
    expect(store().pedigree).toEqual(familyPedigree());
  });
});
