import { usePedigreeStore, selectedPair } from "../store/usePedigreeStore";
import { batchLockState } from "../pedigree/selection";
import { kinshipOf, kinshipXOf, formatCoefficient, degreeOfRelationship } from "../pedigree/relatedness";
import { nameRelationship, pairLabels } from "../pedigree/relationship";
import type { Pedigree } from "@pedigree-editor/layout-engine";

/**
 * The edit panel with several people selected (#21): how many, and the
 * batch lock / unlock, in place of one person's fields.
 */
export function SelectionPanel() {
  const { pedigree, selectedId, selectedIds, setSelectedId, unlockIndividuals, lockIndividuals } = usePedigreeStore();
  const { toUnlock, toLock } = batchLockState(pedigree, selectedIds);
  const moveable = pedigree.canvasSettings?.nodesMoveable ?? false;
  const pair = selectedPair({ selectedId, selectedIds });

  return (
    <div className="space-y-3" data-selection-panel>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {selectedIds.length} selected
      </div>
      <p className="text-xs text-gray-500">
        Drag any unlocked one to move them together. Shift+click or Ctrl+click adds or removes
        someone; Shift+drag on the canvas selects an area.
      </p>
      {pair && <PairRelatedness pedigree={pedigree} a={pair[0]} b={pair[1]} />}
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

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Exactly two selected (#90): how they are related, for any two people, not
 * only partners. The relationship is named only when the drawn tree gives
 * one certain name (`nameRelationship`); otherwise the coefficient and its
 * degree say how close they are.
 */
function PairRelatedness({ pedigree, a, b }: { pedigree: Pedigree; a: string; b: string }) {
  const kinship = kinshipOf(pedigree).kinship(a, b);
  const kinshipX = kinshipXOf(pedigree).kinship(a, b);
  const named = nameRelationship(pedigree, a, b, kinship);
  const related = kinship > 0;
  const label = pairLabels(pedigree, a, b);

  return (
    <div className="border-t pt-3 space-y-1.5 text-xs text-gray-600" data-testid="pair-relatedness">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Relatedness</div>
      <p data-testid="pair-relationship" className="text-sm text-gray-800">
        {named
          ? `${capitalise(label[named.subjectId])} is ${label[named.objectId]}'s ${named.term}.`
          : related
            ? `${capitalise(label[a])} and ${label[b]} are related in more than one way.`
            : `${capitalise(label[a])} and ${label[b]} are not related through anyone drawn.`}
      </p>
      {related && (
        <>
          <div data-testid="pair-kinship" title="The chance that a gene picked at random from each of them is the same copy inherited from a common ancestor. It would be the inbreeding coefficient of a child of theirs.">
            Kinship <span className="font-medium">{formatCoefficient(kinship)}</span>
          </div>
          <div data-testid="pair-kinship-x" title="The same for the X chromosome, which matters for X-linked conditions.">
            X-linked kinship <span className="font-medium">{Number.isNaN(kinshipX) ? "unknown (a sex is not recorded)" : formatCoefficient(kinshipX)}</span>
          </div>
          <div className="text-[10px] text-gray-500">{capitalise(degreeOfRelationship(kinship) ?? "")}.</div>
        </>
      )}
    </div>
  );
}
