import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";

export type CoupleEdgeType = Edge<CoupleEdgeData, "coupleEdge">;

export function CoupleEdge({ source, target }: EdgeProps<CoupleEdgeType>) {
  const nodes = useNodes();
  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);
  if (!sourceNode || !targetNode) return null;

  const half = NODE_SIZE / 2;
  const sx = sourceNode.position.x + half;
  const sy = sourceNode.position.y;
  const tx = targetNode.position.x - half;
  const ty = targetNode.position.y;

  return (
    <g>
      <path
        d={`M ${sx} ${sy} L ${tx} ${ty}`}
        stroke="black"
        strokeWidth={2}
        fill="none"
      />
    </g>
  );
}
