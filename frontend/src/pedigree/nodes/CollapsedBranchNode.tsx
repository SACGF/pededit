import { Handle, Position, useNodeId } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { RFNodeData } from "../sceneToFlow";
import { NODE_SIZE } from "../constants";
import { PersonSymbol } from "../chart/PersonSymbol";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { branchTooltip } from "../collapse";

export type CollapsedBranchNodeType = Node<RFNodeData, "collapsedBranch">;

/**
 * A collapsed branch: the symbol standing for a collapsed couple's
 * unaffected children, with their number inside (NSGC: a diamond, or a
 * square or circle when they share a sex). Affected children are drawn
 * beside it as themselves. Clicking it shows the branch again. It is no one
 * in the pedigree, so it has no hover pill, menu, selection or drag.
 */
export function CollapsedBranchNode({ data }: NodeProps<CollapsedBranchNodeType>) {
  const { branch } = data;
  const nodeId = useNodeId()!;
  const setDescendantsHidden = usePedigreeStore(s => s.setDescendantsHidden);
  const picking = usePedigreeStore(s => s.picking);
  if (!branch) return null;
  return (
    <div
      data-collapsed-branch={branch.roots.join(" ")}
      title={branchTooltip(branch)}
      className="nodrag"
      style={{ width: NODE_SIZE, height: NODE_SIZE, position: "relative", cursor: picking ? "not-allowed" : "pointer" }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        if (!picking) setDescendantsHidden(branch.roots, false);
      }}
    >
      <svg width={NODE_SIZE} height={NODE_SIZE} viewBox={`0 0 ${NODE_SIZE} ${NODE_SIZE}`} overflow="visible">
        <PersonSymbol glyph={data.glyph} clipId={`symbol-clip-${nodeId}`} />
      </svg>

      <Handle type="target" position={Position.Top} id="sibship-in" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="couple-out" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="couple-in" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="sibship-out" style={{ opacity: 0 }} />
    </div>
  );
}
