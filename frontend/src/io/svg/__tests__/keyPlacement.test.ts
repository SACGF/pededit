import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../data/examples";
import { exportSvg } from "../svgExporter";
import { exportUShapeSvg } from "../uShapeExporter";
import { KEY_POSITIONS, keyPlacementProblems, keyPositionOf, placeKey, chooseKeyPlace, drawnBoxes } from "../keyPlacement";
import type { SvgExportOptions } from "../types";

// #241: the key in a corner of the figure, in the chart's free space.

const height = (svg: string) => Number(/height="(\d+)"/.exec(svg)![1]);
const keyBox = (svg: string) => /data-box="([^"]*)"/.exec(svg)?.[1]!.split(" ").map(Number) as [number, number, number, number] | undefined;
const example = (label: string) => EXAMPLES.find(e => e.label === label)!.data;
type Exporter = (p: Parameters<typeof exportSvg>[0], o?: SvgExportOptions) => string;
const exporters: [string, Exporter][] = [["standard", exportSvg], ["U-shape", exportUShapeSvg]];
/** The height the key's band under the chart took before corners: the figure without a key, plus the key and half the padding. */
const bandHeight = (exp: Exporter, p: Parameters<typeof exportSvg>[0], svg: string) => height(exp(p, { key: false })) + keyBox(svg)![3] + 20;

describe("placeKey", () => {
  const figure = { width: 400, height: 300 }, key = { width: 100, height: 60 };
  it("sits against the edge when the free space holds it, and grows by the shortfall when it does not", () => {
    // Something drawn down to y 150 over the left: 300 - 40 - (150 + 20) = 90 free.
    const roomy = placeKey([{ x1: 40, y1: 40, x2: 200, y2: 150 }], figure, key, 40, "bottom-left");
    expect(roomy).toMatchObject({ x: 40, y: 200, growTop: 0, growBottom: 0 });
    // Down to y 200: 40 free, 20 short.
    const short = placeKey([{ x1: 40, y1: 40, x2: 200, y2: 200 }], figure, key, 40, "bottom-left");
    expect(short).toMatchObject({ growBottom: 20, y: 220 });
    // Nothing over the right side: no growth there.
    expect(placeKey([{ x1: 40, y1: 40, x2: 200, y2: 250 }], figure, key, 40, "bottom-right")).toMatchObject({ x: 260, growBottom: 0 });
  });

  it("grows the top for a top corner, and picks the corner that grows least, bottom left on a tie", () => {
    const boxes = [{ x1: 40, y1: 40, x2: 360, y2: 260 }];
    expect(placeKey(boxes, figure, key, 40, "top-left")).toMatchObject({ y: 40, growTop: 80 });
    expect(chooseKeyPlace(boxes, figure, key, 40).position).toBe("bottom-left");
    const freeTopRight = [{ x1: 40, y1: 40, x2: 200, y2: 260 }, { x1: 200, y1: 150, x2: 360, y2: 260 }];
    expect(chooseKeyPlace(freeTopRight, figure, key, 40).position).toBe("top-right");
  });

  it("boxes turned text where it lands", () => {
    const [b] = drawnBoxes(`<svg><g transform="translate(100 100) rotate(90)"><text x="0" y="0" text-anchor="middle" font-size="10">abcdefghij</text></g></svg>`);
    expect(b!.x2 - b!.x1).toBeLessThan(b!.y2 - b!.y1);
  });
});

describe("the key in every example (#241)", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.label}: overlaps nothing at any corner, and the best corner is no taller than the band was`, () => {
      for (const [, exp] of exporters) {
        const best = exp(ex.data);
        if (!keyBox(best)) continue;
        expect(keyPlacementProblems(best)).toEqual([]);
        expect(height(best)).toBeLessThanOrEqual(bandHeight(exp, ex.data, best));
        for (const keyPosition of KEY_POSITIONS) {
          const svg = exp(ex.data, { keyPosition });
          expect(keyPositionOf(svg)).toBe(keyPosition);
          expect(keyPlacementProblems(svg), keyPosition).toEqual([]);
        }
      }
    });
  }

  it("House Targaryen: any corner costs no height", () => {
    const p = example("House Targaryen");
    const bare = height(exportSvg(p, { key: false }));
    for (const keyPosition of KEY_POSITIONS) expect(height(exportSvg(p, { keyPosition })), keyPosition).toBe(bare);
  });

  it("Queen Victoria: the best corner costs much less than the band under the chart", () => {
    const p = example("Queen Victoria · haemophilia B");
    const svg = exportSvg(p);
    expect(height(svg) - height(exportSvg(p, { key: false }))).toBeLessThan((bandHeight(exportSvg, p, svg) - height(exportSvg(p, { key: false }))) / 2);
  });

  it("the key sits on the chosen side and edge", () => {
    const p = example("House Targaryen");
    for (const keyPosition of KEY_POSITIONS) {
      const svg = exportSvg(p, { keyPosition });
      const [x, y, w, h] = keyBox(svg)!;
      const width = Number(/width="(\d+)"/.exec(svg)![1]);
      expect(keyPosition.endsWith("left") ? x : width - x - w).toBeCloseTo(40, 0);
      expect(keyPosition.startsWith("top") ? y : height(svg) - y - h).toBeCloseTo(40, 0);
    }
  });
});
