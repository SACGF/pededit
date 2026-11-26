/**
 * What the editor needs on top of the rules in `pedigree/validation.ts`:
 * the problems of the pedigree being edited,
 * cached and indexed by person, who a problem is about, which person to
 * select for it, and which one F8 goes to next. Used by the Person tab, the
 * toolbar's problems list, the canvas marker and the dev hooks.
 */
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { findProblems, type Problem, type ProblemField } from "../pedigree/validation";
import { pedigreeNumbers } from "../pedigree/scene";
import { personLabel } from "../pedigree/personLabel";

export interface ProblemIndex {
  all: Problem[];
  /** By person; a couple's problems are listed under both partners. */
  byIndividual: Map<string, Problem[]>;
  errors: number;
  warnings: number;
}

const cache = new WeakMap<Pedigree, ProblemIndex>();

/**
 * The problems in a pedigree, memoised per pedigree object. Every edit makes
 * a new object (immer), so this runs once per edit however many canvas nodes
 * ask.
 */
export function problemsOf(pedigree: Pedigree): ProblemIndex {
  const hit = cache.get(pedigree);
  if (hit) return hit;
  const all = findProblems(pedigree);
  const byIndividual = new Map<string, Problem[]>();
  const add = (id: string, p: Problem) => {
    const list = byIndividual.get(id);
    if (list) list.push(p); else byIndividual.set(id, [p]);
  };
  for (const p of all) {
    if (p.individualId) add(p.individualId, p);
    else if (p.partnershipId) {
      const couple = pedigree.partnerships.find(x => x.id === p.partnershipId);
      if (couple) { add(couple.individual1, p); add(couple.individual2, p); }
    }
  }
  const errors = all.filter(p => p.severity === "error").length;
  const index: ProblemIndex = { all, byIndividual, errors, warnings: all.length - errors };
  cache.set(pedigree, index);
  return index;
}

/** One person's problems on one field, for the edit panel. */
export function fieldProblems(pedigree: Pedigree, individualId: string, field: ProblemField): Problem[] {
  return (problemsOf(pedigree).byIndividual.get(individualId) ?? []).filter(p => p.field === field);
}

/**
 * Who a problem is about, for the problems list: the pedigree number
 * then the name, "II-2, Mary", or "II-2, unnamed female" with no name. The
 * number is left out for someone not drawn (a hidden branch). The
 * numbers come from the layout, so they are only worked out when asked.
 */
export function problemSubject(pedigree: Pedigree, problem: Problem, numbers: Map<string, string> = pedigreeNumbers(pedigree)): string {
  const label = (id: string) => personSubject(pedigree, id, numbers);
  if (problem.individualId) return label(problem.individualId);
  const couple = pedigree.partnerships.find(p => p.id === problem.partnershipId);
  return couple ? `${label(couple.individual1)} and ${label(couple.individual2)}` : "Couple";
}

/**
 * One person in a list of several, as the problems list and the PED warning
 * name them: "II-2, Mary", "II-2, unnamed female", or without a number
 * (someone not drawn) "Unnamed female".
 */
export function personSubject(pedigree: Pedigree, id: string, numbers: Map<string, string>): string {
  const number = numbers.get(id);
  return number ? `${number}, ${personLabel(pedigree, id, "unnamed")}` : personLabel(pedigree, id, "unnamed", { start: true });
}

/** The person to select for a problem: the person, or a couple's first partner (the panel shows their couples). */
export function problemTarget(pedigree: Pedigree, problem: Problem): string | undefined {
  if (problem.individualId) return problem.individualId;
  return pedigree.partnerships.find(p => p.id === problem.partnershipId)?.individual1;
}

/**
 * The problem to go to from the keyboard, `dir` 1 for next and -1
 * for previous, wrapping. `from` is the one gone to last: when it is still
 * listed the step is from it; when it has been fixed, the problem now in its
 * place is next. With none yet, the selected person's first problem, else
 * the first (or last) in the list.
 */
export function adjacentProblem(
  pedigree: Pedigree, all: Problem[], from: { id: string; index: number } | null, dir: 1 | -1, selectedId?: string | null,
): Problem | undefined {
  const n = all.length;
  if (n === 0) return undefined;
  if (from) {
    const i = all.findIndex(p => p.id === from.id);
    if (i >= 0) return all[(i + dir + n) % n];
    return all[((dir === 1 ? from.index : from.index - 1) % n + n) % n];
  }
  const mine = selectedId ? all.find(p => problemTarget(pedigree, p) === selectedId) : undefined;
  return mine ?? (dir === 1 ? all[0] : all[n - 1]);
}
