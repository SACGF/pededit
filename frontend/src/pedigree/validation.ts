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
import type {
  Evaluation, Individual, Partnership, Pedigree, ReproductiveRole, SiblingOrderSettings, Tag,
} from "@pedigree-editor/layout-engine";
import { parsePartialDate, type PartialDate } from "./labels";
import { affectedConditions, affectedControlOn, carrierLabel, conditionMode, conditionTags, isAffected, plainAffected, plainCarrier, resolvePlainAffected, type ConditionState } from "./conditions";
import { addYears, ageRange, certainlyBefore, minDaysApart, partialDateOf } from "./dateRanges";
import { pedigreeNumbers } from "./layoutToFlow";

export type Severity = "warning" | "error";

/**
 * Edit panel fields a problem can point at. Each is wrapped in
 * `data-problem-field` in `EditPanel`, which is what the problems list
 * focuses. Add a value here and wrap its field when a rule needs a new one.
 */
export type ProblemField =
  | "dob" | "dod" | "age" | "lifeStatus" | "affected" | "conditions" | "carrier" | "presymptomatic"
  | "evaluations" | "reproductiveRole" | "carriedBy";

/** The pedigree store setters a fix may call. `usePedigreeStore.getState()` satisfies it. */
export interface FixActions {
  setAffected: (id: string, affected: boolean) => void;
  setDeceased: (id: string, deceased: boolean) => void;
  /** Record a condition's state (#115). */
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
  /** Further one-click fixes when there is a choice, offered after `fix` (one per condition, #115). */
  moreFixes?: ProblemFix[];
}

/** What a rule returns for one person or couple; `problemsOf` fills in the rest. */
export type ProblemDraft = Pick<Problem, "severity" | "message"> & { field?: ProblemField; fix?: ProblemFix; moreFixes?: ProblemFix[] };

/** Facts about the whole pedigree, worked out once per pass for rules that need them. */
export interface RuleContext {
  pedigree: Pedigree;
  /** The pedigree's conditions (quadrant tags, #115), in order. */
  conditions: Tag[];
  /** Today, for dates in the future and ages. */
  today: PartialDate;
  byId: Map<string, Individual>;
  /** Each child's partnership in `parentOf`: their genetic parents (#45, #105). */
  parentsOf: Map<string, Partnership>;
  /** Everyone linked to someone else: a partner, a parent or child, or a carrier or social parent line. */
  connected: Set<string>;
  /** Siblings drawn out of birth order (check 8): the person to report, with the younger sibling drawn left of them. */
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
 * The genetic parents of a child, as people (#45: a donor is one, a social
 * parent or the woman who carried the pregnancy is not; #105: a same-sex
 * couple's child has one partner and a donor). None for someone adopted in
 * (#12), whose parents shown are the adoptive ones.
 */
function geneticParentsOf(ind: Individual, ctx: RuleContext): Individual[] {
  if (ind.adopted === "in") return [];
  const p = ctx.parentsOf.get(ind.id);
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
 * A free-text age (#20) that clearly reads as whole years: "34", "34y",
 * "34 years", "d. 72". Anything else ("50s", "~40", "4 mo") is undefined,
 * and is never checked.
 */
export function ageInYears(text: string | undefined): { years: number; atDeath: boolean } | undefined {
  const m = /^(d\.?\s*)?(\d{1,3})\s*(?:y|yr|yrs|years?|yo|y\/o)?\.?$/i.exec(text?.trim() ?? "");
  return m ? { years: +m[2]!, atDeath: !!m[1] } : undefined;
}

/**
 * Siblings drawn out of birth order (check 8), one report per sibship: the
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
    const kids = (pedigree.parentOf[p.id] ?? []).map(id => byId.get(id)).filter((x): x is Individual => !!x);
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

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Text for a date in a message: as typed. */
const shown = (text: string | undefined) => text?.trim() ?? "";

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
    // Affected with a condition (#115) counts, as the drawing fills its sector.
    individual: (ind, ctx) => !!ind.proband && !isAffected(ind, ctx.pedigree) && {
      severity: "warning",
      field: "affected",
      message: "The proband is not marked affected. NSGC: the proband is always affected; an unaffected person seeking advice is the consultand.",
      fix: { label: "Mark affected", apply: a => a.setAffected(ind.id, true) },
    },
  },
  {
    // #115: with two or more conditions, a plain flag does not say which one.
    // With one, the editor records it; with none there is nothing to choose.
    id: "condition-not-recorded",
    individual: (ind, ctx) => {
      if (ctx.conditions.length < 2) return null;
      const out: ProblemDraft[] = [];
      if (plainAffected(ind, ctx.pedigree)) {
        // #118: the flag beside recorded conditions is drawn black under them, so say what it adds.
        const recorded = affectedConditions(ind, ctx.pedigree);
        const others = ctx.conditions.filter(t => !recorded.includes(t));
        const record = (t: Tag): ProblemFix => ({ label: `Record as ${t.label}`, apply: a => a.updateIndividual(ind.id, resolvePlainAffected(ind, t.id, ctx.pedigree)) });
        if (recorded.length === 0) {
          out.push({
            severity: "warning",
            field: "conditions",
            message: "Affected, but with which condition? The key shows it as \"Affected (condition not recorded)\".",
            ...perCondition(ctx.conditions, record),
          });
        } else {
          const names = recorded.map(t => t.label).join(" and ");
          out.push({
            severity: "warning",
            field: "conditions",
            message: `Marked affected as well as affected with ${names}: affected with what else? Drawn filled black under the ${names} section${recorded.length > 1 ? "s" : ""}.`,
            fix: { label: `Only ${names}`, apply: a => a.updateIndividual(ind.id, resolvePlainAffected(ind, null, ctx.pedigree)) },
            ...(others.length ? { moreFixes: others.map(record) } : {}),
          });
        }
      }
      if (plainCarrier(ind, ctx.pedigree)) {
        out.push({
          severity: "warning",
          field: "conditions",
          message: "A carrier, but of which condition? The key shows it as \"Carrier (condition not recorded)\".",
          ...perCondition(ctx.conditions, t => ({ label: `Record as ${carrierLabel(t)}`, apply: a => a.setConditionStatus(ind.id, t.id, "carrier") })),
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
    // 2. The genetic mother over 55 at the birth (an egg donor's age is what counts, #45).
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
    // 3. The woman who gave birth: the one who carried the pregnancy (#45), else the genetic mother.
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
    // sperm donor (#45) is left out, since donated sperm is often used years later.
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
        fix: { label: "Mark deceased", apply: a => a.setDeceased(ind.id, true) },
      };
    },
  },
  {
    // 6. Only an age that clearly reads as years, against the date of birth: at death
    // for someone deceased with a date, else at the date recorded (#102) or today.
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
      const set = birth && ctx.parentsOf.get(ind.id)?.twins?.find(t => t.members.includes(ind.id));
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
        fix: { label: "Order siblings by birth date", apply: a => a.updateSiblingOrderSettings({ mode: "birthDate" }) },
      };
    },
  },
  {
    // 9. The editor refuses this; imported or older data can still have it.
    id: "pregnancy-with-family",
    individual: (ind, ctx) => {
      if (!ind.lifeStatus) return null;
      const partner = ctx.pedigree.partnerships.some(p => p.individual1 === ind.id || p.individual2 === ind.id);
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
      if (isAffected(ind, ctx.pedigree) && plainCarrier(ind, ctx.pedigree) && (!perCondition || plainAffected(ind, ctx.pedigree))) {
        out.push({
          severity: "warning",
          field: perCondition ? "conditions" : "carrier",
          message: "Both affected and a carrier. The affected fill hides the carrier mark.",
          fix: { label: "Not a carrier", apply: a => a.setCarrier(ind.id, false) },
        });
      }
      const both = (ind.carrierTags ?? []).filter(t => ind.tags?.includes(t));
      const names = both.map(t => ctx.pedigree.tags?.find(x => x.id === t)?.label).filter(Boolean);
      if (names.length) {
        out.push({
          severity: "warning",
          field: perCondition ? "conditions" : "carrier",
          message: `Both affected with and a carrier of ${names.join(", ")}. Drawn as affected.`,
          fix: { label: "Keep affected", apply: a => a.updateIndividual(ind.id, { carrierTags: ind.carrierTags!.filter(t => !both.includes(t)) }) },
        });
      }
      return out;
    },
  },
  {
    // 10. Presymptomatic means clinically unaffected now (#101).
    id: "presymptomatic-affected",
    individual: (ind, ctx) => !!ind.presymptomatic && isAffected(ind, ctx.pedigree) && {
      severity: "warning",
      field: conditionMode(ctx.pedigree) === "per-condition" ? "presymptomatic" : "carrier",
      message: "Presymptomatic means not affected now, and the affected fill hides the vertical line.",
      fix: { label: "Not presymptomatic", apply: a => a.setPresymptomatic(ind.id, false) },
    },
  },
  {
    // 11. The store clears these when someone is set unaffected or untagged; imports can keep them.
    id: "onset-unaffected",
    individual: (ind, ctx) => {
      const out: ProblemDraft[] = [];
      // The affected status's own onset goes with the plain Affected control (#118).
      if (ind.onset?.trim() && !affectedControlOn(ind, ctx.pedigree)) {
        out.push({
          severity: "warning",
          field: "affected",
          message: isAffected(ind, ctx.pedigree)
            ? `An age of onset (${ind.onset.trim()}) for "affected", but they are affected only with a recorded condition. It is not drawn.`
            : `An age of onset (${ind.onset.trim()}) on someone not affected. It is not drawn.`,
          fix: { label: "Clear age of onset", apply: a => a.setOnset(ind.id, null, "") },
        });
      }
      for (const [tagId, value] of Object.entries(ind.tagOnset ?? {})) {
        const tag = ctx.pedigree.tags?.find(t => t.id === tagId);
        if (!tag || ind.tags?.includes(tagId) || !value.trim()) continue;
        out.push({
          severity: "warning",
          field: "affected",
          message: `An age of onset of ${tag.label} (${value.trim()}), who is not affected with it. It is not drawn.`,
          fix: { label: "Clear age of onset", apply: a => a.setOnset(ind.id, tagId, "") },
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
        fix: { label: "Remove empty evaluations", apply: a => a.setEvaluations(ind.id, evs.filter(e => !empty.includes(e))) },
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
    // 13. Biological sex (#26): a man cannot have carried a pregnancy.
    id: "carried-by-male",
    individual: (ind, ctx) => {
      const carrier = ind.carriedBy ? ctx.byId.get(ind.carriedBy) : undefined;
      return carrier?.sex === "male" && {
        severity: "warning",
        field: "carriedBy",
        message: `Carried by ${carrier.name?.trim() || "someone"} whose biological sex is male.`,
        fix: { label: "Carried by the genetic mother", apply: a => a.setCarriedBy(ind.id, undefined) },
      };
    },
  },
  {
    // 13. A donor is a genetic parent of a child; a surrogate carried one (#45).
    id: "role-not-linked",
    individual: (ind, ctx) => {
      const role = ind.reproductiveRole;
      if (!role) return null;
      const parent = ctx.pedigree.partnerships.some(p =>
        (p.individual1 === ind.id || p.individual2 === ind.id) && (ctx.pedigree.parentOf[p.id] ?? []).length > 0);
      const carried = ctx.pedigree.individuals.some(i => i.carriedBy === ind.id);
      if (role === "donor" ? parent : parent || carried) return null;
      const what = role === "donor" ? "A donor (D)" : "A surrogate (S)";
      return {
        severity: "warning",
        field: "reproductiveRole",
        message: `${what} who is not linked to any child. Use the child's more menu to add an existing ${role}.`,
        fix: { label: role === "donor" ? "Not a donor" : "Not a surrogate", apply: a => a.setReproductiveRole(ind.id, undefined) },
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
        message: "Refers to a tag or person that is not in the pedigree.",
        fix: { label: "Remove what is missing", apply: a => a.updateIndividual(ind.id, fixed) },
      };
    },
    partnership: (p, ctx) => {
      const missing = [p.individual1, p.individual2, ...(ctx.pedigree.parentOf[p.id] ?? [])].filter(id => !ctx.byId.has(id));
      const kids = new Set(ctx.pedigree.parentOf[p.id] ?? []);
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
  const parentsOf = new Map<string, Partnership>();
  for (const p of pedigree.partnerships) for (const c of pedigree.parentOf[p.id] ?? []) if (!parentsOf.has(c)) parentsOf.set(c, p);
  const ctx: RuleContext = {
    pedigree,
    conditions: conditionTags(pedigree),
    today: partialDateOf(today),
    byId,
    parentsOf,
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

/**
 * Who a problem is about, for the problems list: the pedigree number (#8)
 * then the name, "II-2, Mary", or "II-2, unnamed female" with no name. The
 * number is left out for someone not drawn (a hidden branch, #94). The
 * numbers come from the layout, so they are only worked out when asked.
 */
export function problemSubject(pedigree: Pedigree, problem: Problem, numbers: Map<string, string> = pedigreeNumbers(pedigree)): string {
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    const number = numbers.get(id);
    const name = ind?.name?.trim()
      || (ind?.sex === "male" ? "unnamed male" : ind?.sex === "female" ? "unnamed female" : "unnamed person");
    return number ? `${number}, ${name}` : name.charAt(0).toUpperCase() + name.slice(1);
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

/**
 * The problem to go to from the keyboard (#116), `dir` 1 for next and -1
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
