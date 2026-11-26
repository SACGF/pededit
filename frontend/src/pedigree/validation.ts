/**
 * Editor warnings: one pure pass from a pedigree to the problems in
 * it, so the edit panel, the toolbar's problems list, the canvas marker and
 * the tests all agree. Problems never block saving or editing: they point
 * at something the UI allows but that is probably a mistake.
 *
 * A new check is one entry in `RULES`. Most look at one person
 * (`individual`) or one couple (`partnership`) and return a draft, which
 * `problemsOf` turns into a problem with a stable id and the person or
 * couple attached. `context` is computed once per pedigree for checks that
 * need the whole pedigree (for example "two or more conditions").
 *
 * `field` names the edit panel field to highlight and focus; the panel
 * wraps each such field in `data-problem-field` (see `PROBLEM_FIELDS`).
 * `fix` is an optional one-click repair, as data (`FixEdit`): the
 * store's `applyFix` makes the edit.
 *
 * This module is the rules only. It knows the data model, the conditions
 * and dates, and nothing of the editor: no store, no layout, no React. What
 * the editor needs on top (the per-pedigree cache, who a problem is about,
 * which problem F8 goes to) is in `components/problemList.ts`.
 */
import type {
  Evaluation, Individual, Partnership, Pedigree, ReproductiveRole, SiblingOrderSettings, Tag,
} from "@pedigree-editor/layout-engine";
import { parsePartialDate, type PartialDate } from "./labels";
import { affectedConditions, affectedControlOn, carrierLabel, conditionMode, conditionTags, isAffected, plainAffected, plainCarrier, resolvePlainAffected, type ConditionState } from "./conditions";
import { addYears, ageRange, certainlyBefore, minDaysApart, partialDateOf } from "./dateRanges";
import { childrenOf, couplesOf, parentCoupleOf } from "./graph";
import { capitalised } from "../utils/text";

export type Severity = "warning" | "error";

/**
 * Edit panel fields a problem can point at. Each is wrapped in
 * `data-problem-field` in `EditPanel`, which is what the problems list
 * focuses. Add a value here and wrap its field when a rule needs a new one.
 */
export type ProblemField =
  | "dob" | "dod" | "age" | "lifeStatus" | "affected" | "conditions" | "carrier" | "presymptomatic"
  | "evaluations" | "reproductiveRole" | "carriedBy" | "consultand";

/** The pedigree store setters a fix edit is made with. `usePedigreeStore.getState()` satisfies it. */
export interface FixActions {
  setAffected: (id: string, affected: boolean) => void;
  setDeceased: (id: string, deceased: boolean) => void;
  /** Record a condition's state. */
  setConditionStatus: (id: string, tagId: string, state: ConditionState) => void;
  setCarrier: (id: string, carrier: boolean) => void;
  setPresymptomatic: (id: string, presymptomatic: boolean) => void;
  setOnset: (id: string, tagId: string | null, value: string) => void;
  setEvaluations: (id: string, evaluations: Evaluation[]) => void;
  setCarriedBy: (childId: string, carrierId: string | undefined) => void;
  setReproductiveRole: (id: string, role: ReproductiveRole | undefined) => void;
  updateIndividual: (id: string, updates: Partial<Individual>) => void;
  updateSiblingOrderSettings: (settings: Partial<SiblingOrderSettings>) => void;
}

/**
 * What a fix does, as data: one named edit with its arguments, so a
 * fix can be compared in a test, listed, sent somewhere or applied in bulk
 * without holding a function. Most are a plain change to one person
 * (`updateIndividual`); the named ones go through the store's setter of the
 * same name because it has rules of its own (marking deceased, recording a
 * condition, clearing an onset). A new kind of fix is a new member here and a
 * case in `applyFixEdit`.
 */
export type FixEdit =
  | { op: "setAffected"; id: string; affected: boolean }
  | { op: "setDeceased"; id: string; deceased: boolean }
  | { op: "setConditionStatus"; id: string; tagId: string; state: ConditionState }
  | { op: "setCarrier"; id: string; carrier: boolean }
  | { op: "setPresymptomatic"; id: string; presymptomatic: boolean }
  | { op: "setOnset"; id: string; tagId: string | null; value: string }
  | { op: "setEvaluations"; id: string; evaluations: Evaluation[] }
  | { op: "setCarriedBy"; childId: string; carrierId?: string }
  | { op: "setReproductiveRole"; id: string; role?: ReproductiveRole }
  | { op: "updateIndividual"; id: string; updates: Partial<Individual> }
  | { op: "updateSiblingOrderSettings"; settings: Partial<SiblingOrderSettings> };

export interface ProblemFix {
  /** Button text, a short imperative ("Mark affected"). */
  label: string;
  edit: FixEdit;
}

/** Make a fix's edit through the store's setters. The one place an edit turns into calls. */
export function applyFixEdit(edit: FixEdit, a: FixActions): void {
  switch (edit.op) {
    case "setAffected": return a.setAffected(edit.id, edit.affected);
    case "setDeceased": return a.setDeceased(edit.id, edit.deceased);
    case "setConditionStatus": return a.setConditionStatus(edit.id, edit.tagId, edit.state);
    case "setCarrier": return a.setCarrier(edit.id, edit.carrier);
    case "setPresymptomatic": return a.setPresymptomatic(edit.id, edit.presymptomatic);
    case "setOnset": return a.setOnset(edit.id, edit.tagId, edit.value);
    case "setEvaluations": return a.setEvaluations(edit.id, edit.evaluations);
    case "setCarriedBy": return a.setCarriedBy(edit.childId, edit.carrierId);
    case "setReproductiveRole": return a.setReproductiveRole(edit.id, edit.role);
    case "updateIndividual": return a.updateIndividual(edit.id, edit.updates);
    case "updateSiblingOrderSettings": return a.updateSiblingOrderSettings(edit.settings);
  }
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
  /** Further one-click fixes when there is a choice, offered after `fix` (one per condition). */
  moreFixes?: ProblemFix[];
}

/** What a rule returns for one person or couple; `problemsOf` fills in the rest. */
export type ProblemDraft = Pick<Problem, "severity" | "message"> & { field?: ProblemField; fix?: ProblemFix; moreFixes?: ProblemFix[] };

/** Facts about the whole pedigree, worked out once per pass for rules that need them. */
export interface RuleContext {
  pedigree: Pedigree;
  /** The pedigree's conditions (quadrant tags), in order. */
  conditions: Tag[];
  /** Today, for dates in the future and ages. */
  today: PartialDate;
  byId: Map<string, Individual>;
  /** Everyone linked to someone else: a partner, a parent or child, or a carrier or social parent line. */
  connected: Set<string>;
  /** Siblings drawn out of birth order (`siblings-out-of-order`): the person to report, with the younger sibling drawn left of them. */
  outOfOrder: Map<string, Individual>;
}

/** One fix per condition, the first as `fix` and the rest as `moreFixes`. */
function perCondition(conditions: Tag[], make: (t: Tag) => ProblemFix): Pick<ProblemDraft, "fix" | "moreFixes"> {
  const [first, ...rest] = conditions.map(make);
  return { fix: first, ...(rest.length ? { moreFixes: rest } : {}) };
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

/** "their mother, Mary" or "their father": how a message names a parent. */
function parentWords(parent: Individual): string {
  const role = parent.sex === "female" ? "mother" : parent.sex === "male" ? "father" : "parent";
  const name = parent.name?.trim();
  return name ? `their ${role}, ${name}` : `their ${role}`;
}

/**
 * The genetic parents of a child, as people (a donor is one, a social
 * parent or the woman who carried the pregnancy is not; a same-sex
 * couple's child has one partner and a donor). None for someone adopted in,
 * whose parents shown are the adoptive ones.
 */
function geneticParentsOf(ind: Individual, ctx: RuleContext): Individual[] {
  if (ind.adopted === "in") return [];
  const p = parentCoupleOf(ctx.pedigree, ind.id);
  if (!p) return [];
  return [p.individual1, p.individual2].map(id => ctx.byId.get(id)).filter((x): x is Individual => !!x);
}

/** Their genetic parents with a date of birth, and their own, for the parent checks. */
function parentBirths(ind: Individual, ctx: RuleContext): { birth: PartialDate; parent: Individual; parentBirth: PartialDate }[] {
  const birth = parsed(ind.dob);
  if (!birth) return [];
  return geneticParentsOf(ind, ctx).flatMap(parent => {
    const parentBirth = parsed(parent.dob);
    return parentBirth ? [{ birth, parent, parentBirth }] : [];
  });
}

/**
 * A free-text age that clearly reads as whole years: "34", "34y",
 * "34 years", "d. 72". Anything else ("50s", "~40", "4 mo") is undefined,
 * and is never checked.
 */
export function ageInYears(text: string | undefined): { years: number; atDeath: boolean } | undefined {
  const m = /^(d\.?\s*)?(\d{1,3})\s*(?:y|yr|yrs|years?|yo|y\/o)?\.?$/i.exec(text?.trim() ?? "");
  return m ? { years: +m[2]!, atDeath: !!m[1] } : undefined;
}

/**
 * Siblings drawn out of birth order (`siblings-out-of-order`), one report per sibship: the
 * first sibling, left to right, born certainly before someone drawn to
 * their left. Only in "insertion order", the default: "manual" is an order
 * chosen on purpose and "by birth date" is this order already. Siblings are
 * placed as the layout places them (`autohint`): affected first when that
 * is on (and then only compared within their group), a twin set at the
 * mean of its members' places, and twins never compared with each other.
 */
function siblingsOutOfOrder(pedigree: Pedigree, byId: Map<string, Individual>): Map<string, Individual> {
  const out = new Map<string, Individual>();
  const { mode, affectedFirst } = pedigree.siblingOrder ?? { mode: "insertion", affectedFirst: false };
  if (mode !== "insertion") return out;
  const group = (i: Individual) => affectedFirst && isAffected(i, pedigree) ? 0 : affectedFirst ? 1 : 0;
  for (const p of pedigree.partnerships) {
    const kids = childrenOf(pedigree, p.id).map(id => byId.get(id)).filter((x): x is Individual => !!x);
    if (kids.length < 2) continue;
    const ranked = [...kids].sort((a, b) => group(a) - group(b) || a.sibOrder - b.sibOrder);
    const place = new Map(ranked.map((k, i) => [k.id, i + 1]));
    const twinOf = new Map<string, number>();
    (p.twins ?? []).forEach((set, n) => {
      const members = set.members.filter(m => place.has(m));
      const mean = members.reduce((acc, m) => acc + place.get(m)!, 0) / members.length;
      members.forEach((m, k) => { place.set(m, mean + k / 100); twinOf.set(m, n); });
    });
    const drawn = [...ranked].sort((a, b) => place.get(a.id)! - place.get(b.id)!);
    for (let j = 1; j < drawn.length; j++) {
      const later = drawn[j]!, laterBirth = parsed(later.dob);
      if (!laterBirth) continue;
      const younger = drawn.slice(0, j).find(left => {
        const leftBirth = parsed(left.dob);
        if (!leftBirth || group(left) !== group(later)) return false;
        if (twinOf.has(left.id) && twinOf.get(left.id) === twinOf.get(later.id)) return false;
        return certainlyBefore(laterBirth, leftBirth);
      });
      if (younger) { out.set(later.id, younger); break; }
    }
  }
  return out;
}

/** Everyone joined to someone else by any line the canvas draws. */
function connectedIds(pedigree: Pedigree): Set<string> {
  const out = new Set<string>();
  for (const p of pedigree.partnerships) { out.add(p.individual1); out.add(p.individual2); }
  for (const kids of Object.values(pedigree.parentOf)) for (const k of kids) out.add(k);
  for (const i of pedigree.individuals) {
    if (i.carriedBy) { out.add(i.id); out.add(i.carriedBy); }
    for (const s of i.socialParents ?? []) { out.add(i.id); out.add(s); }
  }
  return out;
}

/** Ids a person refers to that are not in the pedigree: tags, carrier tags, onset tags, carrier and social parents. */
function missingReferences(ind: Individual, pedigree: Pedigree, byId: Map<string, Individual>): Partial<Individual> | undefined {
  const tags = new Set((pedigree.tags ?? []).map(t => t.id));
  const fixed: Partial<Individual> = {};
  const keepTags = (list: string[] | undefined) => list?.filter(t => tags.has(t));
  if (ind.tags?.some(t => !tags.has(t))) fixed.tags = keepTags(ind.tags);
  if (ind.carrierTags?.some(t => !tags.has(t))) {
    const kept = keepTags(ind.carrierTags)!;
    fixed.carrierTags = kept.length ? kept : undefined;
  }
  if (ind.tagOnset && Object.keys(ind.tagOnset).some(t => !tags.has(t))) {
    const kept = Object.fromEntries(Object.entries(ind.tagOnset).filter(([t]) => tags.has(t)));
    fixed.tagOnset = Object.keys(kept).length ? kept : undefined;
  }
  if (ind.carriedBy && !byId.has(ind.carriedBy)) fixed.carriedBy = undefined;
  if (ind.socialParents?.some(s => !byId.has(s))) {
    const kept = ind.socialParents.filter(s => byId.has(s));
    fixed.socialParents = kept.length ? kept : undefined;
  }
  return Object.keys(fixed).length ? fixed : undefined;
}

/** Text for a date in a message: as typed. */
const shown = (text: string | undefined) => text?.trim() ?? "";

/** The starter rules. Keep each small and uncontroversial: a warning nobody can clear trains people to ignore them. */
export const RULES: Rule[] = [
  {
    id: "dob-unparseable",
    individual: ind => unparseable(ind.dob) && {
      severity: "warning",
      field: "dob",
      message: "Not read as a date, so drawn as typed. Use a year (1935) or a date (1935-03-14).",
    },
  },
  {
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
    // The editor ticks deceased with a date of death, so this comes from imported or older data.
    id: "dod-not-deceased",
    individual: ind => !!ind.dod?.trim() && !ind.deceased && {
      severity: "warning",
      field: "dod",
      message: "Has a date of death but is not marked deceased, so the date is not drawn.",
      fix: { label: "Mark deceased", edit: { op: "setDeceased", id: ind.id, deceased: true } },
    },
  },
  {
    // NSGC 2022: the proband is the affected person through whom the family comes to attention.
    id: "proband-unaffected",
    // Affected with a condition counts, as the drawing fills its sector.
    individual: (ind, ctx) => !!ind.proband && !isAffected(ind, ctx.pedigree) && {
      severity: "warning",
      field: "affected",
      message: "The proband is not marked affected. NSGC: the proband is always affected; an unaffected person seeking advice is the consultand.",
      fix: { label: "Mark affected", edit: { op: "setAffected", id: ind.id, affected: true } },
    },
  },
  {
    // The consultand is the person seeking counselling, so living. Someone
    // asking about a relative who has died is the consultand; the relative
    // is not. A pregnancy is left alone: some clinics mark the fetus.
    id: "consultand-deceased",
    individual: ind => {
      if (!ind.consultand) return null;
      const loss = !!ind.lifeStatus && ind.lifeStatus !== "pregnancy";
      if (!ind.deceased && !loss) return null;
      const notConsultand: ProblemFix = { label: "Not the consultand", edit: { op: "updateIndividual", id: ind.id, updates: { consultand: false } } };
      return {
        severity: "warning",
        field: "consultand",
        message: loss
          ? "The consultand is a pregnancy loss. The consultand is the person seeking counselling."
          : "The consultand is marked deceased. The consultand is the person seeking counselling; for a relative who has died, mark the person asking instead.",
        fix: notConsultand,
        ...(loss ? {} : { moreFixes: [{ label: "Mark living", edit: { op: "setDeceased", id: ind.id, deceased: false } }] }),
      };
    },
  },
  {
    // With two or more conditions, a plain flag does not say which one.
    // With one, the editor records it; with none there is nothing to choose.
    id: "condition-not-recorded",
    individual: (ind, ctx) => {
      if (ctx.conditions.length < 2) return null;
      const out: ProblemDraft[] = [];
      if (plainAffected(ind, ctx.pedigree)) {
        // The flag beside recorded conditions is drawn black under them, so say what it adds.
        const recorded = affectedConditions(ind, ctx.pedigree);
        const others = ctx.conditions.filter(t => !recorded.includes(t));
        const record = (t: Tag): ProblemFix => ({ label: `Record as ${t.label}`, edit: { op: "updateIndividual", id: ind.id, updates: resolvePlainAffected(ind, t.id, ctx.pedigree) } });
        if (recorded.length === 0) {
          out.push({
            severity: "warning",
            field: "conditions",
            message: "Affected, but with which condition? The legend shows it as \"Affected (condition not recorded)\".",
            ...perCondition(ctx.conditions, record),
          });
        } else {
          const names = recorded.map(t => t.label).join(" and ");
          out.push({
            severity: "warning",
            field: "conditions",
            message: `Marked affected as well as affected with ${names}: affected with what else? Drawn filled black under the ${names} section${recorded.length > 1 ? "s" : ""}.`,
            fix: { label: `Only ${names}`, edit: { op: "updateIndividual", id: ind.id, updates: resolvePlainAffected(ind, null, ctx.pedigree) } },
            ...(others.length ? { moreFixes: others.map(record) } : {}),
          });
        }
      }
      if (plainCarrier(ind, ctx.pedigree)) {
        out.push({
          severity: "warning",
          field: "conditions",
          message: "A carrier, but of which condition? The legend shows it as \"Carrier (condition not recorded)\".",
          ...perCondition(ctx.conditions, t => ({ label: `Record as ${carrierLabel(t)}`, edit: { op: "setConditionStatus", id: ind.id, tagId: t.id, state: "carrier" } })),
        });
      }
      return out;
    },
  },
  // ── Follow-up checks (#116 comment "Follow-up agreed with the maintainer") ──
  {
    // 1. Genetic parents only: an adoptive or social parent may be younger.
    id: "parent-born-after-child",
    individual: (ind, ctx) => parentBirths(ind, ctx)
      .filter(({ birth, parentBirth }) => certainlyBefore(birth, parentBirth))
      .map(({ parent }) => ({
        severity: "error" as const,
        field: "dob" as const,
        message: `Born before ${parentWords(parent)} (born ${shown(parent.dob)}).`,
      })),
  },
  {
    // 2. Under 12 at the birth: either genetic parent.
    id: "parent-too-young",
    individual: (ind, ctx) => parentBirths(ind, ctx)
      .filter(({ birth, parentBirth }) => !certainlyBefore(birth, parentBirth) && ageRange(parentBirth, birth).max < 12)
      .map(({ parent }) => ({
        severity: "warning" as const,
        field: "dob" as const,
        message: `${capitalised(parentWords(parent))} was under 12 at the birth (born ${shown(parent.dob)}).`,
      })),
  },
  {
    // 2. The genetic mother over 55 at the birth (an egg donor's age is what counts).
    id: "mother-too-old",
    individual: (ind, ctx) => parentBirths(ind, ctx)
      .filter(({ parent, birth, parentBirth }) => parent.sex === "female" && ageRange(parentBirth, birth).min > 55)
      .map(({ parent }) => ({
        severity: "warning" as const,
        field: "dob" as const,
        message: `${capitalised(parentWords(parent))} was over 55 at the birth (born ${shown(parent.dob)}).`,
      })),
  },
  {
    // 3. The woman who gave birth: the one who carried the pregnancy, else the genetic mother.
    id: "born-after-mother-died",
    individual: (ind, ctx) => {
      const birth = parsed(ind.dob);
      if (!birth || ind.adopted === "in") return null;
      const mother = ind.carriedBy ? ctx.byId.get(ind.carriedBy) : geneticParentsOf(ind, ctx).find(p => p.sex === "female");
      const death = parsed(mother?.dod);
      return !!mother && !!death && certainlyBefore(death, birth) && {
        severity: "warning",
        field: "dob",
        message: `Born after ${ind.carriedBy ? "the woman who carried them" : parentWords(mother)} died (${shown(mother.dod)}).`,
      };
    },
  },
  {
    // 3. More than a year: a child is born up to nine months after the father dies. A
    // sperm donor is left out, since donated sperm is often used years later.
    id: "born-long-after-father-died",
    individual: (ind, ctx) => {
      const birth = parsed(ind.dob);
      const father = geneticParentsOf(ind, ctx).find(p => p.sex === "male" && p.reproductiveRole !== "donor");
      const death = parsed(father?.dod);
      return !!birth && !!father && !!death && certainlyBefore(addYears(death, 1), birth) && {
        severity: "warning",
        field: "dob",
        message: `Born more than a year after ${parentWords(father)} died (${shown(father.dod)}).`,
      };
    },
  },
  {
    // 4. Not for a pregnancy, whose date may be the due date.
    id: "date-in-future",
    individual: (ind, ctx) => {
      if (ind.lifeStatus === "pregnancy") return null;
      return (["dob", "dod"] as const).flatMap(field => {
        const d = parsed(ind[field]);
        return d && certainlyBefore(ctx.today, d)
          ? [{ severity: "warning" as const, field, message: `Date of ${field === "dob" ? "birth" : "death"} is in the future.` }]
          : [];
      });
    },
  },
  {
    // 5.
    id: "living-over-110",
    individual: (ind, ctx) => {
      const birth = parsed(ind.dob);
      return !ind.deceased && !ind.lifeStatus && !!birth && ageRange(birth, ctx.today).min > 110 && {
        severity: "warning",
        field: "dod",
        message: `Not marked deceased, but born ${shown(ind.dob)}: over 110 today.`,
        fix: { label: "Mark deceased", edit: { op: "setDeceased", id: ind.id, deceased: true } },
      };
    },
  },
  {
    // 6. Only an age that clearly reads as years, against the date of birth: at death
    // for someone deceased with a date, else at the date recorded or today.
    id: "age-disagrees",
    individual: (ind, ctx) => {
      const age = ageInYears(ind.age), birth = parsed(ind.dob);
      if (!age || !birth) return null;
      const death = ind.deceased ? parsed(ind.dod) : undefined;
      if ((age.atDeath || ind.deceased) && !death) return null;
      const recorded = parsed(ctx.pedigree.clinicalDetails?.recordedOn);
      const at = death ?? recorded ?? ctx.today;
      const { min, max } = ageRange(birth, at);
      if (age.years >= min - 1 && age.years <= max + 1) return null;
      const expected = min === max ? `${min}` : `${min} or ${max}`;
      const when = death ? "at death" : recorded ? `on ${shown(ctx.pedigree.clinicalDetails?.recordedOn)}, the date recorded` : "today";
      return {
        severity: "warning",
        field: "age",
        message: `Age ${age.years} does not match the date of birth, which makes them ${expected} ${when}.`,
      };
    },
  },
  {
    // 7. Reported on each twin after the first of their set, against the first.
    id: "twins-born-apart",
    individual: (ind, ctx) => {
      const birth = parsed(ind.dob);
      const set = birth && parentCoupleOf(ctx.pedigree, ind.id)?.twins?.find(t => t.members.includes(ind.id));
      if (!birth || !set || set.members[0] === ind.id) return null;
      const first = ctx.byId.get(set.members[0]!);
      const firstBirth = parsed(first?.dob);
      return !!first && !!firstBirth && minDaysApart(birth, firstBirth) > 1 && {
        severity: "warning",
        field: "dob",
        message: `A twin, but born more than a day apart from ${first.name?.trim() || "their twin"} (${shown(first.dob)}).`,
      };
    },
  },
  {
    // 8. See `siblingsOutOfOrder`.
    id: "siblings-out-of-order",
    individual: (ind, ctx) => {
      const younger = ctx.outOfOrder.get(ind.id);
      return !!younger && {
        severity: "warning",
        field: "dob",
        message: `Drawn to the right of a younger sibling${younger.name?.trim() ? `, ${younger.name.trim()}` : ""} (born ${shown(younger.dob)}): siblings are drawn in the order they were added.`,
        fix: { label: "Order siblings by birth date", edit: { op: "updateSiblingOrderSettings", settings: { mode: "birthDate" } } },
      };
    },
  },
  {
    // 9. The editor refuses this; imported or older data can still have it.
    id: "pregnancy-with-family",
    individual: (ind, ctx) => {
      if (!ind.lifeStatus) return null;
      const partner = couplesOf(ctx.pedigree, ind.id, { donorPairs: true }).length > 0;
      return partner && {
        severity: "error",
        field: "lifeStatus",
        message: "A pregnancy or pregnancy loss cannot have a partner or children.",
      };
    },
  },
  {
    // 10. Affected and a carrier of the same thing: the affected fill hides the carrier mark.
    id: "affected-and-carrier",
    individual: (ind, ctx) => {
      const out: ProblemDraft[] = [];
      const perCondition = conditionMode(ctx.pedigree) === "per-condition";
      // With any condition the panel's Status has the plain flags block, not the carrier select.
      const field = conditionMode(ctx.pedigree) === "plain" ? "carrier" : "conditions";
      if (isAffected(ind, ctx.pedigree) && plainCarrier(ind, ctx.pedigree) && (!perCondition || plainAffected(ind, ctx.pedigree))) {
        out.push({
          severity: "warning",
          field,
          message: "Both affected and a carrier. The affected fill hides the carrier mark.",
          fix: { label: "Not a carrier", edit: { op: "setCarrier", id: ind.id, carrier: false } },
        });
      }
      const both = (ind.carrierTags ?? []).filter(t => ind.tags?.includes(t));
      const names = both.map(t => ctx.pedigree.tags?.find(x => x.id === t)?.label).filter(Boolean);
      if (names.length) {
        out.push({
          severity: "warning",
          field,
          message: `Both affected with and a carrier of ${names.join(", ")}. Drawn as affected.`,
          fix: { label: "Keep affected", edit: { op: "updateIndividual", id: ind.id, updates: { carrierTags: ind.carrierTags!.filter(t => !both.includes(t)) } } },
        });
      }
      return out;
    },
  },
  {
    // 10. Presymptomatic means clinically unaffected now.
    id: "presymptomatic-affected",
    individual: (ind, ctx) => !!ind.presymptomatic && isAffected(ind, ctx.pedigree) && {
      severity: "warning",
      field: conditionMode(ctx.pedigree) === "plain" ? "carrier" : "presymptomatic",
      message: "Presymptomatic means not affected now, and the affected fill hides the vertical line.",
      fix: { label: "Not presymptomatic", edit: { op: "setPresymptomatic", id: ind.id, presymptomatic: false } },
    },
  },
  {
    // 11. The store clears these when someone is set unaffected or untagged; imports can keep them.
    id: "onset-unaffected",
    individual: (ind, ctx) => {
      const out: ProblemDraft[] = [];
      // The affected status's own onset goes with the plain Affected control.
      if (ind.onset?.trim() && !affectedControlOn(ind, ctx.pedigree)) {
        out.push({
          severity: "warning",
          field: "affected",
          message: isAffected(ind, ctx.pedigree)
            ? `An age of onset (${ind.onset.trim()}) for "affected", but they are affected only with a recorded condition. It is not drawn.`
            : `An age of onset (${ind.onset.trim()}) on someone not affected. It is not drawn.`,
          fix: { label: "Clear age of onset", edit: { op: "setOnset", id: ind.id, tagId: null, value: "" } },
        });
      }
      for (const [tagId, value] of Object.entries(ind.tagOnset ?? {})) {
        const tag = ctx.pedigree.tags?.find(t => t.id === tagId);
        if (!tag || ind.tags?.includes(tagId) || !value.trim()) continue;
        out.push({
          severity: "warning",
          field: "affected",
          message: `An age of onset of ${tag.label} (${value.trim()}), who is not affected with it. It is not drawn.`,
          fix: { label: "Clear age of onset", edit: { op: "setOnset", id: ind.id, tagId, value: "" } },
        });
      }
      return out;
    },
  },
  {
    // 12.
    id: "evaluation-empty",
    individual: ind => {
      const evs = ind.evaluations ?? [];
      const empty = evs.filter(e => !e.result && !e.detail?.trim() && !e.documented);
      return empty.length > 0 && {
        severity: "warning",
        field: "evaluations",
        message: empty.length === 1 ? "An evaluation with nothing recorded." : `${empty.length} evaluations with nothing recorded.`,
        fix: { label: "Remove empty evaluations", edit: { op: "setEvaluations", id: ind.id, evaluations: evs.filter(e => !empty.includes(e)) } },
      };
    },
  },
  {
    // 12. Documented means a result was examined or verified (NSGC "*").
    id: "evaluation-documented-no-result",
    individual: ind => (ind.evaluations ?? []).some(e => e.documented && !e.result) && {
      severity: "warning",
      field: "evaluations",
      message: "An evaluation marked documented (*) has no result.",
    },
  },
  {
    // 13. Biological sex: a man cannot have carried a pregnancy.
    id: "carried-by-male",
    individual: (ind, ctx) => {
      const carrier = ind.carriedBy ? ctx.byId.get(ind.carriedBy) : undefined;
      return carrier?.sex === "male" && {
        severity: "warning",
        field: "carriedBy",
        message: `Carried by ${carrier.name?.trim() || "someone"} whose biological sex is male.`,
        fix: { label: "Carried by the genetic mother", edit: { op: "setCarriedBy", childId: ind.id } },
      };
    },
  },
  {
    // 13. The same for a surrogate (S): the editor refuses it, imports can have it.
    id: "surrogate-male",
    individual: ind => ind.reproductiveRole === "surrogate" && ind.sex === "male" && {
      severity: "warning",
      field: "reproductiveRole",
      message: "A surrogate (S) whose biological sex is male.",
      fix: { label: "Not a surrogate", edit: { op: "setReproductiveRole", id: ind.id } },
    },
  },
  {
    // 13. A donor is a genetic parent of a child; a surrogate carried one.
    id: "role-not-linked",
    individual: (ind, ctx) => {
      const role = ind.reproductiveRole;
      if (!role) return null;
      const parent = couplesOf(ctx.pedigree, ind.id, { donorPairs: true }).some(p => childrenOf(ctx.pedigree, p.id).length > 0);
      const carried = ctx.pedigree.individuals.some(i => i.carriedBy === ind.id);
      if (role === "donor" ? parent : parent || carried) return null;
      const what = role === "donor" ? "A donor (D)" : "A surrogate (S)";
      return {
        severity: "warning",
        field: "reproductiveRole",
        message: `${what} who is not linked to any child. Use the child's more menu to add an existing ${role}.`,
        fix: { label: role === "donor" ? "Not a donor" : "Not a surrogate", edit: { op: "setReproductiveRole", id: ind.id } },
      };
    },
  },
  {
    // 14. A pedigree of one person is a start, not a problem.
    id: "not-connected",
    individual: (ind, ctx) => ctx.pedigree.individuals.length > 1 && !ctx.connected.has(ind.id) && {
      severity: "warning",
      message: "Not connected to anyone else in the pedigree. Give them a parent, partner or child, or delete them.",
    },
  },
  {
    // 15. Only hand-edited or damaged files get these.
    id: "missing-reference",
    individual: (ind, ctx) => {
      const fixed = missingReferences(ind, ctx.pedigree, ctx.byId);
      return !!fixed && {
        severity: "warning",
        message: "Refers to a condition, tag or person that is not in the pedigree.",
        fix: { label: "Remove what is missing", edit: { op: "updateIndividual", id: ind.id, updates: fixed } },
      };
    },
    partnership: (p, ctx) => {
      const missing = [p.individual1, p.individual2, ...childrenOf(ctx.pedigree, p.id)].filter(id => !ctx.byId.has(id));
      const kids = new Set(childrenOf(ctx.pedigree, p.id));
      const twin = (p.twins ?? []).some(t => t.members.some(m => !kids.has(m)));
      return (missing.length > 0 || twin) && {
        severity: "error",
        message: missing.length ? "This couple refers to a person who is not in the pedigree." : "A twin of this couple is not one of their children.",
      };
    },
  },
];

function asList(d: Drafts): ProblemDraft[] {
  if (!d) return [];
  return Array.isArray(d) ? d : [d];
}

/** Every problem the rules find, people in pedigree order then couples. Not memoised: see `problemsOf`. */
export function findProblems(pedigree: Pedigree, rules: Rule[] = RULES, today: Date = new Date()): Problem[] {
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const ctx: RuleContext = {
    pedigree,
    conditions: conditionTags(pedigree),
    today: partialDateOf(today),
    byId,
    connected: connectedIds(pedigree),
    outOfOrder: siblingsOutOfOrder(pedigree, byId),
  };
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

/** The worst severity in a list, or undefined when it is empty. */
export function worstSeverity(problems: Problem[]): Severity | undefined {
  if (problems.length === 0) return undefined;
  return problems.some(p => p.severity === "error") ? "error" : "warning";
}

/** A problem's one-click fixes, `fix` first then `moreFixes`. */
export function fixesOf(problem: Problem): ProblemFix[] {
  return [problem.fix, ...(problem.moreFixes ?? [])].filter((f): f is ProblemFix => f !== undefined);
}

/**
 * The problems "Fix all like this" applies `label` to: those of the same
 * rule offering a fix with the same label, `problem` among them. Each keeps
 * its own fix object, so the fix applies to its own person.
 */
export function problemsLike(all: Problem[], problem: Problem, label: string): { problem: Problem; fix: ProblemFix }[] {
  return all.flatMap(p => {
    if (p.rule !== problem.rule) return [];
    const fix = fixesOf(p).find(f => f.label === label);
    return fix ? [{ problem: p, fix }] : [];
  });
}
