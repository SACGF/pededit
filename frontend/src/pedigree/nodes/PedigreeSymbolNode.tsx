import { useRef, useState } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { RFNodeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { SymbolShape, DeceasedSlash, ProbandArrow, DuplicateSuperscript, AnnotationRow } from "./symbols";
import { HoverPill } from "./HoverPill";
import { captionRowHeight } from "../lifeStatus";
import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT, isLabelCut } from "../labels";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { sectorsFor, annotationRow, ANNOTATION_ROW_HEIGHT } from "../tags";
import { isPhantomId } from "../../io/ped/converter";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dev-only id under the symbol: UUIDs to 6 characters, long file ids cut to the slot width. */
function shortDevId(id: string): string {
  if (UUID_RE.test(id)) return id.slice(0, 6);
  return id.length > 12 ? id.slice(0, 11) + "\u2026" : id;
}

export type PedigreeSymbolNodeType = Node<RFNodeData, "pedigreeSymbol">;

export function PedigreeSymbolNode({ data }: NodeProps<PedigreeSymbolNodeType>) {
  const { individual, isDuplicate, duplicateIndex, hasParents, isPinned, nameLines } = data;
  const details = data.detailLines ?? [];
  const nodeId = useNodeId()!;
  const [isPillVisible, setIsPillVisible] = useState(false);
  const [isNameHovered, setIsNameHovered] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setHoveredId, setSelectedId, selectedId, pedigree, picking, pickIndividual } = usePedigreeStore();
  const isSelected = individual.id === selectedId;
  const nameCut = isLabelCut(nameLines, individual.name);
  // On-canvas picking (#36): a click picks instead of selecting; picked people are outlined.
  const isPicked = picking?.kind === "parents" && picking.picked.includes(individual.id);
  const isPickTarget = (picking?.kind === "parents" && picking.childId === individual.id)
    || (picking?.kind === "partner" && picking.individualId === individual.id);
  const sectors = sectorsFor(individual, pedigree);
  const annotations = annotationRow(individual, pedigree);
  // Under the symbol, top to bottom: "SB" / "ECT" caption, tag annotation row, name, age or DOB.
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

  function handleMouseEnter(e?: React.MouseEvent) {
    // Over a cut name label only the full name shows (#68): the pill would
    // open under the cursor, where a click meant for the name hits a button.
    if (e && (e.target as Element).closest?.("[data-name-label]")) return;
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
        boxShadow: isPicked ? "0 0 0 3px #2563eb" : isPickTarget ? "0 0 0 2px #9ca3af" : isSelected ? "0 0 0 2px #ef4444" : undefined,
        cursor: picking ? "crosshair" : undefined,
      }}
      data-picked={isPicked ? "true" : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseMove={e => { if (!isPillVisible || hideTimeout.current) handleMouseEnter(e); }}
      onMouseLeave={handleMouseLeave}
      onClick={() => { if (!pickIndividual(individual.id)) setSelectedId(individual.id); }}
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

      {/* Name label below symbol, fitted to the slot width (#68). A cut label
          takes the mouse: hovering it shows the full name, clicking it selects. */}
      {nameLines.length > 0 && (
        <div
          data-name-label
          data-name-cut={nameCut ? "true" : undefined}
          onMouseEnter={() => setIsNameHovered(true)}
          onMouseLeave={() => setIsNameHovered(false)}
          style={{
            position: "absolute",
            top: labelTop,
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            textAlign: "center",
            fontSize: LABEL_FONT_SIZE,
            lineHeight: `${LABEL_LINE_HEIGHT}px`,
            color: "#000",
            pointerEvents: nameCut ? "auto" : "none",
          }}
        >
          {nameLines.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      {/* The free-text age, or else the date of birth, under the name (#20). */}
      {details.length > 0 && (
        <div
          data-detail-label
          style={{
            position: "absolute",
            top: labelTop + nameLines.length * LABEL_LINE_HEIGHT,
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
          {details.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      {/* Dev-mode ID label, so a screenshot of the canvas names each node for bug
          reports. Generated ids are UUIDs, which are wider than a slot and
          overlap their neighbours, so those show only their first 6
          characters (data-individual-id has the full id). Not for the invented
          partners of single parents in a PED import: their IDs are internal. */}
      {import.meta.env.DEV && !isPhantomId(individual.id) && (
        <div
          style={{
            position: "absolute",
            top: labelTop + (nameLines.length + details.length) * LABEL_LINE_HEIGHT,
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
        isVisible={isPillVisible && !picking}
        hasParents={hasParents}
        name={individual.name}
        nameOnly={isNameHovered && nameCut}
        onPillEnter={cancelHide}
        onPillLeave={scheduleHide}
        onMenuClose={scheduleHide}
      />
    </div>
  );
}
