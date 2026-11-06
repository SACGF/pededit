import { describe, it, expect, beforeEach } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { usePedigreeStore, DEFAULT_SNAP_GRID_SIZE } from "../usePedigreeStore";

function makePedigree(overrides: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [
      { id: "a", sex: "male", affected: false, sibOrder: 0 },
      { id: "b", sex: "female", affected: false, sibOrder: 1 },
    ],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...overrides,
  };
}

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
    store().pinIndividual("a", { x: 101, y: 201 });
    store().updateCanvasSettings({ nodesMoveable: true });
    expect(store().pedigree.pinnedPositions?.a).toEqual({ x: 101, y: 201 });
  });

  it("leaves auto-laid-out nodes alone (no pinnedPositions)", () => {
    store().initialize(makePedigree());
    store().updateCanvasSettings({ snapToGrid: true });
    expect(store().pedigree.pinnedPositions).toBeUndefined();
  });

  it("undo restores both the positions and the setting in one step", () => {
    store().updateCanvasSettings({ snapToGrid: true });
    expect(store().past).toHaveLength(1);

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
