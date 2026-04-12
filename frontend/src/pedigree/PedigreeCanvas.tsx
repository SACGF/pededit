import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { layoutToFlow } from "./layoutToFlow";
import { PedigreeSymbolNode } from "./nodes/PedigreeSymbolNode";
import { CoupleEdge }         from "./edges/CoupleEdge";
import { ConsanguineousEdge } from "./edges/ConsanguineousEdge";
import { SibshipEdge }        from "./edges/SibshipEdge";

const nodeTypes: NodeTypes = { pedigreeSymbol: PedigreeSymbolNode };

const edgeTypes: EdgeTypes = {
  coupleEdge:         CoupleEdge,
  consanguineousEdge: ConsanguineousEdge,
  sibshipEdge:        SibshipEdge,
};

// Tool → sex mapping
const ADD_TOOLS = { addMale: "male", addFemale: "female", addUnknown: "unknown" } as const;

export function PedigreeCanvas() {
  const { pedigree, activeTool, addIndividual, setSelectedId } = usePedigreeStore();

  // Re-derive layout whenever pedigree data changes
  const { nodes, coupleEdges, sibshipEdges } = useMemo(
    () => pedigree.individuals.length > 0
      ? layoutToFlow(pedigree)
      : { nodes: [], coupleEdges: [], sibshipEdges: [] },
    [pedigree],
  );
  const edges = [...coupleEdges, ...sibshipEdges];

  const handlePaneClick = useCallback(() => {
    // Deselect on bare canvas click
    setSelectedId(null);

    // Add individual if in an add-tool mode
    if (activeTool in ADD_TOOLS) {
      const sex = ADD_TOOLS[activeTool as keyof typeof ADD_TOOLS];
      addIndividual(sex);
      // Stay in add mode — user can switch to select when done
    }
  }, [activeTool, addIndividual, setSelectedId]);

  const cursor =
    activeTool === "select" ? "default" : "crosshair";

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", cursor }}>
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
        nodeOrigin={[0.5, 0.5]}
        nodesDraggable={false}    // Phase 6
        nodesConnectable={false}
        fitView
        onPaneClick={handlePaneClick}
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
              {activeTool === "select"
                ? "Select a tool above to add individuals"
                : "Click to place an individual"}
            </span>
          </div>
        )}
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
