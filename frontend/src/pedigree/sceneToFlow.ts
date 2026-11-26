import type { Node, Edge } from "@xyflow/react";
import { NODE_SIZE } from "./constants";
import type { AssistedLineData, CoupleLineData, DuplicateArcData, Scene, ScenePerson, SibshipData } from "./scene";

/**
 * The canvas's view of a scene: React Flow nodes and edges. React Flow
 * draws, drags and selects them; what they draw is the scene's.
 */

/** What a canvas node carries: the person as the scene has them, less what React Flow holds itself. */
export type RFNodeData = Omit<ScenePerson, "id" | "position" | "draggable">;
export type CoupleEdgeData = CoupleLineData;
export type SibshipEdgeData = SibshipData;
export type AssistedEdgeData = AssistedLineData;
export type DuplicateEdgeData = DuplicateArcData;

export interface FlowData {
  nodes: Node<RFNodeData>[];
  coupleEdges: Edge<CoupleEdgeData>[];
  sibshipEdges: Edge<SibshipEdgeData>[];
  duplicateEdges: Edge<DuplicateEdgeData>[];
  assistedEdges: Edge<AssistedEdgeData>[];
}

/** React Flow nodes (positions are centres: the canvas sets `nodeOrigin` to [0.5, 0.5]) and edges for a scene. */
export function sceneToFlow(scene: Scene): FlowData {
  return {
    nodes: scene.people.map(({ id, position, draggable, ...data }) => ({
      id,
      type: data.branch ? "collapsedBranch" : "pedigreeSymbol",
      position,
      draggable,
      // Not selectable or draggable, so React Flow would turn its pointer
      // events off; the group symbol is clicked to show the branch again.
      ...(data.branch ? { selectable: false, style: { pointerEvents: "all" as const } } : {}),
      width: NODE_SIZE,
      height: NODE_SIZE,
      data,
    })),
    coupleEdges: scene.couples.map(({ double, ...e }) => ({
      ...e,
      sourceHandle: "couple-out", // right edge of the left partner
      targetHandle: "couple-in",  // left edge of the right partner
      type: double ? "consanguineousEdge" : "coupleEdge",
    })),
    sibshipEdges: scene.sibships.map(e => ({ ...e, sourceHandle: "sibship-out", targetHandle: "sibship-in", type: "sibshipEdge" })),
    duplicateEdges: scene.duplicates.map(e => ({ ...e, type: "duplicateEdge" })),
    assistedEdges: scene.assisted.map(e => ({ ...e, type: "assistedEdge" })),
  };
}
