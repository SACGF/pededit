import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { CoupleEdgeData } from "../sceneToFlow";
import { coupleLineGeometry } from "../lineGeometry";
import { CoupleLine, CoupleText } from "../chart/CoupleLine";

export type CoupleEdgeType = Edge<CoupleEdgeData, "coupleEdge">;
export type ConsanguineousEdgeType = Edge<CoupleEdgeData, "consanguineousEdge">;

/**
 * A couple line on the canvas: `CoupleLine` between the partners' live
 * positions, so it follows a drag, with a wide invisible stroke so the
 * 2px line can be right-clicked (#95).
 */
function CoupleLineEdge({ source, target, data, double }: { source: string; target: string; data?: CoupleEdgeData; double: boolean }) {
  const nodes = useNodes();
  const left = nodes.find(n => n.id === source)?.position;
  const right = nodes.find(n => n.id === target)?.position;
  if (!left || !right || !data) return null;
  return (
    <g data-partnership-id={data.partnershipId}>
      <path d={coupleLineGeometry(data, double, left, right).course} stroke="transparent" strokeWidth={12} fill="none" style={{ pointerEvents: "stroke" }} />
      <CoupleLine data={data} double={double} left={left} right={right} />
      {double && <CoupleText data={data} left={left} right={right} />}
    </g>
  );
}

export function CoupleEdge({ source, target, data }: EdgeProps<CoupleEdgeType>) {
  return <CoupleLineEdge source={source} target={target} data={data} double={false} />;
}

/** A double line: the couple are related. */
export function ConsanguineousEdge({ source, target, data }: EdgeProps<ConsanguineousEdgeType>) {
  return <CoupleLineEdge source={source} target={target} data={data} double />;
}
