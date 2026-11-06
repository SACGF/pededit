import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps, Node } from "@xyflow/react";
import type { SibshipEdgeData } from "../layoutToFlow";
import { sibshipSegments, segmentsPathD } from "../sibshipPath";

export type SibshipEdgeType = Edge<SibshipEdgeData, "sibshipEdge">;

export function SibshipEdge({ data }: EdgeProps<SibshipEdgeType>) {
  const nodes = useNodes();
  if (!data) return null;

  const { leftParentId, rightParentId, childIds } = data;
  const leftParent  = nodes.find(n => n.id === leftParentId);
  const rightParent = nodes.find(n => n.id === rightParentId);
  const children    = (childIds ?? [])
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is Node => !!n);

  if (!leftParent || !rightParent || children.length === 0) return null;

  // Couple midpoint: horizontal centre of the couple line.
  const coupleX = (leftParent.position.x + rightParent.position.x) / 2;
  const coupleY = (leftParent.position.y + rightParent.position.y) / 2;
  const d = segmentsPathD(sibshipSegments(
    coupleX, coupleY, data.hopHeight ?? 0, children.map(c => c.position),
  ));

  return (
    <g>
      <path
        d={d}
        stroke="black"
        strokeWidth={2}
        fill="none"
      />
    </g>
  );
}
