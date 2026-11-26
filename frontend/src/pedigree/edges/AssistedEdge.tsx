import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { AssistedEdgeData, RFNodeData } from "../sceneToFlow";
import { AssistedLine } from "../chart/AssistedLine";

export type AssistedEdgeType = Edge<AssistedEdgeData, "assistedEdge">;

/** A line of assisted reproduction, at the live node positions. */
export function AssistedEdge({ source, target, data }: EdgeProps<AssistedEdgeType>) {
  const nodes = useNodes();
  if (!data) return null;
  return (
    <g data-assisted={data.kind}>
      <AssistedLine line={{ source, target, data }} nodeAt={id => {
        const n = nodes.find(x => x.id === id);
        return n && { position: n.position, glyph: (n.data as RFNodeData | undefined)?.glyph };
      }} />
    </g>
  );
}
