import type { ChildlessStatus } from "@pedigree-editor/layout-engine";
import { childlessMarkSegments, childlessReasonBaselineY, CHILDLESS_REASON_FONT_SIZE } from "../childless";
import { segmentsPathD } from "../sibshipPath";

/**
 * Childless couple mark under a couple line, hung from (cx, topY), the line's
 * midpoint (raised when the line hops). Shared by CoupleEdge and
 * ConsanguineousEdge; the SVG exporter draws the same geometry.
 */
export function ChildlessMark({ cx, topY, status, reason }: {
  cx: number; topY: number; status: ChildlessStatus; reason?: string;
}) {
  return (
    <g data-childless={status}>
      <path d={segmentsPathD(childlessMarkSegments(cx, topY, status))} stroke="black" strokeWidth={2} fill="none" />
      {reason && (
        <text
          x={cx} y={childlessReasonBaselineY(topY)}
          textAnchor="middle" fontFamily="sans-serif" fontSize={CHILDLESS_REASON_FONT_SIZE} fill="black"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {reason}
        </text>
      )}
    </g>
  );
}
