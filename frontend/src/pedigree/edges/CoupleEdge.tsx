import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { couplePathD } from "../couplePath";
import { ChildlessMark } from "./ChildlessMark";

export type CoupleEdgeType = Edge<CoupleEdgeData, "coupleEdge">;

export function CoupleEdge({ source, target, data }: EdgeProps<CoupleEdgeType>) {
  const nodes = useNodes();
  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);
  if (!sourceNode || !targetNode) return null;

  const half = NODE_SIZE / 2;
  const sx = sourceNode.position.x + half;
  const sy = sourceNode.position.y;
  const tx = targetNode.position.x - half;
  const ty = targetNode.position.y;

  const hop = data?.hopHeight ?? 0;
  return (
    <g>
      <path
        d={couplePathD(sx, sy, tx, ty, hop, data?.hopInset)}
        stroke="black"
        strokeWidth={2}
        fill="none"
      />
      {data?.childless && (
        <ChildlessMark cx={(sx + tx) / 2} topY={(sy + ty) / 2 - hop} status={data.childless} reason={data.childlessReason} />
      )}
    </g>
  );
}
