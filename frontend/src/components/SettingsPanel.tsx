import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePedigreeStore } from "../store/usePedigreeStore";
import type { SiblingOrderMode } from "@pedigree-editor/layout-engine";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { pedigree, updateSiblingOrderSettings } = usePedigreeStore();
  const { mode, affectedFirst } = pedigree.siblingOrder;

  const modes: { value: SiblingOrderMode; label: string; description: string }[] = [
    {
      value: "insertion",
      label: "Insertion order",
      description: "Siblings appear in the order they were added",
    },
    {
      value: "manual",
      label: "Manual",
      description: "Use move left / move right to control order",
    },
    {
      value: "birthDate",
      label: "By birth date",
      description: "Oldest left, youngest right (uses DOB if set; falls back to insertion order)",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Pedigree settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Sibling order
            </div>

            <div className="space-y-2">
              {modes.map(m => (
                <label key={m.value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="siblingOrderMode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => updateSiblingOrderSettings({ mode: m.value })}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm">{m.label}</div>
                    <div className="text-xs text-gray-400">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={affectedFirst}
                onChange={e => updateSiblingOrderSettings({ affectedFirst: e.target.checked })}
              />
              <div>
                <div className="text-sm">Affected first</div>
                <div className="text-xs text-gray-400">
                  Affected individuals appear leftmost within each sibling group
                </div>
              </div>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
