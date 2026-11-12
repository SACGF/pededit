import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  applyNodeChanges,
  type NodeTypes,
  type EdgeTypes,
  type Edge,
  type Node,
  type NodeChange,
  type OnNodeDrag,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { usePedigreeStore, DEFAULT_SNAP_GRID_SIZE } from "../store/usePedigreeStore";
import { layoutToFlow } from "./layoutToFlow";
import { PedigreeSymbolNode } from "./nodes/PedigreeSymbolNode";
import { CollapsedBranchNode } from "./nodes/CollapsedBranchNode";
import { branchCountFontSize } from "./collapse";
import { CoupleEdge }         from "./edges/CoupleEdge";
import { ConsanguineousEdge } from "./edges/ConsanguineousEdge";
import { SibshipEdge }        from "./edges/SibshipEdge";
import { DuplicateEdge }      from "./edges/DuplicateEdge";
import type { RFNodeData, SibshipEdgeData, CoupleEdgeData } from "./layoutToFlow";
import { NODE_SIZE } from "./constants";
import { sibshipSegments, segmentsPathD } from "./sibshipPath";
import { endedBreakX, endedMarkSegments } from "./ended";
import { layoutSpacing, unscalePinnedPosition } from "./spacing";
import { activeSnapGrid, backgroundDotGap } from "./snap";
import { PickingBanner } from "./PickingBanner";
import { SymbolShape, DeceasedSlash } from "./nodes/symbols";
import { sectorsFor } from "./tags";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { ChartTitleNode, chartTitleNode } from "./nodes/ChartTitleNode";
import { chartTitle } from "./labels";
import { useAppStore } from "../store/useAppStore";
import { CanvasContextMenu, type ContextMenuTarget } from "./CanvasContextMenu";

const nodeTypes: NodeTypes = { pedigreeSymbol: PedigreeSymbolNode, collapsedBranch: CollapsedBranchNode, chartTitle: ChartTitleNode };

const edgeTypes: EdgeTypes = {
  coupleEdge:         CoupleEdge,
  consanguineousEdge: ConsanguineousEdge,
  sibshipEdge:        SibshipEdge,
  duplicateEdge:      DuplicateEdge,
};

// ── Custom minimap ─────────────────────────────────────────────────────────────
// Renders a fixed-size SVG that always fits all content (no zoom/pan).

const MINI_W   = 180;
const MINI_H   = 120;
const MINI_PAD = 8;

const MINIMAP_STROKE_CSS =
  '.pedigree-minimap [stroke="black"], .pedigree-minimap line[stroke="white"]'
  + " { vector-effect: non-scaling-stroke; stroke-width: 1px; }";

interface PedigreeMinimapProps {
  pedigree:     Pedigree;
  nodes:        Node<RFNodeData>[];
  coupleEdges:  Edge<CoupleEdgeData>[];
  sibshipEdges: Edge<SibshipEdgeData>[];
}

function PedigreeMinimap({ pedigree, nodes, coupleEdges, sibshipEdges }: PedigreeMinimapProps) {
  if (nodes.length === 0) return null;

  // Bounding box over all node extents (nodes are centered at position with nodeOrigin=[0.5,0.5])
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const half = NODE_SIZE / 2;
  for (const node of nodes) {
    const { x, y } = node.position;
    if (x - half < x0) x0 = x - half;
    if (x + half > x1) x1 = x + half;
    if (y - half < y0) y0 = y - half;
    if (y + half > y1) y1 = y + half;
  }

  const contentW = x1 - x0 || 1;
  const contentH = y1 - y0 || 1;
  const availW   = MINI_W - 2 * MINI_PAD;
  const availH   = MINI_H - 2 * MINI_PAD;
  const scale    = Math.min(availW / contentW, availH / contentH);

  // Center the content within the available area
  const scaledW = contentW * scale;
  const scaledH = contentH * scale;
  const offsetX = MINI_PAD + (availW - scaledW) / 2;
  const offsetY = MINI_PAD + (availH - scaledH) / 2;

  const mx  = (cx: number) => (cx - x0) * scale + offsetX;
  const my  = (cy: number) => (cy - y0) * scale + offsetY;

  const nodePos = new Map(nodes.map(n => [n.id, n.position]));

  return (
    <Panel position="bottom-right" style={{ margin: 0, lineHeight: 0 }}>
      <svg
        width={MINI_W}
        height={MINI_H}
        className="pedigree-minimap"
        style={{ display: "block", background: "white", border: "1px solid #d1d5db" }}
      >
        {/* The symbols are drawn at canvas size and scaled down; keep their
            outlines and slashes a hairline instead of scaling 2px to nothing. */}
        <style>{MINIMAP_STROKE_CSS}</style>
        {/* Sibship edges — drawn first so nodes render on top */}
        {sibshipEdges.map(edge => {
          const data = edge.data as SibshipEdgeData;
          if (!data?.childXs?.length) return null;
          const kids = data.childXs.map((x, i) => ({ x, y: data.childYs?.[i] ?? data.childY }));
          const d = segmentsPathD(
            sibshipSegments(data.coupleX, data.coupleY, 0, kids, data.barOffset ?? 0),
            (x, y) => [mx(x), my(y)],
          );
          return <path key={edge.id} d={d} stroke="black" strokeWidth={1} fill="none" />;
        })}

        {/* Couple edges */}
        {coupleEdges.map(edge => {
          const src = nodePos.get(edge.source);
          const tgt = nodePos.get(edge.target);
          if (!src || !tgt) return null;
          const lx = mx(src.x + half);
          const rx = mx(tgt.x - half);
          const ey = my(src.y);
          // Ended relationship (#98): the strokes at no less than half size,
          // or they vanish at minimap scale.
          const data = edge.data as CoupleEdgeData | undefined;
          const ended = data?.ended && (
            <path
              data-minimap-ended
              d={segmentsPathD(endedMarkSegments(endedBreakX(lx, rx, 0, 0, !!data.middleTaken), ey, Math.max(scale, 0.5)))}
              stroke="black" strokeWidth={1} fill="none"
            />
          );
          if (edge.type === "consanguineousEdge") {
            return (
              <g key={edge.id}>
                <line x1={lx} y1={ey - 1.5} x2={rx} y2={ey - 1.5} stroke="black" strokeWidth={1} />
                <line x1={lx} y1={ey + 1.5} x2={rx} y2={ey + 1.5} stroke="black" strokeWidth={1} />
                {ended}
              </g>
            );
          }
          return (
            <g key={edge.id}>
              <line x1={lx} y1={ey} x2={rx} y2={ey} stroke="black" strokeWidth={1} />
              {ended}
            </g>
          );
        })}

        {/* Nodes, on top of the edges: the canvas symbols scaled down (#6) */}
        {nodes.map(node => {
          const { x, y } = node.position;
          const { individual, branch } = node.data as RFNodeData;
          return (
            <g
              key={node.id}
              data-minimap-individual={individual.id}
              transform={`translate(${mx(x - half)} ${my(y - half)}) scale(${scale})`}
            >
              <SymbolShape
                individual={individual}
                size={NODE_SIZE}
                sectors={sectorsFor(individual, pedigree)}
                clipId={`minimap-clip-${node.id}`}
                caption={false}
              />
              {individual.deceased && <DeceasedSlash size={NODE_SIZE} />}
              {branch && <BranchCount count={branch.children.length} />}
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

/** The number inside a collapsed-branch group symbol (#1), as on the canvas, for the minimap. */
function BranchCount({ count }: { count: number }) {
  const fs = branchCountFontSize(count, NODE_SIZE);
  return (
    <text
      x={NODE_SIZE / 2}
      y={NODE_SIZE / 2 + Math.round(fs * 0.36 * 10) / 10}
      textAnchor="middle"
      fontFamily="sans-serif"
      fontSize={fs}
      fill="black"
    >
      {count}
    </text>
  );
}

/**
 * Refits the view, once the new layout has rendered, when compact mode is
 * toggled or Auto arrange / Reset layout clears the pins (#64: an auto
 * layout of several families is often wider than the hand-placed one).
 */
function FitOnLayoutChange({ compact }: { compact: boolean }) {
  const { fitView } = useReactFlow();
  const resetCount = usePedigreeStore(s => s.layoutResetCount);
  const key = `${compact}-${resetCount}`;
  const prev = useRef(key);
  useEffect(() => {
    if (prev.current === key) return; // the initial fit comes from the fitView prop
    prev.current = key;
    const id = requestAnimationFrame(() => { void fitView(); });
    return () => cancelAnimationFrame(id);
  }, [key, fitView]);
  return null;
}

const MIN_ZOOM = 0.1;

// ── Canvas ─────────────────────────────────────────────────────────────────────

interface PedigreeCanvasProps {
  showMinimap?: boolean;
  /** Tighter row and slot spacing so larger pedigrees fit on screen. */
  compact?: boolean;
}

export function PedigreeCanvas({ showMinimap = false, compact = false }: PedigreeCanvasProps) {
  const { pedigree, selectedIds, setSelectedId, setSelection, pinIndividuals, resetLayout, picking } = usePedigreeStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const hasPinnedNodes = !!pedigree.pinnedPositions &&
    Object.keys(pedigree.pinnedPositions).length > 0;

  const { nodes: computedNodes, coupleEdges, sibshipEdges, duplicateEdges } = useMemo(
    () => pedigree.individuals.length > 0
      ? layoutToFlow(pedigree, { compact })
      : { nodes: [], coupleEdges: [], sibshipEdges: [], duplicateEdges: [] },
    [pedigree, compact],
  );

  // Rubber band in progress (Shift+drag, #21): the React Flow node ids inside
  // it so far, or null. While set, React Flow's own select changes drive the
  // highlight; the store gets the result when the band ends. The band adds
  // to the selection it started with (Shift adds, as for a click).
  const boxRef = useRef<Set<string> | null>(null);
  const boxBaseRef = useRef<Set<string>>(new Set());
  const individualOfRef = useRef(new Map<string, string>());
  individualOfRef.current = new Map(computedNodes.map(n => [n.id, n.data.individual.id]));
  const inBox = (nodeId: string) =>
    !!boxRef.current?.has(nodeId) || boxBaseRef.current.has(individualOfRef.current.get(nodeId) ?? "");

  // Local node state so React Flow can track positions during drag.
  // Synced from computedNodes whenever the store changes (structure edits,
  // undo/redo, pin commits) — but not on intermediate drag moves. Each
  // node's `selected` mirrors the store's selection (every copy of a
  // selected person), which is what makes React Flow drag them together.
  const [rfNodes, setRfNodes] = useState<Node<RFNodeData>[]>(computedNodes);
  useEffect(() => {
    const sel = new Set(selectedIds);
    setRfNodes(computedNodes.map(n => {
      const selected = boxRef.current ? inBox(n.id) : sel.has(n.data.individual.id);
      return n.selected === selected ? n : { ...n, selected };
    }));
  }, [computedNodes, selectedIds]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<RFNodeData>>[]) => {
      // The store owns the selection: node clicks go through
      // PedigreeSymbolNode, so React Flow's own select changes count only
      // inside a rubber band. Deleting is the store's job too.
      const box = boxRef.current;
      const kept = changes.filter(c => {
        if (c.type === "remove") return false;
        if (c.type !== "select") return true;
        if (!box) return false;
        if (c.selected) box.add(c.id); else box.delete(c.id);
        return true;
      }).map(c => (c.type === "select" ? { ...c, selected: inBox(c.id) } : c));
      if (kept.length > 0) setRfNodes(prev => applyNodeChanges(kept, prev));
    },
    [],
  );

  const handleSelectionStart = useCallback(() => {
    boxRef.current = new Set();
    boxBaseRef.current = new Set(usePedigreeStore.getState().selectedIds);
  }, []);

  const handleSelectionEnd = useCallback(() => {
    const box = boxRef.current;
    boxRef.current = null;
    if (!box) return;
    const { selectedIds, selectedId } = usePedigreeStore.getState();
    const added = [...box].map(id => individualOfRef.current.get(id)).filter((id): id is string => !!id);
    setSelection([...selectedIds, ...added], added.length > 0 ? added[added.length - 1] : selectedId);
  }, [setSelection]);

  const edges = [...duplicateEdges, ...coupleEdges, ...sibshipEdges];

  // The chart title (#20) rides along as one more node, above the layout.
  const pedigreeName = useAppStore(s => s.activeTitle);
  const title = chartTitle(pedigree, pedigreeName);
  const titleNode = useMemo(() => chartTitleNode(title, computedNodes), [title, computedNodes]);
  const flowNodes = titleNode ? [...rfNodes, titleNode as unknown as Node<RFNodeData>] : rfNodes;

  // Background dots follow the snap grid when snap is on (React Flow's
  // default of 20 otherwise). React Flow centres a dot in each pattern tile,
  // so shift by half a tile to put the dots on grid points.
  const grid = activeSnapGrid(pedigree);
  const dotGap = grid > 0 ? backgroundDotGap(grid) : 20;
  const DOT_SIZE = 1;

  const handlePaneClick = useCallback(() => {
    setSelectedId(null);
  }, [setSelectedId]);

  // Right-click (#95): the more menu at the cursor on a person, the couple
  // items on a couple line. The browser's own menu is kept everywhere else.
  // Not while picking, where clicks on people mean something else.
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node<RFNodeData>) => {
    if (picking || node.type !== "pedigreeSymbol") return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, individualId: node.data.individual.id });
  }, [picking]);

  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    const partnershipId = (edge.data as CoupleEdgeData | undefined)?.partnershipId;
    if (picking || (edge.type !== "coupleEdge" && edge.type !== "consanguineousEdge") || !partnershipId) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, partnershipId });
  }, [picking]);

  const handleNodeDragStop: OnNodeDrag<Node<RFNodeData>> = useCallback(
    (_event, node, nodes) => {
      // Every dragged node (the whole selection, #21) is pinned as one undo
      // step. React Flow snaps a group's delta, not each node, so the group
      // keeps its shape. Pins are stored at normal spacing; map back. A
      // person drawn twice keeps the copy that was grabbed, else the first.
      const spacing = layoutSpacing(compact);
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of [node, ...nodes]) {
        const id = n.data.individual.id;
        if (!positions[id]) positions[id] = unscalePinnedPosition(n.position, spacing);
      }
      pinIndividuals(positions);
    },
    [pinIndividuals, compact],
  );

  // Radix's own outside-click dismissal never fires on the canvas, because
  // React Flow stops the mouse events it waits for. Close the menu on any
  // press or scroll in the canvas outside it (the menu is portalled but a
  // React child here, so its own presses arrive too and are let through).
  const closeContextMenuOutside = useCallback((e: React.SyntheticEvent) => {
    if (!(e.target as Element).closest?.("[data-context-menu]")) setContextMenu(null);
  }, []);

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative" }}
      onPointerDownCapture={contextMenu ? closeContextMenuOutside : undefined}
      onWheelCapture={contextMenu ? closeContextMenuOutside : undefined}
    >
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <marker id="proband-arrowhead" markerWidth="6" markerHeight="6"
                  refX="6" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="black" />
          </marker>
        </defs>
      </svg>

      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeOrigin={[0.5, 0.5]}
        nodesDraggable={false}
        nodesConnectable={false}
        // Selection is the store's (#21): Shift+click or Ctrl/Cmd+click
        // toggles, Shift+drag draws a rubber band, plain drag pans. React
        // Flow's own delete key would drop nodes from the canvas only.
        selectNodesOnDrag={false}
        deleteKeyCode={null}
        onSelectionStart={handleSelectionStart}
        onSelectionEnd={handleSelectionEnd}
        snapToGrid={pedigree.canvasSettings?.snapToGrid ?? false}
        snapGrid={[
          pedigree.canvasSettings?.snapGridSize ?? DEFAULT_SNAP_GRID_SIZE,
          pedigree.canvasSettings?.snapGridSize ?? DEFAULT_SNAP_GRID_SIZE,
        ]}
        onNodesChange={onNodesChange}
        fitView
        // React Flow's default (0.5) cannot fit a wide pedigree, such as
        // a dozen families side by side (#64), so fit view would clip it.
        minZoom={MIN_ZOOM}
        onPaneClick={handlePaneClick}
        onNodeDragStop={handleNodeDragStop}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        proOptions={{ hideAttribution: true }}
      >
        {pedigree.individuals.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <span className="text-sm text-gray-300">
              Use the toolbar above to add individuals
            </span>
          </div>
        )}
        {hasPinnedNodes && (
          <Panel position="top-left">
            <button
              onClick={resetLayout}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                background: "white",
                border: "1px solid #d1d5db",
                borderRadius: 4,
                cursor: "pointer",
                color: "#374151",
              }}
            >
              Auto arrange
            </button>
          </Panel>
        )}
        <PickingBanner />
        <Background gap={dotGap} size={DOT_SIZE} offset={DOT_SIZE / 2 - dotGap / 2} />
        <FitOnLayoutChange compact={compact} />
        <Controls />
        {showMinimap && (
          <PedigreeMinimap
            pedigree={pedigree}
            nodes={rfNodes as Node<RFNodeData>[]}
            coupleEdges={coupleEdges as Edge<CoupleEdgeData>[]}
            sibshipEdges={sibshipEdges as Edge<SibshipEdgeData>[]}
          />
        )}
      </ReactFlow>
      <CanvasContextMenu target={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}
