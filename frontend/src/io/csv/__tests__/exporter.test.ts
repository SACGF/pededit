import { describe, it, expect } from "vitest";
import { exportCsv } from "../exporter";
import type { Pedigree } from "@pedigree-editor/layout-engine";

function makePedigree(overrides: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...overrides,
  };
}

function parseRows(csv: string): Record<string, string>[] {
  const [headerLine, ...dataLines] = csv.split("\n");
  const headers = headerLine!.split(",");
  return dataLines
    .filter(l => l.trim() !== "")
    .map(line => {
      // parse quoted CSV values
      const values: string[] = [];
      let current = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
          else inQuote = !inQuote;
        } else if (ch === "," && !inQuote) {
          values.push(current); current = "";
        } else {
          current += ch;
        }
      }
      values.push(current);
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
    });
}

describe("exportCsv", () => {
  it("exports correct header", () => {
    const ped = makePedigree();
    const csv = exportCsv(ped);
    expect(csv.startsWith("family_id,id,name,sex,dob,affected,deceased,carrier,proband,father_id,mother_id,notes")).toBe(true);
  });

  it("empty pedigree produces only header row", () => {
    const ped = makePedigree();
    const lines = exportCsv(ped).split("\n").filter(l => l.trim() !== "");
    expect(lines).toHaveLength(1);
  });

  it("individual without parents has empty father_id and mother_id", () => {
    const ped = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const rows = parseRows(exportCsv(ped));
    expect(rows[0]!.father_id).toBe("");
    expect(rows[0]!.mother_id).toBe("");
  });

  it("individual with parents has correct father_id and mother_id", () => {
    const ped = makePedigree({
      individuals: [
        { id: "dad",   sex: "male",   affected: false, sibOrder: 0 },
        { id: "mom",   sex: "female", affected: false, sibOrder: 1 },
        { id: "child", sex: "male",   affected: false, sibOrder: 0 },
      ],
      partnerships: [{ id: "p1", individual1: "dad", individual2: "mom" }],
      parentOf: { p1: ["child"] },
    });
    const rows = parseRows(exportCsv(ped));
    const child = rows.find(r => r.id === "child")!;
    expect(child.father_id).toBe("dad");
    expect(child.mother_id).toBe("mom");
  });

  it("notes with commas are escaped as semicolons", () => {
    const ped = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, notes: "note one, note two" }],
    });
    const rows = parseRows(exportCsv(ped));
    expect(rows[0]!.notes).toBe("note one; note two");
  });

  it("affected and deceased flags are encoded as 1/0", () => {
    const ped = makePedigree({
      individuals: [
        { id: "i1", sex: "male",   affected: true,  deceased: true,  sibOrder: 0 },
        { id: "i2", sex: "female", affected: false, deceased: false, sibOrder: 1 },
      ],
    });
    const rows = parseRows(exportCsv(ped));
    expect(rows[0]!.affected).toBe("1");
    expect(rows[0]!.deceased).toBe("1");
    expect(rows[1]!.affected).toBe("0");
    expect(rows[1]!.deceased).toBe("0");
  });

  it("proband flag is encoded as 1/0", () => {
    const ped = makePedigree({
      individuals: [
        { id: "i1", sex: "male",   affected: true,  proband: true,  sibOrder: 0 },
        { id: "i2", sex: "female", affected: false, sibOrder: 1 },
      ],
    });
    const rows = parseRows(exportCsv(ped));
    expect(rows[0]!.proband).toBe("1");
    expect(rows[1]!.proband).toBe("0");
  });

  it("hpo_terms are semicolon-joined", () => {
    const ped = makePedigree({
      individuals: [{
        id: "i1", sex: "male", affected: false, sibOrder: 0,
        hpoTerms: ["HP:0001250", "HP:0002069"],
      }],
    });
    const rows = parseRows(exportCsv(ped));
    expect(rows[0]!.hpo_terms).toBe("HP:0001250;HP:0002069");
  });

  it("hpo_terms is empty string when undefined", () => {
    const ped = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const rows = parseRows(exportCsv(ped));
    expect(rows[0]!.hpo_terms).toBe("");
  });

  it("uses custom familyId when provided", () => {
    const ped = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const rows = parseRows(exportCsv(ped, "CUSTOM_FAM"));
    expect(rows[0]!.family_id).toBe("CUSTOM_FAM");
  });
});
