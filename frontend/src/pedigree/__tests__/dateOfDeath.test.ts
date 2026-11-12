import { describe, it, expect, beforeEach } from "vitest";
import { ageLines, ageAtDeath, parsePartialDate, detailLines, detailsBacked, labelMaxWidth } from "../labels";
import { layoutToFlow } from "../layoutToFlow";
import { lintFlow } from "../renderLint";
import { SLOT_WIDTH } from "../constants";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport } from "../../io/svg/exportLint";
import { deidentify } from "../../io/svg/deidentify";
import { exportCsv } from "../../io/csv/exporter";
import { exportJson, importJson } from "../../io/json";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";

const max = labelMaxWidth(SLOT_WIDTH);

function family(): Pedigree {
  return {
    individuals: [
      { id: "f", sex: "male", affected: false, deceased: true, sibOrder: 0, name: "Frank", dob: "1935-06-10", dod: "2007-03-14" },
      { id: "m", sex: "female", affected: false, deceased: true, sibOrder: 0, name: "Mary", dob: "1938", dod: "2010" },
      { id: "c1", sex: "female", affected: false, deceased: true, sibOrder: 0, name: "Ann", dod: "1999" },
      { id: "c2", sex: "male", affected: false, sibOrder: 1, name: "Bob", dob: "1962-07-04" },
    ],
    partnerships: [{ id: "p", individual1: "f", individual2: "m" }],
    parentOf: { p: ["c1", "c2"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const ind = (o: Partial<Individual>): Individual => ({ id: "x", sex: "male", affected: false, sibOrder: 0, ...o });

describe("date of death under the symbol (#103)", () => {
  it("parses a year, year-month or full date and nothing else", () => {
    expect(parsePartialDate("2007")).toEqual({ y: 2007 });
    expect(parsePartialDate("2007-03")).toEqual({ y: 2007, m: 3 });
    expect(parsePartialDate("2007-03-14")).toEqual({ y: 2007, m: 3, d: 14 });
    for (const bad of ["07", "2007-13", "2007-3-1", "d. 2007", "2007-03-32", ""]) expect(parsePartialDate(bad)).toBeUndefined();
  });

  it("age at death from full dates, in years, months or days", () => {
    const p = (s: string) => parsePartialDate(s)!;
    expect(ageAtDeath(p("1935-06-10"), p("2007-03-14"))).toBe("71y");
    expect(ageAtDeath(p("1935-06-10"), p("2007-06-10"))).toBe("72y");
    expect(ageAtDeath(p("2007-01-20"), p("2007-05-19"))).toBe("3 mo");
    expect(ageAtDeath(p("2007-01-20"), p("2007-01-25"))).toBe("5 d");
    expect(ageAtDeath(p("2006-12-20"), p("2007-01-02"))).toBe("13 d");
    expect(ageAtDeath(p("1935"), p("2007-03-14"))).toBeUndefined();
    expect(ageAtDeath(p("2007-03-14"), p("2001-01-01"))).toBeUndefined();
  });

  it("chooses age at death, the year of death, or both years", () => {
    expect(ageLines(ind({ deceased: true, dob: "1935-06-10", dod: "2007-06-10" }))).toEqual(["d. 72y"]);
    expect(ageLines(ind({ deceased: true, dob: "1935", dod: "2007" }))).toEqual(["b. 1935", "d. 2007"]);
    expect(ageLines(ind({ deceased: true, dob: "1935-06-10", dod: "2007" }))).toEqual(["b. 1935", "d. 2007"]);
    expect(ageLines(ind({ deceased: true, dod: "2007-03" }))).toEqual(["d. 2007"]);
    expect(ageLines(ind({ deceased: true }))).toEqual([]);
    // The free-text age wins.
    expect(ageLines(ind({ deceased: true, dob: "1935", dod: "2007", age: "d. 70s" }))).toEqual(["d. 70s"]);
    // Not deceased, or not a date: no death line.
    expect(ageLines(ind({ dob: "1935", dod: "2007" }))).toEqual(["b. 1935"]);
    expect(ageLines(ind({ deceased: true, dob: "1935", dod: "spring 2007" }))).toEqual(["b. 1935"]);
  });

  it("two age lines get the white backing; one does not", () => {
    const ped = family();
    const [f, m, c1] = ped.individuals;
    expect(detailLines(m!, max, ped)).toEqual(["b. 1938", "d. 2010"]);
    expect(detailsBacked(m!, max, ped)).toBe(true);
    expect(detailLines(f!, max, ped)).toEqual(["d. 71y"]);
    expect(detailsBacked(f!, max, ped)).toBe(false);
    expect(detailsBacked(c1!, max, ped)).toBe(false);
  });

  it("canvas, SVG and U-shape draw it, and the lints stay clean", () => {
    const flow = layoutToFlow(family());
    const data = (id: string) => flow.nodes.find(n => n.data.individual.id === id)!.data;
    expect(data("f").detailLines).toEqual(["d. 71y"]);
    expect(data("m").detailLines).toEqual(["b. 1938", "d. 2010"]);
    expect(data("c1").detailLines).toEqual(["d. 1999"]);
    expect(lintFlow(family(), flow)).toEqual([]);
    const svg = exportSvg(family());
    for (const t of ["d. 71y", "b. 1938", "d. 2010", "d. 1999"]) expect(svg).toContain(`>${t}</text>`);
    expect(svg).not.toContain("2007-03-14");
    expect(lintExport(family())).toEqual([]);
    expect(exportUShapeSvg(family())).toContain(">d. 71y</text>");
  });

  it("de-identification drops the date of death; age ranges give the range at death", () => {
    const d = deidentify(family(), { ageBuckets: true });
    expect(d.individuals.every(i => i.dod === undefined)).toBe(true);
    expect(d.individuals.find(i => i.id === "f")!.dob).toBe("d. 70s");
    expect(d.individuals.find(i => i.id === "m")!.dob).toBe("d. 70s");
    const plain = deidentify(family());
    expect(plain.individuals.every(i => i.dod === undefined && i.dob === undefined)).toBe(true);
    const svg = exportSvg(family(), { deidentify: true });
    expect(svg).not.toContain("2007");
    expect(svg).not.toContain("1999");
  });

  it("CSV has a dod column at the end, and JSON round-trips it", () => {
    const [header, ...rows] = exportCsv(family()).split("\n");
    const cols = header!.split(",");
    expect(cols.indexOf("dod")).toBeGreaterThan(cols.indexOf("gender_identity"));
    expect(rows.map(r => r.split(",")[cols.indexOf("dod")])).toEqual(['"2007-03-14"', '"2010"', '"1999"', '""']);
    const back = importJson(exportJson(family(), { title: "x" }));
    expect(back.hasErrors).toBe(false);
    expect(back.pedigree!.individuals.map(i => i.dod)).toEqual(["2007-03-14", "2010", "1999", undefined]);
    const bad = family();
    (bad.individuals[0] as unknown as Record<string, unknown>).dod = 2007;
    expect(importJson(JSON.stringify(bad)).hasErrors).toBe(true);
  });
});

describe("store: deceased and date of death (#103)", () => {
  const store = () => usePedigreeStore.getState();
  const find = (id: string) => store().pedigree.individuals.find(i => i.id === id)!;
  beforeEach(() => store().initialize(family()));

  it("a date of death ticks deceased", () => {
    store().setDateOfDeath("c2", "2020");
    expect(find("c2").deceased).toBe(true);
    expect(find("c2").dod).toBe("2020");
  });

  it("clearing the date keeps deceased (date unknown)", () => {
    store().setDateOfDeath("f", undefined);
    expect("dod" in find("f")).toBe(false);
    expect(find("f").deceased).toBe(true);
  });

  it("unticking deceased clears the date, and undo brings both back", () => {
    store().setDeceased("f", false);
    expect(find("f").deceased).toBe(false);
    expect("dod" in find("f")).toBe(false);
    store().undo();
    expect(find("f").deceased).toBe(true);
    expect(find("f").dod).toBe("2007-03-14");
  });
});
