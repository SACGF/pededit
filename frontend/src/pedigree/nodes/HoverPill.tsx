import { NodeToolbar, Position } from "@xyflow/react";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { MoreMenu } from "./MoreMenu";

interface HoverPillProps {
  nodeId: string;          // React Flow node ID (for NodeToolbar)
  individualId: string;    // pedigree Individual.id
  isVisible: boolean;
  hasParents: boolean;     // disable +dad/+mom if already has both parents filled
}

export function HoverPill({ nodeId, individualId, isVisible, hasParents }: HoverPillProps) {
  const { addParent, addChild, addSibling } = usePedigreeStore();

  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible={isVisible}
      position={Position.Bottom}
      offset={6}
    >
      <div className="flex items-center gap-0.5 bg-white border border-gray-300 rounded-full px-1.5 py-0.5 shadow-sm text-xs">
        {/* +dad */}
        <PillButton
          title="Add father"
          disabled={hasParents}
          onClick={() => addParent(individualId, "male")}
        >
          □↑
        </PillButton>

        {/* +mom */}
        <PillButton
          title="Add mother"
          disabled={hasParents}
          onClick={() => addParent(individualId, "female")}
        >
          ○↑
        </PillButton>

        {/* +child */}
        <PillButton
          title="Add child"
          onClick={() => addChild(individualId)}
        >
          ↓
        </PillButton>

        {/* +sib */}
        <PillButton
          title="Add sibling"
          disabled={!hasParents}
          onClick={() => addSibling(individualId)}
        >
          ←│→
        </PillButton>

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
