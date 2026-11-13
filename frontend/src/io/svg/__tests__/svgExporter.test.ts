import { describe, it, expect } from "vitest";
import { EXAMPLES } from "../../../data/examples";
import { exportSvg } from "../svgExporter";
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
  const half = NODE_SIZE / 2;
  const TRIANGLE = `points="${lossTrianglePoints(NODE_SIZE, -half, -half)}"`;
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
    expect(svg).not.toContain("<circle cx=\"0\" cy=\"0\" r=\"19\"");
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
    const caption = svg.match(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>SB<\/text>/)!;
    const captionY = Number(caption[2]);
    const dotY = Number(svg.match(/<circle cx="[^"]*" cy="([\d.-]+)" r="3.5" fill="#2ca02c"/)![1]);
    const nameY = Number(svg.match(/<text[^>]*y="([\d.]+)"[^>]*>Baby<\/text>/)![1]);
    // The dot is drawn in the symbol's local frame (centre at 0,0); the
    // caption and name are absolute. Compare via the symbol centre.
    const centreY = Number(svg.match(new RegExp(`<g transform="translate\\(${caption[1]} ([\\d.-]+)\\)">`))![1]);
    expect(centreY + dotY - 3.5).toBeGreaterThan(captionY);
    expect(nameY - 10).toBeGreaterThan(centreY + dotY + 3.5);
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
    expect(svg).toMatch(/<path d="M [\d.]+ 118 L [\d.]+ 118"/);
    expect(svg).toMatch(/<path d="M [\d.]+ 122 L [\d.]+ 122"/);
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

// ── Compact option ────────────────────────────────────────────────────────────

describe("exportSvg: compact option", () => {
  /** Centre of every rendered symbol, in slot order, from its translate(x y). */
  function symbolCentres(svg: string): { x: number; y: number }[] {
    return [...svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)">\n<(?:rect|circle|polygon)/g)]
      .map((m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }));
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
    const shapes = svg.match(/<g transform="translate\([^)]+\)">\n<(?:rect|circle|polygon)/g) ?? [];
    expect(shapes).toHaveLength(11);
    const arcs = svg.match(/<g class="duplicate-arcs">([\s\S]*?)<\/g>/)![1]!;
    expect(arcs.match(/stroke-dasharray/g)).toHaveLength(1);
    // The key explains the arc (#124).
    expect(svg.match(/<g class="pedigree-key"[\s\S]*Same person drawn more than once/)).not.toBeNull();
  });
});

describe("exportSvg — duplicate copies", () => {
  it("numbers every copy of someone drawn twice, as the canvas does", () => {
    const uncleNiece = EXAMPLES.find(e => e.label === "Uncle-niece")!.data;
    const marks = [...exportSvg(uncleNiece).matchAll(/font-size="10" fill="black">(\d+)<\/text>/g)].map(m => m[1]);
    expect(marks.sort()).toEqual(["1", "2"]);
  });
});
