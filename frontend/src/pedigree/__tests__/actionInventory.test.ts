import { describe, expect, it } from "vitest";
import {
  ACTIONS, FLAG_TABLE, RELATION_TABLE, SCOPE_TABLE, STORE_ACTIONS, cellActions, selectionTargets,
  type ActionId, type Cell,
} from "../actionInventory";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { F, M, build, couple } from "../../fixtures/features";

// #243: the inventory of actions, and the tests that fail on an unexplained hole.

const isAction = (id: unknown): id is ActionId => typeof id === "string" && Object.hasOwn(ACTIONS, id);
const cells = (): [string, Cell][] => [
  ...Object.entries(RELATION_TABLE).flatMap(([row, verbs]) => Object.entries(verbs).map(([v, c]) => [`relation ${row} / ${v}`, c] as [string, Cell])),
  ...Object.entries(FLAG_TABLE).flatMap(([row, reach]) => Object.entries(reach).map(([r, c]) => [`flag ${row} / ${r}`, c] as [string, Cell])),
  ...Object.entries(SCOPE_TABLE).flatMap(([verb, scopes]) => Object.entries(scopes).map(([s, c]) => [`scope ${verb} / ${s}`, c] as [string, Cell])),
];

describe("the three tables", () => {
  it("every cell is an action of the inventory or a written reason", () => {
    for (const [where, cell] of cells()) {
      if (typeof cell === "object" && !Array.isArray(cell)) {
        expect(cell.reason.trim().length, where).toBeGreaterThan(10);
        continue;
      }
      const ids = cellActions(cell);
      expect(ids.length, where).toBeGreaterThan(0);
      for (const id of ids) expect(isAction(id), `${where}: ${id}`).toBe(true);
    }
  });

  it("every action that adds or links names its inverse, an action of the inventory, or a reason", () => {
    const adds = Object.entries(ACTIONS).filter(([id]) => /\.(add|setParents|makePartners|twins$)/.test(id) || id.endsWith("Partners"));
    expect(adds.length).toBeGreaterThan(10);
    for (const [id, spec] of adds) {
      const inv = (spec as { inverse?: unknown }).inverse;
      expect(inv, `${id} has no inverse`).toBeDefined();
      if (typeof inv === "string") expect(isAction(inv), `${id}: ${inv}`).toBe(true);
      else expect((inv as { reason: string }).reason.length, id).toBeGreaterThan(10);
    }
  });

  it("every action of the inventory is in a table or reached by the store table, so none is orphaned", () => {
    const named = new Set<string>([
      ...cells().flatMap(([, c]) => cellActions(c)),
      ...Object.values(STORE_ACTIONS).filter(isAction),
      ...Object.values(ACTIONS).map(a => (a as { inverse?: unknown }).inverse).filter(isAction),
    ]);
    expect(Object.entries(ACTIONS).filter(([id, a]) => !named.has(id) && !(a as { view?: true }).view).map(([id]) => id)).toEqual([]);
  });
});

describe("store actions", () => {
  it("every edit action of the store is reached by an inventory action or explained as internal", () => {
    const state = usePedigreeStore.getState() as unknown as Record<string, unknown>;
    for (const [name, reach] of Object.entries(STORE_ACTIONS)) {
      expect(typeof state[name], `${name} is not a store action`).toBe("function");
      if (typeof reach === "string") expect(isAction(reach), `${name}: ${reach}`).toBe(true);
      else expect(reach.internal.length, name).toBeGreaterThan(10);
    }
  });
});

describe("selectionTargets", () => {
  const p = build(
    [M("gf"), F("gm"), M("a"), F("b"), M("c"), F("x"), M("y")],
    [couple("p0", "gf", "gm"), couple("pa", "a", "x")],
    { p0: ["a", "b", "c"] },
  );
  const kinds = (ids: string[], line?: string) => selectionTargets(p, ids, line).map(t => t.kind);

  it("one person is a person and each couple they are in", () => {
    expect(selectionTargets(p, ["a"])).toEqual([{ kind: "person", id: "a" }, { kind: "couple", partnershipId: "pa" }]);
    expect(kinds(["y"])).toEqual(["person"]);
  });
  it("two partners are a couple and people", () => {
    expect(kinds(["a", "x"])).toEqual(["couple", "people"]);
  });
  it("two unrelated people are a pair and people", () => {
    expect(kinds(["x", "y"])).toEqual(["pair", "people"]);
  });
  it("two brothers are siblings, a pair and people; three siblings are siblings and people", () => {
    expect(kinds(["a", "c"])).toEqual(["siblings", "pair", "people"]);
    expect(selectionTargets(p, ["a", "b", "c"])[0]).toEqual({ kind: "siblings", partnershipId: "p0", ids: ["a", "b", "c"] });
    expect(kinds(["a", "b", "c"])).toEqual(["siblings", "people"]);
  });
  it("a couple line with nothing selected is that couple", () => {
    expect(selectionTargets(p, [], "p0")).toEqual([{ kind: "couple", partnershipId: "p0" }]);
    expect(selectionTargets(p, [])).toEqual([]);
  });
});
