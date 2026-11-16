import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { SibshipEdgeData, RFNodeData } from "../layoutToFlow";
import { sibshipLineGeometry } from "../lineGeometry";
import { segmentsPathD } from "../sibshipPath";
import { ADOPTION_DASH } from "../adoption";
import { TWIN_QUESTION_FONT_SIZE } from "../twins";

export type SibshipEdgeType = Edge<SibshipEdgeData, "sibshipEdge">;

export function SibshipEdge({ data }: EdgeProps<SibshipEdgeType>) {
  const nodes = useNodes();
  if (!data) return null;

  // Live node positions, so the lines follow a drag. The geometry is shared
  // with the SVG export (lineGeometry.ts, #143).
  const lines = sibshipLineGeometry(data, id => {
    const n = nodes.find(x => x.id === id);
    return n && { position: n.position, data: n.data as RFNodeData | undefined };
  });
  if (!lines) return null;
  const { solid, dashed, marks } = lines;

  return (
    <g>
      <path
        d={segmentsPathD(solid)}
        stroke="black"
        strokeWidth={2}
        fill="none"
      />
      {dashed.length > 0 && (
        <path d={segmentsPathD(dashed)} stroke="black" strokeWidth={2} fill="none" strokeDasharray={ADOPTION_DASH} />
      )}
      {marks.map((m, i) => m.kind === "bar"
        ? <line key={i} x1={m.segment[0]} y1={m.segment[1]} x2={m.segment[2]} y2={m.segment[3]} stroke="black" strokeWidth={2} />
        : <text key={i} x={m.x} y={m.y + TWIN_QUESTION_FONT_SIZE * 0.35} textAnchor="middle" fontFamily="sans-serif" fontSize={TWIN_QUESTION_FONT_SIZE} fontWeight="bold" fill="black" style={{ pointerEvents: "none", userSelect: "none" }}>?</text>,
      )}
    </g>
  );
}
