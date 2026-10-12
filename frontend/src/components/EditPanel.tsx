import { usePedigreeStore } from "../store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pedigreeTags, tagCanvasText } from "../pedigree/tags";

interface EditPanelProps {
  onManageTags?: () => void;
}

export function EditPanel({ onManageTags }: EditPanelProps) {
  const { pedigree, selectedId, updateIndividual, setIndividualTag } = usePedigreeStore();
  const individual = pedigree.individuals.find(i => i.id === selectedId);
  const tags = pedigreeTags(pedigree);

  if (!individual) {
    return (
      <div className="p-4 text-xs text-gray-400">
        Select an individual to edit
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
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
          className="w-full border rounded px-2 py-1 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-black"
          placeholder="Clinical notes"
        />
      </Field>

      <div className="border-t pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Tags
          </div>
          {onManageTags && (
            <button
              type="button"
              onClick={onManageTags}
              className="text-[10px] text-gray-500 hover:text-black hover:underline"
            >
              Manage…
            </button>
          )}
        </div>
        {tags.length === 0 ? (
          <p className="text-[10px] text-gray-400">
            No tags defined for this pedigree yet.
          </p>
        ) : (
          <div className="space-y-1">
            {tags.map(tag => {
              const on = individual.tags?.includes(tag.id) ?? false;
              return (
                <label key={tag.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={e => setIndividualTag(individual.id, tag.id, e.target.checked)}
                  />
                  <span
                    className="inline-block w-2.5 h-2.5 shrink-0 border border-black/20"
                    style={{ background: tag.color, borderRadius: tag.style === "dot" ? "50%" : 0 }}
                  />
                  <span className="truncate">{tag.label}</span>
                  {tag.style === "text" && (
                    <span className="text-[10px] font-bold" style={{ color: tag.color }}>{tagCanvasText(tag)}</span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Status
        </div>
        <div className="text-xs text-gray-600 space-y-1">
          <div>Sex: <span className="font-medium">{individual.sex}</span></div>
          <div>Affected: <span className="font-medium">{individual.affected ? "yes" : "no"}</span></div>
          {individual.deceased && <div className="font-medium">Deceased</div>}
          {individual.proband && <div className="font-medium">Proband</div>}
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
