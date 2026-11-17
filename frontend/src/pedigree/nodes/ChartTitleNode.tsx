import type { Node, NodeProps } from "@xyflow/react";
import { NODE_SIZE } from "../constants";
import { TITLE_FONT_SIZE, TITLE_LINE_HEIGHT, chartTitlePlace } from "../labels";

/**
 * The chart title above the pedigree. It is a React Flow node so that
 * it pans and zooms with the drawing and fit view keeps it in sight; it
 * cannot be selected or dragged and lets clicks through to the pane.
 */
export interface ChartTitleData extends Record<string, unknown> {
  title: string;
}

export type ChartTitleNodeType = Node<ChartTitleData, "chartTitle">;

export const CHART_TITLE_NODE_ID = "__chart-title";

/**
 * The title node centred over the symbols, its baseline TITLE_GAP (plus room
 * for a deceased slash) above the highest one, as in the SVG export.
 * `aboveTop` is the highest point of anything drawn over the symbols
 * (`highestAboveSymbols`: the consanguinity labels and the dashed
 * arcs between two copies of someone); the title is raised to clear it.
 */
export function chartTitleNode(
  title: string,
  symbols: { position: { x: number; y: number } }[],
  aboveTop = Infinity,
): ChartTitleNodeType | null {
  // nodeOrigin is [0.5, 0.5], so the position is the box centre.
  const place = chartTitlePlace(title, symbols, NODE_SIZE / 2, aboveTop);
  if (!place) return null;
  return {
    id: CHART_TITLE_NODE_ID,
    type: "chartTitle",
    position: { x: place.x, y: place.y },
    data: { title },
    width: place.width,
    height: place.height,
    selectable: false,
    draggable: false,
    connectable: false,
    focusable: false,
    style: { pointerEvents: "none" },
  };
}

export function ChartTitleNode({ data }: NodeProps<ChartTitleNodeType>) {
  return (
    <div
      data-chart-title
      style={{
        width: "100%",
        height: TITLE_LINE_HEIGHT,
        lineHeight: `${TITLE_LINE_HEIGHT}px`,
        textAlign: "center",
        whiteSpace: "nowrap",
        fontSize: TITLE_FONT_SIZE,
        fontWeight: 700,
        color: "#000",
        display: "flex",
        justifyContent: "center",
      }}
    >
      {data.title}
    </div>
  );
}
