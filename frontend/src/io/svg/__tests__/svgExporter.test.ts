import { describe, it, expect } from "vitest";
import { exportSvg } from "../svgExporter";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../../fixtures/consanguineous";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE, ROW_HEIGHT } from "../../../pedigree/constants";

function makePedigree(overrides: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...overrides,
  };
}

// ── Structural / shape tests ──────────────────────────────────────────────────

describe("exportSvg — symbol shapes", () => {
  it("single male individual → SVG contains <rect>", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain("<rect");
  });

  it("single female individual → SVG contains <circle>", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "female", affected: false, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain("<circle");
  });

  it("single unknown individual → SVG contains <polygon>", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "unknown", affected: false, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain("<polygon");
  });

  it("empty pedigree → returns minimal SVG without symbol elements", () => {
    const svg = exportSvg(makePedigree());
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<rect x=");     // no symbol rect
    expect(svg).not.toContain("<circle cx=");  // no symbol circle
    expect(svg).not.toContain("<polygon");
  });
});

// ── Fill tests ────────────────────────────────────────────────────────────────

describe("exportSvg — symbol fills", () => {
  it("affected individual → shape contains fill=\"black\"", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: true, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain('fill="black"');
  });

  it("unaffected individual → shape contains fill=\"white\"", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain('fill="white"');
  });

  it("carrier individual → SVG contains carrier dot circle", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, carrier: true, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    // Carrier dot: <circle cx="0" cy="0" r="...">
    expect(svg).toMatch(/<circle cx="0" cy="0" r="\d/);
  });
});

// ── Overlay tests ─────────────────────────────────────────────────────────────

describe("exportSvg — overlays", () => {
  it("deceased individual → SVG contains diagonal deceased slash line", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, deceased: true, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    // Deceased slash goes from top-left to bottom-right of the symbol
    expect(svg).toMatch(/<line[^>]*x1="-\d/);
  });

  it("proband individual → SVG contains proband arrow line and marker reference", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "female", affected: true, proband: true, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain("marker-end");
    expect(svg).toContain("proband-arrowhead");
  });
});

// ── Relationship line tests ───────────────────────────────────────────────────

describe("exportSvg — relationship lines", () => {
  it("nuclear family → contains couple line element", () => {
    const svg = exportSvg(simpleFamily);
    // A couple line is a horizontal <line> at some y
    expect(svg).toContain("<line");
  });

  it("consanguineous family → contains two parallel couple lines", () => {
    const svg = exportSvg(consanguineousFamily);
    // consanguineousFamily: i3+i4 couple is at level 1 (raw y = ROW_HEIGHT = 120)
    // Double couple lines at y ± CONSANG_GAP/2 = 120 ± 2 = 118 and 122
    expect(svg).toContain('y1="118"');
    expect(svg).toContain('y1="122"');
  });

  it("nuclear family → contains sibship bar and vertical drops", () => {
    const svg = exportSvg(simpleFamily);
    // sibship bar is a horizontal line; vertical drops are vertical lines
    // We can check that there are multiple <line> elements
    const lineMatches = svg.match(/<line /g);
    expect(lineMatches).not.toBeNull();
    expect(lineMatches!.length).toBeGreaterThan(3);
  });
});

// ── Bounds tests ──────────────────────────────────────────────────────────────

describe("exportSvg — bounds", () => {
  it("single individual → viewBox width and height > NODE_SIZE", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    const wMatch = svg.match(/width="(\d+)"/);
    const hMatch = svg.match(/height="(\d+)"/);
    expect(wMatch).not.toBeNull();
    expect(hMatch).not.toBeNull();
    expect(parseInt(wMatch![1])).toBeGreaterThan(NODE_SIZE);
    expect(parseInt(hMatch![1])).toBeGreaterThan(NODE_SIZE);
  });

  it("padding option increases SVG dimensions", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const svgDefault = exportSvg(p, { padding: 40 });
    const svgLarge   = exportSvg(p, { padding: 100 });

    const wDefault = parseInt(svgDefault.match(/width="(\d+)"/)![1]);
    const wLarge   = parseInt(svgLarge.match(/width="(\d+)"/)![1]);
    expect(wLarge).toBeGreaterThan(wDefault);
  });

  it("multi-level family → SVG height > ROW_HEIGHT + NODE_SIZE", () => {
    const svg = exportSvg(simpleFamily);
    const hMatch = svg.match(/height="(\d+)"/);
    expect(hMatch).not.toBeNull();
    expect(parseInt(hMatch![1])).toBeGreaterThan(ROW_HEIGHT + NODE_SIZE);
  });
});

// ── Label tests ───────────────────────────────────────────────────────────────

describe("exportSvg — labels", () => {
  it("individual with name → SVG contains <text> with the name", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, name: "TestName" }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain("TestName");
    expect(svg).toContain("<text");
  });

  it("individual with DOB → SVG contains <text> with DOB", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "female", affected: false, sibOrder: 0, dob: "1985-06-15" }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain("1985-06-15");
  });

  it("XML-special characters in name → escaped correctly", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, name: "A & <B>" }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain("A &amp; &lt;B&gt;");
    expect(svg).not.toContain("A & <B>");
  });

  it("named individuals → each name appears exactly once in SVG", () => {
    // Tests the renderLabels deduplication: seen.has(nid) skips second occurrence
    const p = makePedigree({
      individuals: [
        { id: "i1", sex: "male",   affected: false, sibOrder: 0, name: "Alice" },
        { id: "i2", sex: "female", affected: false, sibOrder: 1, name: "Bob" },
      ],
      partnerships: [{ id: "p1", individual1: "i1", individual2: "i2" }],
      parentOf: {},
    });
    const svg = exportSvg(p);
    expect((svg.match(/Alice/g) ?? []).length).toBe(1);
    expect((svg.match(/Bob/g) ?? []).length).toBe(1);
  });
});

// ── De-identification tests ───────────────────────────────────────────────────

describe("exportSvg — de-identification", () => {
  it("deidentify=true replaces names with I-1 notation", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, name: "John Doe" }],
    });
    const svg = exportSvg(p, { deidentify: true });
    expect(svg).not.toContain("John Doe");
    expect(svg).toContain("I-1");
  });

  it("deidentify=true strips DOB", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "female", affected: false, sibOrder: 0, dob: "1990-01-01" }],
    });
    const svg = exportSvg(p, { deidentify: true });
    expect(svg).not.toContain("1990-01-01");
  });

  it("deidentify=true, ageBuckets=true → DOB replaced with age range string", () => {
    const dob = new Date(Date.now() - 35 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, dob }],
    });
    const svg = exportSvg(p, { deidentify: true, ageBuckets: true });
    expect(svg).not.toContain(dob);
    expect(svg).toContain("30s");
  });
});

// ── Title option ──────────────────────────────────────────────────────────────

describe("exportSvg — title option", () => {
  it("title set → SVG contains title <text> element", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const svg = exportSvg(p, { title: "Family Pedigree" });
    expect(svg).toContain("Family Pedigree");
    expect(svg).toContain('font-weight="bold"');
  });

  it("no title → SVG does not contain font-weight bold text", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const svg = exportSvg(p);
    expect(svg).not.toContain('font-weight="bold"');
  });
});
