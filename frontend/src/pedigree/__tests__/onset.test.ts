import { describe, it, expect, beforeEach } from "vitest";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { onsetsOf, onsetSubject } from "../onset";
import { onsetLines, detailLines } from "../labels";
import { exportSvg } from "../../io/svg/svgExporter";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { exportCsv } from "../../io/csv/exporter";
import { importJson, exportJson } from "../../io/json";

function pedigree(): Pedigree {
  return {
    individuals: [
      { id: "a", sex: "female", affected: true, sibOrder: 0, tags: ["bc", "dna"] },
      { id: "b", sex: "male", affected: false, sibOrder: 1 },
    ],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    tags: [
      { id: "bc", label: "Breast cancer", abbrev: "BC", color: "#d62728", style: "quadrant" },
      { id: "oc", label: "Ovarian cancer", color: "#1f77b4", style: "quadrant" },
      { id: "dna", label: "DNA", color: "#2ca02c", style: "dot" },
    ],
  };
}

describe("onsetsOf (#93)", () => {
  it("lists the affected onset first, then condition tags in pedigree order", () => {
    const ped = pedigree();
    ped.individuals[0]!.onset = " 40s ";
    ped.individuals[0]!.tagOnset = { bc: "45y" };
    const items = onsetsOf(ped.individuals[0]!, ped);
    expect(onsetLines(ped.individuals[0]!, ped, 74)).toEqual(["onset 40s", "BC 45y"]);
    expect(items.map(onsetSubject)).toEqual(["Affected", "Breast cancer"]);
  });

  it("ignores values that no longer apply", () => {
    const ped = pedigree();
    const b = ped.individuals[1]!;
    b.onset = "30y";                               // not affected
    b.tagOnset = { bc: "45y" };                    // does not carry the tag
    expect(onsetsOf(b, ped)).toEqual([]);
    const a = ped.individuals[0]!;
    a.tagOnset = { dna: "2020", oc: "50y", bc: "  " }; // dot tag, tag not carried, blank
    expect(onsetsOf(a, ped)).toEqual([]);
  });

  it("loads a pedigree saved before onset existed", () => {
    expect(onsetsOf(pedigree().individuals[0]!, pedigree())).toEqual([]);
  });
});

describe("onset under the symbol (#93)", () => {
  it("follows the age or DOB line", () => {
    const ped = pedigree();
    Object.assign(ped.individuals[0]!, { dob: "1950-01-01", tagOnset: { bc: "45y" } });
    expect(detailLines(ped.individuals[0]!, 74, ped)).toEqual(["1950-01-01", "BC 45y"]);
  });

  it("cuts the tag text, not the age, when the line is too wide", () => {
    const ped = pedigree();
    ped.tags![0]!.abbrev = undefined;
    ped.individuals[0]!.tagOnset = { bc: "45y" };
    const [line] = onsetLines(ped.individuals[0]!, ped, 74);
    expect(line).toMatch(/^Breast.*… 45y$/);
    expect(line!.length * 5.8).toBeLessThanOrEqual(74);
  });

  it("is drawn in the SVG export", () => {
    const ped = pedigree();
    Object.assign(ped.individuals[0]!, { onset: "40s", tagOnset: { bc: "45y" } });
    const svg = exportSvg(ped);
    expect(svg).toContain(">onset 40s</text>");
    expect(svg).toContain(">BC 45y</text>");
  });
});

describe("store setOnset (#93)", () => {
  const get = () => usePedigreeStore.getState();
  const ind = (id: string) => get().pedigree.individuals.find(i => i.id === id)!;
  beforeEach(() => get().initialize(pedigree()));

  it("sets and clears the affected onset and a tag onset", () => {
    get().setOnset("a", null, "40s");
    get().setOnset("a", "bc", "45y");
    expect(ind("a").onset).toBe("40s");
    expect(ind("a").tagOnset).toEqual({ bc: "45y" });
    get().setOnset("a", null, "");
    get().setOnset("a", "bc", " ");
    expect(ind("a").onset).toBeUndefined();
    expect(ind("a").tagOnset).toBeUndefined();
  });

  it("is undoable", () => {
    get().setOnset("a", "bc", "45y");
    get().undo();
    expect(ind("a").tagOnset).toBeUndefined();
  });

  it("drops the onset with the tag or the affected status", () => {
    get().setOnset("a", null, "40s");
    get().setOnset("a", "bc", "45y");
    get().setIndividualTag("a", "bc", false);
    expect(ind("a").tagOnset).toBeUndefined();
    get().setAffected("a", false);
    expect(ind("a").onset).toBeUndefined();
  });

  it("drops onsets of a deleted tag", () => {
    get().setOnset("a", "bc", "45y");
    get().deleteTag("bc");
    expect(ind("a").tagOnset).toBeUndefined();
  });
});

describe("onset in exports (#93)", () => {
  it("writes an onset column to the CSV", () => {
    const ped = pedigree();
    ped.individuals[0]!.onset = "40s";
    ped.individuals[0]!.tagOnset = { bc: "45y" };
    const [header, rowA, rowB] = exportCsv(ped).split("\n");
    expect(header!.split(",").at(-1)).toBe("onset");
    expect(rowA!.split(",").at(-1)).toBe('"Affected: 40s;Breast cancer: 45y"');
    expect(rowB!.split(",").at(-1)).toBe('""');
  });

  it("round-trips through JSON", () => {
    const ped = pedigree();
    ped.individuals[0]!.onset = "40s";
    ped.individuals[0]!.tagOnset = { bc: "45y" };
    const back = importJson(exportJson(ped));
    expect(back.pedigree?.individuals[0]).toMatchObject({ onset: "40s", tagOnset: { bc: "45y" } });
  });

  it("rejects a tagOnset that is not a map of strings", () => {
    const ped = pedigree() as unknown as { individuals: Record<string, unknown>[] };
    ped.individuals[0]!.tagOnset = { bc: 45 };
    const result = importJson(exportJson(ped as unknown as Pedigree));
    expect(result.pedigree).toBeNull();
  });
});
