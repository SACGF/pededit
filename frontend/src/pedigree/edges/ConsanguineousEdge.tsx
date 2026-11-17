import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../layoutToFlow";
import { coupleLineGeometry } from "../lineGeometry";
import { segmentsPathD } from "../sibshipPath";
import { ChildlessMark } from "./ChildlessMark";
import { ConsanguinityLabel } from "./ConsanguinityLabel";

export type ConsanguineousEdgeType = Edge<CoupleEdgeData, "consanguineousEdge">;

export function ConsanguineousEdge({ source, target, data }: EdgeProps<ConsanguineousEdgeType>) {
  const nodes = useNodes();
  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);
  if (!sourceNode || !targetNode) return null;

  // The geometry is shared with the SVG export (lineGeometry.ts).
  const line = coupleLineGeometry(data, true, sourceNode.position, targetNode.position);
  const [outer, inner] = line.paths;

  return (
    <g data-partnership-id={data?.partnershipId}>
      {/* Wide invisible stroke so the line can be right-clicked. */}
      <path d={line.course} stroke="transparent" strokeWidth={12} fill="none" style={{ pointerEvents: "stroke" }} />
      <path d={outer} stroke="black" strokeWidth={2} fill="none" />
      <path d={inner} stroke="black" strokeWidth={2} fill="none" />
      {line.childless && (
        <ChildlessMark cx={line.childless.cx} topY={line.childless.topY} status={line.childless.status} reason={line.childless.reason} />
      )}
      {data?.consanguinityLabel && (
        <ConsanguinityLabel cx={line.cx} cy={line.cy} hop={line.hop} lines={data.consanguinityLabel} offset={data.consanguinityLabelOffset} />
      )}
      {line.ended && <path data-ended d={segmentsPathD(line.ended)} stroke="black" strokeWidth={2} fill="none" />}
    </g>
  );
}
