import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { familyHistoryMarkAt } from "../familyHistory";
import { FamilyHistoryMark } from "../nodes/symbols";
import { renderExportKeySvg } from "../tags";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport } from "../../io/svg/exportLint";
import { exportCsv } from "../../io/csv/exporter";
import { exportJson, importJson } from "../../io/json";
import { usePedigreeStore } from "../../store/usePedigreeStore";

function family(): Pedigree {
  return {
    individuals: [
      { id: "f", sex: "male", affected: false, sibOrder: 0, familyHistoryUnknown: true },
      { id: "m", sex: "female", affected: false, sibOrder: 1 },
      { id: "c1", sex: "male", affected: true, sibOrder: 0, familyHistoryUnknown: true },
      { id: "c2", sex: "female", affected: false, sibOrder: 1 },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c1", "c2"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const MARK = /<text class="family-history-unknown"[^>]*>\?<\/text>/g;

describe("family history not known (#100)", () => {
  it("puts the ? above the symbol, centred, or left of a line of descent", () => {
    const top = familyHistoryMarkAt(40, false);
    expect(top.y).toBeLessThan(0);
    expect(top.x).toBe(20);
    // A child's drop comes into the top centre, so the ? moves off it.
    expect(familyHistoryMarkAt(40, true).x).toBeLessThan(20 - 6);
  });

  it("draws the ? on the canvas", () => {
    expect(renderToStaticMarkup(<svg><FamilyHistoryMark size={40} hasParents={false} /></svg>)).toContain(">?</text>");
  });

  it("draws one ? per flagged person in both exports, which lint clean", () => {
    expect(exportSvg(family()).match(MARK)).toHaveLength(2);
    expect(lintExport(family())).toEqual([]);
    expect(exportUShapeSvg(family()).match(MARK)).toHaveLength(2);
    const none = { ...family(), individuals: family().individuals.map(i => ({ ...i, familyHistoryUnknown: undefined })) };
    expect(exportSvg(none)).not.toMatch(MARK);
  });

  it("has a row in the export key only when used", () => {
    expect(renderExportKeySvg(family(), 0, 0).markup.join("")).toContain("Family history not known");
    const none = { ...family(), individuals: family().individuals.map(i => ({ ...i, familyHistoryUnknown: undefined })) };
    expect(renderExportKeySvg(none, 0, 0).markup.join("")).not.toContain("Family history");
  });

  it("round-trips through JSON and has a CSV column", () => {
    const back = importJson(exportJson(family())).pedigree;
    expect(back.individuals.find(i => i.id === "f")!.familyHistoryUnknown).toBe(true);
    const [header, ...rows] = exportCsv(family()).split("\n");
    const col = header!.split(",").indexOf("family_history_unknown");
    expect(col).toBe(header!.split(",").indexOf("consultand") + 1);
    expect(rows.map(r => r.split(",")[col])).toEqual(['"1"', '"0"', '"1"', '"0"']);
  });
});

describe("usePedigreeStore setFamilyHistoryUnknown", () => {
  const get = () => usePedigreeStore.getState();
  const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id)!;
  beforeEach(() => get().initialize(family()));

  it("sets and clears the flag as one undo step each", () => {
    get().setFamilyHistoryUnknown("c2", true);
    expect(ind("c2").familyHistoryUnknown).toBe(true);
    get().setFamilyHistoryUnknown("f", false);
    expect("familyHistoryUnknown" in ind("f")).toBe(false);
    get().undo();
    expect(ind("f").familyHistoryUnknown).toBe(true);
  });
});
