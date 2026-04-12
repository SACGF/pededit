import type { Edge, EdgeProps } from "@xyflow/react";
import type { SibshipEdgeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";

export type SibshipEdgeType = Edge<SibshipEdgeData, "sibshipEdge">;

export function SibshipEdge({ data }: EdgeProps<SibshipEdgeType>) {
  if (!data) return null;
  const { coupleX, coupleY, sibBarY, childXs, childY } = data;

  if (!childXs || childXs.length === 0) return null;

  const sibLeftX  = Math.min(...childXs);
  const sibRightX = Math.max(...childXs);

  // Child drops end at the top edge of the child symbol.
  const childTopY = childY - NODE_SIZE / 2;

  const pathSegments: string[] = [
    // 1. Vertical drop: couple midpoint → sibship bar
    `M ${coupleX} ${coupleY} L ${coupleX} ${sibBarY}`,
    // 2. Horizontal sibship bar: leftmost child → rightmost child
    `M ${sibLeftX} ${sibBarY} L ${sibRightX} ${sibBarY}`,
    // 3. Vertical drops: sibship bar → top of each child symbol
    ...childXs.map((cx: number) => `M ${cx} ${sibBarY} L ${cx} ${childTopY}`),
  ];

  return (
    <g>
      <path
        d={pathSegments.join(" ")}
        stroke="black"
        strokeWidth={2}
        fill="none"
      />
    </g>
  );
}
