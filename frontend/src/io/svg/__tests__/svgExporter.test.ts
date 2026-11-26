import { describe, it, expect } from "vitest";
import { EXAMPLES } from "../../../data/examples";
import { exportSvg } from "../svgExporter";
import { lintExport, parseExportSvg } from "../exportLint";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../../fixtures/consanguineous";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE, ROW_HEIGHT, SLOT_WIDTH } from "../../../pedigree/constants";
import { lossTrianglePoints } from "../../../pedigree/lifeStatus";

function makePedigree(overrides: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals: [],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...overrides,
  };
}

/**
 * The markup of the people alone: the page background is a <rect>, and the
 * marker, labels and key have fills of their own, so a test of what a symbol
 * draws has to look here and not at the whole file.
 */
const symbolsOf = (svg: string) => svg.match(/<g class="symbols">\n([^]*?)\n<\/g>\n<g class="labels">/)![1]!;
const one = (ind: Partial<Pedigree["individuals"][number]>) =>
  makePedigree({ individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, ...ind }] });

// ── Structural / shape tests ──────────────────────────────────────────────────

describe("exportSvg — symbol shapes", () => {
  it.each([["male", "rect"], ["female", "circle"], ["unknown", "polygon"]] as const)(
    "a %s person is drawn as a <%s> and nothing else", (sex, element) => {
      const drawn = [...symbolsOf(exportSvg(one({ sex }))).matchAll(/<(rect|circle|polygon|path|line)\b/g)].map(m => m[1]);
      expect(drawn).toEqual([element]);
    });

  it("empty pedigree → an SVG with no symbols", () => {
    const svg = exportSvg(makePedigree());
    expect(svg).toContain("<svg");
    expect(parseExportSvg(svg).symbols).toEqual([]);
  });
});

// ── Fill tests ────────────────────────────────────────────────────────────────

describe("exportSvg — symbol fills", () => {
  it("the symbol is filled black for an affected person and white otherwise", () => {
    const fills = (svg: string) => [...symbolsOf(svg).matchAll(/fill="([^"]+)"/g)].map(m => m[1]);
    expect(fills(exportSvg(one({ affected: true })))).toEqual(["black"]);
    expect(fills(exportSvg(one({ affected: false })))).toEqual(["white"]);
  });

  it("carrier individual → SVG contains carrier dot circle", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, carrier: true, sibOrder: 0 }],
    });
    // Carrier dot (NSGC 2008): a circle at the centre of the square, well inside it.
    const dot = symbolsOf(exportSvg(p)).match(/<circle cx="20" cy="20" r="([\d.]+)" fill="black"/);
    expect(Number(dot?.[1])).toBeGreaterThan(0);
    expect(Number(dot?.[1])).toBeLessThan(NODE_SIZE / 4);
  });
});

// ── Tag tests ─────────────────────────────────────────────────────────────────

describe("exportSvg — tags", () => {
  const tags = [
    { id: "t1", label: "Tremor", color: "#000000", style: "quadrant" as const },
    { id: "t2", label: "Seizures", color: "#d62728", style: "quadrant" as const },
    { id: "s1", label: "Sequenced", color: "#2ca02c", style: "dot" as const },
    { id: "g1", label: "Expansion", color: "#ff7f0e", style: "text" as const, abbrev: "exp/+" },
  ];

  it("quadrant tag → clipPath plus a coloured sector path, and a legend row", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, tags: ["t2"] }],
      tags,
    });
    const svg = exportSvg(p);
    expect(svg).toContain("<clipPath");
    expect(svg).toContain('fill="#d62728"');
    expect(svg).toContain(">Seizures</text>");
    expect(svg).not.toContain(">Tremor</text>"); // defined but unused: not in the key
  });

  it("dot and text tags → annotation row under the symbol", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "female", affected: false, sibOrder: 0, tags: ["s1", "g1"] }],
      tags,
    });
    const svg = exportSvg(p);
    expect(svg).toContain('fill="#2ca02c"');
    expect(svg).toContain(">exp/+</text>");
    expect(svg).not.toContain("<clipPath"); // no quadrant tag on anyone
  });

  it("tags grow the canvas to fit the legend", () => {
    const base = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0 }],
    });
    const tagged = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, tags: ["t1"] }],
      tags,
    });
    const h = (svg: string) => Number(svg.match(/height="(\d+)"/)![1]);
    expect(h(exportSvg(tagged))).toBeGreaterThan(h(exportSvg(base)));
  });

  it("de-identified export keeps tags", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, name: "Bob", tags: ["t1"] }],
      tags,
    });
    const svg = exportSvg(p, { deidentify: true });
    expect(svg).not.toContain("Bob");
    expect(svg).toContain(">Tremor</text>");
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

// ── Pregnancy / loss symbols (NSGC 2008) ─────────────────────────────────────

describe("exportSvg, pregnancy and pregnancy loss", () => {
  // Symbols are drawn in their box, from (0, 0) to (40, 40).
  const TRIANGLE = `points="${lossTrianglePoints(NODE_SIZE)}"`;
  // The symbol only: the export key, which now lists pregnancies and losses
  // too, is a separate <g class="pedigree-key"> at the end.
  const one = (ind: Partial<Pedigree["individuals"][number]>) => exportSvg(makePedigree({
    individuals: [{ id: "i1", sex: "female", affected: false, sibOrder: 0, ...ind }],
  })).replace(/<g class="pedigree-key"[^]*$/, "");

  it("pregnancy → sex symbol with a P inside", () => {
    const svg = one({ sex: "male", lifeStatus: "pregnancy" });
    expect(svg).toContain("<rect");
    expect(svg).toMatch(/<text[^>]*>P<\/text>/);
    expect(svg).not.toContain(TRIANGLE);
  });

  it("miscarriage → small triangle instead of the sex symbol", () => {
    const svg = one({ sex: "female", lifeStatus: "miscarriage" });
    expect(svg).toContain(TRIANGLE);
    expect(svg).not.toContain("<circle cx=\"20\" cy=\"20\" r=\"19\"");
    expect(svg).not.toContain("<text");
  });

  it("termination → triangle plus a slash line through it", () => {
    const svg = one({ lifeStatus: "termination" });
    expect(svg).toContain(TRIANGLE);
    expect(svg).toMatch(new RegExp(`${TRIANGLE.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}[^]*?<line`));
  });

  it("stillbirth → sex symbol, slash and an SB caption above the name", () => {
    const svg = one({ sex: "male", lifeStatus: "stillbirth", name: "Baby" });
    expect(svg).toContain("<rect");
    expect(svg).toMatch(/<line[^>]*x1="-\d/);           // deceased-style slash
    expect(svg).toMatch(/<text[^>]*>SB<\/text>/);
    expect(svg.indexOf(">SB<")).toBeLessThan(svg.indexOf("Baby"));
  });

  it("ectopic → triangle with an ECT caption", () => {
    const svg = one({ lifeStatus: "ectopic" });
    expect(svg).toContain(TRIANGLE);
    expect(svg).toMatch(/<text[^>]*>ECT<\/text>/);
  });

  it("a caption adds a label line to the canvas height", () => {
    const plain = one({ sex: "male" });
    const sb    = one({ sex: "male", lifeStatus: "stillbirth" });
    const h = (s: string) => parseInt(s.match(/height="(\d+)"/)![1]);
    expect(h(sb)).toBeGreaterThan(h(plain));
  });

  it("quadrant tags on a loss triangle are clipped to the triangle", () => {
    const svg = exportSvg(makePedigree({
      individuals: [{ id: "i1", sex: "female", affected: false, sibOrder: 0, lifeStatus: "miscarriage", tags: ["q"] }],
      tags: [{ id: "q", label: "Anomaly", color: "#d62728", style: "quadrant" }],
    }));
    const clip = svg.match(/<clipPath id="[^"]+">(.*?)<\/clipPath>/)!;
    expect(clip[1]).toContain(TRIANGLE);
    expect(svg).toContain('fill="#d62728"');
  });

  it("stacks the caption, then the tag row, then the name below the symbol", () => {
    const svg = exportSvg(makePedigree({
      individuals: [{ id: "i1", sex: "male", affected: false, sibOrder: 0, lifeStatus: "stillbirth", name: "Baby", tags: ["d"] }],
      tags: [{ id: "d", label: "Sequenced", color: "#2ca02c", style: "dot" }],
    }));
    // The caption and the dot are drawn in the symbol's box; the name in a
    // group translated to the symbol's centre, so 20 lower in that box.
    const captionY = Number(svg.match(/<text x="[\d.-]+" y="([\d.-]+)"[^>]*>SB<\/text>/)![1]);
    const dotY = Number(svg.match(/<circle cx="[^"]*" cy="([\d.-]+)" r="3.5" fill="#2ca02c"/)![1]);
    const nameY = Number(svg.match(/<text[^>]*y="([\d.]+)"[^>]*>Baby<\/text>/)![1]) + NODE_SIZE / 2;
    expect(dotY - 3.5).toBeGreaterThan(captionY);
    expect(nameY - 10).toBeGreaterThan(dotY + 3.5);
  });
});

// ── Relationship line tests ───────────────────────────────────────────────────

describe("exportSvg — relationship lines", () => {
  it("nuclear family → a line for each couple and each sibship, joined to the people", () => {
    const svg = exportSvg(simpleFamily);
    const parsed = parseExportSvg(svg);
    expect(parsed.couples).toHaveLength(simpleFamily.partnerships.length);
    const families = Object.values(simpleFamily.parentOf).filter(kids => kids.length > 0);
    expect(svg.match(/<g class="sibship-lines">\n(.*)\n<\/g>/)![1]!.match(/<path /g)).toHaveLength(families.length);
    expect(lintExport(simpleFamily)).toEqual([]);
  });

  it("consanguineous family → the related couple's line is drawn twice, one above the other", () => {
    const lines = parseExportSvg(exportSvg(consanguineousFamily)).couples;
    const [x1, x2] = [(l: number[][]) => l[0]![0], (l: number[][]) => l[l.length - 1]![0]];
    // Gaps between lines over the same stretch; other couples are a row or more away.
    const gaps = lines.flatMap((a, i) => lines.slice(i + 1).filter(b => x1(a) === x1(b) && x2(a) === x2(b)).map(b => Math.abs(a[0]![1]! - b[0]![1]!)));
    expect(gaps.filter(gap => gap > 0 && gap < NODE_SIZE / 4)).toHaveLength(1);
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

  it("individual with DOB → SVG contains <text> with the year of birth only", () => {
    const p = makePedigree({
      individuals: [{ id: "i1", sex: "female", affected: false, sibOrder: 0, dob: "1985-06-15" }],
    });
    const svg = exportSvg(p);
    expect(svg).toContain(">b. 1985<");
    expect(svg).not.toContain("1985-06-15");
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

// ── Compact option ────────────────────────────────────────────────────────────

describe("exportSvg: compact option", () => {
  /** Centre of every rendered symbol, in slot order, from its translate(x y). */
  function symbolCentres(svg: string): { x: number; y: number }[] {
    return parseExportSvg(svg).symbols.map(([x, y]) => ({ x, y }));
  }
  function rowYs(svg: string): number[] {
    return [...new Set(symbolCentres(svg).map((c) => c.y))].sort((a, b) => a - b);
  }
  function dims(svg: string): { w: number; h: number } {
    const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
  }

  it("default keeps generation rows ROW_HEIGHT apart", () => {
    const rows = rowYs(exportSvg(simpleFamily));
    expect(rows).toHaveLength(3);
    expect(rows[1] - rows[0]).toBeCloseTo(ROW_HEIGHT);
  });

  it("compact=true places generation rows 70% of ROW_HEIGHT apart", () => {
    const rows = rowYs(exportSvg(simpleFamily, { compact: true }));
    expect(rows).toHaveLength(3);
    expect(rows[1] - rows[0]).toBeCloseTo(ROW_HEIGHT * 0.7);
    expect(rows[2] - rows[1]).toBeCloseTo(ROW_HEIGHT * 0.7);
  });

  it("compact=true narrows slot spacing to 85% of the default", () => {
    const bottomRowXs = (svg: string) => {
      const cs = symbolCentres(svg);
      const bottom = Math.max(...cs.map((c) => c.y));
      return cs.filter((c) => c.y === bottom).map((c) => c.x).sort((a, b) => a - b);
    };
    // Bottom row of simpleFamily: three children one slot apart.
    const nx = bottomRowXs(exportSvg(simpleFamily));
    const cx = bottomRowXs(exportSvg(simpleFamily, { compact: true }));
    expect(nx).toHaveLength(3);
    expect(cx).toHaveLength(3);
    expect(nx[1] - nx[0]).toBeCloseTo(SLOT_WIDTH);
    expect(cx[1] - cx[0]).toBeCloseTo(SLOT_WIDTH * 0.85);
    expect(cx[2] - cx[1]).toBeCloseTo(SLOT_WIDTH * 0.85);
  });

  it("compact=true produces a smaller SVG than the default", () => {
    const n = dims(exportSvg(simpleFamily));
    const c = dims(exportSvg(simpleFamily, { compact: true }));
    expect(c.w).toBeLessThan(n.w);
    expect(c.h).toBeLessThan(n.h);
  });

  it("compact=true scales a pinned position by the same factors", () => {
    // i1 (first symbol) is at pos 1 → x = SLOT_WIDTH, y = 0 at normal spacing.
    // i6 is pinned below everyone else; measure it relative to i1 so the
    // export offset cancels out.
    const pinned: Pedigree = {
      ...simpleFamily,
      pinnedPositions: { i6: { x: 300, y: 250 } },
    };
    const rel = (svg: string) => {
      const cs = symbolCentres(svg);
      const founder = cs[0];
      const pin = cs.reduce((a, b) => (b.y > a.y ? b : a));
      return { dx: pin.x - founder.x, dy: pin.y - founder.y };
    };
    const n = rel(exportSvg(pinned));
    const c = rel(exportSvg(pinned, { compact: true }));
    expect(n.dx).toBeCloseTo(300 - SLOT_WIDTH);
    expect(n.dy).toBeCloseTo(250);
    expect(c.dx).toBeCloseTo((300 - SLOT_WIDTH) * 0.85);
    expect(c.dy).toBeCloseTo(250 * 0.7);
  });
});

describe("exportSvg: someone drawn twice", () => {
  // Double first cousins: kinship2 draws a1 once with his parents and once
  // beside his wife b2.
  const ind = (id: string, sex: "male" | "female") => ({ id, sex, affected: false, sibOrder: 0 });
  const dfc: Pedigree = {
    individuals: [ind("A1", "male"), ind("A2", "female"), ind("B1", "male"), ind("B2", "female"),
                  ind("a1", "male"), ind("a2", "female"), ind("b1", "male"), ind("b2", "female"),
                  ind("Y", "female"), ind("X", "male")],
    partnerships: [
      { id: "pA", individual1: "A1", individual2: "A2" },
      { id: "pB", individual1: "B1", individual2: "B2" },
      { id: "p1", individual1: "b1", individual2: "a2" },
      { id: "p2", individual1: "a1", individual2: "b2" },
    ],
    parentOf: { pA: ["a1", "a2"], pB: ["b1", "b2"], p1: ["Y"], p2: ["X"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };

  it("draws both copies joined by one dashed arc, as on the canvas", () => {
    const svg = exportSvg(dfc);
    expect(parseExportSvg(svg).symbols).toHaveLength(11);
    const arcs = svg.match(/<g class="duplicate-arcs">([\s\S]*?)<\/g>/)![1]!;
    expect(arcs.match(/stroke-dasharray/g)).toHaveLength(1);
    // The key explains the arc (#124).
    expect(svg.match(/<g class="pedigree-key"[\s\S]*Same person drawn more than once/)).not.toBeNull();
  });
});

describe("exportSvg — duplicate copies", () => {
  it("numbers every copy of someone drawn twice, as the canvas does", () => {
    const uncleNiece = EXAMPLES.find(e => e.label === "Uncle-niece")!.data;
    const marks = [...exportSvg(uncleNiece).matchAll(/data-copy-number="(\d+)"/g)].map(m => m[1]);
    expect(marks.sort()).toEqual(["1", "2"]);
  });
});

describe("the export draws from the canvas's layout data (#143)", () => {
  it("svgExporter.tsx imports only types from the layout engine and never lays out itself", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "../svgExporter.tsx"), "utf8");
    const engine = [...source.matchAll(/^import ([^;]*?) from "@pedigree-editor\/layout-engine";/gms)].map(m => m[1]!.trim());
    expect(engine.length).toBeGreaterThan(0);
    expect(engine.filter(i => !i.startsWith("type "))).toEqual([]);
    expect(source).not.toMatch(/alignPedigree|resolveCouple|buildPartnerSet/);
  });
});
