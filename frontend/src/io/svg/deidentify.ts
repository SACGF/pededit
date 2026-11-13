import type { Individual, Partnership, Pedigree } from "@pedigree-editor/layout-engine";
import { pedigreeNumbers } from "../../pedigree/layoutToFlow";
import { DEIDENTIFY_KEEP_DEFAULTS } from "./types";
import type { DeidentifyKeep, SvgExportOptions } from "./types";
import { parsePartialDate } from "../../pedigree/labels";
import { onsetsOf } from "../../pedigree/onset";
import { consanguinityLabelText } from "../../pedigree/consanguinityLabel";
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
 * The optional free text of #111, dropped from one individual as `keep` says.
 * Evaluation detail and onset can carry a test result or date a relative
 * did not know; text tags are often genotypes.
 */
function dropFreeText(ind: Individual, keep: DeidentifyKeep, textTagIds: Set<string>): Individual {
  const out: Individual = { ...ind };
  if (!keep.evaluationDetail && out.evaluations) {
    if (keep.evaluationMarks) {
      // The result stays ("+", "E1-") and so does the documented "*". Every
      // evaluation is kept, so the 2008 numbering matches the canvas and a
      // bare "E" still says one was done; in 2022 an empty one draws nothing.
      out.evaluations = out.evaluations.map(({ detail: _detail, ...ev }) => ev);
    } else {
      // The whole line goes, the "*" with it: a documented mark with no
      // evaluation drawn would point at nothing.
      delete out.evaluations;
    }
  }
  if (!keep.onset) {
    delete out.onset;
    delete out.tagOnset;
  }
  if (!keep.textTags && out.tags?.some(id => textTagIds.has(id))) {
    out.tags = out.tags.filter(id => !textTagIds.has(id));
  }
  return out;
}

/** The consanguinity text (#97) leaves the couple; the named relationship goes via canvasSettings. */
function dropCoupleLabel(p: Partnership): Partnership {
  if (p.consanguinityLabel === undefined) return p;
  const out = { ...p };
  delete out.consanguinityLabel;
  return out;
}

/**
 * The drawn pedigree (hidden descendants left out, #94) with names replaced by
 * generation numbers, dates bucketed or dropped (the date of death always),
 * and free-text age, notes,
 * chart title and clinical key fields dropped. The free text of #111
 * (evaluation detail, onset, consanguinity text, text tags) goes as
 * `options.deidentifyKeep` says, by default the detail and onset.
 */
export function deidentify(full: Pedigree, options: SvgExportOptions = {}): Pedigree {
  const pedigree = drawnPedigree(full);
  // The pedigree numbers (#8), so a de-identified figure reads like the
  // numbered one.
  const notations = pedigreeNumbers(pedigree);

  // The chart title and the free-text age (#20) can name or date someone, so
  // both go; age ranges come from the DOB only.
  // The clinical key fields (#102) name the recorder and historian and date
  // the visit; the reason and ancestry are free text that can name people
  // too, so the whole block goes.
  const rest: Pedigree = { ...pedigree };
  delete rest.clinicalDetails;
  const keep: DeidentifyKeep = { ...DEIDENTIFY_KEEP_DEFAULTS, ...options.deidentifyKeep };
  // Dropped from the people only: the key lists tags in use, so a dropped
  // text tag leaves no row behind.
  const textTagIds = new Set((pedigree.tags ?? []).filter(t => t.style === "text").map(t => t.id));
  return asDrawn({
    ...rest,
    chartTitle: "",
    // The names are the numbers now: drawing them again would repeat them.
    // Without consanguinity text the relationship is not named either.
    ...(pedigree.canvasSettings ? { canvasSettings: {
      ...pedigree.canvasSettings,
      showNumbers: false,
      ...(keep.consanguinityLabels ? {} : { relationshipLabels: false }),
    } } : {}),
    partnerships: keep.consanguinityLabels ? pedigree.partnerships : pedigree.partnerships.map(dropCoupleLabel),
    individuals: pedigree.individuals.map(ind => ({
      ...dropFreeText(ind, keep, textTagIds),
      name:  isBranchPlaceholderId(ind.id) ? undefined : notations.get(ind.id) ?? ind.id,
      // A date of death (#103) dates someone like a DOB does, so it goes;
      // with age ranges, someone with both dates gets the range at death.
      dob:   options.ageBuckets && ind.dob ? (ind.deceased && ind.dod && parsePartialDate(ind.dod.trim()) ? `d. ${ageBucket(ind.dob, new Date(ind.dod))}` : ageBucket(ind.dob)) : undefined,
      dod:   undefined,
      age:   undefined,
      notes: undefined,
    })),
  }, pedigree);
}

/**
 * Which of the #111 choices the drawn pedigree has anything for, so the
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
    consanguinityLabels: pedigree.partnerships.some(p => !!consanguinityLabelText(pedigree, p)),
    textTags: inds.some(i => i.tags?.some(id => textTagIds.has(id))),
  };
}
