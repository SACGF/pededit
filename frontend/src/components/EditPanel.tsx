import { usePedigreeStore, hasPartnerOrChild } from "../store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Legend } from "./Legend";
import { LIFE_STATUS_OPTIONS, lifeStatusLabel } from "../pedigree/lifeStatus";
import type { Individual, LifeStatus } from "@pedigree-editor/layout-engine";

interface EditPanelProps {
  onManageTags?: () => void;
}

/**
 * The right-hand panel: the selected individual's fields on top (when there
 * is one), then the figure legend, always (#75). The legend's tag rows are
 * the tag checkboxes while someone is selected.
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
