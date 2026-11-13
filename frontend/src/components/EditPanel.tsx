import { usePedigreeStore, hasPartnerOrChild } from "../store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Legend } from "./Legend";
import { SelectionPanel } from "./SelectionPanel";
import { LIFE_STATUS_OPTIONS, lifeStatusLabel } from "../pedigree/lifeStatus";
import { CHILDLESS_OPTIONS } from "../pedigree/childless";
import { ADOPTION_OPTIONS } from "../pedigree/adoption";
import { GENDER_IDENTITY_OPTIONS, assignedAtBirthText, drawsGender } from "../pedigree/gender";
import { ZYGOSITY_OPTIONS, parentPartnershipOf, twinSetOf, twinSetProblem } from "../pedigree/twins";
import { formatCoefficient, degreeOfRelationship, relatednessOf } from "../pedigree/relatedness";
import { namedCoupleRelationship } from "../pedigree/consanguinityLabel";
import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { chartTitle, ageText, parsePartialDate } from "../pedigree/labels";
import { CLINICAL_DETAIL_OPTIONS, clinicalDetailLines } from "../pedigree/clinicalDetails";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Individual, LifeStatus, ChildlessStatus, Pedigree, Adoption, Zygosity, GenderIdentity, ReproductiveRole } from "@pedigree-editor/layout-engine";
import type { Evaluation, EvaluationResult } from "@pedigree-editor/layout-engine";
import { EVALUATION_RESULT_OPTIONS, evaluationsOf } from "../pedigree/evaluation";
import { REPRODUCTIVE_ROLE_OPTIONS, assistedCandidates, geneticParents, symbolLetter } from "../pedigree/assisted";

interface EditPanelProps {
  onManageTags?: () => void;
}

/**
 * The right-hand panel: the figure legend when nothing is selected, or the
 * selected individual's fields followed by the legend's tag rows as that
 * person's tag checkboxes (#75).
 */
export function EditPanel({ onManageTags }: EditPanelProps) {
  const { pedigree, selectedId, selectedIds, setIndividualTag, setOnset } = usePedigreeStore();
  // Several selected (#21): the batch panel, and the legend without one person's tag checkboxes.
  const multiple = selectedIds.length > 1;
  const individual = multiple ? undefined : pedigree.individuals.find(i => i.id === selectedId);

  return (
    <div className="p-4 space-y-4">
      {multiple ? (
        <SelectionPanel />
      ) : individual ? (
        <IndividualForm individual={individual} />
      ) : (
        <>
          <ChartTitleField />
          <ClinicalDetailsSection />
          <p className="text-xs text-gray-400">Select an individual to edit</p>
        </>
      )}
      <div className="border-t pt-3">
        <Legend
          pedigree={pedigree}
          individual={individual}
          onToggleTag={individual ? (tagId, on) => setIndividualTag(individual.id, tagId, on) : undefined}
          onSetTagOnset={individual ? (tagId, value) => setOnset(individual.id, tagId, value) : undefined}
          onManageTags={onManageTags}
        />
      </div>
    </div>
  );
}

function IndividualForm({ individual }: { individual: Individual }) {
  const { pedigree, updateIndividual, setDeceased, setDateOfDeath, setCarrier, setPresymptomatic, setFamilyHistoryUnknown, setLifeStatus, setAdopted, setOnset } = usePedigreeStore();
  // A pregnancy or pregnancy loss cannot have a partner or children, and vice versa.
  const isLifeStatusLocked = !individual.lifeStatus && hasPartnerOrChild(pedigree, individual.id);

  return (
    <div className="space-y-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Individual
      </div>

      <Field label="Name">
        <Input
          value={individual.name ?? ""}
          onChange={e => updateIndividual(individual.id, { name: e.target.value })}
          className="h-7 text-sm"
          placeholder="Full name"
        />
      </Field>

      {/* Text, not the browser date picker, so a year alone can be entered (#104), as for death (#103). */}
      <Field label="Date of birth">
        <Input
          value={individual.dob ?? ""}
          aria-label="Date of birth"
          onChange={e => updateIndividual(individual.id, { dob: e.target.value.trim() ? e.target.value : undefined })}
          className="h-7 text-sm"
          placeholder="YYYY or YYYY-MM-DD"
        />
        {individual.dob?.trim() && !parsePartialDate(individual.dob.trim()) && (
          <p className="text-[10px] text-gray-500">Drawn as typed until it reads as a year (1935) or a date (1935-03-14).</p>
        )}
      </Field>

      {/* Deceased alone means date unknown; a date of death ticks it, unticking clears the date (#103). */}
      <Field label="Date of death">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer shrink-0">
            <input
              type="checkbox"
              name="deceased"
              checked={!!individual.deceased}
              onChange={e => setDeceased(individual.id, e.target.checked)}
              className="accent-black"
            />
            <span>Deceased</span>
          </label>
          <Input
            value={individual.dod ?? ""}
            aria-label="Date of death"
            onChange={e => setDateOfDeath(individual.id, e.target.value.trim() ? e.target.value : undefined)}
            className="h-7 text-sm"
            placeholder="YYYY or YYYY-MM-DD"
          />
        </div>
        {individual.dod?.trim() && !parsePartialDate(individual.dod.trim()) && (
          <p className="text-[10px] text-gray-500">Not drawn until it reads as a year (2007) or a date (2007-03-14).</p>
        )}
      </Field>

      <Field label="Age">
        <Input
          value={individual.age ?? ""}
          onChange={e => updateIndividual(individual.id, { age: e.target.value || undefined })}
          className="h-7 text-sm"
          placeholder="e.g. 50s, d. 72"
          aria-label="Age"
        />
        {individual.age?.trim() && (individual.dob || (individual.deceased && individual.dod)) ? (
          <p className="text-[10px] text-gray-500">Shown under the symbol in place of the years of birth and death.</p>
        ) : !individual.age?.trim() && ageText(individual) ? (
          <p className="text-[10px] text-gray-500">Shown under the symbol as "{ageText(individual)}" (NSGC prefers the year to the full date).</p>
        ) : null}
      </Field>

      <Field label="Notes">
        <textarea
          value={individual.notes ?? ""}
          onChange={e => updateIndividual(individual.id, { notes: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm resize-none h-20 focus:outline-hidden focus:ring-1 focus:ring-black"
          placeholder="Clinical notes"
        />
      </Field>

      <Field label="Pregnancy / loss">
        <select
          value={individual.lifeStatus ?? ""}
          disabled={isLifeStatusLocked}
          title={isLifeStatusLocked ? "Not available: this individual has a partner or children" : undefined}
          onChange={e => setLifeStatus(individual.id, (e.target.value || undefined) as LifeStatus | undefined)}
          className="w-full h-7 border rounded px-2 text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-black disabled:opacity-50"
        >
          <option value="">None</option>
          {LIFE_STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Adoption">
        <select
          value={individual.adopted ?? ""}
          aria-label="Adoption"
          onChange={e => setAdopted(individual.id, (e.target.value || undefined) as Adoption | undefined)}
          className="w-full h-7 border rounded px-2 text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
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
        <Field label="Gender identity">
          <select
            name="genderIdentity"
            value={individual.genderIdentity ?? ""}
            aria-label="Gender identity"
            onChange={e => updateIndividual(individual.id, { genderIdentity: (e.target.value || undefined) as GenderIdentity | undefined })}
            className="w-full h-7 border rounded px-2 text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
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

      <AssistedForm key={individual.id} individual={individual} />

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Status
        </div>
        <div className="text-xs text-gray-600 space-y-1">
          <div>Sex{individual.genderIdentity && !individual.lifeStatus ? " assigned at birth" : ""}: <span className="font-medium">{individual.sex}</span></div>
          <div>Affected: <span className="font-medium">{individual.affected ? "yes" : "no"}</span></div>
          {individual.affected && (
            <div className="flex items-center gap-2 pl-5">
              <span className="shrink-0">Age of onset</span>
              <Input
                value={individual.onset ?? ""}
                aria-label="Age of onset"
                onChange={e => setOnset(individual.id, null, e.target.value)}
                className="h-6 text-xs"
                placeholder="e.g. 45y, 40s, childhood"
              />
            </div>
          )}
          {/* One carrier status (#101): the dot, or the presymptomatic vertical line. */}
          <div className="flex items-center gap-2">
            <span className="shrink-0">Carrier</span>
            <select
              value={individual.presymptomatic ? "presymptomatic" : individual.carrier ? "carrier" : ""}
              aria-label="Carrier status"
              onChange={e => {
                const v = e.target.value;
                if (v === "carrier") setCarrier(individual.id, true);
                else if (v === "presymptomatic") setPresymptomatic(individual.id, true);
                else if (individual.presymptomatic) setPresymptomatic(individual.id, false);
                else setCarrier(individual.id, false);
              }}
              className="w-full h-6 border rounded px-1 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
            >
              <option value="">No</option>
              <option value="carrier">Carrier (dot)</option>
              <option value="presymptomatic">Presymptomatic (vertical line)</option>
            </select>
          </div>
          {(individual.carrier || individual.presymptomatic) && individual.affected && (
            <p className="text-[10px] text-gray-500 pl-5">
              Not drawn: the affected fill replaces the carrier mark. Use a gene result tag to show it.
            </p>
          )}
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
          {individual.proband && <div className="font-medium">Proband</div>}
          {individual.consultand && <div className="font-medium">{individual.proband ? "Also the consultand" : "Consultand"}</div>}
          {individual.lifeStatus && <div className="font-medium">{lifeStatusLabel(individual.lifeStatus)}</div>}
        </div>
      </div>

      <EvaluationsForm individual={individual} />
      <TwinsForm individual={individual} />
      <RelatednessSection individual={individual} />
      <EndedForm individual={individual} />
      <CouplesForm individual={individual} />
    </div>
  );
}

/**
 * Evaluations and test results (#101, NSGC): each drawn under the symbol as
 * "detail +" (NSGC 2022, no "E", #114); a documented one
 * adds a "*" at the symbol's lower right.
 */
function EvaluationsForm({ individual }: { individual: Individual }) {
  const { setEvaluations } = usePedigreeStore();
  const evs = evaluationsOf(individual);
  const change = (i: number, patch: Partial<Evaluation>) => {
    setEvaluations(individual.id, evs.map((e, k) => {
      if (k !== i) return e;
      const next: Evaluation = { ...e, ...patch };
      if (!next.result) delete next.result;
      if (!next.detail) delete next.detail;
      if (!next.documented) delete next.documented;
      return next;
    }));
  };
  return (
    <div className="border-t pt-3 space-y-2" data-testid="evaluations-form">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Evaluations</div>
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
              onClick={() => setEvaluations(individual.id, evs.filter((_, k) => k !== i))}
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
      <button
        type="button"
        data-testid="add-evaluation"
        onClick={() => setEvaluations(individual.id, [...evs, {}])}
        className="text-xs underline text-gray-600 hover:text-black"
      >
        Add evaluation
      </button>
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
    <div className="border-t pt-3 space-y-2" data-testid="twins-form">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Twins</div>
      <Field label="Zygosity">
        <select
          value={twin?.set.zygosity ?? ""}
          aria-label="Zygosity"
          onChange={e => {
            const z = e.target.value as Zygosity | "";
            const next = members.length >= 2 ? members : [adjacentSibling(pedigree, individual.id)!];
            apply(z, next);
          }}
          className="w-full h-7 border rounded px-2 text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
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
        <div className="space-y-1">
          <Label className="text-xs text-gray-600">Twin of</Label>
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
 * Relatedness worked out from the drawn structure (#32): the person's
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
  if (!(inbreeding > 0) && couples.length === 0) return null;

  return (
    <div className="border-t pt-3 space-y-2" data-testid="relatedness">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Relatedness</div>
      <div className="text-xs text-gray-600 space-y-1.5">
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
 * Ended relationships (#98): one checkbox per partner. NSGC draws a
 * relationship that no longer exists (separated, divorced) as two short
 * strokes across the couple line.
 */
function EndedForm({ individual }: { individual: Individual }) {
  const { pedigree, setPartnershipEnded } = usePedigreeStore();
  // A gamete donation pair (#45) is not a couple and has no line to mark.
  const own = pedigree.partnerships.filter(p => (p.individual1 === individual.id || p.individual2 === individual.id) && !p.donorConception);
  if (own.length === 0) return null;
  return (
    <div className="border-t pt-3 space-y-2" data-testid="ended-form">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Relationship</div>
      {own.map(p => (
        <label key={p.id} className="flex items-center gap-2 cursor-pointer text-xs text-gray-600" title="Separated or divorced: two short strokes across the couple line">
          <input
            type="checkbox"
            checked={!!p.ended}
            onChange={e => setPartnershipEnded(p.id, e.target.checked)}
            className="accent-black"
          />
          <span>Ended with {partnerLabel(pedigree, individual.id, p.id)}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Childless couple marks (#15), one block per partnership of this person that
 * has no children. A couple with children has nothing to set here.
 */
function CouplesForm({ individual }: { individual: Individual }) {
  const { pedigree, setPartnershipChildless, setPartnershipChildlessReason } = usePedigreeStore();
  const childlessEligible = pedigree.partnerships.filter(p =>
    (p.individual1 === individual.id || p.individual2 === individual.id)
    && (pedigree.parentOf[p.id] ?? []).length === 0);
  if (childlessEligible.length === 0) return null;

  return (
    <div className="border-t pt-3 space-y-3" data-testid="couples-form">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Couple without children
      </div>
      {childlessEligible.map(p => (
        <div key={p.id} className="space-y-1">
          <Field label={`With ${partnerLabel(pedigree, individual.id, p.id)}`}>
            <select
              value={p.childless ?? ""}
              aria-label={`Childless mark with ${partnerLabel(pedigree, individual.id, p.id)}`}
              onChange={e => setPartnershipChildless(p.id, (e.target.value || undefined) as ChildlessStatus | undefined)}
              className="w-full h-7 border rounded px-2 text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
            >
              <option value="">No mark</option>
              {CHILDLESS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          {p.childless && (
            <Input
              value={p.childlessReason ?? ""}
              aria-label="Reason shown under the mark"
              onChange={e => setPartnershipChildlessReason(p.id, e.target.value)}
              className="h-7 text-sm"
              placeholder="Reason (optional), e.g. vasectomy"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Assisted reproduction (#45): the letter in this person's symbol, and for
 * a child, who carried them and who are their social parents. Donors and
 * surrogates are added from the more menu.
 */
function AssistedForm({ individual }: { individual: Individual }) {
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
      <Field label="Donor / surrogate">
        <select
          value={individual.reproductiveRole ?? ""}
          aria-label="Donor or surrogate"
          onChange={e => setReproductiveRole(individual.id, (e.target.value || undefined) as ReproductiveRole | undefined)}
          className="w-full h-7 border rounded px-2 text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
        >
          <option value="">None</option>
          {REPRODUCTIVE_ROLE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      {hasParents && !linked && !expanded && (
        <button className="text-[11px] text-gray-500 underline hover:text-black" onClick={() => setExpanded(true)}>
          Carried by someone else, or social parents...
        </button>
      )}
      {(linked || expanded) && (
        <>
          <Field label="Carried by">
            <select
              value={individual.carriedBy ?? ""}
              aria-label="Carried by"
              onChange={e => setCarriedBy(individual.id, e.target.value || undefined)}
              className="w-full h-7 border rounded px-2 text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
            >
              <option value="">The genetic mother</option>
              {carriers.map(c => <option key={c.id} value={c.id}>{label(c.id)}</option>)}
            </select>
            {individual.carriedBy && (
              <p className="text-[10px] text-gray-500">Solid line from her: she carried the pregnancy but is not the genetic mother, so not a parent for kinship.</p>
            )}
          </Field>
          <Field label="Social parents">
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
                className="w-full h-7 border rounded px-2 text-sm bg-white text-gray-500 focus:outline-hidden focus:ring-1 focus:ring-black"
              >
                <option value="">Add a social parent...</option>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      {children}
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
 * Clinical key fields (#102), under the chart title when nothing is selected.
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
        title="Reason for referral, ancestry, historian, recorder and date, for the key (NSGC)"
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
            Filled fields are listed in the key and in exports. De-identified exports leave them all out.
          </p>
        </div>
      )}
    </div>
  );
}
