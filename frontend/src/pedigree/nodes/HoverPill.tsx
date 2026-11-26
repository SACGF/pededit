import { useLayoutEffect, useRef } from "react";
import { NodeToolbar, Position, useStore } from "@xyflow/react";
import { Lock, Unlock } from "lucide-react";
import { usePedigreeFields, usePedigreeStore } from "../../store/usePedigreeStore";
import { MoreMenu } from "./MoreMenu";
import { lockActionTitle, personAddActions, runPersonAdd } from "../personActions";

interface HoverPillProps {
  nodeId: string;          // React Flow node ID (for NodeToolbar)
  individualId: string;    // pedigree Individual.id
  isVisible: boolean;
  name?: string;           // full name, shown under the pill (the pill covers the name label)
  nameOnly?: boolean;      // a cut name label is hovered: show the full name without the buttons
  onPillEnter: () => void; // called when mouse enters pill (cancel hide timer)
  onPillLeave: () => void; // called when mouse leaves pill (schedule hide)
  onMenuClose?: () => void; // more menu closed (it gives no mouseleave, see MoreMenu)
}

export function HoverPill({ nodeId, individualId, isVisible, name, nameOnly, onPillEnter, onPillLeave, onMenuClose }: HoverPillProps) {
  // Every node has a pill, shown or not, so it reads only this person's
  // answers from the store: a whole-store read redrew every pill on a hover (#197).
  const unlockIndividual = usePedigreeStore(s => s.unlockIndividual);
  const lockIndividual = usePedigreeStore(s => s.lockIndividual);
  const nodesMoveable = usePedigreeStore(s => s.pedigree.canvasSettings?.nodesMoveable ?? false);
  const isUnlocked = usePedigreeStore(s => nodesMoveable || (s.pedigree.unlockedIndividuals ?? []).includes(individualId));


  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible={isVisible || !!nameOnly}
      position={Position.Bottom}
      offset={6}
      // With only the name showing, clicks go through to the label underneath.
      style={isVisible ? undefined : { pointerEvents: "none" }}
    >
      <KeepOnCanvas nodeId={nodeId}>
      <div
        data-testid="hover-pill"
        className="flex items-center gap-0.5 bg-white border border-gray-300 rounded-full px-1.5 py-0.5 shadow-xs text-xs"
        style={isVisible ? undefined : { display: "none" }}
        onMouseEnter={onPillEnter}
        onMouseMove={onPillEnter}
        onMouseLeave={onPillLeave}
      >
        <AddButtons individualId={individualId} />

        {/* Lock / unlock — only shown when global "nodes moveable" is off */}
        {!nodesMoveable && (
          <>
            <div className="w-px h-3 bg-gray-300 mx-0.5" />
            <PillButton
              title={lockActionTitle(isUnlocked)}
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
        <MoreMenu individualId={individualId} onClose={onMenuClose} />
      </div>
      {/* The pill sits over the name label, and the label may be cut to fit its
          slot, so the full name is repeated here. */}
      {name?.trim() && (
        <div
          data-full-name
          className="mt-0.5 px-1.5 py-0.5 bg-white border border-gray-300 text-xs text-black text-center pointer-events-none"
          style={{ maxWidth: 280 }}
        >
          {name.trim()}
        </div>
      )}
      </KeepOnCanvas>
    </NodeToolbar>
  );
}

/**
 * The add buttons, from `personAddActions` as on the Person tab. NodeToolbar
 * mounts its children only while the pill shows, so reading the whole
 * pedigree here costs the other nodes nothing.
 */
function AddButtons({ individualId }: { individualId: string }) {
  const { pedigree, ...edits } = usePedigreeFields("pedigree", "addParent", "addChild", "addSibling");
  const individual = pedigree.individuals.find(i => i.id === individualId);
  if (!individual) return null;
  return (
    <>
      {personAddActions(pedigree, individual).map(a => (
        <PillButton key={a.key} title={a.title} disabled={a.disabled} onClick={() => runPersonAdd(a.key, individualId, edits)}>{a.glyph}</PillButton>
      ))}
    </>
  );
}

/** Gap kept between the pill and the canvas edge. */
const CANVAS_EDGE_MARGIN = 4;

/**
 * Slides the pill sideways to keep it inside the canvas. It is centred on the
 * person and wider than a phone, so beside an edge some of its buttons would
 * be cut off. Mounted only while the pill shows (NodeToolbar renders nothing
 * otherwise), so the store reads here cost nothing for the other nodes.
 */
function KeepOnCanvas({ nodeId, children }: { nodeId: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // What moves the person on the screen: pan, zoom, a drag, the canvas resizing.
  useStore(s => s.transform);
  useStore(s => s.nodeLookup.get(nodeId)?.internals.positionAbsolute);
  useStore(s => s.width);
  useLayoutEffect(() => {
    const el = ref.current;
    const flow = el?.closest(".react-flow");
    if (!el || !flow) return;
    el.style.transform = "";
    const box = el.getBoundingClientRect();
    const canvas = flow.getBoundingClientRect();
    const min = canvas.left + CANVAS_EDGE_MARGIN, max = canvas.right - CANVAS_EDGE_MARGIN;
    let dx = 0;
    // Wider than the canvas: keep its start, where the add buttons are.
    if (box.left < min || box.width > max - min) dx = min - box.left;
    else if (box.right > max) dx = max - box.right;
    if (dx) el.style.transform = `translateX(${dx}px)`;
  });
  return <div ref={ref} className="flex flex-col items-center">{children}</div>;
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
        px-1.5 py-0.5 rounded-full font-mono text-[10px] leading-none pointer-coarse:px-2.5 pointer-coarse:py-2 pointer-coarse:text-xs
        hover:bg-gray-100 active:bg-gray-200
        disabled:opacity-30 disabled:cursor-not-allowed
        transition-colors
      `}
    >
      {children}
    </button>
  );
}
