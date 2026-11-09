import { usePedigreeStore, hasPartnerOrChild } from "../store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Legend } from "./Legend";
import { LIFE_STATUS_OPTIONS, lifeStatusLabel } from "../pedigree/lifeStatus";
import { CHILDLESS_OPTIONS } from "../pedigree/childless";
import type { Individual, LifeStatus, ChildlessStatus, Pedigree } from "@pedigree-editor/layout-engine";

interface EditPanelProps {
  onManageTags?: () => void;
}

/**
 * The right-hand panel: the figure legend when nothing is selected, or the
 * selected individual's fields followed by the legend's tag rows as that
 * person's tag checkboxes (#75).
 */
export function EditPanel({ onManageTags }: EditPanelProps) {
  const { pedigree, selectedId, setIndividualTag } = usePedigreeStore();
  const individual = pedigree.individuals.find(i => i.id === selectedId);

  return (
    <div className="p-4 space-y-4">
      {individual ? (
        <IndividualForm individual={individual} />
      ) : (
        <p className="text-xs text-gray-400">Select an individual to edit</p>
      )}
      <div className="border-t pt-3">
        <Legend
          pedigree={pedigree}
          individual={individual}
          onToggleTag={individual ? (tagId, on) => setIndividualTag(individual.id, tagId, on) : undefined}
          onManageTags={onManageTags}
        />
      </div>
    </div>
  );
}

function IndividualForm({ individual }: { individual: Individual }) {
  const { pedigree, updateIndividual, setCarrier, setLifeStatus } = usePedigreeStore();
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

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Status
        </div>
        <div className="text-xs text-gray-600 space-y-1">
          <div>Sex: <span className="font-medium">{individual.sex}</span></div>
          <div>Affected: <span className="font-medium">{individual.affected ? "yes" : "no"}</span></div>
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

      <CouplesForm individual={individual} />
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
