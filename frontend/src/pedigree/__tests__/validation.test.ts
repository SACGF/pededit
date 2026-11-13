import { describe, it, expect, beforeEach } from "vitest";
import {
  findProblems, problemsOf, fieldProblems, dateBefore, worstSeverity, problemSubject, problemTarget, RULES,
  type Rule,
} from "../validation";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { exportSvg } from "../../io/svg/svgExporter";
import { EXAMPLES } from "../../data/examples";
import type { Individual, Pedigree } from "@pedigree-editor/layout-engine";

const ind = (o: Partial<Individual>): Individual => ({ id: "x", sex: "male", affected: false, sibOrder: 0, ...o });

function ped(individuals: Individual[], extra: Partial<Pedigree> = {}): Pedigree {
  return {
    individuals,
    partnerships: [],
    parentOf: {},
    siblingOrder: { mode: "insertion", affectedFirst: false },
    ...extra,
  };
}

/** The problems, less "not connected" (#116 follow-up): these tests use lone people. */
const found = (p: Pedigree) => findProblems(p).filter(x => x.rule !== "not-connected");
const rulesOf = (p: Pedigree) => found(p).map(x => x.rule);

describe("editor warnings (#116): starter rules", () => {
  it("a clean pedigree has no problems", () => {
    const p = ped([
      ind({ id: "a", dob: "1935-06-10", dod: "2007", deceased: true }),
      ind({ id: "b", proband: true, affected: true, dob: "1960" }),
      ind({ id: "c", deceased: true }), // deceased, date unknown: fine
    ]);
    expect(found(p)).toEqual([]);
  });

  it("dob-unparseable: a date of birth that does not read as a date", () => {
    const [prob] = found(ped([ind({ id: "a", dob: "June 1935" })]));
    expect(prob).toMatchObject({ rule: "dob-unparseable", id: "dob-unparseable:a", severity: "warning", individualId: "a", field: "dob" });
    expect(rulesOf(ped([ind({ id: "a", dob: "  " })]))).toEqual([]);
    expect(rulesOf(ped([ind({ id: "a", dob: "1935-03" })]))).toEqual([]);
  });

  it("dod-unparseable: a date of death that does not read as a date", () => {
    expect(found(ped([ind({ id: "a", dod: "2007-13", deceased: true })]))).toMatchObject([
      { rule: "dod-unparseable", field: "dod", severity: "warning" },
    ]);
  });

  it("death-before-birth compares only the parts both dates have", () => {
    const at = (dob: string, dod: string) => rulesOf(ped([ind({ id: "a", dob, dod, deceased: true })]));
    expect(at("1960", "1959")).toEqual(["death-before-birth"]);
    expect(at("1960-05", "1960-04")).toEqual(["death-before-birth"]);
    expect(at("1960-05-10", "1960-05-09")).toEqual(["death-before-birth"]);
    expect(at("1960-05-10", "1960")).toEqual([]);
    expect(at("1960", "1960-01-01")).toEqual([]);
    expect(at("1960-05-10", "1960-05-10")).toEqual([]);
    const [prob] = found(ped([ind({ id: "a", dob: "1960", dod: "1959", deceased: true })]));
    expect(prob).toMatchObject({ severity: "error", field: "dod" });
  });

  it("dateBefore", () => {
    expect(dateBefore({ y: 2000 }, { y: 2001 })).toBe(true);
    expect(dateBefore({ y: 2001, m: 2 }, { y: 2001 })).toBe(false);
    expect(dateBefore({ y: 2001, m: 2, d: 3 }, { y: 2001, m: 2, d: 4 })).toBe(true);
  });

  it("dod-not-deceased: a date of death on someone not marked deceased, fixed by marking them", () => {
    const p = ped([ind({ id: "a", dod: "2007" })]);
    const [prob] = found(p);
    expect(prob).toMatchObject({ rule: "dod-not-deceased", field: "dod", fix: { label: "Mark deceased" } });
    usePedigreeStore.getState().initialize(p);
    prob!.fix!.apply(usePedigreeStore.getState());
    const after = usePedigreeStore.getState().pedigree;
    expect(after.individuals[0]).toMatchObject({ deceased: true, dod: "2007" });
    expect(found(after)).toEqual([]);
  });

  it("proband-unaffected (NSGC 2022), fixed by marking affected", () => {
    const p = ped([ind({ id: "a", proband: true }), ind({ id: "b", consultand: true })]);
    const problems = found(p);
    expect(problems).toMatchObject([{ rule: "proband-unaffected", individualId: "a", field: "affected", fix: { label: "Mark affected" } }]);
    usePedigreeStore.getState().initialize(p);
    problems[0]!.fix!.apply(usePedigreeStore.getState());
    expect(found(usePedigreeStore.getState().pedigree)).toEqual([]);
  });

  it("consultand-deceased: fixed by unmarking the consultand or marking living", () => {
    const p = ped([ind({ id: "a", consultand: true, deceased: true, dod: "2001" })]);
    const problems = found(p);
    expect(problems).toMatchObject([{ rule: "consultand-deceased", individualId: "a", field: "consultand", fix: { label: "Not the consultand" }, moreFixes: [{ label: "Mark living" }] }]);
    usePedigreeStore.getState().initialize(p);
    problems[0]!.moreFixes![0]!.apply(usePedigreeStore.getState());
    expect(usePedigreeStore.getState().pedigree.individuals[0]).toMatchObject({ consultand: true, deceased: false });
    expect(found(usePedigreeStore.getState().pedigree)).toEqual([]);
    usePedigreeStore.getState().initialize(p);
    problems[0]!.fix!.apply(usePedigreeStore.getState());
    expect(found(usePedigreeStore.getState().pedigree)).toEqual([]);
  });

  it("consultand-deceased: a loss is flagged, a pregnancy is not", () => {
    const loss = found(ped([ind({ id: "a", consultand: true, lifeStatus: "stillbirth" })]));
    expect(loss).toMatchObject([{ rule: "consultand-deceased", fix: { label: "Not the consultand" } }]);
    expect(loss[0]!.moreFixes).toBeUndefined();
    expect(found(ped([ind({ id: "a", consultand: true, lifeStatus: "pregnancy" })]))).toEqual([]);
  });

  it("every rule id is unique", () => {
    expect(new Set(RULES.map(r => r.id)).size).toBe(RULES.length);
  });
});

describe("editor warnings (#116): the module", () => {
  beforeEach(() => usePedigreeStore.getState().initialize(ped([])));

  it("memoises per pedigree object", () => {
    const p = ped([ind({ id: "a", dob: "x" })]);
    expect(problemsOf(p)).toBe(problemsOf(p));
    expect(problemsOf({ ...p })).not.toBe(problemsOf(p));
  });

  it("recomputes after a store edit", () => {
    usePedigreeStore.getState().initialize(ped([ind({ id: "a" })]));
    expect(problemsOf(usePedigreeStore.getState().pedigree).all).toEqual([]);
    usePedigreeStore.getState().setDateOfDeath("a", "nope");
    expect(problemsOf(usePedigreeStore.getState().pedigree).all.map(x => x.rule)).toEqual(["dod-unparseable"]);
  });

  it("indexes by person and counts by severity", () => {
    const p = ped([
      ind({ id: "a", dob: "1960", dod: "1950", deceased: true }),
      ind({ id: "b", dob: "soon", sex: "female" }),
      ind({ id: "c" }),
    ], { partnerships: [{ id: "p", individual1: "a", individual2: "b" }], parentOf: { p: ["c"] } });
    const idx = problemsOf(p);
    expect(idx.errors).toBe(1);
    expect(idx.warnings).toBe(1);
    expect(idx.byIndividual.get("a")!.map(x => x.rule)).toEqual(["death-before-birth"]);
    expect(idx.byIndividual.has("c")).toBe(false);
    expect(fieldProblems(p, "a", "dod")).toHaveLength(1);
    expect(fieldProblems(p, "a", "dob")).toHaveLength(0);
    expect(worstSeverity(idx.all)).toBe("error");
    expect(worstSeverity([])).toBeUndefined();
  });

  it("runs partnership rules, listing a couple's problem under both partners", () => {
    const coupleRule: Rule = {
      id: "test-couple",
      partnership: (q) => q.ended && { severity: "warning", message: "ended" },
    };
    const p = ped([ind({ id: "a", name: "Al" }), ind({ id: "b", sex: "female" })], {
      partnerships: [{ id: "p1", individual1: "a", individual2: "b", ended: true }],
    });
    const [prob] = findProblems(p, [coupleRule]);
    expect(prob).toMatchObject({ id: "test-couple:p1", partnershipId: "p1" });
    expect(problemSubject(p, prob!)).toBe("I-1, Al and I-2, unnamed female");
    expect(problemSubject(p, prob!, new Map())).toBe("Al and Unnamed female");
    expect(problemTarget(p, prob!)).toBe("a");
  });

  it("a rule may return several drafts, each with its own id", () => {
    const many: Rule = { id: "many", individual: () => [{ severity: "warning", message: "1" }, { severity: "warning", message: "2" }] };
    expect(findProblems(ped([ind({ id: "a" })]), [many]).map(x => x.id)).toEqual(["many:a", "many:a:1"]);
  });

  it("never changes what the SVG export draws", () => {
    const p = ped([ind({ id: "a", proband: true, dob: "1960", dod: "1950", deceased: true })]);
    expect(problemsOf(p).all.length).toBeGreaterThan(0);
    const svg = exportSvg(p);
    expect(svg).not.toMatch(/problem/i);
  });

  it("runs on every example without throwing", () => {
    for (const ex of EXAMPLES) expect(() => findProblems(ex.data)).not.toThrow();
  });
});
