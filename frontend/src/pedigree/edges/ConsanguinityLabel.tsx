import { CONSANGUINITY_LABEL_FONT_SIZE, consanguinityLabelBaselines } from "../consanguinityLabel";

/**
 * The degree of relationship above a double couple line (#97), centred on
 * cx over a line at height cy that rises `hop` px. The SVG exporter draws
 * the same text at the same place.
 */
export function ConsanguinityLabel({ cx, cy, hop, lines }: { cx: number; cy: number; hop: number; lines: string[] }) {
  const baselines = consanguinityLabelBaselines(cy, hop, lines.length);
  return (
    <text
      data-consanguinity-label
      textAnchor="middle" fontFamily="sans-serif" fontSize={CONSANGUINITY_LABEL_FONT_SIZE} fill="black"
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {lines.map((line, i) => <tspan key={i} x={cx} y={baselines[i]}>{line}</tspan>)}
    </text>
  );
}
