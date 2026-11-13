/**
 * Editor warnings (#116): one pure pass from a pedigree to the problems in
 * it, so the edit panel, the toolbar's problems list, the canvas marker and
 * the tests all agree. Problems never block saving or editing: they point
 * at something the UI allows but that is probably a mistake.
 *
 * A new check is one entry in `RULES`. Most look at one person
 * (`individual`) or one couple (`partnership`) and return a draft, which
 * `problemsOf` turns into a problem with a stable id and the person or
 * couple attached. `context` is computed once per pedigree for checks that
 * need the whole pedigree (for example "two or more conditions", #115).
 *
 * `field` names the edit panel field to highlight and focus; the panel
 * wraps each such field in `data-problem-field` (see `PROBLEM_FIELDS`).
 * `fix` is an optional one-click repair through the pedigree store's
 * setters (`FixActions` lists the ones fixes may use; the store satisfies it).
 */
import type { Individual, Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import { parsePartialDate, type PartialDate } from "./labels";

export type Severity = "warning" | "error";

/**
 * Edit panel fields a problem can point at. Each is wrapped in
 * `data-problem-field` in `EditPanel`, which is what the problems list
 * focuses. Add a value here and wrap its field when a rule needs a new one.
 */
export type ProblemField = "dob" | "dod" | "affected";

/** The pedigree store setters a fix may call. `usePedigreeStore.getState()` satisfies it. */
export interface FixActions {
  setAffected: (id: string, affected: boolean) => void;
  setDeceased: (id: string, deceased: boolean) => void;
}

export interface ProblemFix {
  /** Button text, a short imperative ("Mark affected"). */
  label: string;
  apply: (actions: FixActions) => void;
}

export interface Problem {
  /** `rule:subject`, stable while the problem lasts (React key, harness selector). */
  id: string;
  rule: string;
  severity: Severity;
  individualId?: string;
  partnershipId?: string;
  field?: ProblemField;
  message: string;
  fix?: ProblemFix;
}

/** What a rule returns for one person or couple; `problemsOf` fills in the rest. */
export type ProblemDraft = Pick<Problem, "severity" | "message"> & { field?: ProblemField; fix?: ProblemFix };

/** Facts about the whole pedigree, worked out once per pass for rules that need them. */
export interface RuleContext {
  pedigree: Pedigree;
}

type Drafts = ProblemDraft | ProblemDraft[] | undefined | null | false;

export interface Rule {
  id: string;
  individual?: (ind: Individual, ctx: RuleContext) => Drafts;
  partnership?: (p: Partnership, ctx: RuleContext) => Drafts;
}

function parsed(text: string | undefined): PartialDate | undefined {
  const t = text?.trim();
  return t ? parsePartialDate(t) : undefined;
}

function unparseable(text: string | undefined): boolean {
  const t = text?.trim();
  return !!t && !parsePartialDate(t);
}

/**
 * Whether `a` is certainly before `b`, comparing only the parts both dates
 * have: 2007 is not before 2007-03-14, 2007-02 is before 2007-03.
 */
export function dateBefore(a: PartialDate, b: PartialDate): boolean {
  if (a.y !== b.y) return a.y < b.y;
  if (a.m === undefined || b.m === undefined) return false;
  if (a.m !== b.m) return a.m < b.m;
  if (a.d === undefined || b.d === undefined) return false;
  return a.d < b.d;
}

/** The starter rules. Keep each small and uncontroversial: a warning nobody can clear trains people to ignore them. */
export const RULES: Rule[] = [
  {
    // Moved here from the edit panel's hint (#104).
    id: "dob-unparseable",
    individual: ind => unparseable(ind.dob) && {
      severity: "warning",
      field: "dob",
      message: "Not read as a date, so drawn as typed. Use a year (1935) or a date (1935-03-14).",
    },
  },
  {
    // Moved here from the edit panel's hint (#103).
    id: "dod-unparseable",
    individual: ind => unparseable(ind.dod) && {
      severity: "warning",
      field: "dod",
      message: "Not read as a date, so not drawn. Use a year (2007) or a date (2007-03-14).",
    },
  },
  {
    id: "death-before-birth",
    individual: ind => {
      const birth = parsed(ind.dob), death = parsed(ind.dod);
      return !!birth && !!death && dateBefore(death, birth) && {
        severity: "error",
        field: "dod",
        message: "Date of death is before the date of birth.",
      };
    },
  },
  {
    // The editor ticks deceased with a date of death (#103), so this comes from imported or older data.
    id: "dod-not-deceased",
    individual: ind => !!ind.dod?.trim() && !ind.deceased && {
      severity: "warning",
      field: "dod",
      message: "Has a date of death but is not marked deceased, so the date is not drawn.",
      fix: { label: "Mark deceased", apply: a => a.setDeceased(ind.id, true) },
    },
  },
  {
    // NSGC 2022: the proband is the affected person through whom the family comes to attention.
    id: "proband-unaffected",
    individual: ind => !!ind.proband && !ind.affected && {
      severity: "warning",
      field: "affected",
      message: "The proband is not marked affected. NSGC: the proband is always affected; an unaffected person seeking advice is the consultand.",
      fix: { label: "Mark affected", apply: a => a.setAffected(ind.id, true) },
    },
  },
];

function asList(d: Drafts): ProblemDraft[] {
  if (!d) return [];
  return Array.isArray(d) ? d : [d];
}

/** Every problem the rules find, people in pedigree order then couples. Not memoised: see `problemsOf`. */
export function findProblems(pedigree: Pedigree, rules: Rule[] = RULES): Problem[] {
  const ctx: RuleContext = { pedigree };
  const out: Problem[] = [];
  for (const ind of pedigree.individuals) {
    for (const rule of rules) {
      if (!rule.individual) continue;
      asList(rule.individual(ind, ctx)).forEach((d, k) =>
        out.push({ ...d, id: `${rule.id}:${ind.id}${k ? `:${k}` : ""}`, rule: rule.id, individualId: ind.id }));
    }
  }
  for (const p of pedigree.partnerships) {
    for (const rule of rules) {
      if (!rule.partnership) continue;
      asList(rule.partnership(p, ctx)).forEach((d, k) =>
        out.push({ ...d, id: `${rule.id}:${p.id}${k ? `:${k}` : ""}`, rule: rule.id, partnershipId: p.id }));
    }
  }
  return out;
}

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

/** The worst severity in a list, or undefined when it is empty. */
export function worstSeverity(problems: Problem[]): Severity | undefined {
  if (problems.length === 0) return undefined;
  return problems.some(p => p.severity === "error") ? "error" : "warning";
}

/** Who a problem is about, for the problems list: the person's name, else their sex. */
export function problemSubject(pedigree: Pedigree, problem: Problem): string {
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    const name = ind?.name?.trim();
    if (name) return name;
    return ind?.sex === "male" ? "Unnamed male" : ind?.sex === "female" ? "Unnamed female" : "Unnamed person";
  };
  if (problem.individualId) return label(problem.individualId);
  const couple = pedigree.partnerships.find(p => p.id === problem.partnershipId);
  return couple ? `${label(couple.individual1)} and ${label(couple.individual2)}` : "Couple";
}

/** The person to select for a problem: the person, or a couple's first partner (the panel shows their couples). */
export function problemTarget(pedigree: Pedigree, problem: Problem): string | undefined {
  if (problem.individualId) return problem.individualId;
  return pedigree.partnerships.find(p => p.id === problem.partnershipId)?.individual1;
}
