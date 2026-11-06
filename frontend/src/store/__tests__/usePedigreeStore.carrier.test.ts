import { describe, it, expect, beforeEach } from "vitest";
import { usePedigreeStore } from "../usePedigreeStore";
import type { Pedigree } from "@pedigree-editor/layout-engine";

function singlePerson(): Pedigree {
  return {
    individuals: [
      { id: "a", sex: "female", affected: false, sibOrder: 0, name: "", notes: "" },
    ],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const get = () => usePedigreeStore.getState();
const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id)!;

describe("usePedigreeStore setCarrier", () => {
  beforeEach(() => {
    get().initialize(singlePerson());
  });

  it("starts with carrier unset", () => {
    expect(ind("a").carrier).toBeUndefined();
    expect(get().past).toHaveLength(0);
    expect(get().isDirty).toBe(false);
  });

  it("sets carrier to true and marks the store dirty", () => {
    get().setCarrier("a", true);
    expect(ind("a").carrier).toBe(true);
    expect(get().isDirty).toBe(true);
  });

  it("clears carrier again", () => {
    get().setCarrier("a", true);
    get().setCarrier("a", false);
    expect(ind("a").carrier).toBe(false);
  });

  it("is a no-op for an unknown id", () => {
    get().setCarrier("nope", true);
    expect(ind("a").carrier).toBeUndefined();
  });

  it("keeps the affected flag untouched", () => {
    get().setAffected("a", true);
    get().setCarrier("a", true);
    expect(ind("a").affected).toBe(true);
    expect(ind("a").carrier).toBe(true);
  });

  it("pushes one undo entry per call", () => {
    get().setCarrier("a", true);
    expect(get().past).toHaveLength(1);
    expect(get().future).toHaveLength(0);
  });

  it("is undone by undo and reapplied by redo", () => {
    get().setCarrier("a", true);
    get().undo();
    expect(ind("a").carrier).toBeUndefined();
    expect(get().future).toHaveLength(1);
    get().redo();
    expect(ind("a").carrier).toBe(true);
    expect(get().future).toHaveLength(0);
  });

  it("clears the redo stack when a new change is made after undo", () => {
    get().setCarrier("a", true);
    get().undo();
    get().setCarrier("a", false);
    expect(get().future).toHaveLength(0);
    expect(ind("a").carrier).toBe(false);
  });
});
