import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { consanguineousPathsD, couplePathD } from "../couplePath";
import { ChildlessMark } from "./ChildlessMark";
import { EndedMark } from "./EndedMark";
import { ConsanguinityLabel } from "./ConsanguinityLabel";

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

  const hop = data?.hopHeight ?? 0;
  const [outer, inner] = consanguineousPathsD(sx, sy, tx, ty, hop, GAP, data?.hopInset);

  return (
    <g data-partnership-id={data?.partnershipId}>
      {/* Wide invisible stroke so the line can be right-clicked (#95). */}
      <path d={couplePathD(sx, sy, tx, ty, hop, data?.hopInset)} stroke="transparent" strokeWidth={12} fill="none" style={{ pointerEvents: "stroke" }} />
      <path d={outer} stroke="black" strokeWidth={2} fill="none" />
      <path d={inner} stroke="black" strokeWidth={2} fill="none" />
      {data?.childless && (
        <ChildlessMark cx={(sx + tx) / 2} topY={(sy + ty) / 2 - hop + GAP / 2} status={data.childless} reason={data.childlessReason} />
      )}
      {data?.consanguinityLabel && (
        <ConsanguinityLabel cx={(sx + tx) / 2} cy={(sy + ty) / 2} hop={hop} lines={data.consanguinityLabel} offset={data.consanguinityLabelOffset} />
      )}
      {data?.ended && <EndedMark sx={sx} tx={tx} y={(sy + ty) / 2 - hop + (hop > 0 ? GAP / 2 : 0)} data={data} />}
    </g>
  );
}
