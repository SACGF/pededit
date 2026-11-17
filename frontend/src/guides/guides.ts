/**
 * The static guide pages (#202), at /guides/<slug>. Each is prerendered into
 * dist/guides/<slug>.html by the build (`PRERENDERED_PAGES` in
 * `prerender.tsx`) and listed in public/sitemap.xml and public/llms.txt.
 * Slugs are published links: never change or reuse one.
 */
export interface GuideInfo {
  slug: string;
  /** The page's heading, and its <title> with " | PedEdit". */
  title: string;
  /** The meta description, and the line under the title in lists of guides. */
  description: string;
}

export const GUIDES: GuideInfo[] = [
  {
    slug: "pedigree-symbols",
    title: "Pedigree symbols cheat sheet",
    description: "The standard pedigree symbols and lines (NSGC 2022, with the 2008 forms where they differ): affected and carrier, deceased, proband and consultand, pregnancies and losses, twins, consanguinity, adoption and assisted reproduction.",
  },
  {
    slug: "how-to-draw-a-pedigree",
    title: "How to draw a pedigree",
    description: "Drawing a three-generation family pedigree step by step: where to start, the order to ask in, what to record under each symbol, and the key.",
  },
  {
    slug: "consanguinity",
    title: "Consanguinity in a pedigree",
    description: "How a consanguineous couple is drawn on a pedigree, and what the kinship and inbreeding coefficients mean, with the values for common relationships.",
  },
  {
    slug: "practice-families",
    title: "Practice families for teaching",
    description: "Family histories to draw as a pedigree, each with the drawn answer and what to check: breast and ovarian cancer, cystic fibrosis with first cousin parents, Duchenne muscular dystrophy, and twins and pregnancies.",
  },
];

export const guidePath = (slug: string) => `/guides/${slug}`;

export function guideBySlug(slug: string | undefined): GuideInfo | undefined {
  return GUIDES.find(g => g.slug === slug);
}
