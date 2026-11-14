import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type MiniMapNodeProps,
  Panel,
  applyNodeChanges,
  type NodeTypes,
  type EdgeTypes,
  type Edge,
  type Node,
  type NodeChange,
  type OnNodeDrag,
  useReactFlow,
  useNodes,
  useEdges,
  useStore as useFlowStore,
  useStoreApi,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDismissableLayerSurface } from "@radix-ui/react-dismissable-layer";
import { usePedigreeStore, DEFAULT_SNAP_GRID_SIZE } from "../store/usePedigreeStore";
import { layoutToFlow } from "./layoutToFlow";
import { PedigreeSymbolNode } from "./nodes/PedigreeSymbolNode";
import { CollapsedBranchNode } from "./nodes/CollapsedBranchNode";
import { CoupleEdge }         from "./edges/CoupleEdge";
import { ConsanguineousEdge } from "./edges/ConsanguineousEdge";
import { SibshipEdge }        from "./edges/SibshipEdge";
import { DuplicateEdge }      from "./edges/DuplicateEdge";
import { AssistedEdge }       from "./edges/AssistedEdge";
import type { RFNodeData, CoupleEdgeData, SibshipEdgeData, AssistedEdgeData } from "./layoutToFlow";
import { sibshipSegments, segmentsPathD } from "./sibshipPath";
import { assistedEdgeSegment } from "./assisted";
import { symbolTopInset } from "./lifeStatus";
import { NODE_SIZE } from "./constants";
import { highestConsanguinityLabel } from "./consanguinityLabel";
import { layoutSpacing, unscalePinnedPosition } from "./spacing";
import { activeSnapGrid, backgroundDotGap } from "./snap";
import { PickingBanner } from "./PickingBanner";
import { FilterBanner } from "./FilterBanner";
import { isAffected } from "./conditions";
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
  assistedEdge:       AssistedEdge,
};

// ── Minimap ─────────────────────────────────────────────────────────────────
// React Flow's own minimap (#6, #125): always the whole pedigree, with the
// viewport as a rectangle. Dragging pans the main view, a click centres it.
// It only gives a sense of where you are, so people are plain shapes (filled
// when affected) joined by plain lines: couple lines (doubled when
// consanguineous), lines of descent and assisted reproduction lines, with no
// dashes, marks or text.

const MINIMAP_SHAPE: Record<string, string> = { male: "minimap-square", female: "minimap-circle", unknown: "minimap-diamond" };

/** Minimap line width in flow units, like the symbol outlines, so lines shrink with the symbols. */
const MINIMAP_LINE_WIDTH = 3;

/**
 * The lines on the minimap, in flow coordinates from the live node positions
 * (so they follow a drag). React Flow's MiniMap draws nodes only, with no
 * slot for anything else in its SVG, so the first node draws these before
 * its own shape, which puts them under every symbol.
 */
function MinimapEdges() {
  const nodes = useNodes();
  const edges = useEdges();
  const byId = new Map(nodes.map(n => [n.id, n]));
  const nodeAt = (id: string) => {
    const n = byId.get(id);
    if (!n) return undefined;
    const d = n.data as Partial<RFNodeData>;
    return { position: n.position, individual: d.individual, shape: d.shape };
  };
  const half = NODE_SIZE / 2;
  const paths: string[] = [];
  for (const edge of edges) {
    if (edge.type === "coupleEdge" || edge.type === "consanguineousEdge") {
      const a = byId.get(edge.source)?.position, b = byId.get(edge.target)?.position;
      if (!a || !b) continue;
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      const y = (l.y + r.y) / 2;
      const offsets = edge.type === "consanguineousEdge" ? [-MINIMAP_LINE_WIDTH, MINIMAP_LINE_WIDTH] : [0];
      for (const dy of offsets) paths.push(`M ${l.x + half} ${y + dy} L ${r.x - half} ${y + dy}`);
    } else if (edge.type === "sibshipEdge") {
      const data = edge.data as SibshipEdgeData | undefined;
      if (!data) continue;
      const lp = byId.get(data.leftParentId), rp = byId.get(data.rightParentId);
      const kids = data.childIds.map(id => byId.get(id)).filter((n): n is Node => !!n);
      if (!lp || !rp || kids.length === 0) continue;
      const sexOf = (n: Node) => { const d = n.data as Partial<RFNodeData>; return d.shape ?? d.individual?.sex; };
      const apart = data.apart
        ? [{ ...lp.position, sex: sexOf(lp) }, { ...rp.position, sex: sexOf(rp) }]
        : undefined;
      paths.push(segmentsPathD(sibshipSegments(
        (lp.position.x + rp.position.x) / 2,
        (lp.position.y + rp.position.y) / 2,
        data.hopHeight ?? 0,
        kids.map(k => ({ ...k.position, topInset: symbolTopInset((k.data as Partial<RFNodeData>).individual?.lifeStatus, NODE_SIZE) })),
        data.barOffset ?? 0,
        apart,
        data.converge,
      )));
    } else if (edge.type === "assistedEdge") {
      const seg = assistedEdgeSegment(edge as Edge<AssistedEdgeData>, nodeAt);
      if (seg) paths.push(`M ${seg[0]} ${seg[1]} L ${seg[2]} ${seg[3]}`);
    }
  }
  return <path data-minimap-edges d={paths.join(" ")} stroke="black" strokeWidth={MINIMAP_LINE_WIDTH} fill="none" />;
}

/** A person on the minimap: the outline of their symbol in the node's box (NODE_SIZE square). */
function MinimapNode(props: MiniMapNodeProps) {
  const firstId = useFlowStore(s => s.nodes.find(n => !n.hidden)?.id);
  const shape = <MinimapShape {...props} />;
  return props.id === firstId ? <>{<MinimapEdges />}{shape}</> : shape;
}

function MinimapShape({ x, y, width, height, className, color, strokeColor, strokeWidth }: MiniMapNodeProps) {
  const paint = { fill: color, stroke: strokeColor, strokeWidth };
  if (className.includes("minimap-circle")) {
    return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...paint} />;
  }
  if (className.includes("minimap-diamond")) {
    const cx = x + width / 2, cy = y + height / 2;
    return <polygon points={`${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`} {...paint} />;
  }
  if (className.includes("minimap-square")) return <rect x={x} y={y} width={width} height={height} {...paint} />;
  return null; // the chart title
}

function PedigreeMinimap({ pedigree }: { pedigree: Pedigree }) {
  const { getZoom, setCenter } = useReactFlow();
  // A drag on the minimap pans, and the browser still sends a click at the end: only a press that did not move centres.
  const down = useRef<{ x: number; y: number } | null>(null);
  const individual = (n: Node) => (n.data as Partial<RFNodeData>).individual;
  return (
    <div onPointerDownCapture={e => { down.current = { x: e.clientX, y: e.clientY }; }}>
      <MiniMap
        position="bottom-right"
        pannable
        nodeComponent={MinimapNode}
        nodeClassName={n => {
          const ind = individual(n);
          return ind ? MINIMAP_SHAPE[(n.data as RFNodeData).shape ?? ind.sex] ?? "minimap-diamond" : "";
        }}
        nodeColor={n => { const ind = individual(n); return ind && isAffected(ind, pedigree) ? "black" : "white"; }}
        nodeStrokeColor="black"
        nodeStrokeWidth={4}
        bgColor="white"
        maskColor="rgba(229, 231, 235, 0.7)"
        maskStrokeColor="#6b7280"
        maskStrokeWidth={1}
        style={{ border: "1px solid #d1d5db", margin: 0 }}
        onClick={(e, position) => {
          const from = down.current;
          if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 3) return;
          void setCenter(position.x, position.y, { zoom: getZoom(), duration: 200 });
        }}
      />
    </div>
  );
}

/**
 * Refits the view, once the new layout has rendered, when a pedigree is
 * loaded (#117), compact mode is toggled or Auto arrange / Reset layout
 * clears the pins (#64: an auto layout of several families is often wider
 * than the hand-placed one).
 *
 * React Flow's own fitView resolves on the first node measurement it sees,
 * and the canvas mounts on the empty pedigree (only the chart title node)
 * before the opened one arrives: fitting then zoomed to the title at the
 * maximum zoom, showing a handful of people (#117). So the fit waits until
 * every node of the current layout (`expected`, from the store, a render
 * ahead of the canvas's own node state) is in React Flow at its new position
 * and measured. Node ids are layout slots ("0-0") and a filter reuses them
 * at other places, so matching ids alone is not enough.
 */
function FitOnLayoutChange({ compact, expected }: { compact: boolean; expected: Node[] }) {
  const { fitView } = useReactFlow();
  const flowStore = useStoreApi();
  const resetCount = usePedigreeStore(s => s.layoutResetCount);
  // Switching a view filter (#4) changes the drawing's size a lot.
  const filtered = usePedigreeStore(s => JSON.stringify(s.pedigree.filters ?? {}));
  const key = `${compact}-${resetCount}-${filtered}`;
  const prev = useRef(key);
  // Also pending on mount: the fitView prop alone has the race above.
  const pending = useRef(true);
  if (prev.current !== key) {
    prev.current = key;
    pending.current = true;
  }
  const want = useRef(expected);
  want.current = expected;

  useEffect(() => {
    const tryFit = () => {
      if (!pending.current) return;
      const { nodeLookup } = flowStore.getState();
      const ready = want.current.length > 0 && want.current.every(e => {
        const n = nodeLookup.get(e.id);
        return !!n?.measured?.width && !!n.measured.height
          && n.position.x === e.position.x && n.position.y === e.position.y;
      });
      if (!ready) return;
      pending.current = false;
      void fitView();
    };
    tryFit();
    return flowStore.subscribe(tryFit);
  }, [key, expected, flowStore, fitView]);
  return null;
}

/**
 * Pans, keeping the zoom, to bring a person into view when the store asks
 * (`revealRequest`, a toolbar add, #121) and their node is off-screen. Waits
 * a few frames for the new layout to render the node.
 */
function RevealOnRequest() {
  const { getNodes, getViewport, setViewport } = useReactFlow();
  const request = usePedigreeStore(s => s.revealRequest);
  const width = useFlowStore(s => s.width);
  const height = useFlowStore(s => s.height);
  const size = useRef({ width, height });
  size.current = { width, height };
  useEffect(() => {
    if (!request) return;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      const node = getNodes().find(n => (n.data as Partial<RFNodeData>)?.individual?.id === request.id);
      if (!node) {
        if (++tries < 10) frame = requestAnimationFrame(attempt);
        return;
      }
      const { x, y, zoom } = getViewport();
      const { width: w, height: h } = size.current;
      const margin = 40;
      const nodeW = (node.width ?? NODE_SIZE) * zoom;
      const nodeH = (node.height ?? NODE_SIZE) * zoom;
      const left = node.position.x * zoom + x;
      const top = node.position.y * zoom + y;
      if (left >= margin && top >= margin && left + nodeW <= w - margin && top + nodeH <= h - margin) return;
      // Centre the node, as the user's eye goes to the middle of the canvas.
      void setViewport({ x: w / 2 - (node.position.x * zoom + nodeW / 2), y: h / 2 - (node.position.y * zoom + nodeH / 2), zoom }, { duration: 200 });
    };
    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
  }, [request, getNodes, getViewport, setViewport]);
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

  const { nodes: computedNodes, coupleEdges, sibshipEdges, duplicateEdges, assistedEdges } = useMemo(
    () => pedigree.individuals.length > 0
      ? layoutToFlow(pedigree, { compact })
      : { nodes: [], coupleEdges: [], sibshipEdges: [], duplicateEdges: [], assistedEdges: [] },
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

  const edges = [...duplicateEdges, ...coupleEdges, ...sibshipEdges, ...assistedEdges];

  // The chart title (#20) rides along as one more node, above the layout.
  const pedigreeName = useAppStore(s => s.activeTitle);
  const title = chartTitle(pedigree, pedigreeName);
  const titleNode = useMemo(
    () => chartTitleNode(title, computedNodes, highestConsanguinityLabel({ nodes: computedNodes, coupleEdges })),
    [title, computedNodes, coupleEdges],
  );
  const flowNodes = titleNode ? [...rfNodes, titleNode as unknown as Node<RFNodeData>] : rfNodes;
  const fitExpected = useMemo(
    () => titleNode ? [...computedNodes, titleNode as unknown as Node] : computedNodes,
    [computedNodes, titleNode],
  );

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
  // React Flow's pan and zoom stop mousedown from reaching the document, and
  // Radix takes a stopped outside click to mean the element handled it, so
  // an open toolbar popover (Filter, Problems, Export PED) stayed open on a
  // canvas click. Registering the canvas as a dismissable surface makes a
  // click anywhere on it close them, as it does on the sidebars.
  const dismissSurfaceRef = useDismissableLayerSurface();

  const closeContextMenuOutside = useCallback((e: React.SyntheticEvent) => {
    if (!(e.target as Element).closest?.("[data-context-menu]")) setContextMenu(null);
  }, []);

  return (
    <div
      ref={dismissSurfaceRef}
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
        <FilterBanner />
        <Background gap={dotGap} size={DOT_SIZE} offset={DOT_SIZE / 2 - dotGap / 2} />
        <FitOnLayoutChange compact={compact} expected={fitExpected} />
        <RevealOnRequest />
        <Controls />
        {showMinimap && (
          <PedigreeMinimap pedigree={pedigree} />
        )}
      </ReactFlow>
      <CanvasContextMenu target={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}
