// The build writes renderLanding() into dist/index.html (#25), and CI does
// not run the build, so a landing page that stops rendering outside a
// browser (a `window` read during render, say) is caught here.
import { beforeAll, describe, expect, it } from "vitest";

describe("prerendered landing page", () => {
  let html = "";
  beforeAll(async () => {
    // As in the build: no browser, so no localStorage until one is given.
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
    });
    const { renderLanding } = await import("../prerender");
    html = renderLanding();
  });

  it("says what PedEdit is and that no account is needed", () => {
    expect(html).toContain("No account required");
    expect(html).toContain("kinship2");
    expect(html).toContain("What happens to your pedigrees");
  });

  it("links every example and names no host", () => {
    expect(html).toContain('href="/example/targaryen"');
    expect(html.replace(/<!-- -->/g, "")).toContain("saved on the server at this site");
  });
});
