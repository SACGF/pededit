import { describe, it, expect } from "vitest";
import {
  RECENT_PEDIGREES_KEY, RECENT_PEDIGREES_LIMIT,
  listRecentPedigrees, recordRecentPedigree, renameRecentPedigree, forgetRecentPedigree,
} from "../recentPedigrees";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    dump: () => map.get(RECENT_PEDIGREES_KEY),
  };
}

const at = (iso: string) => () => new Date(iso);

describe("recent pedigrees on this device (#16)", () => {
  it("starts empty and records the most recent first", () => {
    const s = fakeStorage();
    expect(listRecentPedigrees(s)).toEqual([]);
    recordRecentPedigree("a", "First", s, at("2026-11-01T00:00:00Z"));
    recordRecentPedigree("b", "Second", s, at("2026-11-02T00:00:00Z"));
    expect(listRecentPedigrees(s).map(e => e.id)).toEqual(["b", "a"]);
    expect(listRecentPedigrees(s)[1]).toEqual({ id: "a", title: "First", openedAt: "2026-11-01T00:00:00.000Z" });
  });

  it("reopening moves an entry to the front and refreshes its title and time", () => {
    const s = fakeStorage();
    recordRecentPedigree("a", "First", s, at("2026-11-01T00:00:00Z"));
    recordRecentPedigree("b", "Second", s, at("2026-11-02T00:00:00Z"));
    recordRecentPedigree("a", "First renamed", s, at("2026-11-03T00:00:00Z"));
    const list = listRecentPedigrees(s);
    expect(list.map(e => e.id)).toEqual(["a", "b"]);
    expect(list[0]!.title).toBe("First renamed");
    expect(list[0]!.openedAt).toBe("2026-11-03T00:00:00.000Z");
  });

  it("keeps at most the limit, dropping the oldest", () => {
    const s = fakeStorage();
    for (let i = 0; i < RECENT_PEDIGREES_LIMIT + 5; i++) {
      recordRecentPedigree(`p${i}`, `P ${i}`, s, at(`2026-01-01T00:00:${String(i).padStart(2, "0")}Z`));
    }
    const list = listRecentPedigrees(s);
    expect(list).toHaveLength(RECENT_PEDIGREES_LIMIT);
    expect(list[0]!.id).toBe(`p${RECENT_PEDIGREES_LIMIT + 4}`);
    expect(list.some(e => e.id === "p0")).toBe(false);
  });

  it("renames in place and forgets", () => {
    const s = fakeStorage();
    recordRecentPedigree("a", "First", s, at("2026-11-01T00:00:00Z"));
    recordRecentPedigree("b", "Second", s, at("2026-11-02T00:00:00Z"));
    renameRecentPedigree("a", "Renamed", s);
    expect(listRecentPedigrees(s).map(e => [e.id, e.title])).toEqual([["b", "Second"], ["a", "Renamed"]]);
    renameRecentPedigree("zzz", "Nobody", s);
    expect(listRecentPedigrees(s)).toHaveLength(2);
    forgetRecentPedigree("b", s);
    expect(listRecentPedigrees(s).map(e => e.id)).toEqual(["a"]);
  });

  it("ignores garbage in storage and entries missing fields", () => {
    expect(listRecentPedigrees(fakeStorage({ [RECENT_PEDIGREES_KEY]: "not json" }))).toEqual([]);
    expect(listRecentPedigrees(fakeStorage({ [RECENT_PEDIGREES_KEY]: "{}" }))).toEqual([]);
    const mixed = JSON.stringify([
      { id: "ok", title: "Fine", openedAt: "2026-11-01T00:00:00.000Z" },
      { id: "", title: "No id", openedAt: "2026-11-01T00:00:00.000Z" },
      { title: "Missing id" },
      null,
      42,
    ]);
    expect(listRecentPedigrees(fakeStorage({ [RECENT_PEDIGREES_KEY]: mixed })).map(e => e.id)).toEqual(["ok"]);
  });

  it("survives a missing or throwing storage", () => {
    expect(listRecentPedigrees(null)).toEqual([]);
    expect(() => recordRecentPedigree("a", "x", null)).not.toThrow();
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(listRecentPedigrees(broken)).toEqual([]);
    expect(() => recordRecentPedigree("a", "x", broken)).not.toThrow();
    expect(() => forgetRecentPedigree("a", broken)).not.toThrow();
  });
});
