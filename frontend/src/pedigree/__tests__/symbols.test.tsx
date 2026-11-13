import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SymbolShape } from "../nodes/symbols";
import { lossTrianglePoints } from "../lifeStatus";
import type { Individual } from "@pedigree-editor/layout-engine";

const SIZE = 40;

function render(overrides: Partial<Individual>): string {
  const individual: Individual = { id: "i1", sex: "male", affected: false, sibOrder: 0, ...overrides };
  return renderToStaticMarkup(<svg><SymbolShape individual={individual} size={SIZE} /></svg>);
}

const TRIANGLE = `points="${lossTrianglePoints(SIZE)}"`;

describe("SymbolShape, born individuals (unchanged)", () => {
  it("male is a rect, female a circle, unknown a polygon diamond", () => {
    expect(render({ sex: "male" })).toContain("<rect");
    expect(render({ sex: "female" })).toContain("<circle");
    expect(render({ sex: "unknown" })).toContain("<polygon");
    expect(render({ sex: "unknown" })).not.toContain(TRIANGLE);
  });

  it("draws no text for a born individual", () => {
    expect(render({ sex: "male" })).not.toContain("<text");
  });
});

describe("SymbolShape, pregnancy and pregnancy loss (NSGC 2008)", () => {
  it("pregnancy: sex symbol with a P inside", () => {
    const male = render({ sex: "male", lifeStatus: "pregnancy" });
    expect(male).toContain("<rect");
    expect(male).toMatch(/<text[^>]*>P<\/text>/);
    expect(male).not.toContain(TRIANGLE);

    const female = render({ sex: "female", lifeStatus: "pregnancy" });
    expect(female).toContain("<circle");
    expect(female).toMatch(/<text[^>]*>P<\/text>/);
  });

  it("affected pregnancy: solid fill with the P drawn in white", () => {
    const svg = render({ sex: "female", lifeStatus: "pregnancy", affected: true });
    expect(svg).toMatch(/<circle[^>]*fill="black"/);
    expect(svg).toMatch(/<text[^>]*fill="white"[^>]*>P<\/text>/);
  });

  it("miscarriage: small triangle regardless of sex, no slash, no caption", () => {
    for (const sex of ["male", "female", "unknown"] as const) {
      const svg = render({ sex, lifeStatus: "miscarriage" });
      expect(svg).toContain(TRIANGLE);
      expect(svg).not.toContain("<rect");
      expect(svg).not.toContain("<circle");
      expect(svg).not.toContain("<line");
      expect(svg).not.toContain("<text");
    }
  });

  it("affected miscarriage: filled triangle", () => {
    const svg = render({ sex: "unknown", lifeStatus: "miscarriage", affected: true });
    expect(svg).toMatch(/<polygon[^>]*fill="black"/);
  });

  it("termination: small triangle with a diagonal slash", () => {
    const svg = render({ sex: "female", lifeStatus: "termination" });
    expect(svg).toContain(TRIANGLE);
    expect(svg).toContain("<line");
    expect(svg).not.toContain("<circle");
    expect(svg).not.toContain("<text");
  });

  it("stillbirth: sex symbol with a slash and SB below", () => {
    const svg = render({ sex: "male", lifeStatus: "stillbirth" });
    expect(svg).toContain("<rect");
    expect(svg).toContain("<line");
    expect(svg).toMatch(/<text[^>]*>SB<\/text>/);
    expect(svg).not.toContain(TRIANGLE);
  });

  it("caption={false} (the minimap) keeps the stillbirth slash and drops the SB caption", () => {
    const individual: Individual = { id: "i1", sex: "male", affected: false, sibOrder: 0, lifeStatus: "stillbirth" };
    const svg = renderToStaticMarkup(<svg><SymbolShape individual={individual} size={SIZE} caption={false} /></svg>);
    expect(svg).toContain("<line");
    expect(svg).not.toContain("<text");
  });

  it("stillbirth keeps the sex symbol: female is a circle, unknown a diamond", () => {
    expect(render({ sex: "female",  lifeStatus: "stillbirth" })).toContain("<circle");
    expect(render({ sex: "unknown", lifeStatus: "stillbirth" })).toContain("<polygon");
    expect(render({ sex: "unknown", lifeStatus: "stillbirth" })).not.toContain(TRIANGLE);
  });

  it("ectopic: small triangle with ECT below, no slash", () => {
    const svg = render({ sex: "female", lifeStatus: "ectopic" });
    expect(svg).toContain(TRIANGLE);
    expect(svg).toMatch(/<text[^>]*>ECT<\/text>/);
    expect(svg).not.toContain("<line");
    expect(svg).not.toContain("<circle");
  });

  it("the loss triangle sits inside the symbol box", () => {
    const nums = lossTrianglePoints(SIZE).split(/[ ,]/).map(Number);
    expect(nums.every(n => n > 0 && n < SIZE)).toBe(true);
  });
});

describe("SymbolShape, tags on pregnancy and pregnancy loss", () => {
  const sector = { tag: { id: "q", label: "Anomaly", color: "#d62728", style: "quadrant" as const }, start: 270, end: 360 };

  it("clips quadrant sectors to the loss triangle", () => {
    const html = renderToStaticMarkup(
      <svg><SymbolShape individual={{ id: "i1", sex: "female", affected: false, sibOrder: 0, lifeStatus: "ectopic" }} size={SIZE} paint={{ sectors: [sector], base: "white", core: false, dot: false }} clipId="c1" /></svg>,
    );
    expect(html).toMatch(new RegExp(`<clipPath id="c1"><polygon ${TRIANGLE.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}`));
    expect(html).toContain('fill="#d62728"');
    expect(html).toMatch(/>ECT<\/text>/);
  });

  it("keeps sectors on the sex symbol of a pregnancy", () => {
    const html = renderToStaticMarkup(
      <svg><SymbolShape individual={{ id: "i1", sex: "male", affected: false, sibOrder: 0, lifeStatus: "pregnancy" }} size={SIZE} paint={{ sectors: [sector], base: "white", core: false, dot: false }} clipId="c2" /></svg>,
    );
    expect(html).toMatch(/<clipPath id="c2"><rect/);
    expect(html).toContain('fill="#d62728"');
    expect(html).toMatch(/>P<\/text>/);
  });
});

describe("SymbolShape, carrier dot and slashes over fill (#13, #14)", () => {
  const dot = (html: string) => {
    const m = html.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="black"/);
    return m ? { cx: +m[1], cy: +m[2], r: +m[3] } : null;
  };

  it("born carrier: dot at the centre", () => {
    expect(dot(render({ carrier: true }))).toEqual({ cx: 20, cy: 20, r: 6 });
  });

  it("pregnancy carrier: dot below a smaller, raised P, not overlapping it", () => {
    const html = render({ carrier: true, lifeStatus: "pregnancy" });
    const d = dot(html)!;
    const t = html.match(/<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="([\d.]+)"/)!;
    const baseline = +t[1];
    expect(d.cy - d.r).toBeGreaterThan(baseline);
    expect(d.cy + d.r).toBeLessThan(SIZE);
  });

  it("loss triangle carrier: dot drawn inside the triangle, clear of the slash", () => {
    const d = dot(render({ carrier: true, lifeStatus: "termination" }))!;
    expect(d).not.toBeNull();
    // Slash runs along y = x; keep the dot off it.
    expect(Math.abs(d.cy - d.cx) / Math.SQRT2).toBeGreaterThan(d.r + 1);
  });

  it("affected termination and stillbirth: the slash is redrawn in white inside the fill", () => {
    for (const lifeStatus of ["termination", "stillbirth"] as const) {
      const html = render({ affected: true, lifeStatus });
      expect(html).toMatch(/<line[^>]*stroke="white"[^>]*clip-path="url\(#symbol-clip-i1\)"/);
    }
    expect(render({ lifeStatus: "stillbirth" })).not.toContain('stroke="white"');
  });
});
