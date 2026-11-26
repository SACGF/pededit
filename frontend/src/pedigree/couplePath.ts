import type { HopLineConstants, Sex } from "@pedigree-editor/layout-engine";
import {
  couplePortHeights as engineCouplePortHeights, hopHeight as engineHopHeight,
  hopTurn as engineHopTurn, symbolSideDx as engineSymbolSideDx,
} from "@pedigree-editor/layout-engine";
import {
  COUPLE_HOP, COUPLE_HOP_STEP, COUPLE_HOP_CLEARANCE, COUPLE_HOP_NEST_STEP,
  COUPLE_PORT_STEP, COUPLE_PORT_MAX, COUPLE_PORT_DOUBLE_EXTRA, NODE_SIZE,
} from "./constants";

/** The editor's sizes for the engine's hop line geometry (layout-engine/src/hopLine.ts). */
const HOP_CONSTANTS: HopLineConstants = {
  nodeSize: NODE_SIZE,
  coupleHop: COUPLE_HOP,
  coupleHopStep: COUPLE_HOP_STEP,
  coupleHopClearance: COUPLE_HOP_CLEARANCE,
  coupleHopNestStep: COUPLE_HOP_NEST_STEP,
  couplePortStep: COUPLE_PORT_STEP,
  couplePortMax: COUPLE_PORT_MAX,
  couplePortDoubleExtra: COUPLE_PORT_DOUBLE_EXTRA,
};

/**
 * Rise of a couple line whose partners are `span` slots apart (1 = adjacent,
 * no hop). Wider hops rise higher, so nested hops never run along each other.
 */
export function hopGeometry(span: number): { hopHeight: number } {
  return { hopHeight: engineHopHeight(span, HOP_CONSTANTS) };
}

/**
 * Heights (px above the symbol's centre) at which the couple lines on one
 * side of a symbol leave it, nearest partner first. A relationship line
 * leaves the side of a symbol, never its top, which is where the line from
 * the parents lands. So the line to the partner beside the person leaves at
 * the centre and each line hopping to a further partner leaves the same side
 * higher up: parallel lines that share nothing, as Madeline and pedigreejs
 * draw them. `double`: one of the lines is a double line, which needs more
 * room.
 */
export function couplePortHeights(count: number, double = false): number[] {
  return engineCouplePortHeights(count, double, HOP_CONSTANTS);
}

/**
 * Distance (px) from a symbol's centre to its outline `dy` px above or below
 * the centre, on the middle of the stroke (chart/symbols.tsx: each outline
 * sits 1px inside the NODE_SIZE box). Where a line leaving the side of a
 * circle or a diamond off its centre has to start to touch it.
 */
export function symbolSideDx(shape: Sex | undefined, dy: number, size = NODE_SIZE): number {
  return engineSymbolSideDx(shape, dy, size, 1);
}

/**
 * Where a hopping line turns between the row and its raised part, beside one
 * of its partners, whose centre is `distance` px from the centre of the
 * person next to them: see the engine's `hopTurn`. The further partner's end
 * takes span 2.
 */
export function hopTurn(distance: number, span = 2): { turn: number; drop: number } {
  return engineHopTurn(distance, span, HOP_CONSTANTS);
}

/**
 * One end of a couple line: the partner's symbol centre, and for a hopping
 * line the shape drawn there, the height above the centre at which the line
 * leaves its side (`couplePortHeights`) and how far from the centre it turns
 * between the row and its raised part (`hopTurn`).
 */
export interface CoupleEnd { x: number; y: number; shape?: Sex; port?: number; turn?: number }

/** `CoupleEnd.turn` when none is given: 10px out from the symbol box. */
const DEFAULT_TURN = NODE_SIZE / 2 + 10;

/**
 * x of the two risers of a hopping line: where it turns up beside the left
 * partner and where it comes down beside the right one.
 */
export function hopRisers(left: CoupleEnd, right: CoupleEnd): [number, number] {
  return [left.x + (left.turn ?? DEFAULT_TURN), right.x - (right.turn ?? DEFAULT_TURN)];
}

/**
 * SVG path for a couple line between two partners, given their symbol
 * centres. It always meets the side of each symbol facing the other partner.
 *
 * hopHeight = 0 draws a straight line between the edges of the two symbol
 * boxes. Otherwise (someone with three or more partners, whose line to a far
 * partner must clear the near one) the line leaves the side at each end's
 * `port` height, runs level to that end's `turn`, rises to hopHeight above
 * the row and passes over whatever sits between the partners. The raised
 * part is level at hopHeight above the higher of the two partners, so it
 * still clears the people in between when one partner has been dragged to
 * another height. It comes back down as soon as it is past them and runs
 * level into the further partner's side, so the line to the couple's
 * children hangs from a level couple line like any other.
 *
 * `shift` moves the whole line outwards (up, and its risers apart) by that
 * many px, for the two lines of a double line.
 */
export function couplePathD(left: CoupleEnd, right: CoupleEnd, hopHeight = 0, shift = 0): string {
  const half = NODE_SIZE / 2;
  if (hopHeight <= 0) return `M ${left.x + half} ${left.y - shift} L ${right.x - half} ${right.y - shift}`;
  // At the centre a line starts at the edge of the box, as a straight one does.
  const reach = (end: CoupleEnd) => (end.port ? symbolSideDx(end.shape, end.port + shift) : half);
  const y1 = left.y - (left.port ?? 0) - shift, y2 = right.y - (right.port ?? 0) - shift;
  const [a, b] = hopRisers(left, right);
  const ax = a - shift, bx = b + shift;
  const top = Math.min(left.y, right.y) - hopHeight - shift;
  return `M ${left.x + reach(left)} ${y1} L ${ax} ${y1} L ${ax} ${top} L ${bx} ${top} L ${bx} ${y2} L ${right.x - reach(right)} ${y2}`;
}

/** Corner radius (px) of a dashed arc routed between two rows. */
const ARC_CORNER = 10;
/** How far (px) before the lower copy a routed arc starts to turn down into its top. */
const ARC_LANDING = 36;

/**
 * SVG path for the dashed line joining two copies of one person, given the
 * symbol centres and half the symbol size.
 *
 * On one row it is an arc over the symbol tops whose highest point is `bulge`
 * px above them, as in R's plot.pedigree (arcconnect). Across rows R uses the
 * same arc, which rises into the upper row's sibship bar and falls through
 * labels; here it leaves the upper copy's side facing the lower copy and bends
 * down into the lower copy's top instead.
 *
 * That curve runs along the upper row, so with anyone between the copies it
 * passes through their symbols. `legDx` routes it round them: out of the
 * upper copy's side to `legDx` px from its centre (the gap beside it), down
 * between the two rows, along `bulge` px above the lower row's symbol tops,
 * where an arc on that row runs, and down into the lower copy's top.
 * `chooseArcRoute` (duplicateArc.ts) decides when.
 */
export function duplicateArcD(
  x1: number, y1: number, x2: number, y2: number,
  bulge: number, half: number, legDx?: number,
): string {
  // Within a symbol's height counts as one row (a pin nudged off its row).
  if (Math.abs(y1 - y2) < 2 * half) {
    const ay = y1 - half, by = y2 - half;
    // A quadratic Bezier peaks halfway to its control point.
    const cy = 2 * (Math.min(ay, by) - bulge) - (ay + by) / 2;
    return `M ${x1} ${ay} Q ${(x1 + x2) / 2} ${cy} ${x2} ${by}`;
  }
  const [ux, uy, lx, ly] = y1 < y2 ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  if (legDx) {
    const side = Math.sign(legDx);
    const sx = ux + side * half, legX = ux + legDx, runY = ly - half - bulge, endY = ly - half;
    // Out of the side and round the first corner, down the leg.
    const r1 = Math.max(0, Math.min(ARC_CORNER, Math.abs(legX - sx), (runY - uy) / 2));
    const start = `M ${sx} ${uy} L ${legX - side * r1} ${uy} Q ${legX} ${uy} ${legX} ${uy + r1}`;
    const along = Math.sign(lx - legX), reach = Math.abs(lx - legX);
    const r2 = Math.min(ARC_CORNER, (runY - uy) / 2, reach / 2);
    // The lower copy is under the leg: straight down into its top.
    if (reach < 1) return `${start} L ${legX} ${endY}`;
    // Along the run, then slanting down into the top as an arc on one row does.
    const landing = Math.min(ARC_LANDING, reach - r2);
    return `${start} L ${legX} ${runY - r2} Q ${legX} ${runY} ${legX + along * r2} ${runY}`
      + ` L ${lx - along * landing} ${runY} Q ${lx - along * landing / 4} ${runY} ${lx} ${endY}`;
  }
  const dir = lx >= ux ? 1 : -1;
  const sx = ux + dir * half;
  const cx = dir > 0 ? Math.max(lx, sx + half) : Math.min(lx, sx - half);
  return `M ${sx} ${uy} Q ${cx} ${uy} ${lx} ${ly - half}`;
}

/** Points along a path of M, L and Q commands with absolute coordinates, `steps` to each curve. */
export function pathPoints(d: string, steps = 12): [number, number][] {
  const out: [number, number][] = [];
  let x = 0, y = 0;
  for (const m of d.matchAll(/([MLQ])([^MLQ]*)/g)) {
    const n = (m[2]!.match(/-?[\d.]+(?:e[-+]?\d+)?/g) ?? []).map(Number);
    if (m[1] === "Q") {
      const [cx, cy, ex, ey] = n as [number, number, number, number];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        out.push([u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey]);
      }
      [x, y] = [ex, ey];
    } else {
      [x, y] = n as [number, number];
      out.push([x, y]);
    }
  }
  return out;
}

/** Points along `duplicateArcD`'s line, for keeping text off it. */
export function duplicateArcPoints(
  x1: number, y1: number, x2: number, y2: number,
  bulge: number, half: number, steps = 12, legDx?: number,
): [number, number][] {
  return pathPoints(duplicateArcD(x1, y1, x2, y2, bulge, half, legDx), steps);
}

/**
 * The two paths of a consanguineous (double) couple line, `gap` px apart:
 * the outer (upper) one, then the inner. For a hopping line the two are
 * concentric, so they stay parallel round the corners.
 */
export function consanguineousPathsD(left: CoupleEnd, right: CoupleEnd, hopHeight = 0, gap = 4): [string, string] {
  const h = gap / 2;
  return [couplePathD(left, right, hopHeight, h), couplePathD(left, right, hopHeight, -h)];
}

/**
 * The highest point any hopping couple line reaches, or Infinity when none
 * hops: the top of its raised part, with the upper line of a double line and
 * the stroke. A hop over several people in the top row rises well above the
 * symbols.
 */
export function highestHop(scene: {
  people: { id: string; position: { x: number; y: number } }[];
  couples: { source: string; target: string; data?: { hopHeight?: number } }[];
}): number {
  const pos = new Map(scene.people.map(n => [n.id, n.position]));
  let top = Infinity;
  for (const e of scene.couples) {
    const a = pos.get(e.source), b = pos.get(e.target), hop = e.data?.hopHeight ?? 0;
    if (a && b && hop > 0) top = Math.min(top, Math.min(a.y, b.y) - hop - 3);
  }
  return top;
}

/**
 * The highest point any dashed arc between two copies reaches, or Infinity
 * when there is none. An arc on one row rises `bulge` above the symbols, so
 * in the top row it is the highest thing drawn.
 */
export function highestDuplicateArc(scene: {
  people: { id: string; position: { x: number; y: number } }[];
  duplicates: { source: string; target: string; data?: { bulge?: number; legDx?: number } }[];
}, half: number): number {
  const pos = new Map(scene.people.map(n => [n.id, n.position]));
  let top = Infinity;
  for (const e of scene.duplicates) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (!a || !b) continue;
    for (const [, y] of duplicateArcPoints(a.x, a.y, b.x, b.y, e.data?.bulge ?? 28, half, 12, e.data?.legDx)) top = Math.min(top, y);
  }
  return top;
}
