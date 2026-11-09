import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps, Node } from "@xyflow/react";
import type { SibshipEdgeData, RFNodeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { symbolTopInset } from "../lifeStatus";
import { sibshipPaths, segmentsPathD } from "../sibshipPath";
import { ADOPTION_DASH } from "../adoption";

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
  // Drops end at the top of each child symbol, or at a loss triangle's apex.
  // An adopted-in child's drop is dashed (#12).
  const { solid, dashed } = sibshipPaths(
    coupleX, coupleY, data.hopHeight ?? 0,
    children.map(c => {
      const ind = (c.data as RFNodeData | undefined)?.individual;
      return { ...c.position, topInset: symbolTopInset(ind?.lifeStatus, NODE_SIZE), dashed: ind?.adopted === "in" };
    }),
  );

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
    </g>
  );
}
