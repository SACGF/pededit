import { coupleLineGeometry, type LinePosition } from "../lineGeometry";
import { segmentsPathD } from "../sibshipPath";
import type { CoupleLineData } from "../scene";
import { ChildlessMark } from "./ChildlessMark";
import { ConsanguinityLabel } from "./ConsanguinityLabel";

/**
 * A couple line between the partners centred at `left` and `right`: single
 * or double, its hop over partners in between, and the childless and ended
 * marks (`data-childless`, `data-ended`: they join nobody). Geometry from
 * `coupleLineGeometry`. The text above a double line is `CoupleText`.
 */
export function CoupleLine({ data, double, left, right }: { data: CoupleLineData; double: boolean; left: LinePosition; right: LinePosition }) {
  const line = coupleLineGeometry(data, double, left, right);
  return (
    <>
      {line.paths.map((d, i) => <path key={i} d={d} stroke="black" strokeWidth={2} fill="none" />)}
      {line.childless && (
        <ChildlessMark cx={line.childless.cx} topY={line.childless.topY} status={line.childless.status} reason={line.childless.reason} />
      )}
      {line.ended && <path data-ended d={segmentsPathD(line.ended)} stroke="black" strokeWidth={2} fill="none" />}
    </>
  );
}

/**
 * The text above a double couple line (the degree of relationship, #97),
 * where `buildScene` placed it. Nothing when the line has none.
 */
export function CoupleText({ data, left, right }: { data: CoupleLineData; left: LinePosition; right: LinePosition }) {
  if (!data.consanguinityLabel?.length) return null;
  const line = coupleLineGeometry(data, true, left, right);
  return <ConsanguinityLabel cx={line.cx} cy={line.cy} hop={line.hop} lines={data.consanguinityLabel} offset={data.consanguinityLabelOffset} />;
}
