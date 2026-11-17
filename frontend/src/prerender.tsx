/**
 * The landing page and the guides (#202) as static HTML (#25), so search
 * engines and assistants that do not run JavaScript read them.
 * `prerenderPlugin` in vite.config.ts writes each page of
 * `PRERENDERED_PAGES` into its file in dist/ after a build, from the built
 * index.html with `pageHtml`. Pages are drawn for a first visit: signed out,
 * nothing in "Recent on this device". `main.tsx` renders the app over them,
 * so they are never hydrated and may differ from what the app then draws.
 */
import { renderToString } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import GuidePage, { GuidesIndexPage } from "./pages/GuidePage";
import { GUIDES, guidePath } from "./guides/guides";

const SITE = "https://pededit.com";

export interface PrerenderedPage {
  /** The route. */
  path: string;
  /** Where in dist/ it is written. Nginx tries `$uri.html` (deploy/pededit-nginx.conf). */
  file: string;
  /** Head tags for the page; the landing page keeps index.html's own. */
  head?: { title: string; description: string };
  /** Text the page must contain, so a page that renders empty fails the build. */
  mustContain: string;
}

export const PRERENDERED_PAGES: PrerenderedPage[] = [
  { path: "/", file: "index.html", mustContain: "No account required" },
  {
    path: "/guides",
    file: "guides.html",
    head: { title: "Pedigree guides | PedEdit", description: "Short guides to drawing clinical pedigrees with the standard NSGC symbols: a symbols cheat sheet, how to draw a pedigree, consanguinity, and practice families." },
    mustContain: "Pedigree guides",
  },
  ...GUIDES.map(g => ({
    path: guidePath(g.slug),
    file: `${guidePath(g.slug).slice(1)}.html`,
    head: { title: `${g.title} | PedEdit`, description: g.description },
    mustContain: g.title,
  })),
];

export function renderPage(path: string): string {
  return renderToString(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/guides" element={<GuidesIndexPage />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </StaticRouter>,
  );
}

/** Where index.html takes the prerendered page. */
export const PRERENDER_MARKER = "<!--prerendered-landing-->";

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The built index.html with `html` in place of the marker, and for a page
 * with its own head, its title, description, social tags and canonical
 * link, and the route the inline script shows the static page on.
 */
export function pageHtml(template: string, page: PrerenderedPage, html: string): string {
  if (!template.includes(PRERENDER_MARKER)) throw new Error(`index.html has no ${PRERENDER_MARKER}`);
  let out = template.replace(PRERENDER_MARKER, () => `<div data-prerendered>${html}</div>`);
  if (!page.head) return out;
  const { title, description } = page.head;
  // Each pattern captures what comes before the text it replaces.
  const swaps: [RegExp, string][] = [
    [/(<title>)[^<]*/, attr(title)],
    [/(<meta name="description" content=")[^"]*/, attr(description)],
    [/(<meta property="og:title" content=")[^"]*/, attr(title)],
    [/(<meta property="og:description" content=")[^"]*/, attr(description)],
    [/(<meta name="twitter:title" content=")[^"]*/, attr(title)],
    [/(<meta name="twitter:description" content=")[^"]*/, attr(description)],
    [/(<link rel="canonical" href=")[^"]*/, `${SITE}${page.path}`],
    [/(location\.pathname !== )"\/"/, JSON.stringify(page.path)],
  ];
  for (const [pattern, text] of swaps) {
    if (!pattern.test(out)) throw new Error(`index.html has no match for ${pattern}`);
    out = out.replace(pattern, (_match, before: string) => before + text);
  }
  return out;
}
