import { it, expect } from "vitest";
import { FEATURE_FIXTURES } from "../fixtures/features";
import { exportSvgReact } from "./reactExport";
it("renders in Node with no DOM", () => {
  expect(typeof document).toBe("undefined");
  const svg = exportSvgReact(FEATURE_FIXTURES[0]!.data, { title: "T" });
  const i = svg.indexOf('<g class="symbols">');
  console.log(svg.slice(i, i + 1500));
  expect(svg).toContain("symbol-clip-");
});
