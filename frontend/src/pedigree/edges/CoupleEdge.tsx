import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../layoutToFlow";
import { coupleLineGeometry } from "../lineGeometry";
import { segmentsPathD } from "../sibshipPath";
import { ChildlessMark } from "./ChildlessMark";

export type CoupleEdgeType = Edge<CoupleEdgeData, "coupleEdge">;

export function CoupleEdge({ source, target, data }: EdgeProps<CoupleEdgeType>) {
  const nodes = useNodes();
  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);
  if (!sourceNode || !targetNode) return null;

  // The geometry is shared with the SVG export (lineGeometry.ts).
  const line = coupleLineGeometry(data, false, sourceNode.position, targetNode.position);
  return (
    <g data-partnership-id={data?.partnershipId}>
      {/* Wide invisible stroke so the line can be right-clicked. */}
      <path d={line.course} stroke="transparent" strokeWidth={12} fill="none" style={{ pointerEvents: "stroke" }} />
      <path
        d={line.paths[0]}
        stroke="black"
        strokeWidth={2}
        fill="none"
      />
      {line.childless && (
        <ChildlessMark cx={line.childless.cx} topY={line.childless.topY} status={line.childless.status} reason={line.childless.reason} />
      )}
      {line.ended && <path data-ended d={segmentsPathD(line.ended)} stroke="black" strokeWidth={2} fill="none" />}
    </g>
  );
}
