import { useState } from "react";
import type { Individual, Pedigree, Sex, LifeStatus, Adoption, GenderIdentity } from "@pedigree-editor/layout-engine";
import { usePedigreeFields } from "@/store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { ConditionsAndTags } from "@/components/ConditionsAndTags";
import { fieldProblems } from "@/components/problemList";
import { LIFE_STATUS_LOCKED_TITLE, LIFE_STATUS_OPTIONS, lifeStatusLocked } from "@/pedigree/lifeStatus";
import { probandTitle } from "@/pedigree/proband";
import { ADOPTION_OPTIONS } from "@/pedigree/adoption";
import { GENDER_IDENTITY_OPTIONS, assignedAtBirthText, drawsGender } from "@/pedigree/gender";
import { twinSetOf } from "@/pedigree/twins";
import { ageText } from "@/pedigree/labels";
import type { ProblemField } from "@/pedigree/validation";
import {
  CONDITION_NOT_RECORDED, affectedControlOn, conditionMode, plainAffected, plainCarrier, resolvePlainAffected, soleCondition,
} from "@/pedigree/conditions";
import { batchSexProblem, carrierStatusOf } from "@/pedigree/batch";
import { notationOf } from "@/pedigree/notation";
import { symbolPaint, PLAIN_CARRIER_TAG } from "@/pedigree/tags";
import { childrenOf } from "@/pedigree/graph";
import { capitalised } from "@/utils/text";
import { ChevronRight } from "lucide-react";
import { CheckboxRow, Field, Hint, OptionSelect, ProblemHighlight, SELECT, type ProblemsOn } from "./fields";
import { EvaluationsForm } from "./EvaluationsForm";
import { TwinsForm } from "./TwinsForm";
import { AssistedForm } from "./AssistedForm";
import { PartnersForm, RelatednessSection } from "./CoupleSections";

/** The Person tab for one selected person. */
export function PersonForm({ individual, onManageTags }: { individual: Individual; onManageTags?: () => void }) {
  const { pedigree, updateIndividual, setDeceased, setDateOfDeath, setCarrier, setPresymptomatic, setFamilyHistoryUnknown, setLifeStatus, setAdopted, setOnset, setAffected, setProband, setConsultand, setConditionStatus, setIndividualTag } = usePedigreeFields("pedigree", "updateIndividual", "setDeceased", "setDateOfDeath", "setCarrier", "setPresymptomatic", "setFamilyHistoryUnknown", "setLifeStatus", "setAdopted", "setOnset", "setAffected", "setProband", "setConsultand", "setConditionStatus", "setIndividualTag");
  // A pregnancy or pregnancy loss cannot have a partner or children, and vice versa.
  const isLifeStatusLocked = lifeStatusLocked(pedigree, individual);
  // With any condition defined, conditions are recorded only in "Conditions and tags" and
  // Status keeps the plain flags, affected or carrier with no condition recorded.
  const withConditions = conditionMode(pedigree) !== "plain";
  // Editor warnings on a field: highlighted, with the message under it.
  const problemsOn = (field: ProblemField) => ({ problemFor: individual.id, problemField: field, problems: fieldProblems(pedigree, individual.id, field) });
  // The rarely set fields fold to one line while none is set for this person
  // Opening them stays open across selections, since the form is
  // not keyed by person. A warning on one of them opens them too.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const showDetails = detailsOpen || hasDetails(pedigree, individual)
    || (["lifeStatus", "reproductiveRole", "carriedBy"] as ProblemField[]).some(f => fieldProblems(pedigree, individual.id, f).length > 0);

  // One list, most used first: who and their status, then dates, then
  // conditions, then the rarer fields. Headings only where a section is a
  // list (conditions, evaluations, partners) or read-only (relatedness).
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Field inline label="Name">
          <Input
            value={individual.name ?? ""}
            aria-label="Name"
            onChange={e => updateIndividual(individual.id, { name: e.target.value })}
            className="h-7 text-sm"
            placeholder="Full name"
          />
        </Field>

        <SexControl individual={individual} />

        <div className="text-xs text-gray-600 space-y-1" data-testid="status">
          {withConditions ? (
            <PlainStatusForm individual={individual} problemsOn={problemsOn} />
          ) : (
            <>
              {/* Same rule as A and the more menu. */}
              <ProblemHighlight {...problemsOn("affected")}>
                <CheckboxRow
                  name="affected"
                  label="Affected"
                  checked={affectedControlOn(individual, pedigree)}
                  onChange={on => setAffected(individual.id, on)}
                />
              </ProblemHighlight>
              {affectedControlOn(individual, pedigree) && (
                <OnsetInput value={individual.onset} onChange={v => setOnset(individual.id, null, v)} />
              )}
              {/* One carrier status: the plain carrier, or the presymptomatic vertical line. */}
              <ProblemHighlight {...problemsOn("carrier")}>
              <div className="flex items-center gap-2">
                <span className="shrink-0">Carrier</span>
                <select
                  value={carrierStatusOf(individual, pedigree) === "none" ? "" : carrierStatusOf(individual, pedigree)}
                  aria-label="Carrier status"
                  onChange={e => {
                    const v = e.target.value;
                    if (v === "carrier") setCarrier(individual.id, true);
                    else if (v === "presymptomatic") setPresymptomatic(individual.id, true);
                    else if (individual.presymptomatic) setPresymptomatic(individual.id, false);
                    else setCarrier(individual.id, false);
                  }}
                  className="w-full min-w-0 h-6 border rounded px-1 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
                >
                  <option value="">No</option>
                  <option value="carrier">{notationOf(pedigree) === "nsgc2008" ? "Carrier (dot)" : "Carrier (half patterned)"}</option>
                  <option value="presymptomatic">Presymptomatic (vertical line)</option>
                </select>
              </div>
              </ProblemHighlight>
            </>
          )}
          {/* Affected and a plain carrier is a warning, which says the mark is hidden. */}
          {plainCarrier(individual, pedigree) && !problemsOn("carrier").problems.concat(problemsOn("conditions").problems).some(p => p.rule === "affected-and-carrier") && !symbolPaint(individual, pedigree).dot
            && !symbolPaint(individual, pedigree).sectors.some(x => x.tag === PLAIN_CARRIER_TAG) && (
            <Hint className="pl-5">
              Not drawn: the affected fill replaces the carrier mark. Use a gene result tag to show it.
            </Hint>
          )}
          {/* Deceased alone means date unknown; a date of death ticks it, unticking clears the date. */}
          <CheckboxRow name="deceased" label="Deceased" checked={!!individual.deceased} onChange={on => setDeceased(individual.id, on)} />
          <CheckboxRow
            name="familyHistoryUnknown"
            label="Family history not known"
            title="Draws a ? above the symbol (NSGC)"
            checked={!!individual.familyHistoryUnknown}
            onChange={on => setFamilyHistoryUnknown(individual.id, on)}
          />
          <div className="flex items-start gap-4">
            <CheckboxRow
              name="proband"
              label="Proband"
              title={probandTitle(pedigree, individual)}
              checked={!!individual.proband}
              onChange={() => setProband(individual.id)}
            />
            <ProblemHighlight {...problemsOn("consultand")}>
              <CheckboxRow
                name="consultand"
                label="Consultand"
                title="The person seeking counselling: an arrow without the P. A proband who is also the consultand keeps the P."
                checked={!!individual.consultand}
                onChange={on => setConsultand(individual.id, on)}
              />
            </ProblemHighlight>
          </div>
        </div>

        {/* Text, not the browser date picker, so a year alone can be entered, as for death. */}
        <Field inline label="Born" {...problemsOn("dob")}>
          <Input
            value={individual.dob ?? ""}
            aria-label="Date of birth"
            title="Date of birth: a year alone (YYYY) or a full date (YYYY-MM-DD)"
            onChange={e => updateIndividual(individual.id, { dob: e.target.value.trim() ? e.target.value : undefined })}
            className="h-7 text-xs"
            placeholder="YYYY(-MM-DD)"
          />
        </Field>

        <Field inline label="Died" {...problemsOn("dod")}>
          <Input
            value={individual.dod ?? ""}
            aria-label="Date of death"
            title="Date of death: a year alone (YYYY) or a full date (YYYY-MM-DD). Entering one ticks Deceased."
            onChange={e => setDateOfDeath(individual.id, e.target.value.trim() ? e.target.value : undefined)}
            className="h-7 text-xs"
            placeholder="YYYY(-MM-DD)"
          />
        </Field>

        <Field inline label="Age" {...problemsOn("age")}>
          <Input
            value={individual.age ?? ""}
            onChange={e => updateIndividual(individual.id, { age: e.target.value || undefined })}
            className="h-7 text-xs"
            placeholder="e.g. 50s, d. 72"
            aria-label="Age"
          />
          {individual.age?.trim() && (individual.dob || (individual.deceased && individual.dod)) ? (
            <Hint>Shown under the symbol in place of the years of birth and death.</Hint>
          ) : !individual.age?.trim() && ageText(individual) ? (
            <Hint>Shown under the symbol as "{ageText(individual)}" (NSGC prefers the year to the full date).</Hint>
          ) : null}
        </Field>
      </div>

      <ConditionsAndTags
        pedigree={pedigree}
        individual={individual}
        onConditionState={(tagId, state) => setConditionStatus(individual.id, tagId, state)}
        onToggleTag={(tagId, on) => setIndividualTag(individual.id, tagId, on)}
        onSetTagOnset={(tagId, value) => setOnset(individual.id, tagId, value)}
        onManageTags={onManageTags}
      />

      <EvaluationsForm key={`evaluations-${individual.id}`} individual={individual} problems={problemsOn("evaluations")} />

      <div className="border-t pt-3 space-y-2">
        <textarea
          value={individual.notes ?? ""}
          aria-label="Notes"
          onChange={e => updateIndividual(individual.id, { notes: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm resize-y h-14 focus:outline-hidden focus:ring-1 focus:ring-black"
          placeholder="Notes"
        />

        {!showDetails ? (
          <button
            type="button"
            data-testid="more-details"
            onClick={() => setDetailsOpen(true)}
            className="flex items-center gap-1 text-left text-xs text-gray-500 hover:text-black"
          >
            <ChevronRight size={12} className="shrink-0" />
            Pregnancy, adoption, gender identity, donor, twin
          </button>
        ) : (<>
        <Field inline label="Pregnancy / loss" {...problemsOn("lifeStatus")}>
          <OptionSelect<LifeStatus>
            label="Pregnancy / loss"
            value={individual.lifeStatus}
            options={LIFE_STATUS_OPTIONS}
            disabled={isLifeStatusLocked}
            title={isLifeStatusLocked ? LIFE_STATUS_LOCKED_TITLE : undefined}
            onChange={v => setLifeStatus(individual.id, v)}
            className={`${SELECT} disabled:opacity-50`}
          />
        </Field>

        <Field inline label="Adoption">
          <OptionSelect<Adoption> label="Adoption" value={individual.adopted} options={ADOPTION_OPTIONS} onChange={v => setAdopted(individual.id, v)} />
          {individual.adopted === "in" && (
            <Hint>Brackets round the symbol, dashed line to the adoptive parents.</Hint>
          )}
          {individual.adopted === "out" && (
            <Hint>Brackets round the symbol, solid line to the biological parents.</Hint>
          )}
        </Field>

        {!individual.lifeStatus && (
          <Field inline label="Gender identity">
            <OptionSelect<GenderIdentity>
              name="genderIdentity"
              label="Gender identity"
              none="Not recorded"
              value={individual.genderIdentity}
              options={GENDER_IDENTITY_OPTIONS}
              onChange={v => updateIndividual(individual.id, { genderIdentity: v })}
            />
            {individual.genderIdentity && (
              <Hint data-testid="gender-identity-note">
                {drawsGender(individual, pedigree)
                  ? `The symbol shows gender identity${assignedAtBirthText(individual, pedigree) ? `, with ${assignedAtBirthText(individual, pedigree)} under it` : ""}.`
                  : "Recorded only: symbols show biological sex (Settings)."}
                {" "}Genetics always uses sex ({individual.sex}).
              </Hint>
            )}
          </Field>
        )}

        <AssistedForm key={individual.id} individual={individual} problemsOn={problemsOn} />
        <TwinsForm individual={individual} />
        </>)}
      </div>

      <RelatednessSection individual={individual} />
      <PartnersForm individual={individual} />
    </div>
  );
}

/** True when any of the folded fields is set for this person, so they show. */
function hasDetails(pedigree: Pedigree, individual: Individual): boolean {
  return !!(individual.lifeStatus || individual.adopted || individual.genderIdentity || individual.reproductiveRole
    || individual.carriedBy || individual.socialParents?.length || twinSetOf(pedigree, individual.id)
    || pedigree.partnerships.some(p => p.donorConception && childrenOf(pedigree, p.id).includes(individual.id)));
}

/**
 * Status when the pedigree defines any condition: only the
 * plain flags, affected or carrier with no condition recorded, since each
 * condition is recorded in "Conditions and tags". The Affected box sets the
 * flag itself, never the one condition as A and the more menu do, so the two
 * places never record the same thing. A plain carrier is only shown, to be
 * cleared, as the warning's fixes record it as a condition. Their warnings
 * ("condition-not-recorded") and one-click fixes sit here.
 */
function PlainStatusForm({ individual, problemsOn }: { individual: Individual; problemsOn: ProblemsOn }) {
  const { pedigree, updateIndividual, setCarrier, setPresymptomatic, setOnset } = usePedigreeFields("pedigree", "updateIndividual", "setCarrier", "setPresymptomatic", "setOnset");
  const affected = plainAffected(individual, pedigree);
  // With one condition, the flag beside that condition adds nothing (plainAffected),
  // so the box could not tick: it is disabled instead.
  const sole = soleCondition(pedigree);
  const covered = !affected && !!sole && !!individual.tags?.includes(sole.id);
  // The affected status's own onset while it is drawn: under the flag, or
  // with one condition, an onset recorded before #136 under that condition.
  const ownOnset = affected || (affectedControlOn(individual, pedigree) && !!individual.onset?.trim());
  return (
    <>
      <ProblemHighlight {...problemsOn("conditions")}>
        <div className="space-y-1" data-testid="plain-status">
          <ProblemHighlight {...problemsOn("affected")}>
            <CheckboxRow
              name="plainAffected"
              label={<>Affected {CONDITION_NOT_RECORDED}</>}
              className={`flex items-center gap-2 ${covered ? "text-gray-400" : "cursor-pointer"}`}
              title={covered ? `Already affected with ${sole!.label}, the only condition` : undefined}
              checked={affected}
              disabled={covered}
              onChange={on => updateIndividual(individual.id, on
                ? { affected: true }
                // Only the flag: recorded conditions stay (#118).
                : resolvePlainAffected(individual, null, pedigree))}
            />
          </ProblemHighlight>
          {ownOnset && <OnsetInput value={individual.onset} onChange={v => setOnset(individual.id, null, v)} />}
          {plainCarrier(individual, pedigree) && (
            <CheckboxRow name="plainCarrier" label={<>Carrier {CONDITION_NOT_RECORDED}</>} checked onChange={() => setCarrier(individual.id, false)} />
          )}
        </div>
      </ProblemHighlight>
      <ProblemHighlight {...problemsOn("presymptomatic")}>
        <CheckboxRow
          name="presymptomatic"
          label="Presymptomatic (vertical line)"
          title="Clinically unaffected now but may develop the condition: a vertical line through the symbol (NSGC)"
          checked={!!individual.presymptomatic}
          onChange={on => setPresymptomatic(individual.id, on)}
        />
      </ProblemHighlight>
    </>
  );
}

/** Age of onset of the affected status, under the Affected box. */
function OnsetInput({ value, onChange }: { value: string | undefined; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2 pl-5">
      <span className="shrink-0">Age of onset</span>
      <Input
        value={value ?? ""}
        aria-label="Age of onset"
        onChange={e => onChange(e.target.value)}
        className="h-6 text-xs"
        placeholder="e.g. 45y, 40s, childhood"
      />
    </div>
  );
}

/**
 * Sex, with the more menu's rules: a choice `batchSexProblem` refuses
 * is greyed out, and the reason is its tooltip, so it shows only when someone
 * reaches for that choice. `aria-disabled` rather than `disabled`, because a
 * disabled button gets no hover in some browsers and so no tooltip.
 */
function SexControl({ individual }: { individual: Individual }) {
  const { pedigree, setSex } = usePedigreeFields("pedigree", "setSex");
  const sexes = ["male", "female", "unknown"] as const;
  const problemOf = (sex: Sex) => individual.sex === sex ? null : batchSexProblem(pedigree, [individual.id], sex);
  // Full width, with no label column: three buttons do not fit beside one.
  const atBirth = !!individual.genderIdentity && !individual.lifeStatus;
  return (
    <div className="space-y-1 text-xs text-gray-600">
      {atBirth && <div>Sex assigned at birth</div>}
      <div className="flex">
        <div className="flex flex-1 border rounded overflow-hidden" role="group" aria-label={atBirth ? "Sex assigned at birth" : "Sex"}>
          {sexes.map(sex => (
            <button
              key={sex}
              type="button"
              data-sex={sex}
              aria-pressed={individual.sex === sex}
              aria-disabled={!!problemOf(sex) || undefined}
              title={problemOf(sex) ?? undefined}
              onClick={() => { if (individual.sex !== sex && !problemOf(sex)) setSex(individual.id, sex); }}
              className={`flex-1 px-1 h-6 text-xs border-l first:border-l-0 ${individual.sex === sex ? "bg-black text-white" : "bg-white hover:bg-gray-100"} aria-disabled:text-gray-300 aria-disabled:hover:bg-white aria-disabled:cursor-not-allowed`}
            >
              {capitalised(sex)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
