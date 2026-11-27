import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_SNAP_GRID_SIZE, usePedigreeFields } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import type { NotationEdition, NotesLength, SiblingOrderMode, SymbolsShowMode, TagFillMode } from "@pedigree-editor/layout-engine";
import { TAG_FILL_MODE_OPTIONS, tagFillMode } from "../pedigree/tagFills";
import { nameLabelMode, showsNotes } from "../pedigree/labels";
import { symbolsShowMode } from "../pedigree/gender";
import { NOTATION_OPTIONS, notationOf } from "../pedigree/notation";
import { SettingSelect, SettingToggle } from "./SettingControls";

const NOTES_LENGTH_OPTIONS: { value: NotesLength; label: string }[] = [
  { value: "full", label: "Full text" },
  { value: "twoLines", label: "Up to two lines" },
];

const SYMBOLS_SHOW_OPTIONS: { value: SymbolsShowMode; label: string }[] = [
  { value: "gender", label: "Gender identity where recorded" },
  { value: "sex", label: "Biological sex" },
];

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  showMinimap: boolean;
  onToggleMinimap: (v: boolean) => void;
  compact: boolean;
  onToggleCompact: (v: boolean) => void;
}

export function SettingsPanel({ open, onClose, showMinimap, onToggleMinimap, compact, onToggleCompact }: SettingsPanelProps) {
  const { pedigree, updateSiblingOrderSettings, updateCanvasSettings, uShapeView } = usePedigreeFields("pedigree", "updateSiblingOrderSettings", "updateCanvasSettings", "uShapeView");
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
          {uShapeView && (
            <p className="text-xs text-gray-600 border border-gray-300 px-2 py-1.5" data-testid="settings-u-shape-note">
              The U-shape view is on. Show minimap, Compact layout, Truncate long names and the
              positioning settings apply to the standard chart only; the rest change the U too.
            </p>
          )}
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Display
            </div>
            <SettingToggle
              label="Show minimap"
              description="Overview of the full pedigree in the bottom-right corner"
              checked={showMinimap}
              onChange={onToggleMinimap}
            />
            <SettingToggle
              className="mt-2"
              label="Compact layout"
              description="Tighter spacing between generations so larger pedigrees fit on screen. Pinned positions are scaled to match."
              checked={compact}
              onChange={onToggleCompact}
            />
            <SettingToggle
              className="mt-2"
              name="truncateNames"
              label="Truncate long names"
              description="Names too long for their slot are cut to one line, not wrapped onto two. Hover a name to read it in full. Exports still wrap."
              checked={truncateNames}
              onChange={on => updateCanvasSettings({ nameLabels: on ? "truncate" : "wrap" })}
            />
            <SettingToggle
              className="mt-2"
              name="showNumbers"
              label="Show pedigree numbers"
              description="Generation and position (II-3) on its own line under each symbol, below the name and age, on the canvas and in exports. Numbers follow the layout, so adding someone renumbers the people to their right."
              checked={pedigree.canvasSettings?.showNumbers === true}
              onChange={on => updateCanvasSettings({ showNumbers: on })}
            />
            <SettingToggle
              className="mt-2"
              name="relationshipLabels"
              label="Name consanguineous relationships"
              description={<>Write the relationship ("first cousins") above every double line it can be worked out for, with the kinship when they are more closely related than that ("siblings (3/8)" when their parents are siblings too). Text set on a couple on the Person tab is always shown.</>}
              checked={pedigree.canvasSettings?.relationshipLabels === true}
              onChange={on => updateCanvasSettings({ relationshipLabels: on })}
            />
            <SettingToggle
              className="mt-2"
              name="showCoefficients"
              label="Show kinship and inbreeding coefficients"
              description={<>Write the inbreeding coefficient under anyone whose parents are related ("F = 1/16") and the kinship coefficient above a related couple's double line ("φ = 1/16"), on the canvas and in exports. Worked out from the pedigree as drawn, so they change as relatives are added.</>}
              checked={pedigree.canvasSettings?.showCoefficients === true}
              onChange={on => updateCanvasSettings({ showCoefficients: on })}
            />
            <SettingToggle
              className="mt-2"
              name="showNotes"
              label="Show notes on the chart"
              description="Write each person's notes under their symbol, above the pedigree number, on the canvas and in exports. Notes often hold private detail, so check them before sharing a figure, or turn this off. De-identified exports never include them."
              checked={showsNotes(pedigree)}
              onChange={on => updateCanvasSettings({ showNotes: on })}
            />
            {showsNotes(pedigree) && (
              <SettingSelect<NotesLength>
                name="notesLength"
                label="Notes"
                value={pedigree.canvasSettings?.notesLength ?? "full"}
                options={NOTES_LENGTH_OPTIONS}
                onChange={notesLength => updateCanvasSettings({ notesLength })}
                description="Full text writes every line and moves the generation below down to make room. Up to two lines cuts longer notes with an ellipsis and keeps the rows evenly spaced."
              />
            )}
            <SettingSelect<SymbolsShowMode>
              name="symbolsShow"
              label="Symbols show"
              value={symbolsShowMode(pedigree)}
              options={SYMBOLS_SHOW_OPTIONS}
              onChange={symbolsShow => updateCanvasSettings({ symbolsShow })}
              description="With gender identity, a person whose gender is recorded gets that gender's symbol with AMAB, AFAB or UAAB under it (NSGC 2022). Layout, kinship and PED export always use biological sex."
            />
            <SettingSelect<NotationEdition>
              name="notation"
              label="Notation"
              value={notationOf(pedigree)}
              options={NOTATION_OPTIONS}
              onChange={notation => updateCanvasSettings({ notation })}
              description={<>Edition of the NSGC pedigree nomenclature. 2022 writes test results under the symbol as "BRCA1 +"; 2008 uses the E notation, "E+ (BRCA1)".</>}
            />
            <SettingSelect<TagFillMode>
              name="tagFills"
              label="Conditions and tags drawn in"
              value={tagFillMode(pedigree)}
              options={TAG_FILL_MODE_OPTIONS}
              onChange={tagFills => updateCanvasSettings({ tagFills })}
              description="Black and white draws every condition and tag in black and gives each condition and trait a pattern (its own, or one chosen for it), on the canvas and in exports, for print and journals."
            />
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Layout
            </div>
            <div className="space-y-2">
              <SettingToggle
                label="Nodes moveable by default"
                description="All nodes can be dragged without unlocking individually"
                checked={canvasSettings.nodesMoveable}
                onChange={nodesMoveable => updateCanvasSettings({ nodesMoveable })}
              />

              <SettingToggle
                label="Snap to grid"
                description="Dragged nodes snap to a fixed grid. Turning this on also snaps nodes you have already moved."
                checked={canvasSettings.snapToGrid}
                onChange={snapToGrid => updateCanvasSettings({ snapToGrid })}
              />

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

              <SettingToggle
                name="minimiseWidth"
                label="Minimise width"
                description="Keep a wide pedigree no wider than its widest generation (the kinship2 default). Turn off to let it grow up to two symbols wider, so children sit more directly under their parents. Nodes you have moved stay where they are."
                checked={canvasSettings.layoutWidth !== "relaxed"}
                onChange={on => updateCanvasSettings({ layoutWidth: on ? "minimal" : "relaxed" })}
              />
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

            <SettingToggle
              className="mt-3"
              label="Affected first"
              description="Affected people appear leftmost within each sibling group"
              checked={affectedFirst}
              onChange={on => updateSiblingOrderSettings({ affectedFirst: on })}
            />
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
