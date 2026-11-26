import type { Evaluation, Individual, Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import { pedigreeNumbers } from "../../pedigree/scene";
import { DEIDENTIFY_KEEP_DEFAULTS } from "./types";
import type { DeidentifyKeep, SvgExportOptions } from "./types";
import { parsePartialDate } from "../../pedigree/dateRanges";
import { onsetsOf } from "../../pedigree/onset";
import { consanguinityWording } from "../../pedigree/consanguinityLabel";
import { asDrawn, drawnPedigree, isBranchPlaceholderId } from "../../pedigree/collapse";

function ageBucket(dob: string, referenceDate = new Date()): string {
  const birth = new Date(dob);
  const ageYears = (referenceDate.getTime() - birth.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (ageYears < 1)  return "infant";
  if (ageYears < 10) return "child";
  if (ageYears < 18) return "teen";
  const decade = Math.floor(ageYears / 10) * 10;
  return `${decade}s`;
}

/**
 * What a field of a de-identified copy becomes:
 * - `"keep"`: structure or drawing that names and dates nobody;
 * - `"drop"`: always goes;
 * - `"rewritten"`: replaced below (names by numbers, the DOB by an age range);
 * - a `DeidentifyKeep` choice: goes unless the export keeps that free text.
 *
 * Every field of the type needs an entry, so a new field fails the type
 * check until someone decides what a de-identified export does with it. The
 * copy is built from these lists, so a field missing from them (data saved
 * with something the types no longer name) is dropped, never passed through.
 */
type FieldRule = "keep" | "drop" | "rewritten" | keyof DeidentifyKeep;

const INDIVIDUAL_FIELDS: Record<keyof Individual, FieldRule> = {
  id: "keep",
  sex: "keep",
  genderIdentity: "keep",
  affected: "keep",
  deceased: "keep",
  carrier: "keep",
  presymptomatic: "keep",
  // Kept with the detail or the marks, field by field (`EVALUATION_FIELDS`).
  evaluations: "rewritten",
  proband: "keep",
  consultand: "keep",
  familyHistoryUnknown: "keep",
  sibOrder: "keep",
  name: "rewritten",
  dob: "rewritten",
  // A date of death dates someone like a DOB does.
  dod: "drop",
  // Free text, so it can name or date someone; age ranges come from the DOB.
  age: "drop",
  notes: "drop",
  // HPO codes, not free text.
  hpoTerms: "keep",
  lifeStatus: "keep",
  adopted: "keep",
  reproductiveRole: "keep",
  carriedBy: "keep",
  socialParents: "keep",
  tags: "textTags",
  carrierTags: "keep",
  onset: "onset",
  tagOnset: "onset",
  descendantsHidden: "keep",
  placeholder: "keep",
};

const EVALUATION_FIELDS: Record<keyof Evaluation, FieldRule> = {
  result: "keep",
  detail: "evaluationDetail",
  documented: "keep",
};

const PARTNERSHIP_FIELDS: Record<keyof Partnership, FieldRule> = {
  id: "keep",
  individual1: "keep",
  individual2: "keep",
  consanguineous: "keep",
  consanguinityLabel: "consanguinityLabels",
  childless: "keep",
  childlessReason: "childlessReason",
  twins: "keep",
  ended: "keep",
  donorConception: "keep",
  leftPartner: "keep",
  drawnBeside: "keep",
};

const PEDIGREE_FIELDS: Record<keyof Pedigree, FieldRule> = {
  individuals: "rewritten",
  partnerships: "rewritten",
  parentOf: "keep",
  siblingOrder: "keep",
  pinnedPositions: "keep",
  canvasSettings: "rewritten",
  unlockedIndividuals: "keep",
  // Condition and tag names are the key's rows; text tags go with the people.
  tags: "keep",
  // The title can name the family.
  chartTitle: "rewritten",
  // The recorder and historian, the visit date, and free-text reason and
  // ancestry that can name people too: the whole block goes.
  clinicalDetails: "drop",
  filters: "keep",
};

/**
 * The fields of `from` its rules keep: "keep", and a choice `keep` says to
 * keep. Choices that keep part of a field (evaluation marks, the tags that
 * are not text tags) are finished by the caller.
 */
function allowed<T extends object>(from: T, rules: Record<keyof T, FieldRule>, keep: DeidentifyKeep): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(from) as (keyof T)[]) {
    const rule: FieldRule | undefined = Object.hasOwn(rules, key) ? rules[key] : undefined;
    if (rule === undefined || rule === "drop" || rule === "rewritten") continue;
    if (rule === "keep" || keep[rule]) out[key] = from[key];
  }
  return out;
}

/**
 * A de-identified person, without the rewritten fields. Evaluation detail
 * and onset can carry a test result or date a relative did not know; text
 * tags are often genotypes.
 */
function deidentifiedPerson(ind: Individual, keep: DeidentifyKeep, textTagIds: Set<string>): Omit<Individual, "name" | "dob"> {
  const out = { ...allowed(ind, INDIVIDUAL_FIELDS, keep), id: ind.id, sex: ind.sex, affected: ind.affected, sibOrder: ind.sibOrder };
  if (ind.evaluations && (keep.evaluationDetail || keep.evaluationMarks)) {
    // Without the detail the result stays ("+", "E1-") and so does the
    // documented "*". Every evaluation is kept, so the 2008 numbering matches
    // the canvas and a bare "E" still says one was done; in 2022 an empty one
    // draws nothing. With the marks dropped too, the whole line goes, the "*"
    // with it: a documented mark with no evaluation drawn would point at nothing.
    out.evaluations = ind.evaluations.map(ev => allowed(ev, EVALUATION_FIELDS, keep));
  }
  if (!keep.textTags && ind.tags) {
    // The tags that are conditions, traits and dots stay.
    const tags = ind.tags.filter(id => !textTagIds.has(id));
    if (tags.length > 0) out.tags = tags;
  }
  return out;
}

/**
 * The drawn pedigree (hidden descendants left out) with names replaced by
 * pedigree numbers, the DOB bucketed or dropped, and every field the lists
 * above drop left out. The optional free text (evaluation detail, onset,
 * consanguinity text, text tags, the childless reason) goes as
 * `options.deidentifyKeep` says, by default the detail, onset and reason.
 */
export function deidentify(full: Pedigree, options: SvgExportOptions = {}): Pedigree {
  const pedigree = drawnPedigree(full);
  // The pedigree numbers, so a de-identified figure reads like the
  // numbered one.
  const notations = pedigreeNumbers(pedigree);
  const keep: DeidentifyKeep = { ...DEIDENTIFY_KEEP_DEFAULTS, ...options.deidentifyKeep };
  // Dropped from the people only: the key lists tags in use, so a dropped
  // text tag leaves no row behind.
  const textTagIds = new Set((pedigree.tags ?? []).filter(t => t.style === "text").map(t => t.id));
  return asDrawn({
    ...allowed(pedigree, PEDIGREE_FIELDS, keep),
    parentOf: pedigree.parentOf,
    siblingOrder: pedigree.siblingOrder,
    chartTitle: "",
    // The names are the numbers now: drawing them again would repeat them.
    // Without consanguinity text the relationship is not named either.
    // Notes are dropped above; the setting goes too, so nothing can draw them.
    ...(pedigree.canvasSettings ? { canvasSettings: {
      ...pedigree.canvasSettings,
      showNumbers: false,
      showNotes: false,
      ...(keep.consanguinityLabels ? {} : { relationshipLabels: false }),
    } } : {}),
    partnerships: pedigree.partnerships.map(p => ({
      ...allowed(p, PARTNERSHIP_FIELDS, keep), id: p.id, individual1: p.individual1, individual2: p.individual2,
    })),
    individuals: pedigree.individuals.map(ind => ({
      ...deidentifiedPerson(ind, keep, textTagIds),
      name: isBranchPlaceholderId(ind.id) ? undefined : notations.get(ind.id) ?? ind.id,
      // With age ranges, someone with both dates gets the range at death.
      dob: options.ageBuckets && ind.dob ? (ind.deceased && ind.dod && parsePartialDate(ind.dod.trim()) ? `d. ${ageBucket(ind.dob, new Date(ind.dod))}` : ageBucket(ind.dob)) : undefined,
    })),
  }, pedigree);
}

/**
 * Which of the `DeidentifyKeep` choices the drawn pedigree has anything for, so the
 * export dialog offers only those. `evaluationDetail` is evaluation detail
 * text; the marks choice goes with it.
 */
export function deidentifiableText(full: Pedigree): Record<Exclude<keyof DeidentifyKeep, "evaluationMarks">, boolean> {
  const pedigree = drawnPedigree(full);
  const inds = pedigree.individuals;
  const textTagIds = new Set((pedigree.tags ?? []).filter(t => t.style === "text").map(t => t.id));
  return {
    evaluationDetail: inds.some(i => i.evaluations?.some(e => e.detail?.trim())),
    onset: inds.some(i => onsetsOf(i, pedigree).length > 0),
    consanguinityLabels: pedigree.partnerships.some(p => !!consanguinityWording(pedigree, p)),
    textTags: inds.some(i => i.tags?.some(id => textTagIds.has(id))),
    childlessReason: pedigree.partnerships.some(p => p.childless && !!p.childlessReason?.trim()),
  };
}
