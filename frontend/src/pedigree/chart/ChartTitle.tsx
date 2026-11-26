import { TITLE_FONT_SIZE } from "../labels";

/** The chart title, centred on `x` with its baseline at `y`. Placed by `chartTitlePlace` (labels.ts). */
export function ChartTitle({ title, x, y }: { title: string; x: number; y: number }) {
  return (
    <text
      x={x} y={y} textAnchor="middle"
      fontFamily="sans-serif" fontSize={TITLE_FONT_SIZE} fontWeight="bold" fill="black"
      style={{ userSelect: "none" }}
    >
      {title}
    </text>
  );
}
