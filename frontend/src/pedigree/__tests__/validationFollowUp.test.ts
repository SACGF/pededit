/**
 * Editor warnings (#116), the follow-up checks and the problems list's
 * fixes, fix-all and keyboard stepping.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Individual, Partnership, Pedigree, Tag } from "@pedigree-editor/layout-engine";
import {
  findProblems, problemsOf, problemsLike, fixesOf, adjacentProblem, ageInYears, problemSubject, RULES, type Problem,
} from "../validation";
import { ageRange, certainlyBefore, dayRange, minDaysApart, addYears } from "../dateRanges";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { ProblemFixes, fixAllLike } from "../../components/ProblemFixes";
import { stepProblem, resetProblemStep } from "../../components/ProblemsMenu";
import { EXAMPLES } from "../../data/examples";

const TODAY = new Date(2026, 10, 13);

const ind = (id: string, o: Partial<Individual> = {}): Individual => ({ id, sex: "female", affected: false, sibOrder: 0, ...o });

/** Father f, mother m, and their children (with any extra people and partnerships). */
function family(children: Individual[], o: { father?: Partial<Individual>; mother?: Partial<Individual>; couple?: Partial<Partnership>; extra?: Individual[]; ped?: Partial<Pedigree> } = {}): Pedigree {
  return {
    individuals: [ind("f", { sex: "male", ...o.father }), ind("m", o.mother), ...children, ...(o.extra ?? [])],
    partnerships: [{ id: "p", individual1: "f", individual2: "m", ...o.couple }],
    parentOf: { p: children.map(c => c.id) },
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...o.ped,
  };
}

const rules = (p: Pedigree) => findProblems(p, RULES, TODAY).map(x => x.id);
const only = (p: Pedigree, rule: string) => findProblems(p, RULES, TODAY).filter(x => x.rule === rule);

describe("partial date arithmetic", () => {
  it("dayRange covers every day a partial date could be", () => {
    const [a, b] = dayRange({ y: 2000 });
    expect(b - a).toBe(365); // leap year
    const [c, d] = dayRange({ y: 2001, m: 2 });
    expect(d - c).toBe(27);
    expect(dayRange({ y: 2001, m: 2, d: 3 })).toEqual([dayRange({ y: 2001, m: 2, d: 3 })[0], dayRange({ y: 2001, m: 2, d: 3 })[0]]);
  });

  it("certainlyBefore compares only what both dates have", () => {
    expect(certainlyBefore({ y: 2000 }, { y: 2001 })).toBe(true);
    expect(certainlyBefore({ y: 2001 }, { y: 2001, m: 3 })).toBe(false);
    expect(certainlyBefore({ y: 2001, m: 2 }, { y: 2001, m: 3, d: 1 })).toBe(true);
  });

  it("ageRange: a year of birth leaves a year either way", () => {
    expect(ageRange({ y: 1950 }, { y: 2006, m: 6, d: 1 })).toEqual({ min: 55, max: 56 });
    expect(ageRange({ y: 1950, m: 6, d: 2 }, { y: 2006, m: 6, d: 1 })).toEqual({ min: 55, max: 55 });
    expect(ageRange({ y: 1950, m: 6, d: 1 }, { y: 2006, m: 6, d: 1 })).toEqual({ min: 56, max: 56 });
  });

  it("minDaysApart and addYears", () => {
    expect(minDaysApart({ y: 2000, m: 12, d: 31 }, { y: 2001, m: 1, d: 1 })).toBe(1);
    expect(minDaysApart({ y: 2000 }, { y: 2001 })).toBe(1);
    expect(minDaysApart({ y: 2000, m: 1, d: 1 }, { y: 2000, m: 1, d: 5 })).toBe(4);
    expect(addYears({ y: 2000, m: 2, d: 29 }, 1)).toEqual({ y: 2001, m: 2, d: 28 });
  });
});

describe("follow-up checks (#116)", () => {
  it("none of the examples has a problem from a follow-up check", () => {
    const followUp = new Set(RULES.slice(RULES.findIndex(r => r.id === "parent-born-after-child")).map(r => r.id));
    const hits = EXAMPLES.flatMap(ex => findProblems(ex.data, RULES, TODAY).filter(p => followUp.has(p.rule)).map(p => p.id));
    expect(hits).toEqual([]);
  });

  it("a plausible family with dates is clean", () => {
    const p = family([ind("c1", { dob: "1985-04-02" }), ind("c2", { sex: "male", dob: "1987" })],
      { father: { dob: "1955", dod: "2010", deceased: true }, mother: { dob: "1958-01-20", age: "68" } });
    expect(rules(p)).toEqual([]);
  });

  it("1. parent born after their child (error, genetic parents only)", () => {
    const p = family([ind("c", { dob: "1980" })], { mother: { dob: "1990" } });
    expect(only(p, "parent-born-after-child")).toMatchObject([{ individualId: "c", severity: "error", field: "dob" }]);
    expect(only(family([ind("c", { dob: "1980" })], { mother: { dob: "1980-05" } }), "parent-born-after-child")).toEqual([]);
    // Adopted in (#12): the parents shown are the adoptive ones.
    expect(only(family([ind("c", { dob: "1980", adopted: "in" })], { mother: { dob: "1990" } }), "parent-born-after-child")).toEqual([]);
    // A social parent (#45) is not a genetic parent.
    const social = family([ind("c", { dob: "1980", socialParents: ["s"] })], { extra: [ind("s", { sex: "male", dob: "1990" })], ped: {} });
    social.partnerships.push({ id: "q", individual1: "s", individual2: "m" });
    expect(only(social, "parent-born-after-child")).toEqual([]);
  });

  it("2. a parent under 12, or the genetic mother over 55, at the birth", () => {
    expect(only(family([ind("c", { dob: "2000" })], { father: { dob: "1990" } }), "parent-too-young")).toHaveLength(1);
    expect(only(family([ind("c", { dob: "2000" })], { father: { dob: "1988" } }), "parent-too-young")).toEqual([]);
    expect(only(family([ind("c", { dob: "2000" })], { mother: { dob: "1940" } }), "mother-too-old")).toHaveLength(1);
    expect(only(family([ind("c", { dob: "2000" })], { mother: { dob: "1945" } }), "mother-too-old")).toEqual([]);
    expect(only(family([ind("c", { dob: "2000" })], { father: { dob: "1930" } }), "mother-too-old")).toEqual([]);
    // An egg donor (#45) is the genetic mother; the intended mother carried the pregnancy.
    const egg: Pedigree = {
      individuals: [ind("f", { sex: "male" }), ind("m", { dob: "1940" }), ind("d", { dob: "1975", reproductiveRole: "donor" }), ind("c", { dob: "2000", carriedBy: "m" })],
      partnerships: [{ id: "p", individual1: "f", individual2: "m" }, { id: "q", individual1: "f", individual2: "d", donorConception: true }],
      parentOf: { q: ["c"] },
      siblingOrder: { mode: "insertion", affectedFirst: false },
    };
    expect(only(egg, "mother-too-old")).toEqual([]);
  });

  it("3. born after the mother died, or more than a year after the father died", () => {
    expect(only(family([ind("c", { dob: "2001" })], { mother: { dod: "2000", deceased: true } }), "born-after-mother-died")).toHaveLength(1);
    expect(only(family([ind("c", { dob: "2000-05" })], { mother: { dod: "2000", deceased: true } }), "born-after-mother-died")).toEqual([]);
    expect(only(family([ind("c", { dob: "2002" })], { father: { dod: "2000", deceased: true } }), "born-long-after-father-died")).toHaveLength(1);
    expect(only(family([ind("c", { dob: "2001-05" })], { father: { dod: "2000-08", deceased: true } }), "born-long-after-father-died")).toEqual([]);
    expect(only(family([ind("c", { dob: "2001-09" })], { father: { dod: "2000-08", deceased: true } }), "born-long-after-father-died")).toHaveLength(1);
    // A sperm donor's sperm is often used long after.
    expect(only(family([ind("c", { dob: "2005" })], { father: { dod: "2000", deceased: true, reproductiveRole: "donor" }, couple: { donorConception: true } }), "born-long-after-father-died")).toEqual([]);
  });

  it("4. a date in the future, not for a pregnancy", () => {
    const p = family([ind("c", { dob: "2027" }), ind("d", { dob: "2026-12", lifeStatus: "pregnancy" })], { father: { dod: "2030", deceased: true } });
    expect(only(p, "date-in-future").map(x => [x.individualId, x.field])).toEqual([["f", "dod"], ["c", "dob"]]);
    expect(only(family([ind("c", { dob: "2026-11" })]), "date-in-future")).toEqual([]);
  });

  it("5. living and over 110, fixed by marking deceased", () => {
    const p = family([ind("c", { dob: "1990" })], { mother: { dob: "1910" } });
    const [prob] = only(p, "living-over-110");
    expect(prob).toMatchObject({ individualId: "m", fix: { label: "Mark deceased" } });
    expect(only(family([ind("c")], { mother: { dob: "1916" } }), "living-over-110")).toEqual([]);
    expect(only(family([ind("c")], { mother: { dob: "1900", deceased: true } }), "living-over-110")).toEqual([]);
  });

  it("6. a free-text age that clearly disagrees with the date of birth", () => {
    expect(ageInYears("34")).toEqual({ years: 34, atDeath: false });
    expect(ageInYears("34 y")).toEqual({ years: 34, atDeath: false });
    expect(ageInYears("d. 72")).toEqual({ years: 72, atDeath: true });
    for (const t of ["50s", "~40", "4 mo", "about 30", "34-35", ""]) expect(ageInYears(t)).toBeUndefined();
    const at = (o: Partial<Individual>, ped?: Partial<Pedigree>) => only(family([ind("c", o)], { ped }), "age-disagrees");
    expect(at({ dob: "1990", age: "20" })).toHaveLength(1);
    expect(at({ dob: "1990", age: "36y" })).toEqual([]);
    expect(at({ dob: "1990", age: "37" })).toEqual([]); // 35 or 36, a year either way
    expect(at({ dob: "1990", age: "50s" })).toEqual([]);
    // At death, from a date of death.
    expect(at({ dob: "1930-01-01", dod: "2000-06-01", deceased: true, age: "d. 70" })).toEqual([]);
    expect(at({ dob: "1930-01-01", dod: "2000-06-01", deceased: true, age: "d. 60" })).toHaveLength(1);
    expect(at({ dob: "1930-01-01", deceased: true, age: "d. 60" })).toEqual([]);
    // As of the date recorded (#102).
    expect(at({ dob: "1990", age: "20" }, { clinicalDetails: { recordedOn: "2010-03-01" } })).toEqual([]);
  });

  it("7. twins born more than a day apart", () => {
    const twins = (a: string, b: string) => family([ind("a", { dob: a }), ind("b", { dob: b })], { couple: { twins: [{ members: ["a", "b"], zygosity: "dizygotic" }] } });
    expect(only(twins("1990-01-01", "1990-01-05"), "twins-born-apart")).toMatchObject([{ individualId: "b" }]);
    expect(only(twins("1990-12-31", "1991-01-01"), "twins-born-apart")).toEqual([]);
    expect(only(twins("1990", "1990-03"), "twins-born-apart")).toEqual([]);
    expect(only(twins("1990", "1992"), "twins-born-apart")).toHaveLength(1);
  });

  it("8. siblings drawn out of birth order, respecting the setting and twins", () => {
    const sibs = (o: Partial<Pedigree> = {}, twins = false) => family([
      ind("a", { dob: "1990", sibOrder: 0 }), ind("b", { dob: "1985", sibOrder: 1, affected: true }), ind("c", { dob: "1992", sibOrder: 2 }),
    ], { ped: o, couple: twins ? { twins: [{ members: ["a", "b"], zygosity: "unknown" }] } : {} });
    const [prob] = only(sibs(), "siblings-out-of-order");
    expect(prob).toMatchObject({ individualId: "b", fix: { label: "Order siblings by birth date" } });
    expect(only(sibs({ siblingOrder: { mode: "birthDate", affectedFirst: false } }), "siblings-out-of-order")).toEqual([]);
    expect(only(sibs({ siblingOrder: { mode: "manual", affectedFirst: false } }), "siblings-out-of-order")).toEqual([]);
    // Affected first puts b first on purpose; a and c are in order.
    expect(only(sibs({ siblingOrder: { mode: "insertion", affectedFirst: true } }), "siblings-out-of-order")).toEqual([]);
    // Twins are drawn together and not compared.
    expect(only(sibs({}, true), "siblings-out-of-order")).toEqual([]);
    // The fix orders by birth date, and the warning goes.
    usePedigreeStore.getState().initialize(sibs());
    prob!.fix!.apply(usePedigreeStore.getState());
    expect(only(usePedigreeStore.getState().pedigree, "siblings-out-of-order")).toEqual([]);
  });

  it("9. a pregnancy or loss with a partner or children (error)", () => {
    const p = family([ind("c")], { mother: { lifeStatus: "miscarriage" } });
    expect(only(p, "pregnancy-with-family")).toMatchObject([{ individualId: "m", severity: "error", field: "lifeStatus" }]);
    expect(only(family([ind("c", { lifeStatus: "pregnancy" })]), "pregnancy-with-family")).toEqual([]);
  });

  it("10. affected and a carrier, or presymptomatic on someone affected, with fixes", () => {
    const p = family([ind("c", { affected: true, carrier: true }), ind("d", { affected: true, presymptomatic: true })]);
    const problems = findProblems(p, RULES, TODAY);
    const ac = problems.find(x => x.rule === "affected-and-carrier")!;
    const ps = problems.find(x => x.rule === "presymptomatic-affected")!;
    expect(ac).toMatchObject({ individualId: "c", field: "carrier", fix: { label: "Not a carrier" } });
    expect(ps).toMatchObject({ individualId: "d", field: "carrier", fix: { label: "Not presymptomatic" } });
    usePedigreeStore.getState().initialize(p);
    ac.fix!.apply(usePedigreeStore.getState());
    ps.fix!.apply(usePedigreeStore.getState());
    const after = usePedigreeStore.getState().pedigree;
    expect(after.individuals.find(i => i.id === "c")).toMatchObject({ affected: true, carrier: false });
    expect(after.individuals.find(i => i.id === "d")!.presymptomatic).toBeUndefined();
    expect(rules(after)).toEqual([]);
    expect(only(family([ind("c", { carrier: true })]), "affected-and-carrier")).toEqual([]);
    // A tag in both lists (hand-edited JSON).
    const cf: Tag = { id: "cf", label: "CF", color: "#000", style: "quadrant" };
    const both = family([ind("c", { affected: true, tags: ["cf"], carrierTags: ["cf"] })], { ped: { tags: [cf] } });
    expect(only(both, "affected-and-carrier")).toMatchObject([{ fix: { label: "Keep affected" } }]);
    // Affected with one condition and a carrier of another is fine.
    const ts: Tag = { id: "ts", label: "TS", color: "#111", style: "quadrant" };
    expect(only(family([ind("c", { affected: true, tags: ["cf"], carrierTags: ["ts"] })], { ped: { tags: [cf, ts] } }), "affected-and-carrier")).toEqual([]);
  });

  it("11. an age of onset on someone unaffected, fixed by clearing it", () => {
    const cf: Tag = { id: "cf", label: "CF", color: "#000", style: "quadrant" };
    const p = family([ind("c", { onset: "40s", tagOnset: { cf: "5y" } })], { ped: { tags: [cf] } });
    const found = only(p, "onset-unaffected");
    expect(found).toHaveLength(2);
    usePedigreeStore.getState().initialize(p);
    for (const x of found) x.fix!.apply(usePedigreeStore.getState());
    expect(only(usePedigreeStore.getState().pedigree, "onset-unaffected")).toEqual([]);
    expect(only(family([ind("c", { affected: true, onset: "40s" })]), "onset-unaffected")).toEqual([]);
  });

  it("12. an empty evaluation, or one documented with no result", () => {
    const p = family([ind("c", { evaluations: [{}, { detail: "echo", result: "negative" }] }), ind("d", { evaluations: [{ detail: "BRCA1", documented: true }] })]);
    expect(only(p, "evaluation-empty")).toMatchObject([{ individualId: "c", field: "evaluations", fix: { label: "Remove empty evaluations" } }]);
    expect(only(p, "evaluation-documented-no-result")).toMatchObject([{ individualId: "d" }]);
    usePedigreeStore.getState().initialize(p);
    only(p, "evaluation-empty")[0]!.fix!.apply(usePedigreeStore.getState());
    expect(usePedigreeStore.getState().pedigree.individuals.find(i => i.id === "c")!.evaluations).toEqual([{ detail: "echo", result: "negative" }]);
    expect(only(family([ind("c", { evaluations: [{ documented: true, result: "positive" }] })]), "evaluation-documented-no-result")).toEqual([]);
  });

  it("13. carried by a man; a donor or surrogate linked to no child", () => {
    const p = family([ind("c", { carriedBy: "f" })]);
    expect(only(p, "carried-by-male")).toMatchObject([{ individualId: "c", field: "carriedBy" }]);
    const lone = family([ind("c")], { extra: [ind("s", { reproductiveRole: "surrogate" }), ind("d", { sex: "male", reproductiveRole: "donor" })] });
    lone.partnerships.push({ id: "q", individual1: "d", individual2: "s" }); // connected, but no child
    expect(only(lone, "role-not-linked").map(x => x.individualId)).toEqual(["s", "d"]);
    // A surrogate who carried a child, and a donor who is a genetic parent, are linked.
    const linked = family([ind("c", { carriedBy: "s" })], { father: { reproductiveRole: "donor" }, couple: { donorConception: true }, extra: [ind("s", { reproductiveRole: "surrogate" })] });
    expect(only(linked, "role-not-linked")).toEqual([]);
  });

  it("14. someone not connected to anyone else", () => {
    const p = family([ind("c")], { extra: [ind("x")] });
    expect(only(p, "not-connected").map(x => x.individualId)).toEqual(["x"]);
    expect(only({ ...p, individuals: [ind("x")], partnerships: [], parentOf: {} }, "not-connected")).toEqual([]);
    // A surrogate's line connects her.
    expect(only(family([ind("c", { carriedBy: "x" })], { extra: [ind("x")] }), "not-connected")).toEqual([]);
  });

  it("15. a tag or person id that points at nothing", () => {
    const cf: Tag = { id: "cf", label: "CF", color: "#000", style: "quadrant" };
    const p = family([ind("c", { tags: ["cf", "gone"], socialParents: ["nobody"], carriedBy: "ghost" })], { ped: { tags: [cf] } });
    const [prob] = only(p, "missing-reference");
    expect(prob).toMatchObject({ individualId: "c", fix: { label: "Remove what is missing" } });
    usePedigreeStore.getState().initialize(p);
    prob!.fix!.apply(usePedigreeStore.getState());
    const c = usePedigreeStore.getState().pedigree.individuals.find(i => i.id === "c")!;
    expect(c.tags).toEqual(["cf"]);
    expect(c.socialParents).toBeUndefined();
    expect(c.carriedBy).toBeUndefined();
    const broken = family([ind("c")], { couple: { twins: [{ members: ["c", "z"], zygosity: "unknown" }] } });
    expect(only(broken, "missing-reference")).toMatchObject([{ partnershipId: "p", severity: "error" }]);
  });
});

describe("problems list (#116 follow-up)", () => {
  beforeEach(() => { resetProblemStep(); usePedigreeStore.getState().initialize(family([])); });

  /** Three living people over 110 and one more problem. */
  const old = () => family([ind("c", { dob: "1912", sex: "male", name: "Carl" }), ind("d", { dob: "1913" })], { mother: { dob: "1890" }, father: { dob: "1888", lifeStatus: undefined } });

  it("names people by pedigree number, keeping the name", () => {
    const p = old();
    const subjects = problemsOf(p).all.filter(x => x.rule === "living-over-110").map(x => problemSubject(p, x));
    expect(subjects).toEqual(["I-1, unnamed male", "I-2, unnamed female", "II-1, Carl", "II-2, unnamed female"]);
  });

  it("problemsLike groups the same fix of the same rule", () => {
    const all = problemsOf(old()).all;
    const first = all.find(x => x.rule === "living-over-110")!;
    expect(problemsLike(all, first, "Mark deceased").map(x => x.problem.individualId)).toEqual(["f", "m", "c", "d"]);
    expect(problemsLike(all, first, "Something else")).toEqual([]);
    expect(fixesOf(first).map(f => f.label)).toEqual(["Mark deceased"]);
  });

  it("Fix all like this is one undo step", () => {
    usePedigreeStore.getState().initialize(old());
    const before = usePedigreeStore.getState().past.length;
    const first = problemsOf(usePedigreeStore.getState().pedigree).all.find(x => x.rule === "living-over-110")!;
    expect(fixAllLike(first, "Mark deceased")).toBe(4);
    const s = usePedigreeStore.getState();
    expect(s.pedigree.individuals.every(i => i.deceased)).toBe(true);
    expect(s.past.length).toBe(before + 1);
    s.undo();
    expect(usePedigreeStore.getState().pedigree.individuals.some(i => i.deceased)).toBe(false);
  });

  it("the shared fix component draws the fixes and, for several alike, Fix all", () => {
    usePedigreeStore.getState().initialize(old());
    const all = problemsOf(usePedigreeStore.getState().pedigree).all;
    const html = renderToStaticMarkup(createElement(ProblemFixes, { problem: all.find(x => x.rule === "living-over-110")!, all }));
    expect(html).toContain('data-problem-fix="Mark deceased"');
    expect(html).toContain("Fix all 4 like this");
    // A single problem gets no Fix all; a problem without fixes draws nothing.
    usePedigreeStore.getState().initialize(family([ind("c", { dob: "1900" })]));
    const oneAll = problemsOf(usePedigreeStore.getState().pedigree).all;
    const one = oneAll.find(x => x.rule === "living-over-110")!;
    expect(renderToStaticMarkup(createElement(ProblemFixes, { problem: one, all: oneAll }))).not.toContain("Fix all");
    const none: Problem = { id: "x:c", rule: "x", severity: "warning", message: "m" };
    expect(renderToStaticMarkup(createElement(ProblemFixes, { problem: none }))).toBe("");
  });

  it("several fixes each get their own (all N)", () => {
    const tags: Tag[] = [{ id: "a", label: "A", color: "#000", style: "quadrant" }, { id: "b", label: "B", color: "#111", style: "quadrant" }];
    usePedigreeStore.getState().initialize(family([ind("c", { affected: true }), ind("d", { affected: true })], { ped: { tags } }));
    const all = problemsOf(usePedigreeStore.getState().pedigree).all;
    const p = all.find(x => x.rule === "condition-not-recorded")!;
    const html = renderToStaticMarkup(createElement(ProblemFixes, { problem: p, all }));
    expect(html.match(/\(all 2\)/g)).toHaveLength(2);
    fixAllLike(p, "Record as B");
    expect(usePedigreeStore.getState().pedigree.individuals.filter(i => i.tags?.includes("b")).map(i => i.id)).toEqual(["c", "d"]);
  });

  it("adjacentProblem steps, wraps, and carries on after a fixed one", () => {
    const p = old();
    const all = problemsOf(p).all;
    expect(adjacentProblem(p, all, null, 1)).toBe(all[0]);
    expect(adjacentProblem(p, all, null, -1)).toBe(all[all.length - 1]);
    expect(adjacentProblem(p, all, null, 1, "c")!.individualId).toBe("c");
    expect(adjacentProblem(p, all, { id: all[0]!.id, index: 0 }, 1)).toBe(all[1]);
    expect(adjacentProblem(p, all, { id: all[0]!.id, index: 0 }, -1)).toBe(all[all.length - 1]);
    // all[1] was fixed: what is now at index 1 comes next, the one before it previous.
    const rest = all.filter((_, i) => i !== 1);
    expect(adjacentProblem(p, rest, { id: all[1]!.id, index: 1 }, 1)).toBe(all[2]);
    expect(adjacentProblem(p, rest, { id: all[1]!.id, index: 1 }, -1)).toBe(all[0]);
    expect(adjacentProblem(p, [], null, 1)).toBeUndefined();
  });

  it("stepProblem (F8 / Shift+F8) selects each problem's person in turn", () => {
    usePedigreeStore.getState().initialize(old());
    const all = problemsOf(usePedigreeStore.getState().pedigree).all;
    const seen: (string | null)[] = [];
    for (let i = 0; i < all.length; i++) { stepProblem(1); seen.push(usePedigreeStore.getState().selectedId); }
    expect(seen).toEqual(all.map(x => x.individualId));
    stepProblem(1);
    expect(usePedigreeStore.getState().selectedId).toBe(all[0]!.individualId);
    stepProblem(-1);
    expect(usePedigreeStore.getState().selectedId).toBe(all[all.length - 1]!.individualId);
    usePedigreeStore.getState().initialize(family([ind("c")]));
    expect(stepProblem(1)).toBe(false);
  });

  it("groupEdits leaves no step when nothing was edited", () => {
    const before = usePedigreeStore.getState().past.length;
    usePedigreeStore.getState().groupEdits(() => {});
    expect(usePedigreeStore.getState().past.length).toBe(before);
  });
});
