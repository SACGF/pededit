import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { layoutToFlow } from "./layoutToFlow";
import { PedigreeSymbolNode } from "./nodes/PedigreeSymbolNode";
import { CoupleEdge }         from "./edges/CoupleEdge";
import { ConsanguineousEdge } from "./edges/ConsanguineousEdge";
import { SibshipEdge }        from "./edges/SibshipEdge";

const nodeTypes: NodeTypes = {
  pedigreeSymbol: PedigreeSymbolNode,
};

const edgeTypes: EdgeTypes = {
  coupleEdge:         CoupleEdge,
  consanguineousEdge: ConsanguineousEdge,
  sibshipEdge:        SibshipEdge,
};

interface PedigreeCanvasProps {
  pedigree: Pedigree;
}

export function PedigreeCanvas({ pedigree }: PedigreeCanvasProps) {
  const { nodes, coupleEdges, sibshipEdges } = useMemo(
    () => layoutToFlow(pedigree),
    [pedigree],
  );
  const edges = [...coupleEdges, ...sibshipEdges];

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Global SVG defs — proband arrowhead marker, registered once */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <marker id="proband-arrowhead" markerWidth="6" markerHeight="6"
                  refX="6" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="black" />
          </marker>
        </defs>
      </svg>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeOrigin={[0.5, 0.5]}   // node position = centre of symbol
        nodesDraggable={false}     // read-only for now
        nodesConnectable={false}   // read-only
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
