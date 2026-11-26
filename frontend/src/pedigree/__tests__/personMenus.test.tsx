import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pedigree, Tag } from "@pedigree-editor/layout-engine";
import { F, M, build, couple, SETTINGS_2022 } from "../../fixtures/features";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { MoreMenuItems } from "../nodes/MoreMenu";
import { personCouples } from "../partners";
import { personAddActions } from "../personActions";
import { personLabel } from "../personLabel";
import { relatednessOf } from "../relatedness";
import { peopleWithTag } from "../conditions";

/** The hover pill, the more menu and the Person tab agree (#227). */

const store = () => usePedigreeStore.getState();
/**
 * The menu as rendered with the store holding `p`. A server render reads a
 * zustand store's initial state object, so the current state is copied into
 * it for the render and taken out again after.
 */
const menu = (p: Pedigree, id: string) => {
  store().initialize(p);
  const initial = usePedigreeStore.getInitialState();
  const saved = { ...initial };
  Object.assign(initial, store());
  try {
    return renderToStaticMarkup(<MoreMenuItems individualId={id} onDone={() => {}} />);
  } finally {
    Object.assign(initial, saved);
  }
};

/**
 * Ann and Bea are a couple; Ann's daughter was conceived with Dan's sperm,
 * so Ann and Dan are a donor pair, listed first. The daughter has been
 * deleted, so the pair has no child.
 */
const donorPairAlone = (): Pedigree => build(
  [F("ann", { name: "Ann" }), F("bea", { name: "Bea" }), M("dan", { name: "Dan", reproductiveRole: "donor" })],
  [couple("dp", "ann", "dan", { donorConception: true }), couple("ab", "ann", "bea")],
  {},
);

describe("a donor pair is not a couple in any list about relationships", () => {
  beforeEach(() => store().initialize(donorPairAlone()));

  it("personCouples marks it, and numbers relationships first", () => {
    const couples = personCouples(donorPairAlone(), "ann");
    expect(couples.map(c => [c.partnershipId, c.donorPair, c.childless])).toEqual([["ab", false, true], ["dp", true, true]]);
  });

  it("the more menu names the donor nowhere: no childless mark, no Remove partnership, no Add existing child with him", () => {
    const out = menu(donorPairAlone(), "ann");
    expect(out).toContain("Bea");
    expect(out).not.toContain("Dan");
    expect(out.match(/Remove partnership/g)).toHaveLength(1);
  });

  it("the Relatedness section offers no double line for the pair", () => {
    expect(relatednessOf(donorPairAlone(), "ann").couples.map(c => c.partnershipId)).toEqual(["ab"]);
  });
});

describe("the person menu's couples", () => {
  const withChild = (): Pedigree => build(
    [M("dad"), F("mum"), F("kid")],
    [couple("p", "dad", "mum")],
    { p: ["kid"] },
  );

  it("Remove partnership is shown disabled with the couple menu's reason when the couple has children", () => {
    const out = menu(withChild(), "dad");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*title="This couple has children: use Replace parents or Detach from parents on them first"[^>]*>Remove partnership/);
  });

  it("an unnamed partner is \"Partner 1 (female)\", and the ended item is \"Relationship ended\"", () => {
    const out = menu(withChild(), "dad");
    expect(out).toContain("With partner 1 (female)");
    expect(out).toContain("Relationship ended");
    expect(out).not.toMatch(/>Ended/);
  });
});

describe("the more menu in black and white", () => {
  it("draws its swatches without the tags' colours", () => {
    const tags: Tag[] = [
      { id: "cf", label: "Cystic fibrosis", color: "#d62728", style: "quadrant" },
      { id: "dot", label: "Tested", color: "#1f77b4", style: "dot" },
    ];
    const p = build([F("a", { tags: ["cf", "dot"] })], [], {}, { tags, canvasSettings: { ...SETTINGS_2022, tagFills: "monochrome" } });
    const out = menu(p, "a").toLowerCase();
    expect(out).toContain("cystic fibrosis");
    expect(out).not.toContain("#d62728");
    expect(out).not.toContain("#1f77b4");
  });
});

describe("the hover pill and the Person tab's row", () => {
  it("offer Add sibling, not Add parents, to someone with parents, whatever is drawn", () => {
    const p = build([M("gf"), F("gm"), M("him"), F("her")], [couple("g", "gf", "gm"), couple("h", "him", "her")], { g: ["him"] }, {
      filters: { bloodRelativesOnly: true },
    });
    const of = (id: string) => Object.fromEntries(personAddActions(p, p.individuals.find(i => i.id === id)!).map(a => [a.key, a.disabled]));
    expect(of("him")).toMatchObject({ parents: true, sibling: false });
    expect(of("her")).toMatchObject({ parents: false, sibling: true });
  });

  it("offer no child to a pregnancy", () => {
    const p = build([F("preg", { lifeStatus: "pregnancy" })], [], {});
    expect(personAddActions(p, p.individuals[0]!).filter(a => a.disabled).map(a => a.key)).toEqual(["son", "daughter", "child", "sibling"]);
  });
});

describe("personLabel", () => {
  const p = build([M("m"), F("f", { name: " Fay " }), { id: "u", sex: "unknown", affected: false, sibOrder: 0 }], [], {});
  it("gives the name, else the words of the style", () => {
    expect(personLabel(p, "f", "unnamed")).toBe("Fay");
    expect(personLabel(p, "m", "unnamed")).toBe("unnamed male");
    expect(personLabel(p, "u", "unnamed", { start: true })).toBe("Unnamed person");
    expect(personLabel(p, "m", { partner: 2 }, { start: true })).toBe("Partner 2 (male)");
    expect(personLabel(p, "u", { partner: 1 })).toBe("partner 1 (unknown sex)");
    expect(personLabel(p, "m", "this person", { start: true })).toBe("This person");
  });
});

describe("Conditions and tags: People with this", () => {
  it("counts carriers of a condition as well as the affected", () => {
    const tags: Tag[] = [{ id: "cf", label: "CF", color: "#d62728", style: "quadrant" }];
    const p = build([F("a", { carrierTags: ["cf"] }), M("b", { carrierTags: ["cf"] }), F("c", { tags: ["cf"] }), M("d")], [], {}, { tags });
    expect(peopleWithTag(p, "cf")).toBe(3);
  });
});
