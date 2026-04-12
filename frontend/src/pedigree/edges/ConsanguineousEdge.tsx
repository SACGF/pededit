import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../layoutToFlow";

export type ConsanguineousEdgeType = Edge<CoupleEdgeData, "consanguineousEdge">;

const GAP = 4; // px between the two lines

export function ConsanguineousEdge({
  sourceX, sourceY, targetX, targetY,
}: EdgeProps<ConsanguineousEdgeType>) {
  return (
    <g>
      <path
        d={`M ${sourceX} ${sourceY - GAP / 2} L ${targetX} ${targetY - GAP / 2}`}
        stroke="black" strokeWidth={2} fill="none"
      />
      <path
        d={`M ${sourceX} ${sourceY + GAP / 2} L ${targetX} ${targetY + GAP / 2}`}
        stroke="black" strokeWidth={2} fill="none"
      />
    </g>
  );
}
