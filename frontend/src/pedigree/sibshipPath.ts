import { NODE_SIZE } from "./constants";

/** A straight line segment [x1, y1, x2, y2]. */
export type Segment = [number, number, number, number];

/**
 * Lines joining a couple to their children, shared by `SibshipEdge`, the
 * minimap and `svgExporter`. Framework-free.
 *
 * The sibship bar sits halfway between the couple line and the highest child
 * row. Each child gets its own drop to its own symbol, so a child pinned
 * above or below its siblings' row is still reached. The bar spans from the
 * couple drop to the outermost child so the two always meet.
 *
 * `topInset` is how far below the top of the symbol box the symbol starts:
 * a loss triangle's apex sits lower than a square's top edge (#13).
 *
 * The result is the couple drop, the bar, then one drop per child in input
 * order; `sibshipPaths` splits off the drops of adopted-in children (#12),
 * which are drawn dashed.
 */
export interface SibshipChild {
  x: number;
  y: number;
  topInset?: number;
  dashed?: boolean;
  /** Key of the twin set this child is in (#11): members share one fork from the bar. */
  twinSet?: string;
  zygosity?: "monozygotic" | "dizygotic" | "unknown";
}

/** x where a twin set's fork meets the bar: the mean of the members' x. */
function forkXs(children: SibshipChild[]): Map<string, number> {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const c of children) {
    if (!c.twinSet) continue;
    const e = sums.get(c.twinSet) ?? { sum: 0, n: 0 };
    e.sum += c.x; e.n++;
    sums.set(c.twinSet, e);
  }
  return new Map([...sums].map(([k, e]) => [k, e.n >= 2 ? e.sum / e.n : NaN]).filter(([, x]) => !Number.isNaN(x)) as [string, number][]);
}

export function sibshipSegments(
  coupleX: number,
  coupleY: number,
  hopHeight: number,
  children: SibshipChild[],
): Segment[] {
  if (children.length === 0) return [];
  const half = NODE_SIZE / 2;
  const childRowY = Math.min(...children.map(c => c.y));
  const sibBarY = (coupleY + childRowY) / 2;
  const xs = children.map(c => c.x);
  const segs: Segment[] = [
    // Drop from the couple line (raised when it hops) to the bar.
    [coupleX, coupleY - hopHeight, coupleX, sibBarY],
    [Math.min(coupleX, ...xs), sibBarY, Math.max(coupleX, ...xs), sibBarY],
  ];
  const forks = forkXs(children);
  for (const c of children) {
    // To the top of the symbol, or its bottom if it was dragged above the bar.
    const top = c.y - half + (c.topInset ?? 0);
    const end = top >= sibBarY ? top : c.y + half;
    // Twins: every member's drop starts at the set's shared point on the bar.
    const fromX = c.twinSet !== undefined ? (forks.get(c.twinSet) ?? c.x) : c.x;
    segs.push([fromX, sibBarY, c.x, end]);
  }
  return segs;
}

/** A twin fork's marks: bars across adjacent monozygotic drops, "?" between unknown ones. */
export interface TwinMark { kind: "bar"; segment: Segment } 
export interface TwinQuestion { kind: "question"; x: number; y: number }

/**
 * Marks drawn on twin forks (#11), as R's plot.pedigree does: for each pair
 * of neighbouring members, the points halfway down their two drops are joined
 * by a bar (monozygotic) or get a "?" between them (unknown zygosity).
 */
export function twinForkMarks(
  coupleY: number,
  children: SibshipChild[],
): (TwinMark | TwinQuestion)[] {
  const out: (TwinMark | TwinQuestion)[] = [];
  const half = NODE_SIZE / 2;
  const childRowY = Math.min(...children.map(c => c.y));
  const sibBarY = (coupleY + childRowY) / 2;
  const forks = forkXs(children);
  const bySet = new Map<string, SibshipChild[]>();
  for (const c of children) {
    if (c.twinSet === undefined || !forks.has(c.twinSet)) continue;
    if (!bySet.has(c.twinSet)) bySet.set(c.twinSet, []);
    bySet.get(c.twinSet)!.push(c);
  }
  for (const [key, members] of bySet) {
    const z = members[0]!.zygosity;
    if (z !== "monozygotic" && z !== "unknown") continue;
    const fx = forks.get(key)!;
    const sorted = [...members].sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]!, b = sorted[i + 1]!;
      const mid = (c: SibshipChild) => {
        const top = c.y - half + (c.topInset ?? 0);
        return { x: (fx + c.x) / 2, y: (sibBarY + top) / 2 };
      };
      const pa = mid(a), pb = mid(b);
      if (z === "monozygotic") out.push({ kind: "bar", segment: [pa.x, pa.y, pb.x, pb.y] });
      else out.push({ kind: "question", x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
    }
  }
  return out;
}

/** The sibship lines split into solid segments and the dashed drops of adopted-in children. */
export function sibshipPaths(
  coupleX: number,
  coupleY: number,
  hopHeight: number,
  children: SibshipChild[],
): { solid: Segment[]; dashed: Segment[] } {
  const segs = sibshipSegments(coupleX, coupleY, hopHeight, children);
  if (segs.length === 0 || !children.some(c => c.dashed)) return { solid: segs, dashed: [] };
  const fixed = segs.length - children.length; // couple drop and bar
  const solid = segs.slice(0, fixed), dashed: Segment[] = [];
  children.forEach((c, i) => (c.dashed ? dashed : solid).push(segs[fixed + i]!));
  return { solid, dashed };
}

/** SVG path data for a list of segments. */
export function segmentsPathD(segs: Segment[], map: (x: number, y: number) => [number, number] = (x, y) => [x, y]): string {
  return segs.map(([x1, y1, x2, y2]) => {
    const [a, b] = map(x1, y1);
    const [c, d] = map(x2, y2);
    return `M ${a} ${b} L ${c} ${d}`;
  }).join(" ");
}
