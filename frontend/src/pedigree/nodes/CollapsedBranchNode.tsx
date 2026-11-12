import { Handle, Position, useNodeId } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { RFNodeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { SymbolShape } from "./symbols";
import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT } from "../labels";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { branchCountFontSize, branchTooltip } from "../collapse";

export type CollapsedBranchNodeType = Node<RFNodeData, "collapsedBranch">;

/**
 * A collapsed branch (#1): the symbol standing for a collapsed couple's
 * unaffected children, with their number inside (NSGC: a diamond, or a
 * square or circle when they share a sex). Affected children are drawn
 * beside it as themselves. Clicking it shows the branch again. It is no one
 * in the pedigree, so it has no hover pill, menu, selection or drag.
 */
export function CollapsedBranchNode({ data }: NodeProps<CollapsedBranchNodeType>) {
  const { individual, branch } = data;
  const nodeId = useNodeId()!;
  const setDescendantsHidden = usePedigreeStore(s => s.setDescendantsHidden);
  const picking = usePedigreeStore(s => s.picking);
  if (!branch) return null;
  const n = branch.children.length;
  const fs = branchCountFontSize(n, NODE_SIZE);

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
        <SymbolShape individual={individual} size={NODE_SIZE} clipId={`symbol-clip-${nodeId}`} />
        <text
          x={NODE_SIZE / 2}
          y={NODE_SIZE / 2 + Math.round(fs * 0.36 * 10) / 10}
          textAnchor="middle"
          fontFamily="sans-serif"
          fontSize={fs}
          fill="black"
          style={{ userSelect: "none" }}
        >
          {n}
        </text>
      </svg>

      {data.detailLines.length > 0 && (
        <div
          data-detail-label
          style={{
            position: "absolute",
            top: NODE_SIZE + 2,
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            textAlign: "center",
            fontSize: LABEL_FONT_SIZE,
            lineHeight: `${LABEL_LINE_HEIGHT}px`,
            color: "#000",
            pointerEvents: "none",
          }}
        >
          {data.detailLines.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      <Handle type="target" position={Position.Top} id="sibship-in" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="couple-out" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="couple-in" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="sibship-out" style={{ opacity: 0 }} />
    </div>
  );
}
