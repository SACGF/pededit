import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { sibshipSegments, twinForkMarks } from "../sibshipPath";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportCsv } from "../../io/csv/exporter";
import { renderExportKeySvg } from "../tags";
import { twinSetProblem, twinMembership, zygositiesInUse } from "../twins";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { importJson } from "../../io/json/importer";
import { exportJson } from "../../io/json/exporter";
import { NODE_SIZE } from "../constants";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/** f = m with children a, b (MZ twins, both male), c, d (twins of unknown zygosity), e. */
function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "f", sex: "male",   affected: false, sibOrder: 0 },
      { id: "m", sex: "female", affected: false, sibOrder: 1 },
      { id: "a", sex: "male",   affected: false, sibOrder: 0, name: "Al" },
      { id: "b", sex: "male",   affected: true,  sibOrder: 1, name: "Bob" },
      { id: "c", sex: "female", affected: false, sibOrder: 2 },
      { id: "d", sex: "male",   affected: false, sibOrder: 3 },
      { id: "e", sex: "unknown", affected: false, sibOrder: 4 },
    ],
    partnerships: [{
      id: "p", individual1: "f", individual2: "m",
      twins: [{ members: ["a", "b"], zygosity: "monozygotic" }, { members: ["c", "d"], zygosity: "unknown" }],
    }],
    parentOf: { p: ["a", "b", "c", "d", "e"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

describe("twin fork geometry (#11)", () => {
  const kids = [
    { x: 0,   y: 120, twinSet: "t", zygosity: "monozygotic" as const },
    { x: 80,  y: 120, twinSet: "t", zygosity: "monozygotic" as const },
    { x: 160, y: 120 },
  ];

  it("twins' drops start from one shared point on the bar", () => {
    const segs = sibshipSegments(80, 0, 0, kids);
    const half = NODE_SIZE / 2;
    expect(segs[2]).toEqual([40, 60, 0, 120 - half]);
    expect(segs[3]).toEqual([40, 60, 80, 120 - half]);
    expect(segs[4]).toEqual([160, 60, 160, 120 - half]);
  });

  it("monozygotic: a bar between the midpoints of the two drops; unknown: a question mark", () => {
    const [mark] = twinForkMarks(0, kids);
    expect(mark).toEqual({ kind: "bar", segment: [20, 80, 60, 80] });
    const q = twinForkMarks(0, kids.map(k => (k.twinSet ? { ...k, zygosity: "unknown" as const } : k)));
    expect(q).toEqual([{ kind: "question", x: 40, y: 80 }]);
    expect(twinForkMarks(0, kids.map(k => (k.twinSet ? { ...k, zygosity: "dizygotic" as const } : k)))).toEqual([]);
  });

  it("a lone member is not a fork", () => {
    const segs = sibshipSegments(80, 0, 0, [kids[0]!, kids[2]!]);
    expect(segs[2]).toEqual([0, 60, 0, 120 - NODE_SIZE / 2]);
  });
});

describe("twins on the canvas and in exports (#11)", () => {
  it("layoutToFlow tags twin nodes and the drawing is lint-clean", () => {
    const p = pedigree();
    const flow = layoutToFlow(p);
    expect(lintFlow(p, flow)).toEqual([]);
    const byId = new Map(flow.nodes.map(n => [n.data.individual.id, n.data]));
    expect(byId.get("a")!.twinSet).toBe("p:0");
    expect(byId.get("b")!.zygosity).toBe("monozygotic");
    expect(byId.get("d")!.twinSet).toBe("p:1");
    expect(byId.get("e")!.twinSet).toBeUndefined();
    // Twins sit side by side.
    const x = (id: string) => flow.nodes.find(n => n.data.individual.id === id)!.position.x;
    expect(Math.abs(x("a") - x("b"))).toBeCloseTo(80);
    expect(Math.abs(x("c") - x("d"))).toBeCloseTo(80);
  });

  it("SVG export draws the ? and the key lists both kinds", () => {
    const p = pedigree();
    const svg = exportSvg(p);
    expect(svg).toContain(">?</text>");
    const key = renderExportKeySvg(p, 0, 0).markup.join("");
    expect(key).toContain("Monozygotic twins");
    expect(key).toContain("Twins, zygosity unknown");
    expect(key).not.toContain("Dizygotic twins");
    expect([...zygositiesInUse(p)]).toEqual(["monozygotic", "unknown"]);
  });

  it("CSV carries zygosity and co-twin ids", () => {
    const line = exportCsv(pedigree()).split("\n").find(l => l.includes('"a"'))!;
    expect(line).toMatch(/"monozygotic","b",/);
  });

  it("JSON round trip keeps the sets and drops a set naming a non-child with a warning", () => {
    const p = pedigree();
    const ok = importJson(exportJson(p, { title: "t" }));
    expect(ok.pedigree!.partnerships[0]!.twins).toEqual(p.partnerships[0]!.twins);
    p.partnerships[0]!.twins!.push({ members: ["e", "f"], zygosity: "dizygotic" });
    const r = importJson(exportJson(p, { title: "t" }));
    expect(r.hasErrors).toBe(false);
    expect(r.issues.some(i => i.severity === "warning" && /Twin set dropped/.test(i.message))).toBe(true);
    expect(r.pedigree!.partnerships[0]!.twins).toHaveLength(2);
  });
});

describe("twin rules (#11)", () => {
  it("twinSetProblem explains each refusal", () => {
    const p = pedigree();
    expect(twinSetProblem(p, "p", ["a"], "dizygotic")).toMatch(/at least two/);
    expect(twinSetProblem(p, "p", ["a", "f"], "dizygotic")).toMatch(/same couple/);
    expect(twinSetProblem(p, "p", ["c", "e"], "monozygotic")).toMatch(/same sex/);
    expect(twinSetProblem(p, "p", ["d", "e"], "dizygotic")).toBeNull();
    expect(twinMembership(p).size).toBe(4);
  });
});

describe("setTwins / removeTwin / setSex (#11)", () => {
  const store = () => usePedigreeStore.getState();
  const sets = () => store().pedigree.partnerships[0]!.twins;
  const sex = (id: string) => store().pedigree.individuals.find(i => i.id === id)!.sex;
  beforeEach(() => {
    store().initialize(pedigree());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("makes a set in sibling order and moves members out of other sets", () => {
    expect(store().setTwins("p", ["e", "d"], "dizygotic")).toBeNull();
    // c's set lost d and is dropped; the new set is ordered d, e.
    expect(sets()).toEqual([
      { members: ["a", "b"], zygosity: "monozygotic" },
      { members: ["d", "e"], zygosity: "dizygotic" },
    ]);
  });

  it("refuses with a message and changes nothing", () => {
    const before = store().past.length;
    expect(store().setTwins("p", ["c", "e"], "monozygotic")).toMatch(/same sex/);
    expect(store().past.length).toBe(before);
  });

  it("changes zygosity of an existing set in place", () => {
    store().setTwins("p", ["a", "b"], "dizygotic");
    expect(sets()!.find(t => t.members.includes("a"))!.zygosity).toBe("dizygotic");
  });

  it("removeTwin drops a pair's set entirely, and deleting a twin does too", () => {
    store().removeTwin("a");
    expect(sets()).toEqual([{ members: ["c", "d"], zygosity: "unknown" }]);
    store().deleteIndividual("c");
    expect(sets()).toBeUndefined();
  });

  it("setSex on a monozygotic twin changes the co-twin; not for unknown zygosity", () => {
    store().setSex("a", "female");
    expect([sex("a"), sex("b")]).toEqual(["female", "female"]);
    store().setSex("c", "male");
    expect([sex("c"), sex("d")]).toEqual(["male", "male"]);
    store().setSex("c", "female");
    expect([sex("c"), sex("d")]).toEqual(["female", "male"]);
  });

  it("is undoable", () => {
    store().setTwins("p", ["d", "e"], "dizygotic");
    store().undo();
    expect(sets()).toEqual(pedigree().partnerships[0]!.twins);
  });
});
