import { useEffect, useRef, useState } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { RFNodeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { SymbolShape, DeceasedSlash, ProbandArrow, FamilyHistoryMark, DocumentedMark, DuplicateSuperscript, AnnotationRow } from "./symbols";
import { HoverPill } from "./HoverPill";
import { isSmallScreen } from "../../hooks/useSmallScreen";
import { CAPTION_ROW_HEIGHT } from "../lifeStatus";
import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT, isLabelCut } from "../labels";
import { usePedigreeStore } from "../../store/usePedigreeStore";
import { ANNOTATION_ROW_HEIGHT } from "../tags";
import { isPhantomId } from "../../io/ped/converter";
import { worstSeverity } from "../validation";
import { problemsOf } from "../../components/problemList";
import { ProblemIcon } from "../../components/ProblemsMenu";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dev-only id under the symbol: UUIDs to 6 characters, long file ids cut to the slot width. */
function shortDevId(id: string): string {
  if (UUID_RE.test(id)) return id.slice(0, 6);
  return id.length > 12 ? id.slice(0, 11) + "\u2026" : id;
}

export type PedigreeSymbolNodeType = Node<RFNodeData, "pedigreeSymbol">;

export function PedigreeSymbolNode({ data, selected }: NodeProps<PedigreeSymbolNodeType>) {
  // What to draw is decided once, in the layout: the glyph. This
  // component draws it and adds what only the editor shows (selection, the
  // pin dot, the problem marker, the dev id, the hover pill).
  const { individual, glyph, isPinned } = data;
  const { nameLines, shape, paint, annotations, arrow } = glyph;
  const details = glyph.detailLines;
  const nodeId = useNodeId()!;
  const [isPillVisible, setIsPillVisible] = useState(false);
  const [isNameHovered, setIsNameHovered] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Each read from the store is a selector giving this person's own answer,
  // so a change elsewhere in the store (a hover sets `hoveredId`) redraws
  // only the people whose answer changed, not every symbol (#197).
  const id = individual.id;
  const setHoveredId = usePedigreeStore(s => s.setHoveredId);
  const setSelectedId = usePedigreeStore(s => s.setSelectedId);
  const toggleSelected = usePedigreeStore(s => s.toggleSelected);
  const pickIndividual = usePedigreeStore(s => s.pickIndividual);
  const isPicking = usePedigreeStore(s => s.picking !== null);
  // On-canvas picking: a click picks instead of selecting; picked people are outlined.
  const isPicked = usePedigreeStore(s => s.picking?.kind === "parents" && s.picking.picked.includes(id));
  const isPickTarget = usePedigreeStore(s => {
    const p = s.picking;
    return (p?.kind === "parents" && p.childId === id)
      || ((p?.kind === "partner" || p?.kind === "relatedness") && p.individualId === id);
  });
  // Hovering a problem in the toolbar's list outlines its person.
  const isProblemHighlight = usePedigreeStore(s => s.problemHighlightId === id);
  // Editor warnings, memoised per pedigree so every node shares one
  // pass. The only thing here that reads the pedigree: it is an editor mark.
  // Selected as strings, which compare equal when nothing changed for this
  // person even though every edit makes a new list.
  const problemSeverity = usePedigreeStore(s => worstSeverity(problemsOf(s.pedigree).byIndividual.get(id) ?? []));
  const problemTitle = usePedigreeStore(s => (problemsOf(s.pedigree).byIndividual.get(id) ?? []).map(p => p.message).join("\n"));
  const hasParents = glyph.hasParents;
  // React Flow's flag, which PedigreeCanvas mirrors from the store's
  // selection and which also shows a rubber band as it is drawn.
  const isSelected = !!selected;
  // Touch: there is no hover, so a tap on the symbol opens the pill
  // and it stays for as long as the person is selected. The mouse events a
  // browser makes up after a tap differ between browsers and cannot be
  // relied on to open it or to close it. On a small screen a tap opens
  // the Person tab's sheet, which has the pill's buttons
  // (`components/PersonActions.tsx`), so no pill is shown by touch there.
  const [isTouchPill, setIsTouchPill] = useState(false);
  // Whether the press now on the symbol is a finger.
  const touchDown = useRef(false);
  useEffect(() => { if (!isSelected) setIsTouchPill(false); }, [isSelected]);
  const nameCut = isLabelCut(nameLines, glyph.name);
  // Under the symbol, top to bottom: "SB" / "ECT" caption, tag annotation row,
  // name, then the detail lines in NSGC order (age, onset, pedigree number).
  const captionOffset = glyph.caption ? CAPTION_ROW_HEIGHT : 0;
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
    // Over a cut name label only the full name shows: the pill would
    // open under the cursor, where a click meant for the name hits a button.
    if (e && (e.target as Element).closest?.("[data-name-label]")) return;
    // The mouse events a browser makes up after a tap.
    if (touchDown.current && isSmallScreen()) return;
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
        cursor: isPicking ? "crosshair" : undefined,
        outline: isProblemHighlight ? "2px dashed black" : undefined,
        outlineOffset: isProblemHighlight ? 6 : undefined,
      }}
      data-picked={isPicked ? "true" : undefined}
      data-problem-highlight={isProblemHighlight ? "true" : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseMove={e => { if (!isPillVisible || hideTimeout.current) handleMouseEnter(e); }}
      onMouseLeave={handleMouseLeave}
      onPointerDown={e => {
        // Pressing on an unselected person selects them alone first, so a
        // drag moves just them; pressing on a selected one keeps the group
        // for a group drag. Only for the symbol itself: the hover pill
        // and more menu are portals whose events bubble here too.
        // A finger selects on the click instead: a touch that starts on a
        // person is as often the start of a pan or a pinch, and the browser
        // sends a click only for a tap.
        touchDown.current = e.pointerType === "touch";
        if (touchDown.current || isPicking || selected || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
        if (e.currentTarget.contains(e.target as Element)) setSelectedId(individual.id);
      }}
      onClick={e => {
        if (pickIndividual(individual.id)) return;
        const onSymbol = e.currentTarget.contains(e.target as Element);
        if (onSymbol && touchDown.current && !isSmallScreen()) setIsTouchPill(true);
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
        <SymbolShape individual={individual} shape={shape} size={NODE_SIZE} paint={paint} clipId={`symbol-clip-${nodeId}`} />
        {glyph.deceased && <DeceasedSlash size={NODE_SIZE} />}
        {arrow && <ProbandArrow size={NODE_SIZE} kind={arrow} />}
        {glyph.familyHistoryUnknown && <FamilyHistoryMark size={NODE_SIZE} hasParents={hasParents} />}
        {glyph.documented && <DocumentedMark size={NODE_SIZE} adopted={!!glyph.adopted} />}
        <AnnotationRow items={annotations} size={NODE_SIZE} offsetY={captionOffset} />
      </svg>

      {/* Name label below symbol, fitted to the slot width. A cut label
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
            ...(glyph.labelsBacked ? { background: "#fff", padding: "0 2px" } : {}),
          }}
        >
          {nameLines.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      {/* Under the name in NSGC order: age or DOB, ages of onset,
          evaluations, pedigree number. Past the age line the block can reach the
          sibship bar of the person's children, so it gets a white backing. */}
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
            ...(glyph.detailsBacked || glyph.labelsBacked ? { background: "#fff", padding: "0 2px" } : {}),
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
            ...(glyph.labelsBacked ? { background: "#fff", padding: "0 2px" } : {}),
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

      {/* Editor warning marker: top left, canvas only (not the minimap or exports). */}
      {problemSeverity && (
        <div
          data-problem-marker={problemSeverity}
          title={problemTitle}
          style={{ position: "absolute", top: -7, left: -7, width: 10, height: 10, lineHeight: 0 }}
        >
          <ProblemIcon severity={problemSeverity} size={10} />
        </div>
      )}

      {/* Duplicate superscript */}
      {glyph.copy !== undefined && (
        <DuplicateSuperscript index={glyph.copy} />
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
        isVisible={(isPillVisible || (isTouchPill && isSelected)) && !isPicking}
        hasParents={hasParents}
        noChildren={!!individual.lifeStatus}
        name={individual.name}
        nameOnly={isNameHovered && nameCut}
        onPillEnter={cancelHide}
        onPillLeave={scheduleHide}
        onMenuClose={scheduleHide}
      />
    </div>
  );
}
