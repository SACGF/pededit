import { NodeToolbar, Position } from "@xyflow/react";
import { Lock, Unlock } from "lucide-react";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { MoreMenu } from "./MoreMenu";

interface HoverPillProps {
  nodeId: string;          // React Flow node ID (for NodeToolbar)
  individualId: string;    // pedigree Individual.id
  isVisible: boolean;
  hasParents: boolean;     // disable +parents if already has both parents filled
  onPillEnter: () => void; // called when mouse enters pill (cancel hide timer)
  onPillLeave: () => void; // called when mouse leaves pill (schedule hide)
}

export function HoverPill({ nodeId, individualId, isVisible, hasParents, onPillEnter, onPillLeave }: HoverPillProps) {
  const { addParent, addChild, addSibling, pedigree, unlockIndividual, lockIndividual } = usePedigreeStore();
  const nodesMoveable = pedigree.canvasSettings?.nodesMoveable ?? false;
  const isUnlocked = nodesMoveable || (pedigree.unlockedIndividuals ?? []).includes(individualId);

  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible={isVisible}
      position={Position.Bottom}
      offset={6}
    >
      <div
        className="flex items-center gap-0.5 bg-white border border-gray-300 rounded-full px-1.5 py-0.5 shadow-sm text-xs"
        onMouseEnter={onPillEnter}
        onMouseLeave={onPillLeave}
      >
        {/* +parents */}
        <PillButton
          title="Add parents"
          disabled={hasParents}
          onClick={() => addParent(individualId, "male")}
        >
          ↑
        </PillButton>

        {/* +son */}
        <PillButton
          title="Add son"
          onClick={() => addChild(individualId, "male")}
        >
          □↓
        </PillButton>

        {/* +daughter */}
        <PillButton
          title="Add daughter"
          onClick={() => addChild(individualId, "female")}
        >
          ○↓
        </PillButton>

        {/* +sib */}
        <PillButton
          title="Add sibling"
          disabled={!hasParents}
          onClick={() => addSibling(individualId)}
        >
          ←│→
        </PillButton>

        {/* Lock / unlock — only shown when global "nodes moveable" is off */}
        {!nodesMoveable && (
          <>
            <div className="w-px h-3 bg-gray-300 mx-0.5" />
            <PillButton
              title={isUnlocked ? "Lock position" : "Unlock to drag"}
              onClick={() => isUnlocked ? lockIndividual(individualId) : unlockIndividual(individualId)}
            >
              {isUnlocked
                ? <Unlock size={10} strokeWidth={1.5} />
                : <Lock    size={10} strokeWidth={1.5} />}
            </PillButton>
          </>
        )}

        <div className="w-px h-3 bg-gray-300 mx-0.5" />

        {/* More menu */}
        <MoreMenu individualId={individualId} />
      </div>
    </NodeToolbar>
  );
}

interface PillButtonProps {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function PillButton({ title, disabled, onClick, children }: PillButtonProps) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`
        px-1.5 py-0.5 rounded-full font-mono text-[10px] leading-none
        hover:bg-gray-100 active:bg-gray-200
        disabled:opacity-30 disabled:cursor-not-allowed
        transition-colors
      `}
    >
      {children}
    </button>
  );
}
