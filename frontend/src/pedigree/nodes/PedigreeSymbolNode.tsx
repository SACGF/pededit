import { useRef, useState } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { RFNodeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { SymbolShape, DeceasedSlash, ProbandArrow, DuplicateSuperscript, AnnotationRow } from "./symbols";
import { HoverPill } from "./HoverPill";
import { captionRowHeight } from "../lifeStatus";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { sectorsFor, annotationRow, ANNOTATION_ROW_HEIGHT } from "../tags";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shortDevId(id: string): string {
  return UUID_RE.test(id) ? id.slice(0, 6) : id;
}

export type PedigreeSymbolNodeType = Node<RFNodeData, "pedigreeSymbol">;

export function PedigreeSymbolNode({ data }: NodeProps<PedigreeSymbolNodeType>) {
  const { individual, isDuplicate, duplicateIndex, hasParents, isPinned } = data;
  const nodeId = useNodeId()!;
  const [isPillVisible, setIsPillVisible] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setHoveredId, setSelectedId, selectedId, pedigree } = usePedigreeStore();
  const isSelected = individual.id === selectedId;
  const sectors = sectorsFor(individual, pedigree);
  const annotations = annotationRow(individual, pedigree);
  // Under the symbol, top to bottom: "SB" / "ECT" caption, tag annotation row, name, DOB.
  const captionOffset = captionRowHeight(individual.lifeStatus);
  const labelTop = NODE_SIZE + 2 + captionOffset + (annotations.length > 0 ? ANNOTATION_ROW_HEIGHT : 0);

  function scheduleHide() {
    hideTimeout.current = setTimeout(() => {
      setIsPillVisible(false);
      setHoveredId(null);
    }, 150);
  }

  function cancelHide() {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
  }

  function handleMouseEnter() {
    cancelHide();
    setIsPillVisible(true);
    setHoveredId(individual.id);
  }

  function handleMouseLeave() {
    scheduleHide();
  }

  return (
    <div
      data-individual-id={individual.id}
      style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        position: "relative",
        boxShadow: isSelected ? "0 0 0 2px #ef4444" : undefined,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={() => { if (!isPillVisible || hideTimeout.current) handleMouseEnter(); }}
      onMouseLeave={handleMouseLeave}
      onClick={() => setSelectedId(individual.id)}
    >

      {/* Main pedigree symbol */}
      <svg
        width={NODE_SIZE}
        height={NODE_SIZE}
        viewBox={`0 0 ${NODE_SIZE} ${NODE_SIZE}`}
        overflow="visible"
      >
        <SymbolShape individual={individual} size={NODE_SIZE} sectors={sectors} clipId={`symbol-clip-${nodeId}`} />
        {individual.deceased && <DeceasedSlash size={NODE_SIZE} />}
        {individual.proband  && <ProbandArrow  size={NODE_SIZE} />}
        <AnnotationRow items={annotations} size={NODE_SIZE} offsetY={captionOffset} />
      </svg>

      {/* Name label below symbol */}
      {individual.name && (
        <div
          style={{
            position: "absolute",
            top: labelTop,
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

      {/* Dev-mode ID label, so a screenshot of the canvas names each node for bug
          reports. Generated ids are UUIDs, which are wider than a slot and
          overlap their neighbours, so those show only their first 6
          characters (data-individual-id has the full id). */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: "absolute",
            top: labelTop + (individual.name ? 12 : 0),
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            fontSize: 8,
            fontFamily: "monospace",
            lineHeight: 1.2,
            color: "#888",
            pointerEvents: "none",
          }}
        >
          {shortDevId(individual.id)}
        </div>
      )}

      {/* Pin indicator — small grey dot in top-right corner */}
      {isPinned && (
        <div
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#9ca3af",
            border: "1.5px solid white",
            pointerEvents: "none",
          }}
        />
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
        isVisible={isPillVisible}
        hasParents={hasParents}
        onPillEnter={cancelHide}
        onPillLeave={scheduleHide}
        onMenuClose={scheduleHide}
      />
    </div>
  );
}
