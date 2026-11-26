import { CONSANGUINITY_LABEL_FONT_SIZE, consanguinityLabelBacking, consanguinityLabelBaselines, type ConsanguinityLabelOffset } from "../consanguinityLabel";

/**
 * The degree of relationship above a double couple line, centred on
 * cx over a line at height cy that rises `hop` px, moved by `offset` when
 * text above is in the way. The SVG exporter draws the same text at
 * the same place.
 */
export function ConsanguinityLabel({ cx, cy, hop, lines, offset }: { cx: number; cy: number; hop: number; lines: string[]; offset?: ConsanguinityLabelOffset }) {
  const baselines = consanguinityLabelBaselines(cy, hop, lines.length, offset?.dy ?? 0);
  const x = cx + (offset?.dx ?? 0);
  // On a dashed arc between two copies: the arc passes behind it.
  const b = offset?.backed ? consanguinityLabelBacking(x, baselines, lines) : null;
  return (
    <>
      {b && <rect x={b.x} y={b.y} width={b.width} height={b.height} fill="white" pointerEvents="none" />}
      {lines.map((line, i) => (
        <text
          key={i} data-consanguinity-label x={x} y={baselines[i]}
          textAnchor="middle" fontFamily="sans-serif" fontSize={CONSANGUINITY_LABEL_FONT_SIZE} fill="black"
          pointerEvents="none" style={{ userSelect: "none" }}
        >
          {line}
        </text>
      ))}
    </>
  );
}
