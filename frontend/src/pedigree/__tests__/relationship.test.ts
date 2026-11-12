import { describe, it, expect } from "vitest";
import type { Pedigree, Sex, Zygosity } from "@pedigree-editor/layout-engine";
import { nameRelationship, pairLabels } from "../relationship";
import { kinshipCoefficients } from "@pedigree-editor/layout-engine";

/**
 * A three-generation family plus extras:
 *
 *   ggf = ggm
 *       |
 *    gf = gm             gf2 (gm's second partner, for half relations)
 *     |                   |
 *  dad = mum   aunt = uncleInLaw    halfAunt = x
 *    |                |                 |
 *  me, sis          cousin           halfCousin
 *    |                |
 *  myKid          cousinKid
 */
function family(): Pedigree {
  const person = (id: string, sex: Sex) => ({ id, sex, affected: false, sibOrder: 0 });
  return {
    individuals: [
      person("ggf", "male"), person("ggm", "female"),
      person("gf", "male"), person("gm", "female"), person("gf2", "male"),
      person("dad", "male"), person("mum", "female"), person("aunt", "female"), person("uncleInLaw", "male"),
      person("halfAunt", "female"), person("x", "male"),
      person("me", "male"), person("sis", "female"), person("cousin", "unknown"), person("halfCousin", "male"),
      person("myKid", "female"), person("myKidMum", "female"), person("cousinKid", "male"), person("cousinKidOther", "female"),
      person("stranger", "female"),
    ],
    partnerships: [
      { id: "gg", individual1: "ggf", individual2: "ggm" },
      { id: "g", individual1: "gf", individual2: "gm" },
      { id: "g2", individual1: "gf2", individual2: "gm" },
      { id: "dm", individual1: "dad", individual2: "mum" },
      { id: "au", individual1: "uncleInLaw", individual2: "aunt" },
      { id: "hx", individual1: "x", individual2: "halfAunt" },
      { id: "mk", individual1: "me", individual2: "myKidMum" },
      { id: "ck", individual1: "cousin", individual2: "cousinKidOther" },
    ],
    parentOf: {
      gg: ["gf"], g: ["dad", "aunt"], g2: ["halfAunt"], dm: ["me", "sis"], au: ["cousin"],
      hx: ["halfCousin"], mk: ["myKid"], ck: ["cousinKid"],
    },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

function name(p: Pedigree, a: string, b: string): string | null {
  const r = nameRelationship(p, a, b, kinshipCoefficients(p).kinship(a, b));
  return r ? `${r.subjectId} is ${r.objectId}'s ${r.term}` : null;
}

describe("nameRelationship (#90)", () => {
  const p = family();

  it("names direct ancestors by sex, the ancestor as subject", () => {
    expect(name(p, "me", "dad")).toBe("dad is me's father");
    expect(name(p, "mum", "sis")).toBe("mum is sis's mother");
    expect(name(p, "me", "gm")).toBe("gm is me's grandmother");
    expect(name(p, "ggm", "me")).toBe("ggm is me's great-grandmother");
    expect(name(p, "ggf", "myKid")).toBe("ggf is myKid's great-great-grandfather");
  });

  it("names siblings, full and half", () => {
    expect(name(p, "me", "sis")).toBe("sis is me's sister");
    expect(name(p, "sis", "me")).toBe("me is sis's brother");
    expect(name(p, "dad", "halfAunt")).toBe("halfAunt is dad's half-sister");
  });

  it("names aunts, uncles and great-aunts", () => {
    expect(name(p, "me", "aunt")).toBe("aunt is me's aunt");
    expect(name(p, "dad", "cousin")).toBe("dad is cousin's uncle");
    expect(name(p, "aunt", "myKid")).toBe("aunt is myKid's great-aunt");
    expect(name(p, "halfAunt", "me")).toBe("halfAunt is me's half-aunt");
  });

  it("names cousins with degree and removal", () => {
    expect(name(p, "me", "cousin")).toBe("cousin is me's first cousin");
    expect(name(p, "cousinKid", "me")).toBe("me is cousinKid's first cousin once removed");
    expect(name(p, "myKid", "cousinKid")).toBe("cousinKid is myKid's second cousin");
    expect(name(p, "me", "halfCousin")).toBe("halfCousin is me's half first cousin");
  });

  it("gives no name to people who are not blood relatives", () => {
    expect(name(p, "me", "uncleInLaw")).toBeNull();
    expect(name(p, "me", "stranger")).toBeNull();
    expect(name(p, "dad", "mum")).toBeNull();
    expect(name(p, "me", "me")).toBeNull();
  });

  it("uses a sex-neutral term for unknown sex", () => {
    const q = family();
    q.individuals.find(i => i.id === "dad")!.sex = "unknown";
    expect(name(q, "dad", "me")).toBe("dad is me's parent");
    expect(name(q, "dad", "cousin")).toBe("dad is cousin's aunt or uncle");
  });

  it("names twins by zygosity", () => {
    const cases: [Zygosity, string][] = [
      ["monozygotic", "identical twin"], ["dizygotic", "fraternal twin"], ["unknown", "twin"],
    ];
    for (const [zygosity, word] of cases) {
      const q = family();
      q.individuals.find(i => i.id === "sis")!.sex = "male";
      q.partnerships.find(x => x.id === "dm")!.twins = [{ members: ["me", "sis"], zygosity }];
      expect(name(q, "me", "sis")).toBe(`sis is me's ${word} brother`);
    }
  });

  it("gives no name when there is more than one line of descent", () => {
    // Double first cousins: the cousin's other parent is mum's sibling.
    const q = family();
    q.individuals.push({ id: "mgf", sex: "male", affected: false, sibOrder: 0 }, { id: "mgm", sex: "female", affected: false, sibOrder: 0 });
    q.partnerships.push({ id: "mg", individual1: "mgf", individual2: "mgm" });
    q.parentOf.mg = ["mum", "uncleInLaw"];
    expect(kinshipCoefficients(q).kinship("me", "cousin")).toBe(1 / 8);
    expect(name(q, "me", "cousin")).toBeNull();

    // A child of first cousins is more than a nephew to their parent's sibling.
    const r = family();
    r.individuals.push({ id: "inbred", sex: "female", affected: false, sibOrder: 0 });
    r.partnerships.push({ id: "mc", individual1: "sis", individual2: "cousin" });
    r.parentOf.mc = ["inbred"];
    expect(name(r, "me", "inbred")).toBeNull();
    // Nor is she simply her mother's daughter: her mother is also her father's cousin.
    expect(name(r, "sis", "inbred")).toBeNull();
    // The grandparents are reached two ways at the same distance.
    expect(name(r, "gm", "inbred")).toBeNull();
  });

  it("does not use an adopted-in person's adoptive line", () => {
    const q = family();
    q.individuals.find(i => i.id === "cousin")!.adopted = "in";
    expect(name(q, "me", "cousin")).toBeNull();
  });

  it("writes higher cousins and removals in words, then numbers", () => {
    // A chain down from gf and from gm's other line, built deep enough for third cousins twice removed.
    const q = family();
    const add = (id: string, parentA: string) => {
      q.individuals.push({ id, sex: "female", affected: false, sibOrder: 0 }, { id: `${id}P`, sex: "male", affected: false, sibOrder: 0 });
      q.partnerships.push({ id: `p_${id}`, individual1: `${parentA}P`, individual2: parentA });
      q.parentOf[`p_${id}`] = [id];
    };
    // Give "myKid" and "cousinKid" partners named <id>P and extend both lines.
    q.individuals.push({ id: "myKidP", sex: "male", affected: false, sibOrder: 0 }, { id: "cousinKidP", sex: "female", affected: false, sibOrder: 0 });
    q.partnerships.push({ id: "mkp", individual1: "myKidP", individual2: "myKid" }, { id: "ckp", individual1: "cousinKid", individual2: "cousinKidP" });
    q.individuals.push({ id: "a1", sex: "female", affected: false, sibOrder: 0 }, { id: "b1", sex: "female", affected: false, sibOrder: 0 });
    q.parentOf.mkp = ["a1"];
    q.parentOf.ckp = ["b1"];
    add("a2", "a1");
    add("a3", "a2");
    expect(name(q, "a1", "b1")).toBe("b1 is a1's third cousin");
    expect(name(q, "b1", "a3")).toBe("b1 is a3's third cousin twice removed");
    expect(name(q, "me", "a3")).toBe("me is a3's great-great-grandfather");
    add("a4", "a3");
    expect(name(q, "me", "a4")).toBe("me is a4's 3rd great-grandfather");
  });
});

describe("pairLabels (#90)", () => {
  it("uses names, then sex, then selection order to tell two people apart", () => {
    const p = family();
    expect(pairLabels(p, "me", "sis")).toEqual({ me: "the unnamed male", sis: "the unnamed female" });
    expect(pairLabels(p, "me", "dad")).toEqual({ me: "the first selected", dad: "the last selected" });
    p.individuals.find(i => i.id === "dad")!.name = "Bob";
    expect(pairLabels(p, "me", "dad")).toEqual({ me: "the unnamed male", dad: "Bob" });
    p.individuals.find(i => i.id === "me")!.name = " Bob ";
    expect(pairLabels(p, "me", "dad")).toEqual({ me: "Bob (first selected)", dad: "Bob (last selected)" });
  });
});
