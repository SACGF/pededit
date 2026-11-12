import { describe, it, expect } from "vitest";
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";
import { toRoman } from "../numbering";
import { layoutToFlow, pedigreeNumbers } from "../layoutToFlow";
import { nameLabelText } from "../labels";
import { exportCsv } from "../../io/csv/exporter";
import { exportSvg } from "../../io/svg/svgExporter";
import { exportUShapeSvg } from "../../io/svg/uShapeExporter";
import { lintExport } from "../../io/svg/exportLint";

const person = (id: string, sex: Individual["sex"], sibOrder: number, name?: string): Individual =>
  ({ id, sex, affected: false, sibOrder, ...(name ? { name } : {}) });

/**
 *   gf = gm
 *   ├ a = wa  → a1, a2
 *   ├ b
 *   └ c = wc  → c1
 */
function family(extra: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [
      person("gf", "male", 0, "Grandpa"), person("gm", "female", 1, "Grandma"),
      person("a", "male", 0, "Al"), person("b", "female", 1, "Bea"), person("c", "male", 2, "Cy"),
      person("wa", "female", 3), person("wc", "female", 4),
      person("a1", "male", 0, "Ann"), person("a2", "female", 1), person("c1", "male", 0),
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm" },
      { id: "pa", individual1: "a", individual2: "wa" },
      { id: "pc", individual1: "c", individual2: "wc" },
    ],
    parentOf: { g: ["a", "b", "c"], pa: ["a1", "a2"], pc: ["c1"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...extra,
  };
}

const withNumbers = (p: Pedigree): Pedigree => ({
  ...p, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, showNumbers: true },
});

describe("toRoman", () => {
  it("writes generations past X as Roman numerals", () => {
    expect([1, 4, 9, 10, 11, 14, 19, 40, 90, 2024].map(toRoman))
      .toEqual(["I", "IV", "IX", "X", "XI", "XIV", "XIX", "XL", "XC", "MMXXIV"]);
  });

  it("numbers a twelve generation line I to XII", () => {
    const individuals: Individual[] = [];
    const partnerships: Pedigree["partnerships"] = [];
    const parentOf: Pedigree["parentOf"] = {};
    for (let g = 0; g < 12; g++) {
      individuals.push(person(`m${g}`, "male", 0));
      if (g < 11) {
        individuals.push(person(`w${g}`, "female", 1));
        partnerships.push({ id: `p${g}`, individual1: `m${g}`, individual2: `w${g}` });
        parentOf[`p${g}`] = [`m${g + 1}`];
      }
    }
    const numbers = pedigreeNumbers({ individuals, partnerships, parentOf, siblingOrder: { mode: "insertion", affectedFirst: false } });
    expect(numbers.get("m0")).toMatch(/^I-/);
    expect(numbers.get("m10")).toMatch(/^XI-/);
    expect(numbers.get("m11")).toBe("XII-1");
  });
});

describe("pedigreeNumbers", () => {
  it("numbers each generation left to right as drawn, with no gaps", () => {
    const p = family();
    const numbers = pedigreeNumbers(p);
    expect(numbers.size).toBe(p.individuals.length);
    const flow = layoutToFlow(p);
    const byLevel = new Map<number, { x: number; id: string }[]>();
    for (const n of flow.nodes) {
      const level = Number(n.id.split("-")[0]);
      byLevel.set(level, [...(byLevel.get(level) ?? []), { x: n.position.x, id: n.data.individual.id }]);
    }
    for (const [level, row] of byLevel) {
      row.sort((a, b) => a.x - b.x);
      expect(row.map(r => numbers.get(r.id))).toEqual(row.map((_, k) => `${toRoman(level + 1)}-${k + 1}`));
    }
    expect(numbers.get("gf")).toBe("I-1");
    expect(numbers.get("gm")).toBe("I-2");
  });

  it("renumbers people to the right when a sibling is added", () => {
    const before = pedigreeNumbers(family());
    const p = family();
    p.individuals.push(person("new", "female", 0.5));
    p.parentOf.g = ["a", "new", "b", "c"];
    p.individuals.find(i => i.id === "b")!.sibOrder = 1;
    const after = pedigreeNumbers(p);
    expect(after.get("a")).toBe(before.get("a"));
    expect(after.get("c")).not.toBe(before.get("c"));
    expect(after.size).toBe(before.size + 1);
  });

  it("numbers only drawn people when descendants are hidden (#94)", () => {
    const p = family();
    p.individuals.find(i => i.id === "a")!.descendantsHidden = true;
    const numbers = pedigreeNumbers(p);
    for (const id of ["a1", "a2"]) expect(numbers.has(id)).toBe(false);
    // Generation III is just c1, with no gap left by a1 and a2.
    expect(numbers.get("c1")).toBe("III-1");
    expect([...numbers.values()].filter(n => n.startsWith("II-")).sort())
      .toEqual(["II-1", "II-2", "II-3", "II-4", "II-5"]);
  });

  it("is empty for an empty pedigree", () => {
    expect(pedigreeNumbers({ ...family(), individuals: [], partnerships: [], parentOf: {} }).size).toBe(0);
  });
});

describe("labels with numbers", () => {
  it("puts the number before the name, or alone for an unnamed person", () => {
    const numbers = new Map([["x", "II-3"]]);
    expect(nameLabelText(person("x", "male", 0, "Jo"), numbers)).toBe("II-3 Jo");
    expect(nameLabelText(person("x", "male", 0), numbers)).toBe("II-3");
    expect(nameLabelText(person("x", "male", 0, "Jo"), undefined)).toBe("Jo");
  });

  it("draws the number on the canvas only when the setting is on", () => {
    const off = layoutToFlow(family());
    expect(off.nodes.find(n => n.data.individual.id === "gf")!.data.nameLines).toEqual(["Grandpa"]);
    const on = layoutToFlow(withNumbers(family()));
    const gf = on.nodes.find(n => n.data.individual.id === "gf")!;
    expect(gf.data.labelText).toBe("I-1 Grandpa");
    expect(gf.data.nameLines.join(" ")).toBe("I-1 Grandpa");
    const a2 = on.nodes.find(n => n.data.individual.id === "a2")!;
    expect(a2.data.nameLines).toEqual([pedigreeNumbers(family()).get("a2")]);
  });

  it("draws the numbers in the SVG and U-shape exports, and they lint clean", () => {
    const p = withNumbers(family());
    const svg = exportSvg(p);
    expect(svg).toContain(">I-1 Grandpa<");
    expect(exportSvg(family())).not.toContain("I-1");
    expect(lintExport(p)).toEqual([]);
    expect(exportUShapeSvg(p)).toContain(">I-1 Grandpa<");
  });

  it("does not repeat the number in a de-identified export", () => {
    const svg = exportSvg(withNumbers(family()), { deidentify: true });
    expect(svg).toContain(">I-1<");
    expect(svg).not.toContain("I-1 I-1");
  });
});

describe("CSV pedigree_number column", () => {
  it("gives every drawn person their number and hidden people a blank", () => {
    const p = family();
    p.individuals.find(i => i.id === "a")!.descendantsHidden = true;
    const [header, ...rows] = exportCsv(p).split("\n");
    const col = header!.split(",").indexOf("pedigree_number");
    expect(col).toBeGreaterThan(0);
    const numbers = pedigreeNumbers(p);
    const byId = new Map(rows.map(r => {
      const cells = r.split(",").map(c => c.replace(/^"|"$/g, ""));
      return [cells[1]!, cells[col]!];
    }));
    expect(byId.get("gf")).toBe("I-1");
    expect(byId.get("a1")).toBe("");
    expect(byId.get("a2")).toBe("");
    expect(byId.get("c1")).toBe(numbers.get("c1"));
    // Present whether or not the figure shows the numbers.
    expect(exportCsv(withNumbers(family())).split("\n")[1]).toContain('"I-1"');
  });
});
