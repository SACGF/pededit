import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePedigreeStore, DEFAULT_SNAP_GRID_SIZE } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import type { SiblingOrderMode } from "@pedigree-editor/layout-engine";
import { nameLabelMode } from "../pedigree/labels";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  showMinimap: boolean;
  onToggleMinimap: (v: boolean) => void;
  compact: boolean;
  onToggleCompact: (v: boolean) => void;
}

export function SettingsPanel({ open, onClose, showMinimap, onToggleMinimap, compact, onToggleCompact }: SettingsPanelProps) {
  const { pedigree, updateSiblingOrderSettings, updateCanvasSettings } = usePedigreeStore();
  const { mode, affectedFirst } = pedigree.siblingOrder;
  const canvasSettings = pedigree.canvasSettings ?? { nodesMoveable: false, snapToGrid: false, snapGridSize: DEFAULT_SNAP_GRID_SIZE };
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

  const truncateNames = nameLabelMode(pedigree) === "truncate";

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
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={compact}
                onChange={e => onToggleCompact(e.target.checked)}
              />
              <div>
                <div className="text-sm">Compact layout</div>
                <div className="text-xs text-gray-400">
                  Tighter spacing between generations so larger pedigrees fit on screen. Pinned positions are scaled to match.
                </div>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                name="truncateNames"
                checked={truncateNames}
                onChange={e => updateCanvasSettings({ nameLabels: e.target.checked ? "truncate" : "wrap" })}
              />
              <div>
                <div className="text-sm">Truncate long names</div>
                <div className="text-xs text-gray-400">
                  Names too long for their slot are cut to one line, not wrapped onto two. Hover a name to read it in full. Exports still wrap.
                </div>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                name="showNumbers"
                checked={pedigree.canvasSettings?.showNumbers === true}
                onChange={e => updateCanvasSettings({ showNumbers: e.target.checked })}
              />
              <div>
                <div className="text-sm">Show pedigree numbers</div>
                <div className="text-xs text-gray-400">
                  Generation and position (II-3) on its own line under each symbol, below the name and age, on the canvas and in exports. Numbers follow the layout, so adding someone renumbers the people to their right.
                </div>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                name="relationshipLabels"
                checked={pedigree.canvasSettings?.relationshipLabels === true}
                onChange={e => updateCanvasSettings({ relationshipLabels: e.target.checked })}
              />
              <div>
                <div className="text-sm">Name consanguineous relationships</div>
                <div className="text-xs text-gray-400">
                  Write the relationship ("first cousins") above every double line it can be worked out for. Text set on a couple in the edit panel is always shown.
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
                    Dragged nodes snap to a fixed grid. Turning this on also snaps nodes you have already moved.
                  </div>
                </div>
              </label>

              {canvasSettings.snapToGrid && (
                <label className="flex items-center gap-2 ml-6">
                  <span className="text-xs text-gray-500">Grid size</span>
                  <GridSizeInput
                    value={canvasSettings.snapGridSize}
                    onCommit={v => updateCanvasSettings({ snapGridSize: v })}
                  />
                  <span className="text-xs text-gray-400">px</span>
                </label>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="minimiseWidth"
                  checked={canvasSettings.layoutWidth !== "relaxed"}
                  onChange={e => updateCanvasSettings({ layoutWidth: e.target.checked ? "minimal" : "relaxed" })}
                />
                <div>
                  <div className="text-sm">Minimise width</div>
                  <div className="text-xs text-gray-400">
                    Keep a wide pedigree no wider than its widest generation (the kinship2 default). Turn off to let it grow up to two symbols wider, so children sit more directly under their parents. Nodes you have moved stay where they are.
                  </div>
                </div>
              </label>
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

const MIN_GRID = 4;
const MAX_GRID = 80;

/**
 * The grid size box. Typing only edits the text; the value is applied once,
 * on blur or Enter, clamped to 4..80, so typing "45" is one undo entry and
 * pins are rounded once. An empty or non-numeric box reverts. Closing the
 * dialog (Escape) also applies it.
 */
function GridSizeInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  // Latest state for the unmount commit: Escape (and any other way of
  // closing the dialog) unmounts the box without a blur. `sent` stops a blur
  // and the unmount that follows it from committing twice.
  const latest = useRef({ text, value, onCommit, sent: value });
  latest.current = { ...latest.current, text, value, onCommit };
  useEffect(() => { setText(String(value)); latest.current.sent = value; }, [value]);

  function commit(raw: string) {
    const cur = latest.current;
    const v = parseInt(raw, 10);
    if (isNaN(v)) { setText(String(cur.value)); return; }
    const clamped = Math.min(MAX_GRID, Math.max(MIN_GRID, v));
    setText(String(clamped));
    if (clamped === cur.value || clamped === cur.sent) return;
    cur.sent = clamped;
    cur.onCommit(clamped);
  }
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(latest.current.text), []);

  return (
    <input
      type="number"
      min={MIN_GRID}
      max={MAX_GRID}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); commit(text); }
      }}
      aria-label="Grid size"
      className="w-16 text-xs border rounded px-1.5 py-0.5"
    />
  );
}
