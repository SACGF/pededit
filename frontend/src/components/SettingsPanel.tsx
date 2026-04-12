import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import type { SiblingOrderMode } from "@pedigree-editor/layout-engine";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  showMinimap: boolean;
  onToggleMinimap: (v: boolean) => void;
}

export function SettingsPanel({ open, onClose, showMinimap, onToggleMinimap }: SettingsPanelProps) {
  const { pedigree, updateSiblingOrderSettings, updateCanvasSettings } = usePedigreeStore();
  const { mode, affectedFirst } = pedigree.siblingOrder;
  const canvasSettings = pedigree.canvasSettings ?? { nodesMoveable: false, snapToGrid: false, snapGridSize: 10 };
  const { activePedigreeId, pedigrees, deletePedigree } = useAppStore();
  const navigate = useNavigate();
  const [deleteExpanded, setDeleteExpanded] = useState(false);

  async function handleDeletePedigree() {
    if (!activePedigreeId) return;
    const remaining = pedigrees.filter(p => p.id !== activePedigreeId);
    await deletePedigree(activePedigreeId);
    setDeleteExpanded(false);
    onClose();
    if (remaining.length > 0) {
      navigate(`/p/${remaining[0].id}`);
    } else {
      navigate("/");
    }
  }

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
    <Dialog open={open} onOpenChange={v => { if (!v) { setDeleteExpanded(false); onClose(); } }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Pedigree settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Display
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showMinimap}
                onChange={e => onToggleMinimap(e.target.checked)}
              />
              <div>
                <div className="text-sm">Show minimap</div>
                <div className="text-xs text-gray-400">
                  Overview of the full pedigree in the bottom-right corner
                </div>
              </div>
            </label>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Layout
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canvasSettings.nodesMoveable}
                  onChange={e => updateCanvasSettings({ nodesMoveable: e.target.checked })}
                />
                <div>
                  <div className="text-sm">Nodes moveable by default</div>
                  <div className="text-xs text-gray-400">
                    All nodes can be dragged without unlocking individually
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canvasSettings.snapToGrid}
                  onChange={e => updateCanvasSettings({ snapToGrid: e.target.checked })}
                />
                <div>
                  <div className="text-sm">Snap to grid</div>
                  <div className="text-xs text-gray-400">
                    Dragged nodes snap to a fixed grid
                  </div>
                </div>
              </label>

              {canvasSettings.snapToGrid && (
                <label className="flex items-center gap-2 ml-6">
                  <span className="text-xs text-gray-500">Grid size</span>
                  <input
                    type="number"
                    min={4}
                    max={80}
                    value={canvasSettings.snapGridSize}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 4 && v <= 80) {
                        updateCanvasSettings({ snapGridSize: v });
                      }
                    }}
                    className="w-16 text-xs border rounded px-1.5 py-0.5"
                  />
                  <span className="text-xs text-gray-400">px</span>
                </label>
              )}
            </div>
          </div>

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
          {activePedigreeId && (
            <div className="border-t pt-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Danger zone
              </div>
              {!deleteExpanded ? (
                <button
                  onClick={() => setDeleteExpanded(true)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete this pedigree…
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    This will permanently delete the pedigree and cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeletePedigree}
                      className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      Delete permanently
                    </button>
                    <button
                      onClick={() => setDeleteExpanded(false)}
                      className="px-3 py-1 text-xs border rounded hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
