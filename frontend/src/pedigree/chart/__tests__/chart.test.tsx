import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FEATURE_FIXTURES } from "../../../fixtures/features";
import { EXAMPLES } from "../../../data/examples";
import { buildScene } from "../../scene";
import { Chart } from "../Chart";

/*
 * #147: the chart components draw a scene with no store and no React Flow
 * provider, so the same components can draw an export (#139).
 */

/** Text as React writes it into markup. */
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const cases = [
  ...FEATURE_FIXTURES.map(f => ({ label: `fixture ${f.slug}`, data: f.data })),
  ...EXAMPLES.map(e => ({ label: e.label, data: e.data })),
];

describe("Chart renders every fixture and example to a string, with no provider", () => {
  for (const { label, data } of cases) {
    it(label, () => {
      for (const compact of [false, true]) {
        const scene = buildScene(data, { compact });
        const svg = renderToStaticMarkup(<svg><Chart scene={scene} figure idPrefix="t-" /></svg>);
        // One group per drawn symbol, at its place.
        for (const p of scene.people) {
          expect(svg, `${label}: ${p.id}`).toContain(`transform="translate(${p.position.x - 20} ${p.position.y - 20})"`);
        }
        for (const p of scene.people) for (const line of p.glyph.figureNameLines) {
          expect(svg).toContain(`>${escapeText(line)}</text>`);
        }
        // Presentation attributes only: nothing that needs the page's CSS.
        expect(svg).not.toMatch(/\bclass=/);
        // Clip path ids carry the prefix, so two charts on a page cannot clash.
        for (const m of svg.matchAll(/<clipPath id="([^"]+)"/g)) expect(m[1]!.startsWith("t-")).toBe(true);
      }
    });
  }
});
