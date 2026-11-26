import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LifeStatus, Sex } from "@pedigree-editor/layout-engine";
import { SymbolShape, standaloneGlyph, type SymbolGlyph } from "../chart/symbols";
import { carrierDot, lossTrianglePoints, usesLossTriangle } from "../lifeStatus";
import { person } from "../../fixtures/features";

const SIZE = 40;
const glyphOf = (sex: Sex, extra: Parameters<typeof person>[2] = {}) => standaloneGlyph(person("i1", sex, extra));
const render = (glyph: SymbolGlyph, clipId?: string) => renderToStaticMarkup(<svg><SymbolShape glyph={glyph} size={SIZE} clipId={clipId} /></svg>);

const TRIANGLE = `points="${lossTrianglePoints(SIZE)}"`;

/**
 * What a rendered symbol draws, read back from its markup in one place: the
 * outline ("square", "circle", "diamond" or "triangle"), how many slashes,
 * and the text inside or under it.
 */
function drawn(html: string) {
  const outside = html.replace(/<clipPath[^]*?<\/clipPath>/g, "");
  const outline = outside.includes(TRIANGLE) ? "triangle"
    : /<rect\b/.test(outside) ? "square" : /<circle\b/.test(outside) ? "circle" : /<polygon\b/.test(outside) ? "diamond" : "none";
  const lines = [...outside.matchAll(/<line\b[^>]*stroke="(\w+)"/g)].map(m => m[1]);
  const texts = [...outside.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(m => ({ text: m[2], fill: /fill="(\w+)"/.exec(m[1]!)?.[1] }));
  return { outline, slashes: lines.filter(c => c === "black").length, whiteSlash: lines.includes("white"), texts: texts.map(t => t.text), textFill: texts[0]?.fill };
}

const OUTLINE: Record<Sex, string> = { male: "square", female: "circle", unknown: "diamond" };

describe("glyph: pregnancy and pregnancy loss (NSGC 2008)", () => {
  it("only miscarriage, termination and ectopic replace the sex symbol with the triangle", () => {
    expect((["pregnancy", "miscarriage", "termination", "stillbirth", "ectopic"] as const).filter(usesLossTriangle))
      .toEqual(["miscarriage", "termination", "ectopic"]);
  });

  it("keeps the sex as its shape and carries the status, with SB and ECT as captions", () => {
    const captions: Record<LifeStatus, string | undefined> = { pregnancy: undefined, miscarriage: undefined, termination: undefined, stillbirth: "SB", ectopic: "ECT" };
    for (const [lifeStatus, caption] of Object.entries(captions) as [LifeStatus, string | undefined][]) {
      const g = glyphOf("male", { lifeStatus });
      expect(g, lifeStatus).toMatchObject({ shape: "male", lifeStatus });
      expect(g.caption, lifeStatus).toBe(caption);
    }
    expect(glyphOf("male")).not.toHaveProperty("lifeStatus");
  });

  it("an affected pregnancy or loss is filled black", () => {
    expect(glyphOf("female", { lifeStatus: "pregnancy", affected: true }).paint.base).toBe("black");
    expect(glyphOf("unknown", { lifeStatus: "miscarriage", affected: true }).paint.base).toBe("black");
  });
});

describe("SymbolShape draws the glyph", () => {
  it("the outline: the sex's shape, or the triangle for every sex; the slash, P and caption", () => {
    for (const sex of ["male", "female", "unknown"] as const) {
      expect(drawn(render(glyphOf(sex))), sex).toMatchObject({ outline: OUTLINE[sex], slashes: 0, texts: [] });
      expect(drawn(render(glyphOf(sex, { lifeStatus: "pregnancy" }))), sex).toMatchObject({ outline: OUTLINE[sex], slashes: 0, texts: ["P"] });
      expect(drawn(render(glyphOf(sex, { lifeStatus: "stillbirth" }))), sex).toMatchObject({ outline: OUTLINE[sex], slashes: 1, texts: ["SB"] });
      expect(drawn(render(glyphOf(sex, { lifeStatus: "miscarriage" }))), sex).toMatchObject({ outline: "triangle", slashes: 0, texts: [] });
      expect(drawn(render(glyphOf(sex, { lifeStatus: "termination" }))), sex).toMatchObject({ outline: "triangle", slashes: 1, texts: [] });
      expect(drawn(render(glyphOf(sex, { lifeStatus: "ectopic" }))), sex).toMatchObject({ outline: "triangle", slashes: 0, texts: ["ECT"] });
    }
  });

  it("the P of an affected pregnancy is white on the black fill", () => {
    expect(drawn(render(glyphOf("female", { lifeStatus: "pregnancy", affected: true }))).textFill).toBe("white");
  });

  it("the loss triangle sits inside the symbol box", () => {
    const nums = lossTrianglePoints(SIZE).split(/[ ,]/).map(Number);
    expect(nums.every(n => n > 0 && n < SIZE)).toBe(true);
  });
});

describe("SymbolShape, tags on pregnancy and pregnancy loss", () => {
  const sector = { tag: { id: "q", label: "Anomaly", color: "#d62728", style: "quadrant" as const }, start: 270, end: 360 };
  const tagged = (sex: Sex, lifeStatus: LifeStatus) => ({ ...glyphOf(sex, { lifeStatus }), paint: { sectors: [sector], base: "white" as const, core: false, dot: false } });
  /** The outline the sections are clipped to. */
  const clipOutline = (html: string) => drawn(/<clipPath[^>]*>([^]*?)<\/clipPath>/.exec(html)![1]!).outline;

  it("clips quadrant sectors to the loss triangle", () => {
    const html = render(tagged("female", "ectopic"), "c1");
    expect(clipOutline(html)).toBe("triangle");
    expect(html).toContain("#d62728");
    expect(drawn(html).texts).toEqual(["ECT"]);
  });

  it("keeps sectors on the sex symbol of a pregnancy", () => {
    const html = render(tagged("male", "pregnancy"), "c2");
    expect(clipOutline(html)).toBe("square");
    expect(html).toContain("#d62728");
    expect(drawn(html).texts).toEqual(["P"]);
  });
});

describe("carrier dot and slashes over fill (#13, #14)", () => {
  const dotIn = (html: string) => {
    const m = html.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="black"/);
    return m ? { cx: +m[1]!, cy: +m[2]!, r: +m[3]! } : null;
  };

  it("the symbol draws the dot where carrierDot puts it: the centre when born", () => {
    expect(carrierDot(undefined, SIZE)).toMatchObject({ cx: SIZE / 2, cy: SIZE / 2 });
    for (const lifeStatus of [undefined, "pregnancy", "termination"] as const) {
      expect(dotIn(render(glyphOf("male", { carrier: true, lifeStatus })))).toEqual(carrierDot(lifeStatus, SIZE));
    }
  });

  it("pregnancy carrier: dot below a smaller, raised P, not overlapping it", () => {
    const html = render(glyphOf("male", { carrier: true, lifeStatus: "pregnancy" }));
    const d = carrierDot("pregnancy", SIZE);
    const baseline = +html.match(/<text x="[\d.]+" y="([\d.]+)"/)![1]!;
    expect(d.cy - d.r).toBeGreaterThan(baseline);
    expect(d.cy + d.r).toBeLessThan(SIZE);
  });

  it("loss triangle carrier: dot inside the triangle, clear of the slash", () => {
    const d = carrierDot("termination", SIZE);
    // Slash runs along y = x; keep the dot off it.
    expect(Math.abs(d.cy - d.cx) / Math.SQRT2).toBeGreaterThan(d.r + 1);
  });

  it("affected termination and stillbirth: the slash is redrawn in white inside the fill", () => {
    for (const lifeStatus of ["termination", "stillbirth"] as const) {
      expect(drawn(render(glyphOf("male", { affected: true, lifeStatus }))).whiteSlash, lifeStatus).toBe(true);
    }
    expect(drawn(render(glyphOf("male", { lifeStatus: "stillbirth" }))).whiteSlash).toBe(false);
  });
});
