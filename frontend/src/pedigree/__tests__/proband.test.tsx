import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { arrowKind, arrowGeometry, ARROW_LEGEND_LABEL } from "../proband";
import { ProbandArrow } from "../nodes/symbols";
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
      { id: "f", sex: "male", affected: false, sibOrder: 0 },
      { id: "m", sex: "female", affected: false, sibOrder: 1 },
      { id: "c1", sex: "male", affected: true, sibOrder: 0, proband: true },
      { id: "c2", sex: "female", affected: false, sibOrder: 1, consultand: true },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c1", "c2"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const PROBAND_P = /<text class="proband-letter"[^>]*>P<\/text>/g;

describe("proband and consultand arrows (#99)", () => {
  it("the proband wins over the consultand", () => {
    expect(arrowKind({ proband: true })).toBe("proband");
    expect(arrowKind({ proband: true, consultand: true })).toBe("proband");
    expect(arrowKind({ consultand: true })).toBe("consultand");
    expect(arrowKind({})).toBeUndefined();
  });

  it("puts the P below-left of the arrow's tail", () => {
    const { tip, tail, letter } = arrowGeometry(40);
    expect(tip).toEqual({ x: 0, y: 40 });
    expect(tail.x).toBeLessThan(tip.x);
    expect(tail.y).toBeGreaterThan(tip.y);
    expect(letter.x).toBeLessThan(tail.x);
    expect(letter.y).toBeGreaterThan(tail.y);
  });

  it("draws the P on the canvas for the proband only", () => {
    const proband = renderToStaticMarkup(<svg><ProbandArrow size={40} kind="proband" /></svg>);
    const consultand = renderToStaticMarkup(<svg><ProbandArrow size={40} kind="consultand" /></svg>);
    expect(proband).toContain(">P</text>");
    expect(proband).toContain("marker-end");
    expect(consultand).not.toContain("<text");
    expect(consultand).toContain("marker-end");
  });

  it("draws one P and two arrows in the SVG and U-shape exports, which lint clean", () => {
    const svg = exportSvg(family());
    expect(svg.match(PROBAND_P)).toHaveLength(1);
    expect(svg.match(/marker-end="url\(#proband-arrowhead\)"/g)).toHaveLength(2);
    expect(lintExport(family())).toEqual([]);
    const u = exportUShapeSvg(family());
    expect(u.match(PROBAND_P)).toHaveLength(1);
    expect(u.match(/marker-end="url\(#proband-arrowhead\)"/g)).toHaveLength(2);
  });

  it("explains both arrows in the export key, only when used", () => {
    const key = renderExportKeySvg(family(), 0, 0).markup.join("");
    expect(key).toContain(ARROW_LEGEND_LABEL.proband);
    expect(key).toContain(ARROW_LEGEND_LABEL.consultand);
    const none = { ...family(), individuals: family().individuals.map(i => ({ ...i, proband: undefined, consultand: undefined })) };
    const plain = renderExportKeySvg(none, 0, 0).markup.join("");
    expect(plain).not.toContain(ARROW_LEGEND_LABEL.proband);
    expect(plain).not.toContain(ARROW_LEGEND_LABEL.consultand);
  });

  it("round-trips through JSON and has a CSV column", () => {
    const back = importJson(exportJson(family())).pedigree;
    expect(back.individuals.find(i => i.id === "c2")!.consultand).toBe(true);
    const [header, ...rows] = exportCsv(family()).split("\n");
    const col = header!.split(",").indexOf("consultand");
    expect(col).toBe(header!.split(",").length - 1);
    expect(rows.map(r => r.split(",")[col])).toEqual(['"0"', '"0"', '"0"', '"1"']);
  });
});

describe("usePedigreeStore setConsultand", () => {
  const get = () => usePedigreeStore.getState();
  const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id)!;
  beforeEach(() => get().initialize(family()));

  it("toggles the flag, allows several consultands and is one undo step", () => {
    get().setConsultand("c1", true);
    expect(ind("c1").consultand).toBe(true);
    expect(ind("c2").consultand).toBe(true);
    get().setConsultand("c2", false);
    expect(ind("c2").consultand).toBeUndefined();
    expect("consultand" in ind("c2")).toBe(false);
    get().undo();
    expect(ind("c2").consultand).toBe(true);
  });
});
