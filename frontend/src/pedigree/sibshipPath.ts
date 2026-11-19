import { NODE_SIZE } from "./constants";
import { donorDescentSegments, type LinePoint } from "./assisted";

/** A straight line segment [x1, y1, x2, y2]. */
export type Segment = [number, number, number, number];

/**
 * Lines joining a couple to their children, shared by `SibshipEdge` and
 * `svgExporter`. Framework-free.
 *
 * The sibship bar sits halfway between the couple line and the highest child
 * row, but never more than `maxDrop` below the couple line (`sibBarHeight`),
 * lowered by `barOffset` when it would otherwise run into another couple's
 * bar (`sibshipBarOffsets`). Each child gets its own drop to
 * its own symbol, so a child pinned above or below its siblings' row is still
 * reached. The bar spans from the couple drop to the outermost child so the
 * two always meet.
 *
 * `topInset` is how far below the top of the symbol box the symbol starts:
 * a loss triangle's apex sits lower than a square's top edge.
 *
 * `converge` (a donor pair's only child): no bar; the line from each
 * parent in `apart` runs straight to the top of the child's symbol, where
 * any other line of assisted reproduction meets it too, as NSGC 2008 Fig. 3
 * draws them (the child sits under the woman carrying it, so her line is
 * vertical). The result is then just those lines.
 *
 * The result is the couple drop, the bar, then one drop per child in input
 * order; `sibshipPaths` splits off the drops of adopted-in children,
 * which are drawn dashed.
 */
export interface SibshipChild {
  x: number;
  y: number;
  topInset?: number;
  dashed?: boolean;
  /** Key of the twin set this child is in: members share one fork from the bar. */
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

/**
 * y of a sibship bar: halfway down from the couple line to the highest child,
 * or `maxDrop` below the couple line if that is higher. With `maxDrop` half a
 * row this is the same for children one row down; for a child dragged further
 * down the bar stays in the gap under the parents' row instead of running
 * along the row in between, so the drop from the couple line does not pass
 * through the people there.
 */
export function sibBarHeight(coupleY: number, childRowY: number, barOffset = 0, maxDrop = Infinity): number {
  return coupleY + Math.min((childRowY - coupleY) / 2, maxDrop) + barOffset;
}

export function sibshipSegments(
  coupleX: number,
  coupleY: number,
  children: SibshipChild[],
  barOffset = 0,
  apart?: LinePoint[],
  converge = false,
  maxDrop = Infinity,
): Segment[] {
  if (children.length === 0) return [];
  const half = NODE_SIZE / 2;
  if (converge && apart && children.length === 1) {
    const c = children[0]!;
    const top = c.y - half + (c.topInset ?? 0);
    if (top > coupleY + half) return donorDescentSegments(apart, c.x, top);
  }
  const sibBarY = sibBarHeight(coupleY, Math.min(...children.map(c => c.y)), barOffset, maxDrop);
  const forks = forkXs(children);
  // Twins: every member's drop starts at the set's shared point on the bar.
  const fromXs = children.map(c => c.twinSet !== undefined ? (forks.get(c.twinSet) ?? c.x) : c.x);
  const segs: Segment[] = [
    // Drop from the couple line to the bar. Parents who are not a couple
    // (gamete donation) each get a line to the bar instead (`apart`).
    ...(apart ? donorDescentSegments(apart, coupleX, sibBarY) : [[coupleX, coupleY, coupleX, sibBarY] as Segment]),
    // The bar ends where the outermost drops start: at a twin fork, not over
    // the twin's own symbol (#104: twins at the end of a sibship left a stub).
    [Math.min(coupleX, ...fromXs), sibBarY, Math.max(coupleX, ...fromXs), sibBarY],
  ];
  children.forEach((c, i) => {
    // To the top of the symbol, or its bottom if it was dragged above the bar.
    const top = c.y - half + (c.topInset ?? 0);
    const end = top >= sibBarY ? top : c.y + half;
    segs.push([fromXs[i]!, sibBarY, c.x, end]);
  });
  return segs;
}

/** A twin fork's marks: bars across adjacent monozygotic drops, "?" between unknown ones. */
export interface TwinMark { kind: "bar"; segment: Segment } 
export interface TwinQuestion { kind: "question"; x: number; y: number }

/**
 * Marks drawn on twin forks, as R's plot.pedigree does: for each pair
 * of neighbouring members, the points halfway down their two drops are joined
 * by a bar (monozygotic) or get a "?" between them (unknown zygosity).
 */
export function twinForkMarks(
  coupleY: number,
  children: SibshipChild[],
  barOffset = 0,
  maxDrop = Infinity,
): (TwinMark | TwinQuestion)[] {
  const out: (TwinMark | TwinQuestion)[] = [];
  const half = NODE_SIZE / 2;
  const sibBarY = sibBarHeight(coupleY, Math.min(...children.map(c => c.y)), barOffset, maxDrop);
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
  children: SibshipChild[],
  barOffset = 0,
  apart?: LinePoint[],
  converge = false,
  maxDrop = Infinity,
): { solid: Segment[]; dashed: Segment[] } {
  const segs = sibshipSegments(coupleX, coupleY, children, barOffset, apart, converge, maxDrop);
  // A converged only child has no drop of its own to dash.
  const ownDrops = segs.length - children.length >= 2;
  if (segs.length === 0 || !ownDrops || !children.some(c => c.dashed)) return { solid: segs, dashed: [] };
  const fixed = segs.length - children.length; // couple drop and bar
  const solid = segs.slice(0, fixed), dashed: Segment[] = [];
  children.forEach((c, i) => (c.dashed ? dashed : solid).push(segs[fixed + i]!));
  return { solid, dashed };
}

// ── Bars that would overlap ─────────────────────────────────────────────────

/** What `sibshipBarOffsets` needs to know about one sibship. */
export interface SibshipBar {
  coupleX: number;
  coupleY: number;
  childXs: number[];
  childYs: number[];
}

/** Preferred distance (px) between two bars that would otherwise overlap. */
export const SIB_BAR_STEP = 12;
/** Bars are never packed closer than this while a free level remains. */
const SIB_BAR_MIN_STEP = 7;
/** Space (px) kept between the lowest bar and the top of the child symbols. */
const SIB_BAR_CLEARANCE = 8;
/** Bars whose ends come this close (px) read as one line, so they count as overlapping. */
const SIB_BAR_TOUCH = NODE_SIZE / 4;
/** Space (px) between the bottom of a label and a bar lowered to pass under it. */
const SIB_BAR_UNDER_LABEL = 2;

/**
 * How far (px) to lower each sibship's bar below the halfway line so that no
 * two bars run along the same stretch of the same y.
 *
 * When a row of children is wider than the row of their parents, each
 * sibship sits to one side of its parents, and bars that all sit halfway
 * overlap into one line: nobody can tell which children are whose. Bars that
 * overlap get a level each. Levels only go down, towards the children,
 * because name and date labels hang in the space above the halfway line.
 *
 * Which bar goes above which is chosen to cross as few lines as possible. A
 * bar is crossed by the couple drop of a lower bar and by the child drops of
 * a higher one, so for sibships shifted right of their parents the leftmost
 * bar goes lowest and nothing crosses at all (the mirror image when shifted
 * left).
 *
 * Returns one offset per input, 0 for a bar that overlaps nothing.
 */
export function sibshipBarOffsets(sibs: SibshipBar[]): number[] {
  const bars = sibs.map((s, i) => {
    const childY = Math.min(...s.childYs);
    return {
      i,
      ok: s.childXs.length > 0,
      x1: Math.min(s.coupleX, ...s.childXs),
      x2: Math.max(s.coupleX, ...s.childXs),
      y: (s.coupleY + childY) / 2,
      // Room between the halfway line and the child symbols.
      room: (childY - s.coupleY) / 2 - NODE_SIZE / 2 - SIB_BAR_CLEARANCE,
      coupleX: s.coupleX,
      childXs: s.childXs,
      level: 0,
    };
  });
  type Bar = (typeof bars)[number];
  const overlap = (a: Bar, b: Bar) =>
    Math.abs(a.y - b.y) < SIB_BAR_MIN_STEP && a.x1 <= b.x2 + SIB_BAR_TOUCH && b.x1 <= a.x2 + SIB_BAR_TOUCH;
  const within = (x: number, b: Bar) => x >= b.x1 - 1 && x <= b.x2 + 1;
  /** Lines crossed when `upper`'s bar is drawn above `lower`'s. */
  const crossings = (upper: Bar, lower: Bar) =>
    (within(lower.coupleX, upper) ? 1 : 0) + upper.childXs.filter(x => within(x, lower)).length;

  const offsets = sibs.map(() => 0);
  const seen = new Set<Bar>();
  for (const start of bars) {
    if (!start.ok || seen.has(start)) continue;
    // Everything joined to this bar through a chain of overlaps.
    const group: Bar[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const b = queue.pop()!;
      group.push(b);
      for (const o of bars) {
        if (o.ok && !seen.has(o) && overlap(b, o)) { seen.add(o); queue.push(o); }
      }
    }
    if (group.length < 2) continue;

    const room = Math.max(0, Math.min(...group.map(b => b.room)));
    const maxLevels = Math.floor(room / SIB_BAR_MIN_STEP) + 1;
    // Left to right, each bar takes the free level that crosses least. A
    // smaller level is higher on the page.
    group.sort((a, b) => a.x1 - b.x1 || a.coupleX - b.coupleX || a.i - b.i);
    const placed: Bar[] = [];
    let lo = 0, hi = 0;
    for (const b of group) {
      const near = placed.filter(p => overlap(p, b));
      if (near.length > 0) {
        const taken = new Set(near.map(p => p.level));
        let best: { level: number; key: number[] } | undefined;
        for (const capped of [true, false]) {
          for (let level = lo - 1; level <= hi + 1; level++) {
            if (taken.has(level)) continue;
            const grows = level < lo || level > hi;
            if (capped && grows && hi - lo + 2 > maxLevels) continue;
            const cost = near.reduce((n, p) => n + (p.level < level ? crossings(p, b) : crossings(b, p)), 0);
            // Fewest crossings, then no new level, then far from the bars it
            // overlaps (so a long run restarts instead of zigzagging), then lowest.
            const dist = Math.min(...near.map(p => Math.abs(p.level - level)));
            const key = [cost, grows ? 1 : 0, -dist, -level];
            if (!best || lessThan(key, best.key)) best = { level, key };
          }
          if (best) break;
        }
        b.level = best!.level;
        lo = Math.min(lo, b.level);
        hi = Math.max(hi, b.level);
      } else {
        // Overlaps only bars still to come: start in the middle of what is used.
        b.level = placed.length ? Math.round((lo + hi) / 2) : 0;
      }
      placed.push(b);
    }
    const step = hi > lo ? Math.min(SIB_BAR_STEP, room / (hi - lo)) : 0;
    for (const b of group) offsets[b.i] = (b.level - lo) * step;
  }
  return offsets;
}

/** A bar as drawn, for `barsUnderLabels`. */
export interface DrawnBar {
  x1: number;
  x2: number;
  /** y of the bar, bar offset included. */
  y: number;
  /** y of the highest child's centre. */
  childY: number;
}

/** The text under one symbol: `top` and `bottom` of the block, `bottom` a descender below the last baseline. */
export interface LabelBox { x: number; halfWidth: number; top: number; bottom: number }

/**
 * Bars that would run through the text under someone above them: a tag row
 * and a two-line name, or a long detail block, hang below the halfway line
 * where a bar normally sits. For each bar, how much further (px) to lower it
 * so it passes under that text, and the labels (by index) it still runs
 * through, which then need a white backing: when the text hangs lower than
 * a bar can go above its children, or lowering it would put it on another
 * couple's bar, the bar stays where it was.
 */
export function barsUnderLabels(bars: DrawnBar[], labels: LabelBox[]): { lower: number[]; through: Set<number> } {
  const lower = bars.map(() => 0);
  const through = new Set<number>();
  const ys = bars.map(b => b.y);
  bars.forEach((b, i) => {
    // Text that starts above the bar, over its length, and ends on or below it.
    const over = labels
      .map((l, k) => ({ l, k }))
      .filter(({ l }) => l.top < b.y && l.bottom > b.y + 1 && l.x + l.halfWidth > b.x1 && l.x - l.halfWidth < b.x2);
    if (over.length === 0) return;
    const lowest = b.childY - NODE_SIZE / 2 - SIB_BAR_CLEARANCE;
    const wanted = Math.max(...over.map(({ l }) => l.bottom)) + SIB_BAR_UNDER_LABEL;
    const onAnother = bars.some((o, j) => j !== i && Math.abs(ys[j]! - wanted) < SIB_BAR_MIN_STEP
      && b.x1 <= o.x2 + SIB_BAR_TOUCH && o.x1 <= b.x2 + SIB_BAR_TOUCH);
    // A bar lowered part of the way would still run through the text, and
    // take room from what is drawn above the children, so it stays put.
    if (wanted <= lowest && !onAnother) { lower[i] = wanted - b.y; ys[i] = wanted; }
    // Text that hangs down to the symbols below gets no backing: it would
    // cover part of them.
    else for (const { l, k } of over) if (l.bottom <= b.childY - NODE_SIZE / 2) through.add(k);
  });
  return { lower, through };
}

function lessThan(a: number[], b: number[]): boolean {
  for (let k = 0; k < a.length; k++) {
    if (a[k]! !== b[k]!) return a[k]! < b[k]!;
  }
  return false;
}

/** SVG path data for a list of segments. */
export function segmentsPathD(segs: Segment[], map: (x: number, y: number) => [number, number] = (x, y) => [x, y]): string {
  return segs.map(([x1, y1, x2, y2]) => {
    const [a, b] = map(x1, y1);
    const [c, d] = map(x2, y2);
    return `M ${a} ${b} L ${c} ${d}`;
  }).join(" ");
}
