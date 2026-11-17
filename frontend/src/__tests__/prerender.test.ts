// The build writes renderPage() for each of PRERENDERED_PAGES into dist/
// (#25, #202), and CI does not run the build, so a page that stops
// rendering outside a browser (a `window` read during render, say) is
// caught here.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type * as Prerender from "../prerender";

let prerender: typeof Prerender;
beforeAll(async () => {
  // As in the build: no browser, so no localStorage until one is given.
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
  });
  prerender = await import("../prerender");
});

const unmark = (html: string) => html.replace(/<!-- -->/g, "");

describe("prerendered landing page", () => {
  let html = "";
  beforeAll(() => { html = prerender.renderPage("/"); });

  it("says what PedEdit is and that no account is needed", () => {
    expect(html).toContain("No account required");
    expect(html).toContain("kinship2");
    expect(html).toContain('href="/your-data"');
  });

  it("links every example and guide and names no host", () => {
    expect(html).toContain('href="/example/targaryen"');
    expect(html).toContain('href="/guides/pedigree-symbols"');
  });
});

describe("prerendered /your-data", () => {
  it("names no host and says where the server is", () => {
    const html = unmark(prerender.renderPage("/your-data"));
    expect(html).toContain("saved on the server at this site");
    expect(html).toContain("Nectar Research Cloud");
  });
});

describe("prerendered guides", () => {
  const template = readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");

  it("renders every page with its own text, and its figures as images", () => {
    for (const page of prerender.PRERENDERED_PAGES) {
      const html = prerender.renderPage(page.path);
      expect(unmark(html), page.path).toContain(page.mustContain);
      if (page.path.startsWith("/guides/")) expect(html, page.path).toContain('src="data:image/svg+xml');
    }
  });

  it("gives a guide its own head and shows the static page on its own path", () => {
    const page = prerender.PRERENDERED_PAGES.find(p => p.path === "/guides/consanguinity")!;
    const out = prerender.pageHtml(template, page, "<p>body</p>");
    expect(page.file).toBe("guides/consanguinity.html");
    expect(out).toContain("<title>Consanguinity in a pedigree | PedEdit</title>");
    expect(out).toContain('<link rel="canonical" href="https://pededit.com/guides/consanguinity"');
    expect(out).toContain('location.pathname !== "/guides/consanguinity"');
    expect(out).toContain("<div data-prerendered><p>body</p></div>");
    expect(out.match(/content="Free online pedigree chart maker/g)).toBeNull();
  });

  it("leaves the landing page's head alone", () => {
    const out = prerender.pageHtml(template, prerender.PRERENDERED_PAGES[0], "x");
    expect(out).toContain('location.pathname !== "/"');
    expect(out).toContain('<link rel="canonical" href="https://pededit.com/"');
  });
});
