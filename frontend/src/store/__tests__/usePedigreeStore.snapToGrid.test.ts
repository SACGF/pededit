import { describe, it, expect, beforeEach } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { usePedigreeStore, DEFAULT_SNAP_GRID_SIZE } from "../usePedigreeStore";
import { F, M } from "../../fixtures/features";
import { family } from "../../data/pedigreeBuilder";
import { expectOneUndoStep } from "./undoSteps";

// No canvas settings unless a test gives them: the defaults are under test.
const makePedigree = (overrides: Partial<Pedigree> = {}): Pedigree => family([M("a"), F("b")], [], {}, overrides);

const store = () => usePedigreeStore.getState();

describe("updateCanvasSettings snap to grid", () => {
  beforeEach(() => {
    store().initialize(makePedigree({
      pinnedPositions: { a: { x: 103, y: 207 }, b: { x: 12, y: 18 } },
    }));
  });

  it("defaults the grid size to 5px", () => {
    expect(DEFAULT_SNAP_GRID_SIZE).toBe(5);
    store().updateCanvasSettings({ snapToGrid: true });
    expect(store().pedigree.canvasSettings).toEqual({
      nodesMoveable: false,
      snapToGrid: true,
      snapGridSize: 5,
    });
  });

  it("keeps an explicit grid size from a saved pedigree", () => {
    store().initialize(makePedigree({
      canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 10 },
    }));
    store().updateCanvasSettings({ snapToGrid: true });
    expect(store().pedigree.canvasSettings?.snapGridSize).toBe(10);
  });

  it("snaps existing pinned positions to the grid when snap is enabled", () => {
    store().updateCanvasSettings({ snapToGrid: true });
    expect(store().pedigree.pinnedPositions).toEqual({
      a: { x: 105, y: 205 },
      b: { x: 10, y: 20 },
    });
  });

  it("re-snaps pinned positions when the grid size changes while snap is on", () => {
    store().updateCanvasSettings({ snapToGrid: true });
    store().updateCanvasSettings({ snapGridSize: 20 });
    expect(store().pedigree.pinnedPositions).toEqual({
      a: { x: 100, y: 200 },
      b: { x: 20, y: 20 },
    });
  });

  it("does not move pinned positions when snap is off", () => {
    store().updateCanvasSettings({ snapGridSize: 20 });
    store().updateCanvasSettings({ nodesMoveable: true });
    expect(store().pedigree.pinnedPositions).toEqual({
      a: { x: 103, y: 207 },
      b: { x: 12, y: 18 },
    });
  });

  it("does not re-snap when an unrelated setting changes while snap is on", () => {
    store().updateCanvasSettings({ snapToGrid: true });
    store().updateCanvasSettings({ snapGridSize: 10 });
    store().updateCanvasSettings({ snapToGrid: true, snapGridSize: 10 });
    const before = store().pedigree.pinnedPositions;
    store().updateCanvasSettings({ nodesMoveable: true });
    expect(store().pedigree.pinnedPositions).toEqual(before);
  });

  it("stores a pin on the grid when snap is on, as given when it is off", () => {
    store().pinIndividual("a", { x: 101.3, y: 201.7 });
    expect(store().pedigree.pinnedPositions?.a).toEqual({ x: 101.3, y: 201.7 });
    store().updateCanvasSettings({ snapToGrid: true });
    // A compact drag arrives unscaled and off the grid (270.59, 135.71).
    store().pinIndividual("a", { x: 270.588, y: 135.714 });
    expect(store().pedigree.pinnedPositions?.a).toEqual({ x: 270, y: 135 });
  });

  it("applies a grid size change as one undo entry", () => {
    store().updateCanvasSettings({ snapToGrid: true });
    expectOneUndoStep(() => store().updateCanvasSettings({ snapGridSize: 45 }));
    expect(store().pedigree.pinnedPositions?.a).toEqual({ x: 90, y: 225 });
  });

  it("leaves auto-laid-out nodes alone (no pinnedPositions)", () => {
    store().initialize(makePedigree());
    store().updateCanvasSettings({ snapToGrid: true });
    expect(store().pedigree.pinnedPositions).toBeUndefined();
  });

  it("undo restores both the positions and the setting in one step", () => {
    expectOneUndoStep(() => store().updateCanvasSettings({ snapToGrid: true }));

    store().undo();
    expect(store().pedigree.canvasSettings).toBeUndefined();
    expect(store().pedigree.pinnedPositions).toEqual({
      a: { x: 103, y: 207 },
      b: { x: 12, y: 18 },
    });

    store().redo();
    expect(store().pedigree.canvasSettings?.snapToGrid).toBe(true);
    expect(store().pedigree.pinnedPositions).toEqual({
      a: { x: 105, y: 205 },
      b: { x: 10, y: 20 },
    });
  });
});
