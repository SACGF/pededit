import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../layoutToFlow";

export type CoupleEdgeType = Edge<CoupleEdgeData, "coupleEdge">;

export function CoupleEdge({
  sourceX, sourceY, targetX, targetY,
}: EdgeProps<CoupleEdgeType>) {
  return (
    <g>
      <path
        d={`M ${sourceX} ${sourceY} L ${targetX} ${targetY}`}
        stroke="black"
        strokeWidth={2}
        fill="none"
      />
    </g>
  );
}
