import { describe, expect, it, vi } from "vitest";
import { buildScene } from "../scene";
import { lintScene } from "../renderLint";
import type { Pedigree } from "@pedigree-editor/layout-engine";

// The title as it would be placed if nothing drawn over the symbols were
// counted: what the canvas lint is there to catch (#188).
vi.mock("../consanguinityLabel", async importOriginal => ({
  ...(await importOriginal<typeof import("../consanguinityLabel")>()),
  highestAboveSymbols: () => Infinity,
}));

describe("lintScene: a chart title that is not raised", () => {
  const base = {
    individuals: [
      { id: "f", sex: "male", affected: false, sibOrder: 0 },
      { id: "m", sex: "female", affected: false, sibOrder: 1 },
      { id: "c", sex: "female", affected: false, sibOrder: 0 },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  } as Pedigree;

  it("is reported when it is drawn through a couple line hopping over the top row", () => {
    const flow = buildScene(base);
    flow.couples = flow.couples.map(e => ({ ...e, data: { ...e.data!, hopHeight: 50 } }));
    const found = lintScene(base, flow, { title: "A family" }).filter(f => f.code === "title-collides");
    expect(found.map(f => f.message)).toEqual(['the chart title "A family" is drawn through a couple line hopping over a symbol']);
    // No title, no check.
    expect(lintScene(base, flow).filter(f => f.code === "title-collides")).toEqual([]);
  });
});
