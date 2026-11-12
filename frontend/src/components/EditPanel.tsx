import { usePedigreeStore, hasPartnerOrChild } from "../store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Legend } from "./Legend";
import { SelectionPanel } from "./SelectionPanel";
import { LIFE_STATUS_OPTIONS, lifeStatusLabel } from "../pedigree/lifeStatus";
import { CHILDLESS_OPTIONS } from "../pedigree/childless";
import { ADOPTION_OPTIONS } from "../pedigree/adoption";
import { ZYGOSITY_OPTIONS, parentPartnershipOf, twinSetOf, twinSetProblem } from "../pedigree/twins";
import { formatCoefficient, degreeOfRelationship, relatednessOf } from "../pedigree/relatedness";
import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { chartTitle } from "../pedigree/labels";
import type { Individual, LifeStatus, ChildlessStatus, Pedigree, Adoption, Zygosity } from "@pedigree-editor/layout-engine";

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
  const { pedigree, updateIndividual, setCarrier, setLifeStatus, setAdopted, setOnset } = usePedigreeStore();
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

      <Field label="Date of birth">
        <Input
          type="date"
          value={individual.dob ?? ""}
          onChange={e => updateIndividual(individual.id, { dob: e.target.value || undefined })}
          className="h-7 text-sm"
        />
      </Field>

      <Field label="Age">
        <Input
          value={individual.age ?? ""}
          onChange={e => updateIndividual(individual.id, { age: e.target.value || undefined })}
          className="h-7 text-sm"
          placeholder="e.g. 50s, d. 72"
          aria-label="Age"
        />
        {individual.age?.trim() && individual.dob && (
          <p className="text-[10px] text-gray-500">Shown under the symbol in place of the date of birth.</p>
        )}
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

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Status
        </div>
        <div className="text-xs text-gray-600 space-y-1">
          <div>Sex: <span className="font-medium">{individual.sex}</span></div>
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!individual.carrier}
              onChange={e => setCarrier(individual.id, e.target.checked)}
              className="accent-black"
            />
            <span>Carrier</span>
          </label>
          {individual.carrier && individual.affected && (
            <p className="text-[10px] text-gray-500 pl-5">
              Not drawn: the affected fill replaces the carrier dot. Use a gene result tag to show it.
            </p>
          )}
          {individual.deceased && <div className="font-medium">Deceased</div>}
          {individual.proband && <div className="font-medium">Proband</div>}
          {individual.lifeStatus && <div className="font-medium">{lifeStatusLabel(individual.lifeStatus)}</div>}
        </div>
      </div>

      <TwinsForm individual={individual} />
      <RelatednessSection individual={individual} />
      <CouplesForm individual={individual} />
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
