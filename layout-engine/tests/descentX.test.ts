import { describe, expect, it } from "vitest";
import { descentX } from "../src/index.js";

describe("descentX", () => {
  it("is the middle of the couple line for two or more children", () => {
    expect(descentX(100, [95, 175], 40)).toBe(100);
  });

  it("is an only child's x when the child is within a quarter of a symbol of the middle", () => {
    expect(descentX(100, [105.7], 40)).toBe(105.7);
    expect(descentX(100, [90], 40)).toBe(90);
    expect(descentX(100, [100], 40)).toBe(100);
  });

  it("stays the middle for an only child further off, who gets a bar", () => {
    expect(descentX(100, [111], 40)).toBe(100);
    expect(descentX(100, [60], 40)).toBe(100);
  });
});
