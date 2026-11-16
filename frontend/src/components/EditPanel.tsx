import { usePedigreeStore, hasPartnerOrChild } from "../store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Legend, SectionHeader } from "./Legend";
import { ConditionsAndTags } from "./ConditionsAndTags";
import { SelectionPanel } from "./SelectionPanel";
import { LIFE_STATUS_OPTIONS } from "../pedigree/lifeStatus";
import { CHILDLESS_OPTIONS } from "../pedigree/childless";
import { coupleChildren } from "../pedigree/sameSex";
import { ADOPTION_OPTIONS } from "../pedigree/adoption";
import { GENDER_IDENTITY_OPTIONS, assignedAtBirthText, drawsGender } from "../pedigree/gender";
import { ZYGOSITY_OPTIONS, parentPartnershipOf, twinSetOf, twinSetProblem } from "../pedigree/twins";
import { formatCoefficient, degreeOfRelationship, relatednessOf } from "../pedigree/relatedness";
import { referenceRelatedness } from "../pedigree/referenceRelatedness";
import { namedCoupleRelationship } from "../pedigree/consanguinityLabel";
import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { chartTitle, ageText } from "../pedigree/labels";
import { CLINICAL_DETAIL_OPTIONS, clinicalDetailLines } from "../pedigree/clinicalDetails";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Individual, Sex, LifeStatus, ChildlessStatus, Pedigree, Adoption, Zygosity, GenderIdentity, ReproductiveRole } from "@pedigree-editor/layout-engine";
import type { Evaluation, EvaluationResult } from "@pedigree-editor/layout-engine";
import { EVALUATION_RESULT_OPTIONS, evaluationsOf } from "../pedigree/evaluation";
import { REPRODUCTIVE_ROLE_OPTIONS, assistedCandidates, geneticParents, reproductiveRoleProblem, symbolLetter } from "../pedigree/assisted";
import { worstSeverity, type Problem, type ProblemField } from "../pedigree/validation";
import { fieldProblems } from "./problemList";
import { ProblemIcon } from "./ProblemsMenu";
import { ProblemFixes } from "./ProblemFixes";
import {
  CONDITION_NOT_RECORDED, affectedControlOn, conditionMode, plainAffected, plainCarrier, resolvePlainAffected, soleCondition,
} from "../pedigree/conditions";
import { batchSexProblem, carrierStatusOf } from "../pedigree/batch";
import { notationOf } from "../pedigree/notation";
import { symbolPaint, PLAIN_CARRIER_TAG } from "../pedigree/tags";

interface EditPanelProps {
  onManageTags?: () => void;
}

type PanelTab = "person" | "pedigree";

/**
 * The right-hand panel (#135): a Person tab (the selected individual's
 * fields, or the batch panel for several) and a Pedigree tab (chart title,
 * clinical details), with the figure legend under both. Any change of
 * selection switches tab, to Person when someone is selected and to Pedigree
 * when the selection is cleared, so clicking a person or the background is a
 * shortcut. Every selection write makes a new `selectedIds` array, so
 * clicking the person already selected switches back too. Choosing the
 * Pedigree tab keeps the selection, so Person returns to the same people.
 * Person is disabled while nobody is selected. The figure legend is on the
 * Pedigree tab only; the Person tab has the person's own conditions and tags
 * with the same swatches (#136).
 *
 * Only the content under the tabs scrolls, with a stable scrollbar gutter, so
 * switching between a short and a long tab never moves the tabs or the text.
 */
export function EditPanel({ onManageTags }: EditPanelProps) {
  const { pedigree, selectedId, selectedIds } = usePedigreeStore();
  const anyone = selectedIds.length > 0;
  const [tab, setTab] = useState<PanelTab>(anyone ? "person" : "pedigree");
  useEffect(() => {
    setTab(selectedIds.length > 0 ? "person" : "pedigree");
  }, [selectedIds]);
  // Several selected (#21): the batch panel.
  const multiple = selectedIds.length > 1;
  const onPerson = tab === "person" && anyone;
  const individual = onPerson && !multiple ? pedigree.individuals.find(i => i.id === selectedId) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Side panel" className="flex shrink-0 border-b text-xs">
        <PanelTabButton tab="person" current={onPerson ? "person" : "pedigree"} onSelect={setTab} disabled={!anyone}
          title={anyone ? undefined : "Select someone on the chart to edit them"}>Person</PanelTabButton>
        <PanelTabButton tab="pedigree" current={onPerson ? "person" : "pedigree"} onSelect={setTab}>Pedigree</PanelTabButton>
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]" data-testid="panel-scroll">
        <div className="p-4 space-y-4" role="tabpanel" data-testid={onPerson ? "panel-person" : "panel-pedigree"}>
          {!onPerson ? (
            <>
              <ChartTitleField />
              <ClinicalDetailsSection />
              <div className="border-t pt-3">
                <Legend pedigree={pedigree} onManageTags={onManageTags} />
              </div>
            </>
          ) : multiple ? (
            <SelectionPanel />
          ) : individual ? (
            <IndividualForm individual={individual} onManageTags={onManageTags} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PanelTabButton({ tab, current, onSelect, disabled, title, children }: {
  tab: PanelTab; current: PanelTab; onSelect: (tab: PanelTab) => void; disabled?: boolean; title?: string; children: ReactNode;
}) {
  const active = tab === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      title={title}
      data-testid={`panel-tab-${tab}`}
      onClick={() => onSelect(tab)}
      className={`flex-1 py-2 -mb-px border-b ${active ? "border-black text-black" : "border-transparent text-gray-500 hover:text-black"} disabled:text-gray-300 disabled:hover:text-gray-300 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}


function IndividualForm({ individual, onManageTags }: { individual: Individual; onManageTags?: () => void }) {
  const { pedigree, updateIndividual, setDeceased, setDateOfDeath, setCarrier, setPresymptomatic, setFamilyHistoryUnknown, setLifeStatus, setAdopted, setOnset, setAffected, setProband, setConsultand, setConditionStatus, setIndividualTag } = usePedigreeStore();
  // A pregnancy or pregnancy loss cannot have a partner or children, and vice versa.
  const isLifeStatusLocked = !individual.lifeStatus && hasPartnerOrChild(pedigree, individual.id);
  // With any condition defined, conditions are recorded only in "Conditions and tags" and
  // Status keeps the plain flags, affected or carrier with no condition recorded (#136).
  const withConditions = conditionMode(pedigree) !== "plain";
  // Editor warnings (#116) on a field: highlighted, with the message under it.
  const problemsOn = (field: ProblemField) => ({ problemFor: individual.id, problemField: field, problems: fieldProblems(pedigree, individual.id, field) });
  // The rarely set fields fold to one line while none is set for this person
  // (#138). Opening them stays open across selections, since the form is
  // not keyed by person. A warning on one of them opens them too.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const showDetails = detailsOpen || hasDetails(pedigree, individual)
    || (["lifeStatus", "reproductiveRole", "carriedBy"] as ProblemField[]).some(f => fieldProblems(pedigree, individual.id, f).length > 0);

  // One list, most used first (#138): who and their status, then dates, then
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
              {/* Same rule as A and the more menu (#120). */}
              <ProblemHighlight {...problemsOn("affected")}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="affected"
                    checked={affectedControlOn(individual, pedigree)}
                    onChange={e => setAffected(individual.id, e.target.checked)}
                    className="accent-black"
                  />
                  <span>Affected</span>
                </label>
              </ProblemHighlight>
              {affectedControlOn(individual, pedigree) && (
                <OnsetInput value={individual.onset} onChange={v => setOnset(individual.id, null, v)} />
              )}
              {/* One carrier status (#101): the plain carrier, or the presymptomatic vertical line. */}
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
          {/* Affected and a plain carrier is a warning (#116), which says the mark is hidden. */}
          {plainCarrier(individual, pedigree) && !problemsOn("carrier").problems.concat(problemsOn("conditions").problems).some(p => p.rule === "affected-and-carrier") && !symbolPaint(individual, pedigree).dot
            && !symbolPaint(individual, pedigree).sectors.some(x => x.tag === PLAIN_CARRIER_TAG) && (
            <p className="text-[10px] text-gray-500 pl-5">
              Not drawn: the affected fill replaces the carrier mark. Use a gene result tag to show it.
            </p>
          )}
          {/* Deceased alone means date unknown; a date of death ticks it, unticking clears the date (#103). */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="deceased"
              checked={!!individual.deceased}
              onChange={e => setDeceased(individual.id, e.target.checked)}
              className="accent-black"
            />
            <span>Deceased</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer" title="Draws a ? above the symbol (NSGC)">
            <input
              type="checkbox"
              name="familyHistoryUnknown"
              checked={!!individual.familyHistoryUnknown}
              onChange={e => setFamilyHistoryUnknown(individual.id, e.target.checked)}
              className="accent-black"
            />
            <span>Family history not known</span>
          </label>
          <div className="flex items-start gap-4">
            <label className="flex items-center gap-2 cursor-pointer" title={probandTitle(pedigree, individual)}>
              <input
                type="checkbox"
                name="proband"
                checked={!!individual.proband}
                onChange={() => setProband(individual.id)}
                className="accent-black"
              />
              <span>Proband</span>
            </label>
            <ProblemHighlight {...problemsOn("consultand")}>
              <label className="flex items-center gap-2 cursor-pointer" title="The person seeking counselling: an arrow without the P. A proband who is also the consultand keeps the P.">
                <input
                  type="checkbox"
                  name="consultand"
                  checked={!!individual.consultand}
                  onChange={e => setConsultand(individual.id, e.target.checked)}
                  className="accent-black"
                />
                <span>Consultand</span>
              </label>
            </ProblemHighlight>
          </div>
        </div>

        {/* Text, not the browser date picker, so a year alone can be entered (#104), as for death (#103). */}
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
            <p className="text-[10px] text-gray-500">Shown under the symbol in place of the years of birth and death.</p>
          ) : !individual.age?.trim() && ageText(individual) ? (
            <p className="text-[10px] text-gray-500">Shown under the symbol as "{ageText(individual)}" (NSGC prefers the year to the full date).</p>
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
          <select
            value={individual.lifeStatus ?? ""}
            aria-label="Pregnancy / loss"
            disabled={isLifeStatusLocked}
            title={isLifeStatusLocked ? "Not available: this person has a partner or children" : undefined}
            onChange={e => setLifeStatus(individual.id, (e.target.value || undefined) as LifeStatus | undefined)}
            className={`${SELECT} disabled:opacity-50`}
          >
            <option value="">None</option>
            {LIFE_STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field inline label="Adoption">
          <select
            value={individual.adopted ?? ""}
            aria-label="Adoption"
            onChange={e => setAdopted(individual.id, (e.target.value || undefined) as Adoption | undefined)}
            className={SELECT}
          >
            <option value="">None</option>
            {ADOPTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {individual.adopted === "in" && (
            <p className="text-[10px] text-gray-500">Brackets round the symbol, dashed line to the adoptive parents.</p>
          )}
          {individual.adopted === "out" && (
            <p className="text-[10px] text-gray-500">Brackets round the symbol, solid line to the biological parents.</p>
          )}
        </Field>

        {!individual.lifeStatus && (
          <Field inline label="Gender identity">
            <select
              name="genderIdentity"
              value={individual.genderIdentity ?? ""}
              aria-label="Gender identity"
              onChange={e => updateIndividual(individual.id, { genderIdentity: (e.target.value || undefined) as GenderIdentity | undefined })}
              className={SELECT}
            >
              <option value="">Not recorded</option>
              {GENDER_IDENTITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {individual.genderIdentity && (
              <p className="text-[10px] text-gray-500" data-testid="gender-identity-note">
                {drawsGender(individual, pedigree)
                  ? `The symbol shows gender identity${assignedAtBirthText(individual, pedigree) ? `, with ${assignedAtBirthText(individual, pedigree)} under it` : ""}.`
                  : "Recorded only: symbols show biological sex (Settings)."}
                {" "}Genetics always uses sex ({individual.sex}).
              </p>
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

/** True when any of the folded fields (#138) is set for this person, so they show. */
function hasDetails(pedigree: Pedigree, individual: Individual): boolean {
  return !!(individual.lifeStatus || individual.adopted || individual.genderIdentity || individual.reproductiveRole
    || individual.carriedBy || individual.socialParents?.length || twinSetOf(pedigree, individual.id)
    || pedigree.partnerships.some(p => p.donorConception && (pedigree.parentOf[p.id] ?? []).includes(individual.id)));
}

/** A dropdown in an inline `Field`: it fills the control column. */
const SELECT = "w-full min-w-0 h-7 border rounded px-1 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-black";

/**
 * Status when the pedigree defines any condition (#115, #136): only the
 * plain flags, affected or carrier with no condition recorded, since each
 * condition is recorded in "Conditions and tags". The Affected box sets the
 * flag itself, never the one condition as A and the more menu do, so the two
 * places never record the same thing. A plain carrier is only shown, to be
 * cleared, as the warning's fixes record it as a condition. Their warnings
 * ("condition-not-recorded") and one-click fixes sit here.
 */
function PlainStatusForm({ individual, problemsOn }: { individual: Individual; problemsOn: (field: ProblemField) => ProblemProps }) {
  const { pedigree, updateIndividual, setCarrier, setPresymptomatic, setOnset } = usePedigreeStore();
  const affected = plainAffected(individual, pedigree);
  // With one condition, the flag beside that condition adds nothing (plainAffected),
  // so the box could not tick: it is disabled instead.
  const sole = soleCondition(pedigree);
  const covered = !affected && !!sole && !!individual.tags?.includes(sole.id);
  // The affected status's own onset (#93) while it is drawn: under the flag, or
  // with one condition, an onset recorded before #136 under that condition.
  const ownOnset = affected || (affectedControlOn(individual, pedigree) && !!individual.onset?.trim());
  return (
    <>
      <ProblemHighlight {...problemsOn("conditions")}>
        <div className="space-y-1" data-testid="plain-status">
          <ProblemHighlight {...problemsOn("affected")}>
            <label
              className={`flex items-center gap-2 ${covered ? "text-gray-400" : "cursor-pointer"}`}
              title={covered ? `Already affected with ${sole!.label}, the only condition` : undefined}
            >
              <input
                type="checkbox"
                name="plainAffected"
                checked={affected}
                disabled={covered}
                onChange={e => updateIndividual(individual.id, e.target.checked
                  ? { affected: true }
                  // Only the flag: recorded conditions stay (#118).
                  : resolvePlainAffected(individual, null, pedigree))}
                className="accent-black"
              />
              <span>Affected {CONDITION_NOT_RECORDED}</span>
            </label>
          </ProblemHighlight>
          {ownOnset && <OnsetInput value={individual.onset} onChange={v => setOnset(individual.id, null, v)} />}
          {plainCarrier(individual, pedigree) && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="plainCarrier" checked onChange={() => setCarrier(individual.id, false)} className="accent-black" />
              <span>Carrier {CONDITION_NOT_RECORDED}</span>
            </label>
          )}
        </div>
      </ProblemHighlight>
      <ProblemHighlight {...problemsOn("presymptomatic")}>
        <label className="flex items-center gap-2 cursor-pointer" title="Clinically unaffected now but may develop the condition: a vertical line through the symbol (NSGC)">
          <input
            type="checkbox"
            name="presymptomatic"
            checked={!!individual.presymptomatic}
            onChange={e => setPresymptomatic(individual.id, e.target.checked)}
            className="accent-black"
          />
          <span>Presymptomatic (vertical line)</span>
        </label>
      </ProblemHighlight>
    </>
  );
}

/** Age of onset of the affected status (#93), under the Affected box. */
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
 * Evaluations and test results (#101, NSGC): each drawn under the symbol as
 * "detail +" (NSGC 2022, no "E", #114); a documented one
 * adds a "*" at the symbol's lower right.
 */
/**
 * "Add evaluation" opens a draft row that lives only here until something is
 * entered, so a row just added and not yet typed into is not saved empty and
 * does not raise the empty evaluation warning (#116). Keyed by person at the
 * call site, so the draft goes when the selection changes.
 */
function EvaluationsForm({ individual, problems }: { individual: Individual; problems: ProblemProps }) {
  const { setEvaluations } = usePedigreeStore();
  const [draft, setDraft] = useState(false);
  const saved = evaluationsOf(individual);
  const evs: Evaluation[] = draft ? [...saved, {}] : saved;
  const change = (i: number, patch: Partial<Evaluation>) => {
    const next: Evaluation = { ...evs[i], ...patch };
    if (!next.result) delete next.result;
    if (!next.detail) delete next.detail;
    if (!next.documented) delete next.documented;
    if (i === saved.length) {
      // The draft row: saved once it holds something, and then it is an ordinary row.
      if (Object.keys(next).length === 0) return;
      setDraft(false);
      setEvaluations(individual.id, [...saved, next]);
      return;
    }
    setEvaluations(individual.id, saved.map((e, k) => (k === i ? next : e)));
  };
  const remove = (i: number) => {
    if (i === saved.length) setDraft(false);
    else setEvaluations(individual.id, saved.filter((_, k) => k !== i));
  };
  return (
    <div className={`border-t pt-3 ${evs.length ? "space-y-2" : ""}`} data-testid="evaluations-form">
      <SectionHeader action={
        <button
          type="button"
          data-testid="add-evaluation"
          onClick={() => setDraft(true)}
          disabled={draft}
          className="text-xs text-gray-600 underline hover:text-black disabled:text-gray-300 disabled:no-underline"
        >
          Add
        </button>
      }>Evaluations</SectionHeader>
      <ProblemHighlight {...problems}>
      {evs.map((ev, i) => (
        <div key={i} className="space-y-1" data-evaluation-row={i}>
          <div className="flex items-center gap-1 text-xs">
            <select
              value={ev.result ?? ""}
              aria-label={`Evaluation ${i + 1} result`}
              onChange={e => change(i, { result: (e.target.value || undefined) as EvaluationResult | undefined })}
              className="flex-1 min-w-0 h-6 border rounded px-1 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
            >
              <option value="">No result</option>
              {EVALUATION_RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              type="button"
              aria-label={`Remove evaluation ${i + 1}`}
              title="Remove this evaluation"
              onClick={() => remove(i)}
              className="px-1 text-gray-500 hover:text-black"
            >
              ×
            </button>
          </div>
          <Input
            value={ev.detail ?? ""}
            aria-label={`Evaluation ${i + 1} detail`}
            onChange={e => change(i, { detail: e.target.value })}
            className="h-6 text-xs"
            placeholder="e.g. BRCA1 c.5266dupC, echo"
          />
          <label className="flex items-center gap-1 cursor-pointer text-xs" title="Documented: examined by your team, or an outside result reviewed and verified. Draws a * at the symbol's lower right (NSGC).">
            <input
              type="checkbox"
              checked={!!ev.documented}
              aria-label={`Evaluation ${i + 1} documented`}
              onChange={e => change(i, { documented: e.target.checked })}
              className="accent-black"
            />
            <span>Documented (*)</span>
          </label>
        </div>
      ))}
      </ProblemHighlight>
    </div>
  );
}

/** Name or a short description of a sibling, for the twins checkboxes. */
function siblingLabel(pedigree: Pedigree, id: string): string {
  const ind = pedigree.individuals.find(i => i.id === id);
  const name = ind?.name?.trim();
  if (name) return name;
  const sex = ind?.sex === "male" ? "Brother" : ind?.sex === "female" ? "Sister" : "Sibling";
  const sibs = pedigree.parentOf[parentPartnershipOf(pedigree, id)?.id ?? ""] ?? [];
  return `${sex} ${sibs.indexOf(id) + 1}`;
}

/** The sibling drawn next to this person: the next one in the sibship, or the previous one for the last. */
export function adjacentSibling(pedigree: Pedigree, individualId: string): string | undefined {
  const sibs = pedigree.parentOf[parentPartnershipOf(pedigree, individualId)?.id ?? ""] ?? [];
  const i = sibs.indexOf(individualId);
  if (i < 0 || sibs.length < 2) return undefined;
  return sibs[i + 1] ?? sibs[i - 1];
}

/**
 * Twins (#11): zygosity for the selected person's twin set and which
 * siblings are in it. Choosing a zygosity when the person is not a twin yet
 * pairs them with the sibling drawn next to them.
 */
function TwinsForm({ individual }: { individual: Individual }) {
  const { pedigree, setTwins, removeTwin } = usePedigreeStore();
  const [problem, setProblem] = useState<string | null>(null);
  const partnership = parentPartnershipOf(pedigree, individual.id);
  const siblings = partnership ? (pedigree.parentOf[partnership.id] ?? []).filter(id => id !== individual.id) : [];
  if (!partnership || siblings.length === 0) return null;

  const twin = twinSetOf(pedigree, individual.id);
  const members = twin?.set.members ?? [];

  const apply = (zygosity: Zygosity | "", nextMembers: string[]) => {
    if (zygosity === "") { removeTwin(individual.id); setProblem(null); return; }
    const chosen = [individual.id, ...nextMembers.filter(m => m !== individual.id)];
    setProblem(setTwins(partnership.id, chosen, zygosity));
  };

  return (
    <div className="space-y-1" data-testid="twins-form">
      <Field inline label="Twin">
        <select
          value={twin?.set.zygosity ?? ""}
          aria-label="Zygosity"
          onChange={e => {
            const z = e.target.value as Zygosity | "";
            const next = members.length >= 2 ? members : [adjacentSibling(pedigree, individual.id)!];
            apply(z, next);
          }}
          className={SELECT}
        >
          <option value="">Not a twin</option>
          {ZYGOSITY_OPTIONS.map(o => {
            const next = members.length >= 2 ? members : [individual.id, adjacentSibling(pedigree, individual.id)!];
            const why = twinSetProblem(pedigree, partnership.id, next, o.value);
            return <option key={o.value} value={o.value} disabled={!!why} title={why ?? undefined}>{o.label}</option>;
          })}
        </select>
      </Field>
      {twin && (
        <div className="space-y-1 pl-20">
          <div className="text-xs text-gray-600">Twin of</div>
          {siblings.map(id => {
            const on = members.includes(id);
            return (
              <label key={id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={on}
                  aria-label={`Twin of ${siblingLabel(pedigree, id)}`}
                  onChange={e => apply(twin.set.zygosity, e.target.checked ? [...members, id] : members.filter(m => m !== id))}
                  className="accent-black"
                />
                <span>{siblingLabel(pedigree, id)}</span>
              </label>
            );
          })}
          {twin.set.zygosity === "monozygotic" && (
            <p className="text-[10px] text-gray-500">Changing the sex of one monozygotic twin changes all of them.</p>
          )}
        </div>
      )}
      {problem && <p className="text-[10px] text-red-600" role="alert">{problem}</p>}
    </div>
  );
}

/** Label for the other member of a partnership, as the more menu names them. */
export function partnerLabel(pedigree: Pedigree, individualId: string, partnershipId: string): string {
  const own = pedigree.partnerships.filter(p => p.individual1 === individualId || p.individual2 === individualId);
  const i = own.findIndex(p => p.id === partnershipId);
  const p = own[i];
  if (!p) return "partner";
  const otherId = p.individual1 === individualId ? p.individual2 : p.individual1;
  const other = pedigree.individuals.find(ind => ind.id === otherId);
  const name = other?.name?.trim();
  const sexLabel = other?.sex === "male" ? "male" : other?.sex === "female" ? "female" : "unknown sex";
  return name || `partner ${i + 1} (${sexLabel})`;
}

/** An X-linked coefficient, which is NaN when it turns on someone's unknown sex (#87). */
function formatCoefficientX(x: number): string {
  return Number.isNaN(x) ? "unknown (a sex is not recorded)" : formatCoefficient(x);
}

/**
 * Relatedness worked out from the drawn structure (#32): one line for how
 * the person is related to the proband and the consultand (#134), the person's
 * inbreeding coefficient, and for each partner the couple's kinship
 * coefficient, which is what their children's inbreeding coefficient will
 * be. Each has its X-linked value beside it (#87). The coefficients are
 * read-only.
 *
 * Each couple also has the double-line checkbox (#85), labelled
 * "Consanguineous with" so it can be found (#92). When the pedigree
 * shows the two are related it is ticked and fixed, since the line follows
 * the kinship. Otherwise it is the override for a couple known to be related
 * whose common ancestors are not drawn.
 */
function RelatednessSection({ individual }: { individual: Individual }) {
  const { pedigree, setPartnershipConsanguineous } = usePedigreeStore();
  const { inbreeding, inbreedingX, couples } = relatednessOf(pedigree, individual.id);
  const references = referenceRelatedness(pedigree, individual.id);
  if (!(inbreeding > 0) && couples.length === 0 && references.length === 0) return null;

  return (
    <div className="border-t pt-3 space-y-2" data-testid="relatedness">
      <SectionHeader>Relatedness</SectionHeader>
      <div className="text-xs text-gray-600 space-y-1.5">
        {references.map(r => (
          <div key={r.referenceId} data-testid="reference-relatedness" data-role={r.role}>
            <span className="text-gray-800">{r.text}</span>
            {r.detail && <div className="text-[10px] text-gray-500">{r.detail}</div>}
          </div>
        ))}
        {inbreeding > 0 && (
          <div data-testid="inbreeding" title="The chance that this person's two copies of a gene are the same copy inherited through both parents. It equals the kinship coefficient of the parents.">
            Inbreeding coefficient (F): <span className="font-medium">{formatCoefficient(inbreeding)}</span>
            <div data-testid="inbreeding-x" title="The same for the X chromosome, which matters for X-linked recessive conditions. A male has one X, so he cannot be inbred on it.">
              X-linked F: <span className="font-medium">{individual.sex === "male" ? "not applicable (one X)" : formatCoefficientX(inbreedingX)}</span>
            </div>
            <div className="text-[10px] text-gray-500">Parents {degreeOfRelationship(inbreeding)}.</div>
          </div>
        )}
        {couples.map(c => {
          const partner = partnerLabel(pedigree, individual.id, c.partnershipId);
          const related = c.kinship > 0;
          const flagged = !!pedigree.partnerships.find(p => p.id === c.partnershipId)?.consanguineous;
          return (
            <div key={c.partnershipId} data-testid="couple-kinship">
              <label
                className={`flex items-center gap-2 ${related ? "" : "cursor-pointer"}`}
                title={related
                  ? "The pedigree shows they are related, so the couple line is double."
                  : "Draws the couple line double. For a couple known to be related when the pedigree does not show how."}
              >
                <input
                  type="checkbox"
                  checked={related || flagged}
                  disabled={related}
                  onChange={e => setPartnershipConsanguineous(c.partnershipId, e.target.checked)}
                  className="accent-black"
                />
                <span>Consanguineous with {partner}</span>
              </label>
              {!related && !flagged && (
                <p className="text-[10px] text-gray-500 pl-5">
                  Tick for a couple known to be related when the pedigree does not show how. Draws a double line.
                </p>
              )}
              {related && (
                <div className="pl-5" title="The kinship coefficient of a couple is the inbreeding coefficient of their children.">
                  Kinship <span className="font-medium">{formatCoefficient(c.kinship)}</span>
                  <div data-testid="couple-kinship-x" title="X-linked kinship of the couple: the X-linked inbreeding coefficient of their daughters. Sons have one X and are not inbred on it.">
                    X-linked kinship <span className="font-medium">{formatCoefficientX(c.kinshipX)}</span>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {capitalise(degreeOfRelationship(c.kinship) ?? "")}. Their children have F = {formatCoefficient(c.kinship)}
                    {Number.isNaN(c.kinshipX) ? "." : `, their daughters X-linked F = ${formatCoefficient(c.kinshipX)}.`}
                  </div>
                </div>
              )}
              {!related && flagged && (
                <p className="text-[10px] text-gray-500 pl-5">
                  Double line. The pedigree does not show how they are related, so there is no coefficient.
                </p>
              )}
              {(related || flagged) && <ConsanguinityLabelField partnershipId={c.partnershipId} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The text above a couple's double line (#97). NSGC writes the degree of
 * relationship there when the drawing does not show it, so it matters most
 * for the manual override. When the pedigree names the relationship, a
 * button fills it in.
 */
function ConsanguinityLabelField({ partnershipId }: { partnershipId: string }) {
  const { pedigree, setPartnershipConsanguinityLabel } = usePedigreeStore();
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!partnership) return null;
  const named = namedCoupleRelationship(pedigree, partnership);
  const own = partnership.consanguinityLabel ?? "";
  const auto = !own.trim() && pedigree.canvasSettings?.relationshipLabels ? named : null;
  return (
    <div className="pl-5 pt-1 space-y-1" data-testid="consanguinity-label">
      <Input
        value={own}
        aria-label="Written above the double line"
        onChange={e => setPartnershipConsanguinityLabel(partnershipId, e.target.value)}
        className="h-7 text-sm"
        placeholder={auto ?? "Above the line, e.g. third cousins"}
      />
      <p className="text-[10px] text-gray-500">
        {auto
          ? `"${auto}" is written above the line (Settings, name consanguineous relationships). Type to replace it.`
          : "Written above the double line. For when the pedigree does not show how they are related."}
      </p>
      {named && own.trim() !== named && !auto && (
        <button
          type="button"
          onClick={() => setPartnershipConsanguinityLabel(partnershipId, named)}
          className="text-[10px] underline text-gray-600 hover:text-black"
        >
          Write "{named}"
        </button>
      )}
    </div>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Partners (#138): one block per couple this person is in, with the ended
 * mark (#98: two short strokes across the couple line for a separation or
 * divorce) and, while the couple has no children, the childless mark (#15).
 * A gamete donation pair (#45) is not a couple and is left out.
 */
function PartnersForm({ individual }: { individual: Individual }) {
  const { pedigree, setPartnershipEnded, setPartnershipChildless, setPartnershipChildlessReason } = usePedigreeStore();
  const own = pedigree.partnerships.filter(p => (p.individual1 === individual.id || p.individual2 === individual.id) && !p.donorConception);
  if (own.length === 0) return null;
  return (
    <div className="border-t pt-3 space-y-2" data-testid="partners-form">
      <SectionHeader>Partners</SectionHeader>
      {own.map(p => {
        const partner = partnerLabel(pedigree, individual.id, p.id);
        const childless = coupleChildren(pedigree, p.id).length === 0;
        return (
          <div key={p.id} className="space-y-1 text-xs text-gray-600" data-partner-row={p.id}>
            <div className="text-gray-800 break-words">{partner}</div>
            <label className="flex items-center gap-2 cursor-pointer" title="Separated or divorced: two short strokes across the couple line">
              <input
                type="checkbox"
                checked={!!p.ended}
                aria-label={`Ended with ${partner}`}
                onChange={e => setPartnershipEnded(p.id, e.target.checked)}
                className="accent-black"
              />
              <span>Relationship ended</span>
            </label>
            {childless && (
              <Field inline label="No children">
                <select
                  value={p.childless ?? ""}
                  aria-label={`Childless mark with ${partner}`}
                  onChange={e => setPartnershipChildless(p.id, (e.target.value || undefined) as ChildlessStatus | undefined)}
                  className={SELECT}
                >
                  <option value="">No mark</option>
                  {CHILDLESS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {p.childless && (
                  <Input
                    value={p.childlessReason ?? ""}
                    aria-label="Reason shown under the mark"
                    onChange={e => setPartnershipChildlessReason(p.id, e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Reason, e.g. vasectomy"
                  />
                )}
              </Field>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Assisted reproduction (#45): the letter in this person's symbol, and for
 * a child, who carried them and who are their social parents. Donors and
 * surrogates are added from the more menu.
 */
function AssistedForm({ individual, problemsOn }: { individual: Individual; problemsOn: (field: ProblemField) => ProblemProps }) {
  const { pedigree, setReproductiveRole, setCarriedBy, setSocialParents } = usePedigreeStore();
  const candidates = assistedCandidates(pedigree, individual.id);
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    const letter = ind && symbolLetter(ind);
    return (ind?.name?.trim() || (letter ? `${letter === "D" ? "Donor" : "Surrogate"} (${ind!.sex})` : `Unnamed ${ind?.sex ?? ""}`)).trim();
  };
  const hasParents = geneticParents(pedigree, individual.id).length > 0;
  const donorConceived = !!pedigree.partnerships.find(p => (pedigree.parentOf[p.id] ?? []).includes(individual.id))?.donorConception;
  const linked = !!individual.carriedBy || !!individual.socialParents?.length || donorConceived;
  const [expanded, setExpanded] = useState(false);
  const social = individual.socialParents ?? [];
  const carriers = candidates.filter(c => c.sex !== "male" || c.id === individual.carriedBy);
  // An egg donor who also carried the child (#104) is a genetic parent, so not a candidate: keep her shown.
  const carrierInd = pedigree.individuals.find(i => i.id === individual.carriedBy);
  if (carrierInd && !carriers.some(c => c.id === carrierInd.id)) carriers.unshift(carrierInd);
  const addable = candidates.filter(c => !social.includes(c.id) && c.id !== individual.carriedBy);
  return (
    <div className="space-y-2" data-testid="assisted-form">
      <Field inline label="Donor / surrogate" {...problemsOn("reproductiveRole")}>
        <select
          value={individual.reproductiveRole ?? ""}
          aria-label="Donor or surrogate"
          onChange={e => setReproductiveRole(individual.id, (e.target.value || undefined) as ReproductiveRole | undefined)}
          className={SELECT}
        >
          <option value="">None</option>
          {REPRODUCTIVE_ROLE_OPTIONS.map(o => {
            // A man cannot be a surrogate; one recorded as such (an import) keeps the option to show it.
            const refused = o.value !== individual.reproductiveRole && !!reproductiveRoleProblem(pedigree, individual.id, o.value);
            return <option key={o.value} value={o.value} disabled={refused}>{o.label}{refused ? ", not for a male" : ""}</option>;
          })}
        </select>
      </Field>
      {hasParents && !linked && !expanded && (
        <button className="pl-20 text-[11px] text-left text-gray-500 underline hover:text-black" onClick={() => setExpanded(true)}>
          Carried by, social parents...
        </button>
      )}
      {(linked || expanded) && (
        <>
          <Field inline label="Carried by" {...problemsOn("carriedBy")}>
            <select
              value={individual.carriedBy ?? ""}
              aria-label="Carried by"
              onChange={e => setCarriedBy(individual.id, e.target.value || undefined)}
              className={SELECT}
            >
              <option value="">The genetic mother</option>
              {carriers.map(c => <option key={c.id} value={c.id}>{label(c.id)}</option>)}
            </select>
            {individual.carriedBy && (
              <p className="text-[10px] text-gray-500">Solid line from her: she carried the pregnancy but is not the genetic mother, so not a parent for kinship.</p>
            )}
          </Field>
          <Field inline label="Social parents">
            {social.map(id => (
              <div key={id} className="flex items-center justify-between text-xs text-gray-600">
                <span className="truncate">{label(id)}</span>
                <button
                  className="px-1 text-gray-400 hover:text-black"
                  aria-label={`Remove ${label(id)} as social parent`}
                  onClick={() => setSocialParents(individual.id, social.filter(x => x !== id))}
                >
                  ×
                </button>
              </div>
            ))}
            {addable.length > 0 && (
              <select
                value=""
                aria-label="Add social parent"
                onChange={e => e.target.value && setSocialParents(individual.id, [...social, e.target.value])}
                className={`${SELECT} text-gray-500`}
              >
                <option value="">Add...</option>
                {addable.map(c => <option key={c.id} value={c.id}>{label(c.id)}</option>)}
              </select>
            )}
            {social.length > 0 && (
              <p className="text-[10px] text-gray-500">Dashed line: a parent who is not a genetic parent, such as the intended father with donor sperm.</p>
            )}
          </Field>
        </>
      )}
    </div>
  );
}

interface ProblemProps {
  /** The person the problems are about, and the field (`data-problem-field`, which the problems list focuses). */
  problemFor?: string;
  problemField?: ProblemField;
  problems?: Problem[];
}

/** Proband checkbox tooltip: one per pedigree, so say whose arrow moves. */
function probandTitle(pedigree: Pedigree, individual: Individual): string {
  const other = pedigree.individuals.find(i => i.proband && i.id !== individual.id);
  if (!other) return "The affected person through whom the family came to attention: an arrow with a P. One per pedigree.";
  return `One per pedigree: ticking this moves the proband arrow from ${other.name?.trim() || "another person"}.`;
}

/**
 * Sex (#120), with the more menu's rules: a choice `batchSexProblem` refuses
 * is greyed out, and the reason is its tooltip, so it shows only when someone
 * reaches for that choice. `aria-disabled` rather than `disabled`, because a
 * disabled button gets no hover in some browsers and so no tooltip.
 */
function SexControl({ individual }: { individual: Individual }) {
  const { pedigree, setSex } = usePedigreeStore();
  const sexes = ["male", "female", "unknown"] as const;
  const problemOf = (sex: Sex) => individual.sex === sex ? null : batchSexProblem(pedigree, [individual.id], sex);
  // Full width, with no label column: three buttons do not fit beside one (#138).
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
              {sex.charAt(0).toUpperCase() + sex.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A labelled field. `inline` puts the label in a narrow column beside the
 * control (#138), for single-line controls, so each takes one row; a long
 * label wraps. Messages and warnings go under the control.
 */
function Field({ label, inline, children, ...problem }: { label: string; inline?: boolean; children: React.ReactNode } & ProblemProps) {
  if (inline) {
    return (
      <div className="flex items-start gap-2">
        <Label className="w-[4.5rem] shrink-0 min-h-7 flex items-center text-xs leading-tight text-gray-600">{label}</Label>
        <div className="flex-1 min-w-0">
          <ProblemHighlight {...problem}>{children}</ProblemHighlight>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      <ProblemHighlight {...problem}>{children}</ProblemHighlight>
    </div>
  );
}

/**
 * Editor warnings (#116): a thin outline round the field (black for a
 * warning, red for an error, as notices are) and each message under it,
 * with its one-click fix when the rule has one. Nothing when there are none.
 */
function ProblemHighlight({ children, problemFor, problemField, problems = [] }: { children: React.ReactNode } & ProblemProps) {
  const severity = worstSeverity(problems);
  return (
    <div
      data-problem-for={problemField ? problemFor : undefined}
      data-problem-field={problemField}
      data-problem-severity={severity}
      className={`space-y-1${severity ? ` rounded-sm outline outline-1 outline-offset-2 ${severity === "error" ? "outline-red-600" : "outline-gray-500"}` : ""}`}
    >
      {children}
      {problems.map(p => (
        <p key={p.id} data-problem-message={p.id} className={`flex items-start gap-1 text-[10px] ${p.severity === "error" ? "text-red-700" : "text-gray-700"}`}>
          <span className="mt-px"><ProblemIcon severity={p.severity} size={10} /></span>
          <span>
            {p.message}
            <ProblemFixes problem={p} />
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * The chart title (#20), shown when nothing is selected. Until edited it
 * shows the pedigree's name, which is what the canvas and exports draw;
 * clearing it hides the title.
 */
function ChartTitleField() {
  const { pedigree, setChartTitle } = usePedigreeStore();
  const pedigreeName = useAppStore(s => s.activeTitle);
  return (
    <Field label="Chart title">
      <Input
        value={pedigree.chartTitle ?? chartTitle(pedigree, pedigreeName)}
        onChange={e => setChartTitle(e.target.value)}
        className="h-7 text-sm"
        placeholder="No title"
        aria-label="Chart title"
      />
      <p className="text-[10px] text-gray-500">Drawn above the pedigree and in exports. Clear it for no title.</p>
    </Field>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Clinical key fields (#102), under the chart title on the Pedigree tab (#135).
 * Folded by default so a new pedigree's panel stays short; the header says
 * how many are filled, and the legend below lists them.
 */
function ClinicalDetailsSection() {
  const { pedigree, setClinicalDetail } = usePedigreeStore();
  const [open, setOpen] = useState(false);
  const filled = clinicalDetailLines(pedigree).length;
  const details = pedigree.clinicalDetails ?? {};
  return (
    <div className="space-y-2" data-testid="clinical-details">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs text-gray-600 hover:text-black"
        title="Reason for referral, ancestry, historian, recorder and date, for the legend and the export key (NSGC)"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Clinical details
        {filled > 0 && <span className="text-gray-400">({filled} filled)</span>}
      </button>
      {open && (
        <div className="space-y-2 pl-4">
          {CLINICAL_DETAIL_OPTIONS.map(o => {
            const value = details[o.field] ?? "";
            // A date typed elsewhere (an imported file) is kept as text rather than hidden by the picker.
            const asDate = o.date && (value === "" || ISO_DATE.test(value));
            return (
              <Field key={o.field} label={o.label}>
                {o.long ? (
                  <textarea
                    value={value}
                    onChange={e => setClinicalDetail(o.field, e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm resize-none h-12 focus:outline-hidden focus:ring-1 focus:ring-black"
                    placeholder={o.placeholder}
                    aria-label={o.label}
                  />
                ) : <Input
                  type={asDate ? "date" : "text"}
                  value={value}
                  onChange={e => setClinicalDetail(o.field, e.target.value)}
                  className="h-7 text-sm"
                  placeholder={o.placeholder}
                  aria-label={o.label}
                />}
              </Field>
            );
          })}
          <p className="text-[10px] text-gray-500">
            Filled fields are listed in the legend and the export key. De-identified exports leave them all out.
          </p>
        </div>
      )}
    </div>
  );
}
