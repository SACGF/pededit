import { useRef, useState } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { RFNodeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { SymbolShape, DeceasedSlash, ProbandArrow, DuplicateSuperscript, AnnotationRow, CollapsedMarkIcon } from "./symbols";
import { HoverPill } from "./HoverPill";
import { captionRowHeight } from "../lifeStatus";
import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT, isLabelCut } from "../labels";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { sectorsFor, annotationRow, ANNOTATION_ROW_HEIGHT } from "../tags";
import { onsetsOf } from "../onset";
import { isPhantomId } from "../../io/ped/converter";
import { collapseInfo, collapsedMarkBox } from "../collapse";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dev-only id under the symbol: UUIDs to 6 characters, long file ids cut to the slot width. */
function shortDevId(id: string): string {
  if (UUID_RE.test(id)) return id.slice(0, 6);
  return id.length > 12 ? id.slice(0, 11) + "\u2026" : id;
}

export type PedigreeSymbolNodeType = Node<RFNodeData, "pedigreeSymbol">;

export function PedigreeSymbolNode({ data, selected }: NodeProps<PedigreeSymbolNodeType>) {
  const { individual, isDuplicate, duplicateIndex, hasParents, isPinned, nameLines } = data;
  const details = data.detailLines ?? [];
  const nodeId = useNodeId()!;
  const [isPillVisible, setIsPillVisible] = useState(false);
  const [isNameHovered, setIsNameHovered] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setHoveredId, setSelectedId, toggleSelected, pedigree, picking, pickIndividual, setDescendantsHidden } = usePedigreeStore();
  // React Flow's flag, which PedigreeCanvas mirrors from the store's
  // selection (#21) and which also shows a rubber band as it is drawn.
  const isSelected = !!selected;
  const nameCut = isLabelCut(nameLines, individual.name);
  // On-canvas picking (#36): a click picks instead of selecting; picked people are outlined.
  const isPicked = picking?.kind === "parents" && picking.picked.includes(individual.id);
  const isPickTarget = (picking?.kind === "parents" && picking.childId === individual.id)
    || (picking?.kind === "partner" && picking.individualId === individual.id);
  const sectors = sectorsFor(individual, pedigree);
  const annotations = annotationRow(individual, pedigree);
  const hasOnset = onsetsOf(individual, pedigree).length > 0;
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
      onPointerDown={e => {
        // Pressing on an unselected person selects them alone first, so a
        // drag moves just them; pressing on a selected one keeps the group
        // for a group drag (#21). Only for the symbol itself: the hover pill
        // and more menu are portals whose events bubble here too.
        if (picking || selected || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
        if (e.currentTarget.contains(e.target as Element)) setSelectedId(individual.id);
      }}
      onClick={e => {
        if (pickIndividual(individual.id)) return;
        const onSymbol = e.currentTarget.contains(e.target as Element);
        if (onSymbol && (e.shiftKey || e.ctrlKey || e.metaKey)) toggleSelected(individual.id);
        // A click in this person's hover pill keeps a selection they are in.
        else if (onSymbol || !selected) setSelectedId(individual.id);
      }}
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

      {/* The free-text age, or else the date of birth, under the name (#20),
          then ages of onset (#93). Onset lines can reach the sibship bar of
          the person's children, so the block gets a white backing then. */}
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
            ...(hasOnset ? { background: "#fff", padding: "0 2px" } : {}),
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

      {/* Hidden descendants (#94): click the mark to show them again. */}
      {individual.descendantsHidden && (() => {
        const box = collapsedMarkBox(NODE_SIZE);
        const n = collapseInfo(pedigree).branches.get(individual.id)?.size ?? 0;
        return (
          <button
            type="button"
            data-descendants-hidden={individual.id}
            title={`${n} ${n === 1 ? "person" : "people"} hidden below. Click to show.`}
            onClick={e => { e.stopPropagation(); setDescendantsHidden([individual.id], false); }}
            style={{ position: "absolute", left: box.x - 3, top: box.y - 3, width: box.size + 6, height: box.size + 6, padding: 3, border: 0, background: "transparent", cursor: "pointer" }}
          >
            <CollapsedMarkIcon size={box.size} />
          </button>
        );
      })()}

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
