import { describe, it, expect } from "vitest";
import type { Individual, Pedigree, Sex } from "@pedigree-editor/layout-engine";
import { kinshipCoefficients } from "@pedigree-editor/layout-engine";
import { referenceRelatedness } from "../referenceRelatedness";
import { relationshipTermFor } from "../relationship";

/**
 *    gf = gm = gf2
 *      |      |
 *  dad = mum   aunt = uncleInLaw    halfAunt
 *    |               |
 *  me, sis         cousin
 *  |
 *  kid (me = wife)
 */
function family(flags: Record<string, Partial<Individual>> = {}): Pedigree {
  const person = (id: string, sex: Sex): Individual => ({ id, sex, affected: false, sibOrder: 0, ...flags[id] });
  return {
    individuals: [
      person("gf", "male"), person("gm", "female"), person("gf2", "male"),
      person("dad", "male"), person("mum", "female"), person("aunt", "female"), person("uncleInLaw", "male"),
      person("halfAunt", "female"),
      person("me", "male"), person("sis", "female"), person("cousin", "female"),
      person("wife", "female"), person("kid", "male"), person("ghost", "unknown"),
    ],
    partnerships: [
      { id: "g", individual1: "gf", individual2: "gm" },
      { id: "g2", individual1: "gf2", individual2: "gm" },
      { id: "dm", individual1: "dad", individual2: "mum" },
      { id: "au", individual1: "uncleInLaw", individual2: "aunt" },
      { id: "mw", individual1: "me", individual2: "wife" },
    ],
    parentOf: { g: ["dad", "aunt"], g2: ["halfAunt"], dm: ["me", "sis"], au: ["cousin"], mw: ["kid"] },
    siblingOrder: { mode: "insertion", affectedFirst: false },
  };
}

const texts = (p: Pedigree, id: string) =>
  referenceRelatedness(p, id).map(l => (l.detail ? `${l.text}. ${l.detail}` : l.text));

describe("relationshipTermFor (#134)", () => {
  const p = family();
  const k = kinshipCoefficients(p);
  const term = (a: string, b: string) => relationshipTermFor(p, a, b, k.kinship(a, b))?.term ?? null;

  it("gives the term for the first person whichever is nearer the common ancestors", () => {
    expect(term("dad", "me")).toBe("father");
    expect(term("me", "dad")).toBe("son");
    expect(term("aunt", "me")).toBe("aunt");
    expect(term("me", "aunt")).toBe("nephew");
    expect(term("halfAunt", "me")).toBe("half-aunt");
    expect(term("me", "halfAunt")).toBe("half-nephew");
    expect(term("kid", "gf")).toBe("great-grandson");
    expect(term("sis", "me")).toBe("sister");
    expect(term("me", "sis")).toBe("brother");
    expect(term("cousin", "me")).toBe("first cousin");
    expect(term("kid", "cousin")).toBe("first cousin once removed");
    expect(term("wife", "me")).toBeNull();
  });
});

describe("referenceRelatedness (#134)", () => {
  it("names the relationship to the proband with the kinship", () => {
    // The proband's X comes from his mother, so a paternal cousin shares none.
    const p = family({ me: { proband: true } });
    expect(texts(p, "cousin")).toEqual(["Proband's first cousin. Kinship 1/16 (0.0625), X-linked 0"]);
    expect(texts(p, "kid")).toEqual(["Proband's son. Kinship 1/4 (0.25), X-linked 0"]);
  });

  it("says nothing about the proband to themselves", () => {
    const p = family({ me: { proband: true } });
    expect(referenceRelatedness(p, "me")).toEqual([]);
  });

  it("says when someone is not related by blood", () => {
    const p = family({ me: { proband: true } });
    expect(texts(p, "wife")).toEqual(["Not related to the proband through anyone drawn"]);
  });

  it("adds the consultand when they are not the proband", () => {
    const p = family({ me: { proband: true }, sis: { consultand: true } });
    expect(texts(p, "cousin")).toEqual([
      "Proband's first cousin. Kinship 1/16 (0.0625), X-linked 0",
      "Consultand's first cousin. Kinship 1/16 (0.0625), X-linked 1/16 (0.0625)",
    ]);
    // The consultand gets the proband's line, the proband the consultand's.
    expect(texts(p, "sis")).toEqual(["Proband's sister. Kinship 1/4 (0.25), X-linked 1/4 (0.25)"]);
    expect(texts(p, "me")).toEqual(["Consultand's brother. Kinship 1/4 (0.25), X-linked 1/4 (0.25)"]);
  });

  it("gives one line for someone who is both proband and consultand", () => {
    const p = family({ me: { proband: true, consultand: true } });
    expect(referenceRelatedness(p, "dad").map(l => l.role)).toEqual(["proband"]);
  });

  it("falls back to the consultand when there is no proband", () => {
    const p = family({ sis: { consultand: true } });
    expect(texts(p, "aunt")).toEqual(["Consultand's aunt. Kinship 1/8 (0.125), X-linked 1/8 (0.125)"]);
  });

  it("says which one when there are several of a role", () => {
    const p = family({ me: { consultand: true, name: "Tom" }, cousin: { consultand: true } });
    expect(referenceRelatedness(p, "dad").map(l => l.text)).toEqual([
      "Consultand Tom's father",
      "Consultand 2's uncle",
    ]);
  });

  it("names double first cousins, and says when someone is related in other ways too", () => {
    // Double first cousins: two sisters marry two brothers.
    const person = (id: string, sex: Sex, extra: Partial<Individual> = {}): Individual => ({ id, sex, affected: false, sibOrder: 0, ...extra });
    const p: Pedigree = {
      individuals: [
        person("f1", "male"), person("m1", "female"), person("f2", "male"), person("m2", "female"),
        person("b1", "male"), person("b2", "male"), person("s1", "female"), person("s2", "female"),
        person("c1", "male", { proband: true }), person("c2", "female"),
      ],
      partnerships: [
        { id: "p1", individual1: "f1", individual2: "m1" },
        { id: "p2", individual1: "f2", individual2: "m2" },
        { id: "x1", individual1: "b1", individual2: "s1" },
        { id: "x2", individual1: "b2", individual2: "s2" },
      ],
      parentOf: { p1: ["b1", "b2"], p2: ["s1", "s2"], x1: ["c1"], x2: ["c2"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    expect(texts(p, "c2")).toEqual(["Proband's double first cousin. Kinship 1/8 (0.125), X-linked 3/16 (0.1875)"]);
    // Their child is more than the proband's first cousin once removed.
    const q: Pedigree = {
      ...p,
      individuals: [...p.individuals, person("k", "female")],
      partnerships: [...p.partnerships, { id: "ck", individual1: "c1", individual2: "c2" }],
      parentOf: { ...p.parentOf, ck: ["k"] },
    };
    expect(texts(q, "k")[0]).toMatch(/^Proband's daughter, and related in other ways too\. Kinship 5\/16/);
  });

  it("says related in more than one way when the closest common ancestors are not a couple", () => {
    // Half first cousins twice over: the fathers share a father, the mothers a mother.
    const person = (id: string, sex: Sex, extra: Partial<Individual> = {}): Individual => ({ id, sex, affected: false, sibOrder: 0, ...extra });
    const p: Pedigree = {
      individuals: [
        person("F", "male"), person("w1", "female"), person("w2", "female"), person("M", "female"), person("h1", "male"), person("h2", "male"),
        person("f1", "male"), person("f2", "male"), person("m1", "female"), person("m2", "female"),
        person("a", "male", { proband: true }), person("b", "female"),
      ],
      partnerships: [
        { id: "F1", individual1: "F", individual2: "w1" }, { id: "F2", individual1: "F", individual2: "w2" },
        { id: "M1", individual1: "h1", individual2: "M" }, { id: "M2", individual1: "h2", individual2: "M" },
        { id: "A", individual1: "f1", individual2: "m1" }, { id: "B", individual1: "f2", individual2: "m2" },
      ],
      parentOf: { F1: ["f1"], F2: ["f2"], M1: ["m1"], M2: ["m2"], A: ["a"], B: ["b"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    expect(texts(p, "b")).toEqual(["Related to the proband in more than one way. Kinship 1/16 (0.0625), X-linked 1/16 (0.0625)"]);
  });

  it("writes an X-linked value that turns on an unknown sex as unknown", () => {
    const p = family({ me: { proband: true } });
    p.individuals.find(i => i.id === "ghost")!.sex = "unknown";
    p.partnerships.push({ id: "sg", individual1: "ghost", individual2: "sis" });
    p.parentOf.sg = ["niece"];
    p.individuals.push({ id: "niece", sex: "female", affected: false, sibOrder: 0 });
    const line = referenceRelatedness(p, "niece")[0];
    expect(line.text).toBe("Proband's niece");
    expect(line.detail).toMatch(/^Kinship 1\/8 \(0\.125\), X-linked /);
  });
});
