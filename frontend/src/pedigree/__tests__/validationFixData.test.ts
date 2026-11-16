import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATASET, DATASET_TODAY, datasetFileText } from "../../fixtures/dataset";
import { importJson } from "../../io/json";
import { applyFixEdit, findProblems, fixesOf, RULES, type FixActions, type FixEdit } from "../validation";

/*
 * #126: a fix is data, and the rules know nothing of the editor.
 */

const TODAY = new Date(`${DATASET_TODAY}T12:00:00Z`);
const fixes = DATASET.filter(c => c.group === "problems" || c.group === "drawn").flatMap(c => {
  const p = importJson(datasetFileText(c)).pedigree!;
  return findProblems(p, RULES, TODAY).flatMap(problem => fixesOf(problem).map(fix => ({ file: c.file, problem, fix })));
});

describe("fixes as data (#126)", () => {
  it("the data set offers fixes from many rules", () => {
    expect(new Set(fixes.map(f => f.problem.rule)).size).toBeGreaterThan(12);
  });

  it("every fix is a label and a plain edit that survives JSON", () => {
    for (const { file, problem, fix } of fixes) {
      expect(Object.keys(fix).sort(), `${file} ${problem.id}`).toEqual(["edit", "label"]);
      // A carrier or role being cleared is an absent key, which JSON drops too.
      expect(JSON.parse(JSON.stringify(fix.edit)), `${file} ${problem.id}`).toEqual(fix.edit);
    }
  });

  it("applyFixEdit makes exactly one call, to the setter the edit names", () => {
    for (const { fix } of fixes) {
      const calls: string[] = [];
      const actions = new Proxy({}, { get: (_t, name: string) => () => { calls.push(name); } }) as FixActions;
      applyFixEdit(fix.edit, actions);
      expect(calls).toEqual([fix.edit.op]);
    }
  });

  it("passes each edit's arguments in the setter's order", () => {
    const seen: unknown[][] = [];
    const actions = new Proxy({}, { get: () => (...args: unknown[]) => { seen.push(args); } }) as FixActions;
    const edits: FixEdit[] = [
      { op: "setAffected", id: "a", affected: true },
      { op: "setDeceased", id: "a", deceased: false },
      { op: "setConditionStatus", id: "a", tagId: "t", state: "carrier" },
      { op: "setCarrier", id: "a", carrier: false },
      { op: "setPresymptomatic", id: "a", presymptomatic: false },
      { op: "setOnset", id: "a", tagId: null, value: "" },
      { op: "setEvaluations", id: "a", evaluations: [] },
      { op: "setCarriedBy", childId: "a" },
      { op: "setReproductiveRole", id: "a" },
      { op: "updateIndividual", id: "a", updates: { consultand: false } },
      { op: "updateSiblingOrderSettings", settings: { mode: "birthDate" } },
    ];
    for (const e of edits) applyFixEdit(e, actions);
    expect(seen).toEqual([
      ["a", true], ["a", false], ["a", "t", "carrier"], ["a", false], ["a", false], ["a", null, ""], ["a", []],
      ["a", undefined], ["a", undefined], ["a", { consultand: false }], [{ mode: "birthDate" }],
    ]);
  });
});

describe("the rules are separate from the editor (#126)", () => {
  it("validation.ts imports only the data model, conditions and dates", () => {
    const source = readFileSync(join(__dirname, "../validation.ts"), "utf8");
    const imports = [...source.matchAll(/^import[^;]*?from "([^"]+)";/gms)].map(m => m[1]).sort();
    expect(imports).toEqual(["./conditions", "./dateRanges", "./labels", "@pedigree-editor/layout-engine"]);
  });
});
