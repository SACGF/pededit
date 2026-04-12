import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps, Node } from "@xyflow/react";
import type { SibshipEdgeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";

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
  const coupleX  = (leftParent.position.x + rightParent.position.x) / 2;
  const coupleY  = (leftParent.position.y + rightParent.position.y) / 2;
  const childY   = children[0].position.y;
  const sibBarY  = (coupleY + childY) / 2;
  const childXs  = children.map(c => c.position.x);

  // The bar must span from the couple-drop x to the outermost child x so that
  // the vertical from the couple always connects to the bar even when a child
  // cannot be perfectly centred (spacing-constraint displacement).
  const sibLeftX  = Math.min(coupleX, ...childXs);
  const sibRightX = Math.max(coupleX, ...childXs);

  // Child drops end at the top edge of the child symbol.
  const childTopY = childY - NODE_SIZE / 2;

  const pathSegments: string[] = [
    // 1. Vertical drop: couple midpoint → sibship bar
    `M ${coupleX} ${coupleY} L ${coupleX} ${sibBarY}`,
    // 2. Horizontal sibship bar: spans from couple-drop to outermost child
    `M ${sibLeftX} ${sibBarY} L ${sibRightX} ${sibBarY}`,
    // 3. Vertical drops: sibship bar → top of each child symbol
    ...childXs.map((cx: number) => `M ${cx} ${sibBarY} L ${cx} ${childTopY}`),
  ];

  return (
    <g>
      <path
        d={pathSegments.join(" ")}
        stroke="black"
        strokeWidth={2}
        fill="none"
      />
    </g>
  );
}
