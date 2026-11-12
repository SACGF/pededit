import type { Node, NodeProps } from "@xyflow/react";
import { NODE_SIZE } from "../constants";
import { TITLE_FONT_SIZE, TITLE_GAP, titleWidth } from "../labels";

/**
 * The chart title above the pedigree (#20). It is a React Flow node so that
 * it pans and zooms with the drawing and fit view keeps it in sight; it
 * cannot be selected or dragged and lets clicks through to the pane.
 */
export interface ChartTitleData extends Record<string, unknown> {
  title: string;
}

export type ChartTitleNodeType = Node<ChartTitleData, "chartTitle">;

export const CHART_TITLE_NODE_ID = "__chart-title";
const LINE_HEIGHT = TITLE_FONT_SIZE + 4;

/**
 * The title node centred over the symbols, its baseline TITLE_GAP (plus room
 * for a deceased slash) above the highest one, as in the SVG export.
 * `aboveTop` is the highest point of anything drawn over the symbols (the
 * consanguinity labels of #97); the title is raised to clear it.
 */
export function chartTitleNode(
  title: string,
  symbols: { position: { x: number; y: number } }[],
  aboveTop = Infinity,
): ChartTitleNodeType | null {
  if (!title || symbols.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const { position: { x, y } } of symbols) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y);
  }
  const width = Math.ceil(titleWidth(title)) + 8;
  // nodeOrigin is [0.5, 0.5], so the position is the box centre; the baseline
  // sits about a third of the font size below it.
  const top = Math.min(minY - NODE_SIZE / 2, aboveTop);
  const baseline = top - TITLE_GAP - 4;
  return {
    id: CHART_TITLE_NODE_ID,
    type: "chartTitle",
    position: { x: (minX + maxX) / 2, y: baseline - TITLE_FONT_SIZE / 3 },
    data: { title },
    width,
    height: LINE_HEIGHT,
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
        height: LINE_HEIGHT,
        lineHeight: `${LINE_HEIGHT}px`,
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
