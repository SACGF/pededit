import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { consanguineousPathsD } from "../couplePath";

export type ConsanguineousEdgeType = Edge<CoupleEdgeData, "consanguineousEdge">;

const GAP = 4; // px between the two lines

export function ConsanguineousEdge({ source, target, data }: EdgeProps<ConsanguineousEdgeType>) {
  const nodes = useNodes();
  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);
  if (!sourceNode || !targetNode) return null;

  const half = NODE_SIZE / 2;
  const sx = sourceNode.position.x + half;
  const sy = sourceNode.position.y;
  const tx = targetNode.position.x - half;
  const ty = targetNode.position.y;

  const [outer, inner] = consanguineousPathsD(sx, sy, tx, ty, data?.hopHeight ?? 0, GAP, data?.hopInset);

  return (
    <g>
      <path d={outer} stroke="black" strokeWidth={2} fill="none" />
      <path d={inner} stroke="black" strokeWidth={2} fill="none" />
    </g>
  );
}
