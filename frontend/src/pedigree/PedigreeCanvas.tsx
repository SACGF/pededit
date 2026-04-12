import { useMemo, useCallback, useState, useEffect } from "react";
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
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { layoutToFlow } from "./layoutToFlow";
import { PedigreeSymbolNode } from "./nodes/PedigreeSymbolNode";
import { CoupleEdge }         from "./edges/CoupleEdge";
import { ConsanguineousEdge } from "./edges/ConsanguineousEdge";
import { SibshipEdge }        from "./edges/SibshipEdge";
import type { RFNodeData, SibshipEdgeData, CoupleEdgeData } from "./layoutToFlow";
import { NODE_SIZE } from "./constants";

const nodeTypes: NodeTypes = { pedigreeSymbol: PedigreeSymbolNode };

const edgeTypes: EdgeTypes = {
  coupleEdge:         CoupleEdge,
  consanguineousEdge: ConsanguineousEdge,
  sibshipEdge:        SibshipEdge,
};

// ── Custom minimap ─────────────────────────────────────────────────────────────
// Renders a fixed-size SVG that always fits all content (no zoom/pan).

const MINI_W   = 180;
const MINI_H   = 120;
const MINI_PAD = 8;

interface PedigreeMinimapProps {
  nodes:        Node<RFNodeData>[];
  coupleEdges:  Edge<CoupleEdgeData>[];
  sibshipEdges: Edge<SibshipEdgeData>[];
}

function PedigreeMinimap({ nodes, coupleEdges, sibshipEdges }: PedigreeMinimapProps) {
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
  const ms  = (s: number)  => s * scale;

  const nodePos = new Map(nodes.map(n => [n.id, n.position]));

  return (
    <Panel position="bottom-right" style={{ margin: 0, lineHeight: 0 }}>
      <svg
        width={MINI_W}
        height={MINI_H}
        style={{ display: "block", background: "white", border: "1px solid #d1d5db" }}
      >
        {/* Sibship edges — drawn first so nodes render on top */}
        {sibshipEdges.map(edge => {
          const data = edge.data as SibshipEdgeData;
          if (!data?.childXs?.length) return null;
          const sibLeftX  = Math.min(data.coupleX, ...data.childXs);
          const sibRightX = Math.max(data.coupleX, ...data.childXs);
          const childTopY = data.childY - half;
          const d = [
            `M ${mx(data.coupleX)} ${my(data.coupleY)} L ${mx(data.coupleX)} ${my(data.sibBarY)}`,
            `M ${mx(sibLeftX)} ${my(data.sibBarY)} L ${mx(sibRightX)} ${my(data.sibBarY)}`,
            ...data.childXs.map(cx => `M ${mx(cx)} ${my(data.sibBarY)} L ${mx(cx)} ${my(childTopY)}`),
          ].join(" ");
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
          if (edge.type === "consanguineousEdge") {
            return (
              <g key={edge.id}>
                <line x1={lx} y1={ey - 1.5} x2={rx} y2={ey - 1.5} stroke="black" strokeWidth={1} />
                <line x1={lx} y1={ey + 1.5} x2={rx} y2={ey + 1.5} stroke="black" strokeWidth={1} />
              </g>
            );
          }
          return <line key={edge.id} x1={lx} y1={ey} x2={rx} y2={ey} stroke="black" strokeWidth={1} />;
        })}

        {/* Nodes — rendered on top of edges */}
        {nodes.map(node => {
          const { x, y }   = node.position;
          const { individual } = node.data as RFNodeData;
          const sz   = ms(NODE_SIZE);
          const nx   = mx(x - half);
          const ny   = my(y - half);
          const ncx  = nx + sz / 2;
          const ncy  = ny + sz / 2;
          const fill = individual.affected ? "black" : "white";
          const sp   = { stroke: "black", strokeWidth: 1, vectorEffect: "non-scaling-stroke" } as const;

          if (individual.sex === "male") {
            return <rect key={node.id} x={nx} y={ny} width={sz} height={sz} fill={fill} {...sp} />;
          }
          if (individual.sex === "female") {
            return <circle key={node.id} cx={ncx} cy={ncy} r={sz / 2} fill={fill} {...sp} />;
          }
          return (
            <polygon
              key={node.id}
              points={`${ncx},${ny} ${nx + sz},${ncy} ${ncx},${ny + sz} ${nx},${ncy}`}
              fill={fill} {...sp}
            />
          );
        })}
      </svg>
    </Panel>
  );
}

// ── Canvas ─────────────────────────────────────────────────────────────────────

interface PedigreeCanvasProps {
  showMinimap?: boolean;
}

export function PedigreeCanvas({ showMinimap = false }: PedigreeCanvasProps) {
  const { pedigree, setSelectedId, pinIndividual } = usePedigreeStore();

  const { nodes: computedNodes, coupleEdges, sibshipEdges } = useMemo(
    () => pedigree.individuals.length > 0
      ? layoutToFlow(pedigree)
      : { nodes: [], coupleEdges: [], sibshipEdges: [] },
    [pedigree],
  );

  // Local node state so React Flow can track positions during drag.
  // Synced from computedNodes whenever the store changes (structure edits,
  // undo/redo, pin commits) — but not on intermediate drag moves.
  const [rfNodes, setRfNodes] = useState<Node<RFNodeData>[]>(computedNodes);
  useEffect(() => {
    setRfNodes(computedNodes);
  }, [computedNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<RFNodeData>>[]) => {
      setRfNodes(prev => applyNodeChanges(changes, prev));
    },
    [],
  );

  const edges = [...coupleEdges, ...sibshipEdges];

  const handlePaneClick = useCallback(() => {
    setSelectedId(null);
  }, [setSelectedId]);

  const handleNodeDragStop: NodeMouseHandler<Node<RFNodeData>> = useCallback(
    (_event, node) => {
      pinIndividual(node.data.individual.id, node.position);
    },
    [pinIndividual],
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <marker id="proband-arrowhead" markerWidth="6" markerHeight="6"
                  refX="6" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="black" />
          </marker>
        </defs>
      </svg>

      <ReactFlow
        nodes={rfNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeOrigin={[0.5, 0.5]}
        nodesDraggable={true}
        nodesConnectable={false}
        onNodesChange={onNodesChange}
        fitView
        onPaneClick={handlePaneClick}
        onNodeDragStop={handleNodeDragStop}
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
        <Background />
        <Controls />
        {showMinimap && (
          <PedigreeMinimap
            nodes={rfNodes as Node<RFNodeData>[]}
            coupleEdges={coupleEdges as Edge<CoupleEdgeData>[]}
            sibshipEdges={sibshipEdges as Edge<SibshipEdgeData>[]}
          />
        )}
      </ReactFlow>
    </div>
  );
}
