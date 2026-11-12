import { usePedigreeStore } from "../store/usePedigreeStore";
import { batchLockState } from "../pedigree/selection";

/**
 * The edit panel with several people selected (#21): how many, and the
 * batch lock / unlock, in place of one person's fields.
 */
export function SelectionPanel() {
  const { pedigree, selectedIds, setSelectedId, unlockIndividuals, lockIndividuals } = usePedigreeStore();
  const { toUnlock, toLock } = batchLockState(pedigree, selectedIds);
  const moveable = pedigree.canvasSettings?.nodesMoveable ?? false;

  return (
    <div className="space-y-3" data-selection-panel>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {selectedIds.length} selected
      </div>
      <p className="text-xs text-gray-500">
        Drag any unlocked one to move them together. Shift+click or Ctrl+click adds or removes
        someone; Shift+drag on the canvas selects an area.
      </p>
      <div className="flex flex-col items-start gap-1">
        {toUnlock.length > 0 && (
          <PanelButton onClick={() => unlockIndividuals(toUnlock)} title="Let these people be dragged">
            Unlock {toUnlock.length}
          </PanelButton>
        )}
        {toLock.length > 0 && (
          <PanelButton onClick={() => lockIndividuals(toLock)} title="Lock and drop their pinned positions">
            Lock {toLock.length} (return to auto layout)
          </PanelButton>
        )}
        {moveable && toLock.length === 0 && (
          <p className="text-xs text-gray-400">Every node is moveable (Settings).</p>
        )}
        <PanelButton onClick={() => setSelectedId(null)} title="Escape">
          Clear selection
        </PanelButton>
      </div>
    </div>
  );
}

function PanelButton({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
    >
      {children}
    </button>
  );
}
