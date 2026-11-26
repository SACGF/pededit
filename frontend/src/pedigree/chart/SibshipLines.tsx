import { sibshipLineGeometry, type SibshipEnd } from "../lineGeometry";
import { segmentsPathD } from "../sibshipPath";
import { ADOPTION_DASH } from "../adoption";
import { TWIN_QUESTION_FONT_SIZE } from "../twins";
import type { SibshipData } from "../scene";

/**
 * The lines from a couple to their children: the drop, the bar, a drop to
 * each child (dashed for one adopted in), and the twin marks
 * (`data-twin-mark`: they join nobody, which the export lint needs to know). `nodeAt`
 * gives each end by its slot id, or undefined when it is not drawn.
 */
export function SibshipLines({ data, nodeAt }: { data: SibshipData; nodeAt: (id: string) => SibshipEnd | undefined }) {
  const lines = sibshipLineGeometry(data, nodeAt);
  if (!lines) return null;
  const { solid, dashed, marks } = lines;
  return (
    <>
      <path d={segmentsPathD(solid)} stroke="black" strokeWidth={2} fill="none" />
      {dashed.length > 0 && (
        <path d={segmentsPathD(dashed)} stroke="black" strokeWidth={2} fill="none" strokeDasharray={ADOPTION_DASH} />
      )}
      {marks.map((m, i) => m.kind === "bar"
        ? <line key={i} data-twin-mark x1={m.segment[0]} y1={m.segment[1]} x2={m.segment[2]} y2={m.segment[3]} stroke="black" strokeWidth={2} />
        : (
          <text
            key={i} data-twin-mark x={m.x} y={m.y + TWIN_QUESTION_FONT_SIZE * 0.35}
            textAnchor="middle" fontFamily="sans-serif" fontSize={TWIN_QUESTION_FONT_SIZE} fontWeight="bold" fill="black"
            pointerEvents="none" style={{ userSelect: "none" }}
          >
            ?
          </text>
        ),
      )}
    </>
  );
}
