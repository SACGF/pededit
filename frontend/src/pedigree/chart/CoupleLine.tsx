import { coupleLineGeometry, type LinePosition } from "../lineGeometry";
import { segmentsPathD } from "../sibshipPath";
import type { CoupleLineData } from "../scene";
import { ChildlessMark } from "./ChildlessMark";
import { ConsanguinityLabel } from "./ConsanguinityLabel";

/**
 * A couple line between the partners centred at `left` and `right`: single
 * or double, its hop over partners in between, the childless and ended
 * marks and, on a double line, the text above it. Geometry from
 * `coupleLineGeometry`.
 */
export function CoupleLine({ data, double, left, right }: { data: CoupleLineData; double: boolean; left: LinePosition; right: LinePosition }) {
  const line = coupleLineGeometry(data, double, left, right);
  return (
    <>
      {line.paths.map((d, i) => <path key={i} d={d} stroke="black" strokeWidth={2} fill="none" />)}
      {line.childless && (
        <ChildlessMark cx={line.childless.cx} topY={line.childless.topY} status={line.childless.status} reason={line.childless.reason} />
      )}
      {double && data.consanguinityLabel && (
        <ConsanguinityLabel cx={line.cx} cy={line.cy} hop={line.hop} lines={data.consanguinityLabel} offset={data.consanguinityLabelOffset} />
      )}
      {line.ended && <path data-ended d={segmentsPathD(line.ended)} stroke="black" strokeWidth={2} fill="none" />}
    </>
  );
}
