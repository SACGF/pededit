import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { SibshipEdgeData, RFNodeData } from "../sceneToFlow";
import { SibshipLines } from "../chart/SibshipLines";

export type SibshipEdgeType = Edge<SibshipEdgeData, "sibshipEdge">;

/** The lines from a couple to their children, at the live node positions so they follow a drag. */
export function SibshipEdge({ data }: EdgeProps<SibshipEdgeType>) {
  const nodes = useNodes();
  if (!data) return null;
  return (
    <SibshipLines data={data} nodeAt={id => {
      const n = nodes.find(x => x.id === id);
      return n && { position: n.position, ...(n.data as RFNodeData | undefined) };
    }} />
  );
}
