import { describe, expect, it } from "vitest";
import { EXAMPLES, exampleBySlug } from "../examples";

describe("example slugs (#150)", () => {
  it("are unique", () => {
    const slugs = EXAMPLES.map(e => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("need no escaping in a URL: lower case letters, digits and single hyphens", () => {
    for (const { slug } of EXAMPLES) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  // /example/<slug> links are published (posts, papers, the docs), so a slug
  // must keep opening the same example. Adding an example adds a line here;
  // a line that changes or goes is a broken link somewhere.
  it("still name the examples their published links open", () => {
    expect(Object.fromEntries(EXAMPLES.map(e => [e.slug, e.label]))).toEqual({
      "simple-family": "Simple family",
      "three-generations": "Three generations",
      "multi-branch-family": "Multi-branch family",
      "large-family": "Large family",
      "uncle-niece": "Uncle-niece",
      "remarriage": "Remarriage · half-siblings",
      "multiple-partners": "Multiple partners",
      "high-complexity": "High complexity",
      "assisted-reproduction": "Assisted reproduction",
      "habsburgs": "Spanish Habsburgs",
      "queen-victoria": "Queen Victoria · haemophilia B",
      "tutankhamun": "Tutankhamun's family",
      "three-quarter-siblings": "3/4 siblings",
      "five-eighths-siblings": "5/8 siblings",
      "full-sib-mating": "Full-sib mating",
      "half-sib-triangle": "Half-sib triangle",
      "double-first-cousins": "Double first cousins",
      "double-second-cousins-a": "Double second cousins (A)",
      "double-second-cousins-b": "Double second cousins (B)",
      "quadruple-half-first-cousins": "Quadruple half first cousins",
      "grandparent-and-grandchilds-partner": "Grandparent and grandchild's partner",
      "two-lineages-joined-twice": "Two lineages joined twice",
      "targaryen": "House Targaryen",
      "buendia": "The Buendías",
      "atreides": "House Atreides",
      "lannister": "House Lannister (TV show)",
      "practice-breast-ovarian-cancer": "Breast and ovarian cancer",
      "practice-cystic-fibrosis": "Cystic fibrosis, first cousin parents",
      "practice-duchenne": "Duchenne muscular dystrophy",
      "practice-twins-and-pregnancies": "Twins, a pregnancy and a loss",
    });
  });

  it("exampleBySlug finds an example by its slug in any case, and nothing for an unknown one", () => {
    expect(exampleBySlug("targaryen")?.label).toBe("House Targaryen");
    expect(exampleBySlug("Targaryen")?.label).toBe("House Targaryen");
    expect(exampleBySlug("no-such-example")).toBeUndefined();
    expect(exampleBySlug(undefined)).toBeUndefined();
    expect(exampleBySlug("")).toBeUndefined();
  });
});
