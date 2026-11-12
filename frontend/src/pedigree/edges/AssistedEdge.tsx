import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { AssistedEdgeData, RFNodeData } from "../layoutToFlow";
import { assistedEdgeSegment } from "../assisted";
import { ADOPTION_DASH } from "../adoption";

export type AssistedEdgeType = Edge<AssistedEdgeData, "assistedEdge">;

/**
 * Assisted reproduction (#45): a solid line from the woman who carried the
 * child, or a dashed one from a parent who is not genetic, to the child or
 * to where the sibship's line of descent meets the bar.
 */
export function AssistedEdge({ source, target, data }: EdgeProps<AssistedEdgeType>) {
  const nodes = useNodes();
  const seg = assistedEdgeSegment({ source, target, data }, id => {
    const n = nodes.find(x => x.id === id);
    const d = n?.data as RFNodeData | undefined;
    return n && { position: n.position, individual: d?.individual, shape: d?.shape };
  });
  if (!seg) return null;
  const [x1, y1, x2, y2] = seg;
  return (
    <line
      data-assisted={data?.kind}
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="black"
      strokeWidth={2}
      strokeDasharray={data?.kind === "social" ? ADOPTION_DASH : undefined}
    />
  );
}
