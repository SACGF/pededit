import { describe, it, expect, beforeEach } from "vitest";
import { usePedigreeStore } from "../usePedigreeStore";
import { F, build } from "../../fixtures/features";
import { expectNoEdit, expectOneUndoStep } from "./undoSteps";

const singlePerson = () => build([F("a")], [], {});

const get = () => usePedigreeStore.getState();
const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id)!;

describe("usePedigreeStore setCarrier", () => {
  beforeEach(() => {
    get().initialize(singlePerson());
  });

  it("starts with carrier unset", () => {
    expect(ind("a").carrier).toBeUndefined();
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
    expectNoEdit(() => get().setCarrier("nope", true));
  });

  it("keeps the affected flag untouched", () => {
    get().setAffected("a", true);
    get().setCarrier("a", true);
    expect(ind("a").affected).toBe(true);
    expect(ind("a").carrier).toBe(true);
  });

  it("is one undo step per call", () => {
    expectOneUndoStep(() => get().setCarrier("a", true));
    expectOneUndoStep(() => get().setCarrier("a", false));
  });

  it("is undone by undo and reapplied by redo", () => {
    get().setCarrier("a", true);
    get().undo();
    expect(ind("a").carrier).toBeUndefined();
    get().redo();
    expect(ind("a").carrier).toBe(true);
    expectNoEdit(() => get().redo()); // nothing left to redo
  });

  it("clears the redo stack when a new change is made after undo", () => {
    get().setCarrier("a", true);
    get().undo();
    get().setAffected("a", true);
    expectNoEdit(() => get().redo());
    expect(ind("a").carrier).toBeFalsy();
  });

  it("keeps the redo stack when an action after undo changes nothing", () => {
    get().setCarrier("a", true);
    get().undo();
    expectNoEdit(() => get().setCarrier("a", false));
    get().redo();
    expect(ind("a").carrier).toBe(true);
  });
});
