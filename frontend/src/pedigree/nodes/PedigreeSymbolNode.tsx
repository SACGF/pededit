import { useState } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { RFNodeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { SymbolShape, DeceasedSlash, ProbandArrow, DuplicateSuperscript } from "./symbols";
import { HoverPill } from "./HoverPill";
import { usePedigreeStore } from "../../store/usePedigreeStore";

export type PedigreeSymbolNodeType = Node<RFNodeData, "pedigreeSymbol">;

export function PedigreeSymbolNode({ data, selected }: NodeProps<PedigreeSymbolNodeType>) {
  const { individual, isDuplicate, duplicateIndex, hasParents } = data;
  const nodeId = useNodeId()!;
  const [isHovered, setIsHovered] = useState(false);
  const { setHoveredId, setSelectedId } = usePedigreeStore();

  function handleMouseEnter() {
    setIsHovered(true);
    setHoveredId(individual.id);
  }
  function handleMouseLeave() {
    setIsHovered(false);
    setHoveredId(null);
  }

  return (
    <div
      style={{ width: NODE_SIZE, height: NODE_SIZE, position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => setSelectedId(individual.id)}
    >
      {/* Selection ring */}
      {selected && (
        <div
          style={{
            position: "absolute",
            inset: -3,
            border: "2px solid #000",
            borderRadius: 2,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Main pedigree symbol */}
      <svg
        width={NODE_SIZE}
        height={NODE_SIZE}
        viewBox={`0 0 ${NODE_SIZE} ${NODE_SIZE}`}
        overflow="visible"
      >
        <SymbolShape individual={individual} size={NODE_SIZE} />
        {individual.deceased && <DeceasedSlash size={NODE_SIZE} />}
        {individual.proband  && <ProbandArrow  size={NODE_SIZE} />}
      </svg>

      {/* Name label below symbol */}
      {individual.name && (
        <div
          style={{
            position: "absolute",
            top: NODE_SIZE + 2,
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            fontSize: 10,
            lineHeight: 1.2,
            color: "#000",
            pointerEvents: "none",
          }}
        >
          {individual.name}
        </div>
      )}

      {/* Duplicate superscript */}
      {isDuplicate && duplicateIndex !== undefined && (
        <DuplicateSuperscript index={duplicateIndex} />
      )}

      {/* React Flow edge handles — invisible */}
      <Handle type="source" position={Position.Right}  id="couple-out"  style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   id="couple-in"   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="sibship-out" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top}    id="sibship-in"  style={{ opacity: 0 }} />

      {/* Hover pill — rendered via NodeToolbar outside node clip boundary */}
      <HoverPill
        nodeId={nodeId}
        individualId={individual.id}
        isVisible={isHovered}
        hasParents={hasParents}
      />
    </div>
  );
}
