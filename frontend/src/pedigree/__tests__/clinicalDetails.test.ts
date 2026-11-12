import { describe, it, expect, beforeEach } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { clinicalDetailLines, wrapText } from "../clinicalDetails";
import { renderExportKeySvg, renderClinicalDetailsSvg } from "../tags";
import { simpleFamily } from "../../fixtures/simpleFamily";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { deidentify } from "../../io/svg/deidentify";
import { importJson } from "../../io/json/importer";
import { exportJson } from "../../io/json/exporter";
import { usePedigreeStore } from "../../store/usePedigreeStore";

const details = {
  referralReason: "Family history of breast & ovarian cancer",
  recordedBy: "J. Counsellor, GC",
  recordedOn: "2026-11-12",
  historian: "Proband and her mother",
  maternalAncestry: "Ashkenazi Jewish",
  paternalAncestry: "  ",
};

const withDetails = (p: Pedigree): Pedigree => ({ ...p, clinicalDetails: { ...details } });

describe("clinical key fields (#102)", () => {
  it("lists only filled fields, trimmed, in display order", () => {
    const lines = clinicalDetailLines(withDetails(simpleFamily));
    expect(lines.map(l => l.label)).toEqual([
      "Reason for referral", "Maternal ancestry", "Historian", "Recorded by", "Date",
    ]);
    expect(clinicalDetailLines(simpleFamily)).toEqual([]);
    expect(clinicalDetailLines({ clinicalDetails: { historian: "" } })).toEqual([]);
  });

  it("wraps long text at spaces and splits overlong words", () => {
    expect(wrapText("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrapText("  ", 4)).toEqual([]);
  });

  it("adds escaped text rows to the export key only when filled", () => {
    const empty = renderClinicalDetailsSvg(simpleFamily, 0, 0);
    expect(empty.height).toBe(0);
    const block = renderClinicalDetailsSvg(withDetails(simpleFamily), 0, 0);
    expect(block.markup.join("")).toContain("breast &amp; ovarian");
    expect(block.markup.join("")).not.toContain("Paternal ancestry");
    const without = renderExportKeySvg(simpleFamily, 0, 0);
    const withKey = renderExportKeySvg(withDetails(simpleFamily), 0, 0);
    expect(withKey.height).toBeGreaterThan(without.height);
    expect(withKey.markup.join("")).toContain('class="clinical-details"');
  });

  it("draws the key on a pedigree with no symbol rows", () => {
    const lone: Pedigree = {
      individuals: [{ id: "a", sex: "male", affected: false, sibOrder: 0 }],
      partnerships: [], parentOf: {}, siblingOrder: { mode: "insertion", affectedFirst: false },
      clinicalDetails: { historian: "Self" },
    };
    const key = renderExportKeySvg(lone, 0, 0);
    expect(key.height).toBeGreaterThan(0);
    expect(exportSvg(lone)).toContain("Historian:");
  });

  it("appears in both SVG exporters and in neither when de-identified", () => {
    const p = withDetails(simpleFamily);
    for (const svg of [exportSvg(p), exportUShapeSvg(p)]) {
      expect(svg).toContain("Reason for referral:");
      expect(svg).toContain("J. Counsellor");
    }
    for (const svg of [exportSvg(p, { deidentify: true }), exportUShapeSvg(p, { deidentify: true })]) {
      expect(svg).not.toContain("clinical-details");
      expect(svg).not.toContain("Counsellor");
      expect(svg).not.toContain("Ashkenazi");
    }
    expect(deidentify(p).clinicalDetails).toBeUndefined();
  });

  it("survives a JSON round trip and rejects a non-string field", () => {
    const p = withDetails(simpleFamily);
    const back = importJson(exportJson(p, { title: "t" }));
    expect(back.pedigree?.clinicalDetails).toEqual(details);
    const bad = JSON.parse(exportJson(p, { title: "t" }));
    bad.pedigree.clinicalDetails.historian = 3;
    expect(importJson(JSON.stringify(bad)).hasErrors).toBe(true);
  });
});

describe("setClinicalDetail", () => {
  beforeEach(() => usePedigreeStore.getState().initialize(structuredClone(simpleFamily)));

  it("sets, clears and drops the empty block, one undo step each", () => {
    const s = usePedigreeStore.getState;
    s().setClinicalDetail("historian", "Mother");
    expect(s().pedigree.clinicalDetails).toEqual({ historian: "Mother" });
    s().setClinicalDetail("historian", " ");
    expect(s().pedigree.clinicalDetails).toBeUndefined();
    s().undo();
    expect(s().pedigree.clinicalDetails).toEqual({ historian: "Mother" });
  });
});
