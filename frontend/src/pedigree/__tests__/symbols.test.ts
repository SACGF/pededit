import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SymbolShape } from "../nodes/symbols";
import type { Individual } from "@pedigree-editor/layout-engine";

const SIZE = 40;
const DOT_R = SIZE * 0.15;

function person(overrides: Partial<Individual> = {}): Individual {
  return { id: "x", sex: "female", affected: false, sibOrder: 0, name: "", notes: "", ...overrides };
}

function render(ind: Individual): string {
  return renderToStaticMarkup(createElement(SymbolShape, { individual: ind, size: SIZE }));
}

/** True when a small inner circle (the carrier dot) is present. */
function hasCarrierDot(svg: string): boolean {
  return svg.includes(`r="${DOT_R}"`);
}

/** Fill colour of the main shape (first element in the group). */
function shapeFill(svg: string): string | undefined {
  return svg.match(/fill="(black|white)"/)?.[1];
}

describe("SymbolShape carrier and affected rendering", () => {
  it("unaffected non-carrier renders an empty symbol with no dot", () => {
    const svg = render(person());
    expect(shapeFill(svg)).toBe("white");
    expect(hasCarrierDot(svg)).toBe(false);
  });

  it("unaffected carrier renders an empty symbol with a centred dot", () => {
    for (const sex of ["male", "female", "unknown"] as const) {
      const svg = render(person({ sex, carrier: true }));
      expect(shapeFill(svg)).toBe("white");
      expect(hasCarrierDot(svg)).toBe(true);
      expect(svg).toContain(`cx="${SIZE / 2}" cy="${SIZE / 2}" r="${DOT_R}" fill="black"`);
    }
  });

  it("affected renders a filled symbol with no dot", () => {
    const svg = render(person({ affected: true }));
    expect(shapeFill(svg)).toBe("black");
    expect(hasCarrierDot(svg)).toBe(false);
  });

  it("affected plus carrier: affected wins, filled symbol and no dot", () => {
    for (const sex of ["male", "female", "unknown"] as const) {
      const svg = render(person({ sex, affected: true, carrier: true }));
      expect(shapeFill(svg)).toBe("black");
      expect(hasCarrierDot(svg)).toBe(false);
    }
  });
});
