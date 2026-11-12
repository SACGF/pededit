import { useNodes } from "@xyflow/react";
import type { Edge, EdgeProps, Node } from "@xyflow/react";
import type { SibshipEdgeData, RFNodeData } from "../layoutToFlow";
import { NODE_SIZE } from "../constants";
import { symbolTopInset } from "../lifeStatus";
import { sibshipPaths, segmentsPathD, twinForkMarks } from "../sibshipPath";
import { ADOPTION_DASH } from "../adoption";
import { TWIN_QUESTION_FONT_SIZE } from "../twins";

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
  const kids = children.map(c => {
    const d = c.data as RFNodeData | undefined;
    const ind = d?.individual;
    return {
      ...c.position,
      topInset: symbolTopInset(ind?.lifeStatus, NODE_SIZE),
      dashed: ind?.adopted === "in",
      twinSet: d?.twinSet,
      zygosity: d?.zygosity,
    };
  });
  // The bar's offset (#80) comes from the layout, so it is as of the last
  // layout while a node is being dragged.
  const barOffset = data.barOffset ?? 0;
  // Parents who are not a couple (gamete donation, #45): a line from each.
  const sexOf = (n: Node) => { const d = n.data as RFNodeData | undefined; return d?.shape ?? d?.individual?.sex; };
  const apart = data.apart
    ? [{ ...leftParent.position, sex: sexOf(leftParent) }, { ...rightParent.position, sex: sexOf(rightParent) }]
    : undefined;
  const { solid, dashed } = sibshipPaths(coupleX, coupleY, data.hopHeight ?? 0, kids, barOffset, apart, data.converge);
  // Twin forks (#11): a bar across monozygotic drops, "?" between unknown ones.
  const marks = twinForkMarks(coupleY, kids, barOffset);

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
