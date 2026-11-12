import { describe, it, expect, beforeEach } from "vitest";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { endedBreakX, endedMarkSegments, middleTaken, ENDED_STROKE_DX, ENDED_STROKE_DY, ENDED_STROKE_GAP } from "../ended";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport } from "../../io/svg/exportLint";
import { renderExportKeySvg } from "../tags";
import { importJson, exportJson } from "../../io/json";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/** a = b ended with a child e; c = d ended and childless; e has no partner. */
function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "a", sex: "male",   affected: false, sibOrder: 0 },
      { id: "b", sex: "female", affected: false, sibOrder: 1 },
      { id: "e", sex: "female", affected: false, sibOrder: 0 },
      { id: "c", sex: "male",   affected: false, sibOrder: 2 },
      { id: "d", sex: "female", affected: false, sibOrder: 3 },
    ],
    partnerships: [
      { id: "ab", individual1: "a", individual2: "b", ended: true },
      { id: "cd", individual1: "c", individual2: "d", ended: true },
    ],
    parentOf: { ab: ["e"], cd: [] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const markLines = (svg: string) => (svg.match(/<line class="mark"/g) ?? []).length;

describe("ended relationship geometry (#98)", () => {
  it("sits in the middle when nothing hangs there, else halfway to the left end", () => {
    expect(endedBreakX(100, 140, 0, 0, false)).toBe(120);
    expect(endedBreakX(100, 140, 0, 0, true)).toBe(110);
    // A hopping line's run starts `inset` in.
    expect(endedBreakX(100, 300, 30, 10, true)).toBe((110 + 200) / 2);
  });

  it("two parallel strokes rising to the right, centred on the point", () => {
    const [s1, s2] = endedMarkSegments(0, 0);
    const h = ENDED_STROKE_GAP / 2;
    expect(s1).toEqual([-h - ENDED_STROKE_DX, ENDED_STROKE_DY, -h + ENDED_STROKE_DX, -ENDED_STROKE_DY]);
    expect(s2).toEqual([h - ENDED_STROKE_DX, ENDED_STROKE_DY, h + ENDED_STROKE_DX, -ENDED_STROKE_DY]);
  });

  it("the middle is taken by children or an active childless mark", () => {
    const p = pedigree();
    expect(middleTaken(p.partnerships[0]!, p)).toBe(true);
    expect(middleTaken(p.partnerships[1]!, p)).toBe(false);
    p.partnerships[1]!.childless = "byChoice";
    expect(middleTaken(p.partnerships[1]!, p)).toBe(true);
  });
});

describe("ended relationship on the canvas and in exports (#98)", () => {
  it("layoutToFlow flags the ended couples' edges", () => {
    const p = pedigree();
    p.partnerships[1]!.ended = undefined;
    const flow = layoutToFlow(p);
    expect(lintFlow(p, flow)).toEqual([]);
    const data = flow.coupleEdges.map(e => e.data!).sort((x, y) => (x.partnershipId! < y.partnershipId! ? -1 : 1));
    expect(data[0]).toMatchObject({ partnershipId: "ab", ended: true, middleTaken: true });
    expect(data[1]?.ended).toBeUndefined();
  });

  it("the SVG export draws two marks per ended couple, the key has the row, and the lint is clean", () => {
    const p = pedigree();
    const svg = exportSvg(p);
    expect(markLines(svg)).toBe(4);
    expect(renderExportKeySvg(p, 0, 0).markup.join("")).toContain("Relationship ended");
    expect(lintExport(p)).toEqual([]);
    p.partnerships.forEach(x => delete x.ended);
    expect(markLines(exportSvg(p))).toBe(0);
    expect(renderExportKeySvg(p, 0, 0).markup.join("")).not.toContain("Relationship ended");
  });

  it("on a consanguineous double line too", () => {
    const p = pedigree();
    p.partnerships[1]!.consanguineous = true;
    expect(markLines(exportSvg(p))).toBe(4);
  });

  it("the U-shape export draws the strokes", () => {
    const p = pedigree();
    const plain = exportUShapeSvg({ ...p, partnerships: p.partnerships.map(x => ({ ...x, ended: undefined })) });
    const ended = exportUShapeSvg(p);
    const lines = (s: string) => (s.match(/<line /g) ?? []).length;
    expect(lines(ended)).toBeGreaterThan(lines(plain));
  });
});

describe("ended relationship data (#98)", () => {
  beforeEach(() => {
    usePedigreeStore.getState().initialize(pedigree());
  });

  it("the store sets and clears the flag, one undo step each", () => {
    const s = usePedigreeStore.getState();
    s.setPartnershipEnded("cd", false);
    expect(usePedigreeStore.getState().pedigree.partnerships[1]).not.toHaveProperty("ended");
    usePedigreeStore.getState().setPartnershipEnded("cd", true);
    expect(usePedigreeStore.getState().pedigree.partnerships[1]!.ended).toBe(true);
    usePedigreeStore.getState().undo();
    expect(usePedigreeStore.getState().pedigree.partnerships[1]).not.toHaveProperty("ended");
  });

  it("survives a JSON round trip, and a non-boolean is refused", () => {
    const back = importJson(exportJson(pedigree()));
    expect(back.pedigree?.partnerships[0]!.ended).toBe(true);
    const bad = JSON.parse(exportJson(pedigree()));
    bad.pedigree.partnerships[0].ended = "yes";
    expect(importJson(JSON.stringify(bad.pedigree ?? bad)).hasErrors).toBe(true);
  });
});
