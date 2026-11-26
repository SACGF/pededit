/**
 * U-shape export, step 2: the layout. The bent coordinate system (`Geom`:
 * u along the U, depth across it), packing the tree along the tracks, and
 * the public `UShapeLayout` of positions and rotations. No SVG in here, so it
 * could move beside the layout engine.
 */
import { type Pedigree, type Individual } from "@pedigree-editor/layout-engine";
import { personGlyph, type PersonGlyph } from "../../../pedigree/personGlyph";
import { labelMaxWidth, LABEL_CHAR_WIDTH } from "../../../pedigree/labels";
import { labelNumbers } from "../../../pedigree/scene";
import { CONSANGUINEOUS_GAP, NODE_SIZE } from "../../../pedigree/constants";
import { LABEL_LINE_HEIGHT } from "../../../pedigree/labels";
import { HALF, MIN_SLOT, MAX_SLOT, FAMILY_GAP, BAR_CLEARANCE, TARGET_ASPECT, MIN_ASPECT, MAX_PLACE_ATTEMPTS, FAN_MAX_WIDTH, MAX_FLAT, CLABEL_PAD, CLABEL_BASELINE, CLABEL_ENDED_BASELINE, CLABEL_CAP, CLABEL_REACH } from "./constants";
import { coupleGap, labelRadius, kidsOf, walk, buildTree, type UShapeOptions, type Union, type TNode } from "./tree";
import { hasParents } from "../../../pedigree/graph";

// ── Geometry ──────────────────────────────────────────────────────────────────

export interface Geom {
  r0: number;       // radius of the founder track around the curve
  ringGap: number;  // distance between consecutive generation tracks
  slot: number;     // min centre-to-centre spacing along a track
  flat: number;     // half the length of the flat bottom
  vb: number;       // length of each quarter circle on the founder track
  u0: number;       // where the founders sit along the U (0 = bottom centre)
}

export function makeGeom(r0: number, ringGap: number, slot: number, flat: number): Geom {
  return { r0, ringGap, slot, flat, vb: (Math.PI * r0) / 2, u0: 0 };
}

/**
 * Move `dist` real pixels along the track `offset` px outside the founder
 * track, starting at signed position u and heading in direction dir (-1 toward
 * the left tip, +1 toward the right tip). Returns the new u. On the curve a
 * pixel on an outer track is worth less than a unit of u. On the flat bottom
 * and the arms they are equal. A negative dist walks the other way.
 */
export function advance(u: number, dir: -1 | 1, offset: number, dist: number, g: Geom): number {
  if (dist < 0) { dir = -dir as -1 | 1; dist = -dist; }
  const curve = g.r0 / (g.r0 + offset);
  const a = g.flat, b = g.flat + g.vb;
  let t = u * dir; // position along the direction of travel
  // Far arm, far curve, flat bottom, near curve, then the arm ahead.
  for (let seg = 0; seg < 4; seg++) {
    const end = seg === 0 ? -b : seg === 1 ? -a : seg === 2 ? a : b;
    if (t >= end - 1e-9) continue;
    const scale = seg === 1 || seg === 3 ? curve : 1;
    const room = (end - t) / scale;
    if (dist <= room) return (t + dist * scale) * dir;
    dist -= room;
    t = end;
  }
  return (t + dist) * dir;
}

/** Real pixels along the track `offset` px outside the founder track from u1 to u2 (u1 <= u2). */
export function trackDistance(u1: number, u2: number, offset: number, g: Geom): number {
  const curve = (g.r0 + offset) / g.r0;
  const overlap = (a: number, b: number) => Math.max(0, Math.min(u2, b) - Math.max(u1, a));
  const onCurve = overlap(-g.flat - g.vb, -g.flat) + overlap(g.flat, g.flat + g.vb);
  return (u2 - u1 - onCurve) + onCurve * curve;
}

export interface TrackPoint { x: number; y: number; nx: number; ny: number; theta: number; }

/** Point at signed position u on the track `offset` px outside the founder track. */
export function trackPoint(u: number, offset: number, g: Geom): TrackPoint {
  const r = g.r0 + offset;
  const side = u < 0 ? -1 : 1;
  const v = Math.abs(u);
  if (v <= g.flat) return { x: u, y: r, nx: 0, ny: 1, theta: 0 };
  if (v <= g.flat + g.vb) {
    const theta = (side * (v - g.flat)) / g.r0;
    const nx = Math.sin(theta), ny = Math.cos(theta);
    return { x: side * g.flat + r * nx, y: r * ny, nx, ny, theta };
  }
  return { x: side * (g.flat + r), y: -(v - g.flat - g.vb), nx: side, ny: 0, theta: (side * Math.PI) / 2 };
}

/** Signed position of one member of a node. */
export function memberU(n: TNode, i: number, g: Geom): number {
  const dx = n.members[i].dx;
  return dx === 0 ? n.u : advance(n.u, dx < 0 ? -1 : 1, n.depth * g.ringGap, Math.abs(dx), g);
}

/** Where a union's descent line leaves the track: the middle of the couple line. */
export function descentU(n: TNode, w: Union, g: Geom): number {
  if (w.kind === "join") return (memberU(n, w.a, g) + w.joinNode!.u) / 2;
  if (w.b === null) return memberU(n, w.a, g);
  return (memberU(n, w.a, g) + memberU(n, w.b, g)) / 2;
}

// ── Packing ───────────────────────────────────────────────────────────────────

/**
 * Pack one side of the U, working outward from uC. Every node goes as close
 * to the centre as the previous node on its own track allows, and a couple
 * sits over the middle of its children. If that would land the parent on top
 * of its neighbour, the children are pushed outward and retried.
 */
export function packSide(tops: TNode[], side: -1 | 1, g: Geom, uC: number, firstMin = -Infinity): number {
  // v is distance from uC, in u units, heading toward this side's tip.
  // Spacing depends on where along the U a node really is.
  const step = (v: number, offset: number, dist: number): number =>
    (advance(uC + side * v, side, offset, dist, g) - uC) * side;
  let reach = 0;
  const last: number[] = [];               // outer edge of the last node on each track
  const lastNode: TNode[] = [];
  // The left side is packed from the centre outward, so it is visited in
  // reverse to keep siblings reading left to right in the finished figure.
  const inOrder = <T>(xs: T[]): T[] => (side < 0 ? [...xs].reverse() : xs);

  const place = (n: TNode, hint: number): void => {
    n.side = side;
    const offset = n.depth * g.ringGap;
    let inward = 0, outward = 0;
    for (const m of n.members) { inward = Math.max(inward, -side * m.dx); outward = Math.max(outward, side * m.dx); }
    const floor = last[n.depth] === undefined
      ? step(0, offset, Math.max((g.slot + FAMILY_GAP) / 2, (n.joinGap ?? 0) / 2) + inward)
      : step(last[n.depth], offset, (lastNode[n.depth].parent === n.parent ? g.slot : g.slot + FAMILY_GAP) + inward);
    let need = Math.max(hint, floor);

    // Joined to the previous node on this track: their couple line runs between
    // the two, and a sibship hangs from its middle. That descent line must
    // clear the other sibships of both, so it comes down beyond the last
    // child of the inner partner and before the first child of the outer one.
    const prev: TNode | undefined = lastNode[n.depth];
    const joinsPrev = n.unions.some(w => w.kind === "join" && w.joinNode === prev);
    const prevJoins = !!prev && prev.unions.some(w => w.kind === "join" && w.joinNode === n);
    const clear = BAR_CLEARANCE;
    if (prev && joinsPrev && last[n.depth + 1] !== undefined) need = Math.max(need, 2 * (last[n.depth + 1] + clear) - prev.v);
    // Room for the label between joined partners.
    const joinUnion = !prev ? undefined
      : n.unions.find(w => w.kind === "join" && w.joinNode === prev) ?? prev.unions.find(w => w.kind === "join" && w.joinNode === n);
    if (joinUnion?.labelWidth) need = Math.max(need, step(prev!.v, offset, coupleGap(joinUnion)));

    const groups = inOrder(n.unions.filter(w => w.kids.length));
    if (groups.length === 0) {
      n.v = need;
    } else {
      const kids = groups.flatMap(w => inOrder(w.kids));
      // Where the node wants to be, given where its children ended up.
      const target = (): number => {
        const mid = (w: Union) => (w.kids[0].v + w.kids[w.kids.length - 1].v) / 2;
        // Where the union's descent line leaves the track, in px outward from the blood member.
        const out = (w: Union) => side * (w.kind === "join" ? (w.joinSide * (g.slot + FAMILY_GAP)) / 2
          : w.b === null ? 0 : (n.members[w.a].dx + n.members[w.b].dx) / 2);
        if (groups.length === 1) return step(mid(groups[0]), offset, -out(groups[0]));
        // Two sibships: the point half way between their descent lines stands
        // over the boundary between them, so neither line crosses the other
        // sibship's bar.
        let sum = 0;
        for (let i = 0; i + 1 < groups.length; i++) {
          const inner = inOrder(groups[i].kids), outer = inOrder(groups[i + 1].kids);
          const boundary = (inner[inner.length - 1].v + outer[0].v) / 2;
          sum += step(boundary, offset, -(out(groups[i]) + out(groups[i + 1])) / 2);
        }
        return sum / (groups.length - 1);
      };
      let childHint = -Infinity;
      for (let attempt = 1; ; attempt++) {
        const snapLast = last.slice(), snapNode = lastNode.slice();
        kids.forEach((c, i) => place(c, i === 0 ? childHint : -Infinity));
        const t = target();
        // The previous node's join sibship comes down half way to this node.
        const bound = prevJoins ? (prev!.v + Math.max(t, need)) / 2 + clear : -Infinity;
        if ((t >= need - 0.5 && kids[0].v >= bound - 0.5) || attempt >= MAX_PLACE_ATTEMPTS) {
          n.v = Math.max(t, need);
          break;
        }
        // Moving the children out by d moves this node by d and the bound by d / 2.
        childHint = kids[0].v + Math.max(0, need - t, 2 * (bound - kids[0].v));
        last.length = 0; last.push(...snapLast);
        lastNode.length = 0; lastNode.push(...snapNode);
      }
    }
    n.u = uC + side * n.v;
    last[n.depth] = step(n.v, offset, outward);
    lastNode[n.depth] = n;
    reach = Math.max(reach, last[n.depth]);
  };

  inOrder(tops).forEach((t, i) => place(t, i === 0 ? firstMin : -Infinity));
  return reach;
}

/**
 * Lay the whole tree out for a given geometry. Fills in u on every node and
 * returns u0, the position of the founders along the U. With slide off the
 * founders stay at the bottom centre.
 */
export function packTree(root: TNode, g: Geom, slide: boolean): number {
  // Trunk: while there is a single child there is nothing to split, so the line
  // of descent runs straight out across the tracks.
  const layTrunk = (u0: number): TNode => {
    root.u = u0; root.side = 0; root.v = 0;
    let n = root;
    for (let kids = kidsOf(n); kids.length === 1; kids = kidsOf(n)) {
      const c = kids[0];
      c.u = descentU(n, c.parentUnion!, g); c.side = 0; c.v = 0;
      n = c;
    }
    return n;
  };
  const end = layTrunk(0);
  const kids = kidsOf(end);
  if (kids.length === 0) return 0;

  // The children split around the descent line of their parents. A parent
  // with two sibships has each on its own side, starting under the middle of
  // its own couple line.
  const groups = end.unions.filter(w => w.kids.length);
  const centre = (u0: number): number => {
    layTrunk(u0);
    return groups.length === 1 ? descentU(end, groups[0], g) : end.u;
  };
  const splits: number[] = [];
  if (groups.length > 1) splits.push(groups[0].kids.length);
  else for (let i = 1; i < kids.length; i++) {
    // Twins stay on one arm.
    if (kids[i - 1].twinSet !== undefined && kids[i - 1].twinSet === kids[i].twinSet) continue;
    splits.push(i);
  }
  if (splits.length === 0 && groups.length === 1) splits.push(kids.length);
  const firstMin = groups.length > 1 ? Math.max(...groups.map(coupleGap)) / 2 : -Infinity;
  const armStart = g.flat + g.vb;

  // One sibship and arms to level: the founders stay at the bottom centre and
  // their children are laid out as one row that slides along the U under them
  // until the arms are level, as far as the line of descent still lands on the
  // sibship bar. One big branch then wraps round the bottom of the U rather
  // than pushing the founders up an arm. Only when the bar is too short for
  // that do the founders slide as well, by what is still missing.
  if (slide && groups.length === 1) {
    const first = kids[0], lastKid = kids[kids.length - 1];
    const span = packSide(kids, 1, g, centre(0)) + 2 * g.slot;
    const layRow = (start: number) => packSide(kids, 1, g, start);
    // [arms, sym] for the row as laid: arms is positive when the left arm ends
    // higher than the right one. Within the curve both arms count as level,
    // and sym, positive when the family reaches further left, centres it.
    const balance = (): [number, number] => {
      let uMin = Infinity, uMax = -Infinity;
      walk(root, n => n.members.forEach((_, i) => {
        const u = memberU(n, i, g);
        uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
      }));
      return [-Math.min(uMin, -armStart) - Math.max(uMax, armStart), -(uMin + uMax)];
    };
    const tilt = ([arms, sym]: [number, number]) => (arms !== 0 ? arms : sym);
    // Moving the row, or the founders with it, by x moves both arm ends by x,
    // so it changes the imbalance by 2x. Packing is not quite continuous in
    // where it starts (outer tracks change spacing on the curve, joins
    // re-pack), so a few steps are taken and the most level kept.
    const STEPS = 4;
    // The row start that puts child c's symbol at u.
    const startWith = (c: TNode, u: number): number => {
      let s = u - span / 2;
      for (let i = 0; i < 3; i++) { layRow(s); s += u - c.u; }
      return s;
    };
    // With the founders at u0: the row start that levels the arms best while
    // the line of descent lands on the sibship bar, and how uneven they are left.
    const levelRow = (u0: number): { start: number; rest: [number, number] } => {
      const d = centre(u0);
      const lo = startWith(lastKid, d), hi = startWith(first, d);
      let best: { start: number; rest: [number, number] } | null = null;
      let s = (lo + hi) / 2;
      for (let i = 0; i < STEPS; i++) {
        layRow(s);
        const rest = balance();
        if (!best || Math.abs(tilt(rest)) < Math.abs(tilt(best.rest))) best = { start: s, rest };
        const next = Math.min(hi, Math.max(lo, s + tilt(rest) / 2));
        if (Math.abs(next - s) < 0.5) break;
        s = next;
      }
      return best!;
    };
    // If the bar is too short to level the arms, the founders slide too, by
    // the steps above while they close in on the level point and by halving
    // the interval known to hold it when a step would leave it.
    let u0 = 0;
    let { start, rest: [arms] } = levelRow(0);
    let lo = arms > 0 ? 0 : -Infinity, hi = arms > 0 ? Infinity : 0;
    for (let i = 0, u = 0, a = arms; i < 2 * STEPS && Math.abs(arms) > 1 && hi - lo > 1; i++) {
      u += a / 2;
      if (u <= lo || u >= hi) u = (lo + hi) / 2;
      const r = levelRow(u);
      a = r.rest[0];
      if (a > 0) lo = u; else hi = u;
      if (Math.abs(a) < Math.abs(arms)) { u0 = u; start = r.start; arms = a; }
    }
    centre(u0);
    layRow(start);
    return u0;
  }

  // Otherwise the children are split between the two sides of the founders'
  // line of descent: a fan, or a founder with two sibships, one each side. Two
  // ways to even out the arms: choose where the sibship is split between
  // them, and slide the founders along the U. A family that fits on the curve
  // has no arms to level, so its founders stay at the bottom centre.
  //
  // imbalance() is positive when the left arm ends higher than the right one.
  // It falls steadily as the founders move right, so bisection finds the level
  // point.
  const limit = packSide(kids, 1, g, centre(0));
  const level = (k: number): { u0: number; cost: number } => {
    const reaches = (u0: number): [number, number] => {
      const uC = centre(u0);
      return [uC - packSide(kids.slice(0, k), -1, g, uC, firstMin), uC + packSide(kids.slice(k), 1, g, uC, firstMin)];
    };
    const imbalance = (u0: number): number => {
      const [uMin, uMax] = reaches(u0);
      return -Math.min(uMin, -armStart) - Math.max(uMax, armStart);
    };
    // Within the curve both arms clamp to the same height, so every split
    // levels equally. Tie-break on how far each side really reaches, or a
    // small family puts one child on the left and all the rest on the right.
    const symmetry = (u0: number): number => {
      const [uMin, uMax] = reaches(u0);
      return 0.01 * Math.abs(uMin + uMax);
    };
    const atCentre = imbalance(0);
    if (!slide || Math.abs(atCentre) <= 1) return { u0: 0, cost: Math.abs(atCentre) + symmetry(0) };
    let lo = atCentre > 0 ? 0 : -limit, hi = atCentre > 0 ? limit : 0;
    for (let i = 0; i < 20 && hi - lo > 1; i++) {
      const mid = (lo + hi) / 2;
      if (imbalance(mid) > 0) lo = mid; else hi = mid;
    }
    const u0 = (lo + hi) / 2;
    // Uneven arms waste the page, so they cost the most. Between splits that
    // level equally well, prefer the one that keeps the founders near the centre.
    return { u0, cost: Math.abs(imbalance(u0)) + 0.5 * Math.abs(u0) + symmetry(u0) };
  };

  // A couple joined across the split has its sibship hanging from somewhere
  // near the centre, where it can run into the other sibships of either
  // partner. Such a split is only used if there is no clean one, and the
  // whole family on one side is a clean one.
  const joined: Array<{ host: TNode; w: Union }> = [];
  walk(end, n => { for (const w of n.unions) if (w.kind === "join") joined.push({ host: n, w }); });
  const span = (n: TNode, w: Union): [number, number] => {
    const us = [descentU(n, w, g), ...w.kids.map(c => c.u)];
    return [Math.min(...us), Math.max(...us)];
  };
  const clashes = (): boolean => joined.some(({ host, w }) => {
    const other = w.joinNode!;
    if (!w.kids.length || host.side === other.side) return false;
    const [lo, hi] = span(host, w);
    return [host, other].some(n => n.unions.some(w2 => {
      if (w2 === w || !w2.kids.length) return false;
      const [lo2, hi2] = span(n, w2);
      return lo2 < hi + BAR_CLEARANCE && hi2 > lo - BAR_CLEARANCE;
    }));
  });

  let k = splits[0], u0 = 0, bestCost = Infinity;
  const consider = (i: number) => {
    const res = level(i);
    if (joined.length) {
      const uC = centre(res.u0);
      packSide(kids.slice(0, i), -1, g, uC, firstMin);
      packSide(kids.slice(i), 1, g, uC, firstMin);
      if (clashes()) res.cost += 1e9;
    }
    if (res.cost < bestCost) { bestCost = res.cost; k = i; u0 = res.u0; }
  };
  splits.forEach(consider);
  if (bestCost >= 1e9 && groups.length === 1) [0, kids.length].forEach(consider);
  const uC = centre(u0);
  packSide(kids.slice(0, k), -1, g, uC, firstMin);
  packSide(kids.slice(k), 1, g, uC, firstMin);
  return u0;
}

// ── Public layout ─────────────────────────────────────────────────────────────

export interface UShapeNode {
  id: string;
  /** Blood parent this individual hangs from. Null for the founders and for partners. */
  parent: string | null;
  /** Where along the U the descent line from this individual's parents starts. */
  parentU: number | null;
  /** For a married-in partner, the blood relative they stand beside. */
  partnerOf: string | null;
  depth: number;
  /** Signed position along the U: negative left arm, positive right arm. */
  u: number;
  x: number;
  y: number;
  /** Rotation in degrees that points the symbol's "down" outward. */
  rotation: number;
}

export interface UShapeLayout {
  /** Everybody drawn, once each. */
  nodes: Map<string, UShapeNode>;
  /**
   * Second copies of people who are also drawn somewhere else: a blood relative
   * drawn again beside their partner when the two could not be placed side by
   * side. The export links the copies with a dashed line.
   */
  duplicates: UShapeNode[];
  r0: number;
  ringGap: number;
  slot: number;
  /** Half the length of the flat bottom of the U. */
  flat: number;
  maxDepth: number;
  /** The founder couple (or a lone individual) at the bottom of the U. */
  founders: string[];
  /** Individuals in the pedigree that are not drawn. */
  omitted: string[];
  /** Consanguinity labels, see `UShapeCoupleLabel`. */
  coupleLabels: UShapeCoupleLabel[];
}

/**
 * Text along a double couple line, between the partners' symbols, on the
 * inward side (above the line, as the symbols stand). (x, y) is the point
 * on the line under the middle of the label and `rotation` the line's angle
 * there, as for the symbols. In that rotated frame the text is centred on
 * x = 0 with its baseline at y = baselines[0] (negative: inward). One line
 * for now; `lines` and `baselines` leave room for more.
 * The text is straight, so on the curve it is lifted by the sagitta of its
 * half width, the most the line bends up towards it at its ends.
 */
export interface UShapeCoupleLabel {
  partnershipId: string;
  lines: string[];
  width: number;
  x: number;
  y: number;
  rotation: number;
  baselines: number[];
  /** On a white backing, which a dashed link between two copies of someone passes behind. */
  backed: boolean;
}

export interface Extent { minX: number; maxX: number; minY: number; maxY: number; }

export function extentOf(root: TNode, g: Geom): Extent {
  const e: Extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  walk(root, n => {
    n.members.forEach((_, i) => {
      const p = trackPoint(memberU(n, i, g), n.depth * g.ringGap, g);
      e.minX = Math.min(e.minX, p.x); e.maxX = Math.max(e.maxX, p.x);
      e.minY = Math.min(e.minY, p.y); e.maxY = Math.max(e.maxY, p.y);
    });
  });
  return e;
}

export interface Built { root: TNode; geom: Geom; maxDepth: number; labelLines: number; }

export function build(pedigree: Pedigree, opts: UShapeOptions = {}): Built | null {
  const root = buildTree(pedigree, opts.partners ?? true);
  if (!root) return null;

  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  let maxDepth = 0, labelLines = 0, labelChars = 0;
  walk(root, n => {
    maxDepth = Math.max(maxDepth, n.depth);
    for (const { id } of n.members) {
      const ind = byId.get(id);
      if (!ind) continue;
      // Names wrap at the widest slot, so a long name adds a line rather than width.
      const glyph = glyphOf(ind, pedigree);
      const nameLines = glyph.figureNameLines;
      const details = glyph.detailLines;
      labelLines = Math.max(labelLines, nameLines.length + details.length
        + (glyph.annotations.length > 0 ? 1 : 0) + (glyph.caption ? 1 : 0));
      labelChars = Math.max(labelChars, ...nameLines.map(l => l.length), ...details.map(l => l.length));
    }
  });

  // A label sits between its symbol and the sibship bar beyond it, so the
  // tracks move apart when labels have more lines, and nodes move apart along
  // the track when labels are long.
  const ringGap = NODE_SIZE + 8 + labelLines * LABEL_LINE_HEIGHT + BAR_CLEARANCE + 6;
  const slot = Math.min(MAX_SLOT, Math.max(MIN_SLOT, labelChars * LABEL_CHAR_WIDTH + 12));
  let minR0 = Math.max(1.4 * ringGap, Math.max(...root.members.map(m => m.dx)) - Math.min(...root.members.map(m => m.dx)) + NODE_SIZE);
  // A straight label on a curve is lifted clear of the line at its ends
  // (coupleLabels); the curve must be gentle enough for that lift.
  walk(root, n => {
    for (const w of n.unions) {
      if (!w.labelWidth) continue;
      minR0 = Math.max(minR0, labelRadius(w) + CONSANGUINEOUS_GAP / 2 - n.depth * ringGap);
    }
  });

  // The founders stand upright on the flat bottom, and so do their children
  // if there are only a few of them. A small family then reads like an
  // ordinary pedigree rather than a fan. Positions on the flat are plain
  // pixels, so a trial packing on a long flat measures what is needed.
  const foundersHalf = Math.max(...root.members.map(m => Math.abs(m.dx))) + HALF;
  const trial = makeGeom(minR0, ringGap, slot, 1e6);
  packTree(root, trial, false);
  let gen1Half = 0;
  walk(root, n => {
    if (n.depth === 1) n.members.forEach((_, i) => { gen1Half = Math.max(gen1Half, Math.abs(memberU(n, i, trial)) + HALF); });
  });
  const flat = Math.max(foundersHalf, gen1Half <= MAX_FLAT ? gen1Half : 0);

  const measure = (geom: Geom) => {
    const e = extentOf(root, geom);
    let reach = 0;
    walk(root, n => n.members.forEach((_, i) => { reach = Math.max(reach, Math.abs(memberU(n, i, geom))); }));
    return { w: e.maxX - e.minX + 2 * ringGap, h: e.maxY - e.minY + 2 * ringGap, reach };
  };
  const radii = Array.from({ length: 60 }, (_, i) => minR0 * 1.08 ** i);

  // A family that fits on a page as a plain fan gets one: founders upright at
  // the bottom centre and no arms, however lopsided it is. Sliding the
  // founders to level such a family only skews it.
  let geom: Geom | null = null;
  for (const r0 of radii) {
    const trial = makeGeom(r0, ringGap, slot, flat);
    packTree(root, trial, false);
    const { w, h, reach } = measure(trial);
    if (w > FAN_MAX_WIDTH || h / w < MIN_ASPECT) break;
    if (reach <= trial.flat + trial.vb + HALF && h / w <= TARGET_ASPECT) { geom = trial; break; }
  }

  // Otherwise it needs the arms, and they are levelled by sliding the family
  // along the U (packTree). A bigger founder radius makes a wider, shorter
  // figure, because more of the family fits around the curve. Grow it until
  // the figure is no taller than the target aspect ratio.
  if (!geom) {
    for (const r0 of radii) {
      geom = makeGeom(r0, ringGap, slot, flat);
      geom.u0 = packTree(root, geom, true);
      const { w, h } = measure(geom);
      if (h / w <= TARGET_ASPECT) break;
    }
  }

  return { root, geom: geom!, maxDepth, labelLines };
}

export function nodeAt(n: TNode, i: number, g: Geom): UShapeNode {
  const m = n.members[i];
  const u = memberU(n, i, g);
  const p = trackPoint(u, n.depth * g.ringGap, g);
  const isBlood = m.id === n.blood && !m.dup;
  return {
    id: m.id,
    parent: isBlood && n.parent ? n.parent.blood : null,
    parentU: isBlood && n.parent ? descentU(n.parent, n.parentUnion!, g) : null,
    partnerOf: isBlood || n.isRoot ? null : n.blood,
    depth: n.depth, u, x: p.x, y: p.y, rotation: (-p.theta * 180) / Math.PI,
  };
}

export function toLayout(pedigree: Pedigree, b: Built): UShapeLayout {
  const nodes = new Map<string, UShapeNode>();
  const duplicates: UShapeNode[] = [];
  walk(b.root, n => {
    n.members.forEach((m, i) => {
      if (m.dup) duplicates.push(nodeAt(n, i, b.geom));
      else nodes.set(m.id, nodeAt(n, i, b.geom));
    });
  });
  return {
    nodes,
    duplicates,
    r0: b.geom.r0,
    ringGap: b.geom.ringGap,
    slot: b.geom.slot,
    flat: b.geom.flat,
    maxDepth: b.maxDepth,
    founders: b.root.members.map(m => m.id),
    omitted: pedigree.individuals.filter(i => !nodes.has(i.id)).map(i => i.id),
    coupleLabels: coupleLabels(b, { nodes, duplicates }),
  };
}

/**
 * Where each couple label goes (`UShapeCoupleLabel`): half way along the
 * line, or slid along it to clear the dashed link between two copies of
 * someone that runs straight across the tracks (renderConnectors). Where
 * such a link crosses every place between the partners (often the link from
 * one of the partners themselves, heading inward), the label is written half
 * way on a white backing and the dashed link passes behind it.
 */
export function coupleLabels(b: Built, layout: Pick<UShapeLayout, "nodes" | "duplicates">): UShapeCoupleLabel[] {
  const g = b.geom;
  const placed: UShapeCoupleLabel[] = [];
  const chords: Array<[number, number, number, number]> = [];
  for (const dup of layout.duplicates) {
    const orig = layout.nodes.get(dup.id);
    if (orig && orig.depth !== dup.depth) chords.push([dup.x, dup.y, orig.x, orig.y]);
  }
  walk(b.root, n => {
    for (const w of n.unions) {
      if (!w.label || !w.labelWidth || w.kind === "solo") continue;
      const track = n.depth * g.ringGap;
      const uA = memberU(n, w.a, g);
      const uB = w.kind === "join" ? w.joinNode!.u : memberU(n, w.b!, g);
      const [lo0, hi0] = uA < uB ? [uA, uB] : [uB, uA];
      // Distances are real pixels along the line, which on the curve are
      // not units of u.
      const length = trackDistance(lo0, hi0, track, g);
      const half = w.labelWidth / 2;
      const at = (d: number): UShapeCoupleLabel => {
        const mid = advance(lo0, 1, track, d, g);
        // Any of it over the curve: lift it by the sagitta at its ends. The
        // radius is never tighter than labelRadius (build), so the lift
        // keeps it under the dashed links along the track (maxLabelSag).
        const lo = Math.abs(mid) - half, hi = Math.abs(mid) + half;
        const onCurve = hi > g.flat && lo < g.flat + g.vb;
        const reach = half + CLABEL_REACH;
        const sag = onCurve ? (reach * reach) / (2 * (g.r0 + track - CONSANGUINEOUS_GAP / 2)) : 0;
        const bottom = (w.ended ? CLABEL_ENDED_BASELINE : CLABEL_BASELINE) + sag;
        const p = trackPoint(mid, track, g);
        return {
          partnershipId: w.pids[0]!,
          lines: w.label!,
          width: w.labelWidth!,
          x: p.x, y: p.y,
          rotation: (-p.theta * 180) / Math.PI,
          baselines: [-bottom],
          backed: false,
        };
      };
      const clear = (l: UShapeCoupleLabel): boolean => {
        const a = (-l.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
        const local = (x: number, y: number): [number, number] => [(x - l.x) * cos - (y - l.y) * sin, (x - l.x) * sin + (y - l.y) * cos];
        const box: [number, number, number, number] = [-half - 2, Math.min(...l.baselines) - CLABEL_CAP, half + 2, Math.max(...l.baselines) + 4];
        return chords.every(([x1, y1, x2, y2]) => !segmentMeetsBox(local(x1, y1), local(x2, y2), box));
      };
      // Half way, then further and further either side while the label
      // stays clear of both symbols.
      const room = length / 2 - HALF - CLABEL_PAD - half;
      let found: UShapeCoupleLabel | undefined;
      for (let k = 0; !found && k * 4 <= Math.max(0, room); k++) {
        for (const d of k === 0 ? [0] : [-k * 4, k * 4]) {
          const l = at(length / 2 + d);
          if (clear(l)) { found = l; break; }
        }
      }
      placed.push(found ?? { ...at(length / 2), backed: true });
    }
  });
  return placed;
}

/** Does the segment a-b cross the box [x1, y1, x2, y2]? (Liang-Barsky) */
export function segmentMeetsBox(a: [number, number], b: [number, number], box: [number, number, number, number]): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - box[0]], [dx, box[2] - a[0]], [-dy, a[1] - box[1]], [dy, box[3] - a[1]]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/** Positions only, no SVG. Origin is the centre of the curve, y grows downward. */
export function layoutUShape(pedigree: Pedigree, opts: UShapeOptions = {}): UShapeLayout | null {
  const b = build(pedigree, opts);
  return b ? toLayout(pedigree, b) : null;
}

/**
 * What is drawn for each person (`personGlyph`), worked out once per
 * drawn pedigree. The U-shape has its own layout, so it has no flow nodes to
 * read a glyph from; it asks for the same glyph the canvas and the standard
 * figure draw, with names wrapped at its widest slot and nobody numbered as
 * a copy (its copies are joined by dashed links, not numbers).
 */
export const glyphCache = new WeakMap<Pedigree, { numbers: Map<string, string> | undefined; glyphs: Map<string, PersonGlyph> }>();
export function glyphOf(ind: Individual, pedigree: Pedigree): PersonGlyph {
  let cache = glyphCache.get(pedigree);
  if (!cache) {
    cache = { numbers: labelNumbers(pedigree), glyphs: new Map() };
    glyphCache.set(pedigree, cache);
  }
  let glyph = cache.glyphs.get(ind.id);
  if (!glyph) {
    glyph = personGlyph(ind, pedigree, { labelMax: labelMaxWidth(MAX_SLOT), numbers: cache.numbers, hasParents: hasParents(pedigree, ind.id) });
    cache.glyphs.set(ind.id, glyph);
  }
  return glyph;
}
