import { ADOPTION_DASH } from "../adoption";
import { assistedEdgeSegment } from "../assisted";
import type { AssistedLineData, SceneLine } from "../scene";
import { LINE_WIDTH } from "../constants";

type NodeAt = Parameters<typeof assistedEdgeSegment>[1];

/**
 * A line of assisted reproduction: solid from the woman who carried the
 * child, dashed from a parent who is not genetic, to the child or to where
 * the sibship's line of descent meets the bar.
 */
export function AssistedLine({ line, nodeAt }: { line: Pick<SceneLine<AssistedLineData>, "source" | "target" | "data">; nodeAt: NodeAt }) {
  const seg = assistedEdgeSegment(line, nodeAt);
  if (!seg) return null;
  const [x1, y1, x2, y2] = seg;
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth={LINE_WIDTH}
      strokeDasharray={line.data.kind === "social" ? ADOPTION_DASH : undefined}
    />
  );
}
