import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { DuplicateEdgeData } from "../sceneToFlow";
import { DuplicateArc } from "../chart/DuplicateArc";

export type DuplicateEdgeType = Edge<DuplicateEdgeData, "duplicateEdge">;

/** Dashed arc between two copies of the same person, at the live node positions. */
export function DuplicateEdge({ source, target, data }: EdgeProps<DuplicateEdgeType>) {
  const nodes = useNodes();
  const a = nodes.find(n => n.id === source)?.position;
  const b = nodes.find(n => n.id === target)?.position;
  if (!a || !b || !data) return null;
  return <DuplicateArc a={a} b={b} data={data} />;
}
