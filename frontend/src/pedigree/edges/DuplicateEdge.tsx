import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { DuplicateEdgeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { duplicateArcD } from "../couplePath";

export type DuplicateEdgeType = Edge<DuplicateEdgeData, "duplicateEdge">;

/** Dashed arc between two copies of the same person (kinship2 convention). */
export function DuplicateEdge({ source, target, data }: EdgeProps<DuplicateEdgeType>) {
  const nodes = useNodes();
  const a = nodes.find(n => n.id === source);
  const b = nodes.find(n => n.id === target);
  if (!a || !b) return null;
  const half = NODE_SIZE / 2;
  return (
    <path
      d={duplicateArcD(a.position.x, a.position.y, b.position.x, b.position.y, data?.bulge ?? 28, half)}
      stroke="black"
      strokeWidth={1.5}
      strokeDasharray="6 4"
      fill="none"
    />
  );
}
