import { NODE_SIZE } from "../constants";
import { duplicateArcD } from "../duplicateArc";
import type { DuplicateArcData } from "../scene";
import type { LinePosition } from "../lineGeometry";

/** The dashed arc between two copies of the same person (kinship2's `arcconnect`), from `a` to `b`. */
export function DuplicateArc({ a, b, data }: { a: LinePosition; b: LinePosition; data: DuplicateArcData }) {
  return (
    <path
      d={duplicateArcD(a.x, a.y, b.x, b.y, data.bulge, NODE_SIZE / 2, data.legDx)}
      stroke="black" strokeWidth={1.5} strokeDasharray="6 4" fill="none"
    />
  );
}
