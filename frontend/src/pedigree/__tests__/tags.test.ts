import { describe, it, expect } from "vitest";
import type { Pedigree, Tag } from "@pedigree-editor/layout-engine";
import {
  sectorAngles, sectorsFor, sectorPath, annotationRow, tagsInUse, tagsOf,
  nextTagColor, TAG_PALETTE, renderTagLegendSvg, renderSectorsSvg, hasAnnotationRow,
  renderExportKeySvg, needsAffectedCore, renderAffectedCoreSvg,
} from "../tags";

const tremor: Tag   = { id: "t1", label: "Tremor", color: "#000000", style: "quadrant" };
const seizure: Tag  = { id: "t2", label: "Tonic-clonic seizures", color: "#d62728", style: "quadrant" };
const myoclonic: Tag = { id: "t3", label: "Myoclonic seizures", color: "#1f77b4", style: "quadrant" };
const focal: Tag    = { id: "t4", label: "Focal seizures", color: "#f2c80f", style: "quadrant" };
const sequenced: Tag = { id: "s1", label: "Sequenced", color: "#2ca02c", style: "dot" };
const genotype: Tag = { id: "g1", label: "FAME3 expansion", color: "#ff7f0e", style: "text", abbrev: "exp/+" };

function makePedigree(tags: Tag[], indTags: Record<string, string[]> = {}): Pedigree {
  return {
    individuals: [
      { id: "a", sex: "male",   affected: false, sibOrder: 0, tags: indTags["a"] },
      { id: "b", sex: "female", affected: false, sibOrder: 1, tags: indTags["b"] },
    ],
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    tags,
  };
}

describe("sectorAngles", () => {
  it("the first four quadrant tags get fixed quarters, upper left first then clockwise", () => {
    expect(sectorAngles(0)).toEqual([270, 360]);
    expect(sectorAngles(1)).toEqual([0, 90]);
    expect(sectorAngles(2)).toEqual([90, 180]);
    expect(sectorAngles(3)).toEqual([180, 270]);
  });

  it("a fifth or later tag has no fixed quarter (whole swatch)", () => {
    expect(sectorAngles(4)).toEqual([0, 360]);
  });
});

describe("sectorsFor", () => {
  it("returns only the quadrant tags the individual carries, keeping their slot", () => {
    const p = makePedigree([tremor, sequenced, seizure, myoclonic], { a: ["t3", "s1"] });
    const sectors = sectorsFor(p.individuals[0]!, p);
    expect(sectors).toHaveLength(1);
    expect(sectors[0]!.tag.id).toBe("t3");
    // t3 is the third quadrant tag (dot tag does not take a slot): lower right
    expect([sectors[0]!.start, sectors[0]!.end]).toEqual([90, 180]);
  });

  it("ignores ids that no longer exist", () => {
    const p = makePedigree([tremor], { a: ["t1", "gone"] });
    expect(sectorsFor(p.individuals[0]!, p)).toHaveLength(1);
    expect(tagsOf(p.individuals[0]!, p).map(t => t.id)).toEqual(["t1"]);
  });

  it("with five quadrant tags, people with only the first four keep their quarters", () => {
    const fifth: Tag = { id: "t5", label: "Fifth", color: "#9467bd", style: "quadrant" };
    const p = makePedigree([tremor, seizure, myoclonic, focal, fifth], { a: ["t2", "t4"], b: ["t1", "t5"] });
    const a = sectorsFor(p.individuals[0]!, p).map(x => [x.tag.id, x.start, x.end]);
    expect(a).toEqual([["t2", 0, 90], ["t4", 180, 270]]);
    // b carries the fifth tag: their own quadrant tags become equal slices, no empty wedges.
    const b = sectorsFor(p.individuals[1]!, p).map(x => [x.tag.id, x.start, x.end]);
    expect(b).toEqual([["t1", 0, 180], ["t5", 180, 360]]);
  });

  it("is empty when the individual has no tags", () => {
    const p = makePedigree([tremor, seizure]);
    expect(sectorsFor(p.individuals[0]!, p)).toEqual([]);
  });
});

describe("sectorPath", () => {
  it("builds a closed wedge from the centre", () => {
    const d = sectorPath(20, 20, 40, 0, 90);
    expect(d.startsWith("M 20 20 L 20 -20 A 40 40 0 0 1 60 20 Z")).toBe(true);
  });

  it("uses the large-arc flag for sectors over 180 degrees", () => {
    expect(sectorPath(0, 0, 10, 0, 270)).toContain("A 10 10 0 1 1");
  });

  it("draws a full disc for 360 degrees", () => {
    const d = sectorPath(0, 0, 10, 0, 360);
    expect(d.match(/A 10 10/g)).toHaveLength(2);
  });
});

describe("annotationRow", () => {
  it("lays dot and text tags out as a centred row in tag order", () => {
    const p = makePedigree([genotype, tremor, sequenced], { a: ["s1", "g1", "t1"] });
    const row = annotationRow(p.individuals[0]!, p);
    expect(row.map(i => i.tag.id)).toEqual(["g1", "s1"]);
    const left = row[0]!.x - row[0]!.width / 2;
    const right = row[1]!.x + row[1]!.width / 2;
    expect(left).toBeCloseTo(-right, 5);
    expect(hasAnnotationRow(p.individuals[0]!, p)).toBe(true);
    expect(hasAnnotationRow(p.individuals[1]!, p)).toBe(false);
  });
});

describe("tagsInUse", () => {
  it("lists only applied tags, in pedigree order", () => {
    const p = makePedigree([tremor, seizure, focal, sequenced], { a: ["s1"], b: ["t1", "s1"] });
    expect(tagsInUse(p).map(t => t.id)).toEqual(["t1", "s1"]);
  });
});

describe("nextTagColor", () => {
  it("the first tag gets a visible colour, not black", () => {
    expect(nextTagColor([]).toLowerCase()).not.toBe("#000000");
  });

  it("skips colours already taken", () => {
    expect(nextTagColor([])).toBe(TAG_PALETTE[0]);
    const first: Tag = { ...tremor, color: TAG_PALETTE[0]! };
    const second: Tag = { ...seizure, color: TAG_PALETTE[1]! };
    expect(nextTagColor([first])).toBe(TAG_PALETTE[1]);
    expect(nextTagColor([first, second])).toBe(TAG_PALETTE[2]);
  });
});

describe("string SVG rendering", () => {
  it("renders one clipped path per sector in the tag colour", () => {
    const p = makePedigree([tremor, seizure], { a: ["t1", "t2"] });
    const svg = renderSectorsSvg(p.individuals[0]!, p, 40, "clip-x");
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('fill="#d62728"');
    expect(svg).toContain('clip-path="url(#clip-x)"');
  });

  it("legend block has a row per tag in use and escapes labels", () => {
    const weird: Tag = { id: "w", label: "A & B <c>", color: "#000", style: "dot" };
    const p = makePedigree([tremor, weird, seizure], { a: ["w", "t2"] });
    const legend = renderTagLegendSvg(p, 10, 10);
    expect(legend.markup).toHaveLength(2);
    expect(legend.height).toBeGreaterThan(0);
    expect(legend.markup.join("")).toContain("A &amp; B &lt;c&gt;");
    expect(legend.markup.join("")).not.toContain("Tremor");
  });

  it("text tags in the key leave a gap before their label", () => {
    const p = makePedigree([genotype], { a: ["g1"] });
    const row = renderTagLegendSvg(p, 0, 0).markup.join("");
    const xs = [...row.matchAll(/<text x="([\d.]+)"/g)].map(m => parseFloat(m[1]!));
    // swatch text starts at 0 and is about 5 characters of 9px bold; the label starts past it
    expect(xs[0]).toBe(0);
    expect(xs[1]!).toBeGreaterThanOrEqual("exp/+".length * 5.2 + 4);
  });

  it("export key lists Affected, Carrier and Deceased before the tags", () => {
    const p = makePedigree([tremor], { a: ["t1"] });
    p.individuals[0]!.affected = true;
    p.individuals[1]!.carrier = true;
    p.individuals[1]!.deceased = true;
    const key = renderExportKeySvg(p, 0, 0);
    const labels = key.markup.map(m => [...m.matchAll(/>([^<>]+)<\/text>/g)].map(x => x[1]).pop());
    expect(labels).toEqual(["Affected", "Affected, with tags (black centre)", "Carrier", "Deceased", "Tremor"]);
    expect(key.height).toBe(5 * 20);
  });

  it("export key is empty with no status and no tags", () => {
    expect(renderExportKeySvg(makePedigree([tremor]), 0, 0).markup).toEqual([]);
  });

  it("legend is empty when no tag is applied", () => {
    const p = makePedigree([tremor]);
    expect(renderTagLegendSvg(p, 0, 0)).toEqual({ markup: [], width: 0, height: 0 });
  });
});

describe("affected core", () => {
  it("is drawn only for affected people with quadrant sectors", () => {
    const p = makePedigree([tremor, seizure, myoclonic, focal], { a: ["t1", "t2", "t3", "t4"], b: ["t1"] });
    const [a, b] = p.individuals as [Pedigree["individuals"][0], Pedigree["individuals"][0]];
    expect(needsAffectedCore(a, sectorsFor(a, p))).toBe(false);
    a.affected = true;
    expect(needsAffectedCore(a, sectorsFor(a, p))).toBe(true);
    b.affected = true;
    b.tags = [];
    expect(needsAffectedCore(b, sectorsFor(b, p))).toBe(false);
  });

  it("renders a scaled black copy of the outline", () => {
    const svg = renderAffectedCoreSvg(`<rect x="-20" y="-20" width="40" height="40"`);
    expect(svg).toContain('transform="scale(0.55)"');
    expect(svg).toContain('fill="black"');
  });
});
