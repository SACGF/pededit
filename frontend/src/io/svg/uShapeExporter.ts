import type { Pedigree, Individual } from "@pedigree-editor/layout-engine";
import { deidentify } from "./deidentify";
import type { SvgExportOptions } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// U-shape (horseshoe) pedigree export. Issue #2.
//
// Very wide pedigrees do not fit a journal figure. Bending the pedigree around
// a U lets the long bottom generation run up both arms and around the curve.
//
// Only blood descendants of one founder couple are drawn. Married-in partners
// are dropped, which removes every horizontal couple line except the founders'.
//
// The whole thing is an ordinary tidy tree in a bent coordinate system:
//
//   u      position ALONG the U. 0 is the bottom centre, negative runs up the
//          left arm, positive runs up the right arm. Measured as arc length on
//          the innermost track (the founder track, radius r0).
//   depth  position ACROSS the U. Depth 0 (founders) is the innermost track,
//          and every generation sits one ringGap further out.
//
// So a "horizontal" sibship bar becomes a path that follows a track, and a
// "vertical" descent line becomes a segment along the local outward normal.
// Symbols and labels are rotated so that "down" always points outward.
//
// Outer tracks are longer than inner ones around the curve, so the same step
// in u covers more distance further out. The packing below measures spacing in
// real pixels on each node's own track, which lets the curve hold more nodes
// in the outer generations, where the nodes actually are.
// ─────────────────────────────────────────────────────────────────────────────

const NODE_SIZE = 40;
const HALF = NODE_SIZE / 2;
const STROKE = 2;
const DECEASED_OVERHANG = 4;
const PROBAND_TAIL = 18;
const LABEL_FONT_SIZE = 10;
const LABEL_LINE_HEIGHT = 13;
const LABEL_CHAR_WIDTH = 5.8;   // rough sans-serif advance at LABEL_FONT_SIZE
const CONSANG_GAP = 4;

const MIN_SLOT = 58;            // min centre-to-centre spacing between siblings
const MAX_SLOT = 130;           // long names stop widening the layout here
const FAMILY_GAP = 16;          // extra spacing between cousins (different parents)
const COUPLE_GAP = 80;          // founder couple centre-to-centre spacing
const BAR_CLEARANCE = 12;       // gap between a sibship bar and the child symbols
const TARGET_ASPECT = 1.35;     // height / width the figure aims for (portrait page)
const MAX_PLACE_ATTEMPTS = 4;

// ── Blood tree ────────────────────────────────────────────────────────────────

interface TNode {
  /** One individual, or the two founders for the root. */
  members: string[];
  depth: number;
  parent: TNode | null;
  children: TNode[];
  /** Unsigned distance from the bottom centre, in u units. */
  v: number;
  /** -1 left arm, +1 right arm, 0 centred on the bottom. */
  side: -1 | 0 | 1;
  leaves: number;
}

function buildBloodTree(pedigree: Pedigree): { root: TNode; consang: boolean } | null {
  if (pedigree.individuals.length === 0) return null;

  const byId = new Map<string, Individual>(pedigree.individuals.map(i => [i.id, i]));
  const partnershipsOf = new Map<string, string[]>();
  const hasParents = new Set<string>();
  for (const p of pedigree.partnerships) {
    for (const id of [p.individual1, p.individual2]) {
      if (!partnershipsOf.has(id)) partnershipsOf.set(id, []);
      partnershipsOf.get(id)!.push(p.id);
    }
    for (const c of pedigree.parentOf[p.id] ?? []) hasParents.add(c);
  }

  const childrenOf = (id: string): string[] => {
    const kids: string[] = [];
    for (const pid of partnershipsOf.get(id) ?? []) kids.push(...(pedigree.parentOf[pid] ?? []));
    return kids;
  };

  const countDescendants = (ids: string[]): number => {
    const seen = new Set<string>();
    const stack = [...ids];
    while (stack.length) {
      for (const c of childrenOf(stack.pop()!)) {
        if (!seen.has(c)) { seen.add(c); stack.push(c); }
      }
    }
    return seen.size;
  };

  // Root: the founder couple with the most descendants. If no couple has two
  // founder partners, fall back to whichever couple has the most descendants.
  let rootP: Pedigree["partnerships"][number] | undefined;
  let best = -1;
  for (const p of pedigree.partnerships) {
    if (!(pedigree.parentOf[p.id] ?? []).length) continue;
    const founders = !hasParents.has(p.individual1) && !hasParents.has(p.individual2);
    const score = (founders ? 1e6 : 0) + countDescendants([p.individual1, p.individual2]);
    if (score > best) { best = score; rootP = p; }
  }

  const mk = (members: string[], depth: number, parent: TNode | null): TNode =>
    ({ members, depth, parent, children: [], v: 0, side: 0, leaves: 1 });

  if (!rootP) {
    // Nobody has children. Draw the first couple, or else the first individual.
    const p = pedigree.partnerships[0];
    const members = p ? [p.individual1, p.individual2] : [pedigree.individuals[0].id];
    return { root: mk(members, 0, null), consang: !!p?.consanguineous };
  }

  // Male on the left, as in a standard pedigree.
  const first = byId.get(rootP.individual1)?.sex === "female" ? rootP.individual2 : rootP.individual1;
  const second = first === rootP.individual1 ? rootP.individual2 : rootP.individual1;
  const root = mk([first, second], 0, null);

  const { mode, affectedFirst } = pedigree.siblingOrder ?? { mode: "insertion", affectedFirst: false };
  const orderKey = (id: string): [number, number] => {
    const ind = byId.get(id);
    if (!ind) return [0, 0];
    const a = affectedFirst ? (ind.affected ? 0 : 1) : 0;
    const o = mode === "birthDate" && ind.dob ? new Date(ind.dob).getTime() : ind.sibOrder ?? 0;
    return [a, o];
  };
  const sortSibs = (ids: string[]) =>
    [...new Set(ids)].sort((x, y) => {
      const [ax, ox] = orderKey(x), [ay, oy] = orderKey(y);
      return ax - ay || ox - oy;
    });

  // Breadth-first, so a child of two blood relatives hangs off whichever parent
  // is closer to the founders. Each individual appears exactly once.
  const assigned = new Set<string>(root.members);
  const queue: TNode[] = [root];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    const kids = sortSibs(node.members.flatMap(childrenOf)).filter(c => !assigned.has(c));
    for (const kid of kids) {
      assigned.add(kid);
      const child = mk([kid], node.depth + 1, node);
      node.children.push(child);
      queue.push(child);
    }
  }

  for (let i = queue.length - 1; i >= 0; i--) {
    const n = queue[i];
    if (n.children.length) n.leaves = n.children.reduce((s, c) => s + c.leaves, 0);
  }

  return { root, consang: !!rootP.consanguineous };
}

function walk(root: TNode, fn: (n: TNode) => void): void {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    fn(n);
    stack.push(...n.children);
  }
}

// ── Geometry ──────────────────────────────────────────────────────────────────

interface Geom {
  r0: number;       // radius of the founder track
  ringGap: number;  // distance between consecutive generation tracks
  slot: number;     // min centre-to-centre spacing along a track
  vb: number;       // |u| at which the curve meets the arms
  u0: number;       // where the founders sit along the U (0 = bottom centre)
}

function makeGeom(r0: number, ringGap: number, slot: number): Geom {
  return { r0, ringGap, slot, vb: (Math.PI * r0) / 2, u0: 0 };
}

/**
 * Move `dist` real pixels along the track `offset` px outside the founder
 * track, starting at signed position u and heading in direction dir (-1 toward
 * the left tip, +1 toward the right tip). Returns the new u. On the curve a
 * pixel on an outer track is worth less than a unit of u. On the arms they are
 * equal. The walk may start on an arm, cross the curve, and leave up the other.
 */
function advance(u: number, dir: -1 | 1, offset: number, dist: number, g: Geom): number {
  const scale = g.r0 / (g.r0 + offset);
  const eps = 1e-9;
  let t = u * dir; // position along the direction of travel: curve is [-vb, vb]
  if (t < -g.vb - eps) {
    // On the arm we are travelling down, heading for the curve.
    const room = -g.vb - t;
    if (dist <= room) return (t + dist) * dir;
    dist -= room;
    t = -g.vb;
  }
  if (t < g.vb - eps) {
    const room = (g.vb - t) / scale;
    if (dist <= room) return (t + dist * scale) * dir;
    dist -= room;
    t = g.vb;
  }
  return (t + dist) * dir;
}

interface TrackPoint { x: number; y: number; nx: number; ny: number; theta: number; }

/** Point at signed position u on the track `offset` px outside the founder track. */
function trackPoint(u: number, offset: number, g: Geom): TrackPoint {
  const r = g.r0 + offset;
  const side = u < 0 ? -1 : 1;
  const v = Math.abs(u);
  if (v <= g.vb) {
    const theta = u / g.r0;
    const nx = Math.sin(theta), ny = Math.cos(theta);
    return { x: r * nx, y: r * ny, nx, ny, theta };
  }
  return { x: side * r, y: -(v - g.vb), nx: side, ny: 0, theta: side * Math.PI / 2 };
}

// ── Packing ───────────────────────────────────────────────────────────────────

/**
 * Pack one side of the U, working outward from the bottom centre. Every node
 * goes as close to the centre as the previous node on its own track allows,
 * and a parent sits over the middle of its children. If that would land the
 * parent on top of its neighbour, the children are pushed outward and retried.
 */
function packSide(tops: TNode[], side: -1 | 1, g: Geom, u0: number): number {
  // v is distance from the founders at u0, in u units, heading toward this
  // side's tip. Spacing depends on where along the U a node really is.
  const step = (v: number, offset: number, dist: number): number =>
    (advance(u0 + side * v, side, offset, dist, g) - u0) * side;
  let reach = 0;
  const last: number[] = [];
  const lastParent: (TNode | null)[] = [];
  // The left side is packed from the centre outward, so it is visited in
  // reverse to keep siblings reading left to right in the finished figure.
  const kidsOf = (n: TNode) => (side < 0 ? [...n.children].reverse() : n.children);

  const minV = (n: TNode): number => {
    const offset = n.depth * g.ringGap;
    if (last[n.depth] === undefined) return step(0, offset, (g.slot + FAMILY_GAP) / 2);
    const gap = lastParent[n.depth] === n.parent ? g.slot : g.slot + FAMILY_GAP;
    return step(last[n.depth], offset, gap);
  };

  const place = (n: TNode, hint: number): void => {
    n.side = side;
    const need = Math.max(hint, minV(n));
    const kids = kidsOf(n);
    if (kids.length === 0) {
      n.v = need;
    } else {
      let childHint = -Infinity;
      for (let attempt = 1; ; attempt++) {
        const snapLast = last.slice(), snapParent = lastParent.slice();
        kids.forEach((c, i) => place(c, i === 0 ? childHint : -Infinity));
        const mid = (kids[0].v + kids[kids.length - 1].v) / 2;
        if (mid >= need - 0.5 || attempt >= MAX_PLACE_ATTEMPTS) {
          n.v = Math.max(mid, need);
          break;
        }
        childHint = kids[0].v + (need - mid);
        last.length = 0; last.push(...snapLast);
        lastParent.length = 0; lastParent.push(...snapParent);
      }
    }
    last[n.depth] = n.v;
    lastParent[n.depth] = n.parent;
    reach = Math.max(reach, n.v);
  };

  for (const t of (side < 0 ? [...tops].reverse() : tops)) place(t, -Infinity);
  return reach;
}

/**
 * Lay the whole tree out for a given geometry. Fills in v and side on every
 * node and returns u0, the position of the founders along the U.
 */
function packTree(root: TNode, g: Geom): number {
  // Trunk: while there is a single child there is nothing to split, so the line
  // of descent runs straight out across the tracks.
  const trunk: TNode[] = [root];
  while (trunk[trunk.length - 1].children.length === 1) trunk.push(trunk[trunk.length - 1].children[0]);
  for (const n of trunk) { n.v = 0; n.side = 0; }
  const kids = trunk[trunk.length - 1].children;
  if (kids.length === 0) return 0;

  // Two ways to even out the arms: choose where the sibship is split between
  // them, and slide the founders along the U. A family that fits on the curve
  // has no arms to level, so its founders stay at the bottom centre. A very
  // lopsided family can push its founders part way up one arm, which still
  // reads well and keeps the figure compact.
  //
  // imbalance() is positive when the left arm ends higher than the right one.
  // It falls steadily as the founders move right, so bisection finds the level
  // point.
  const limit = packSide(kids, 1, g, 0);
  const level = (k: number): { u0: number; cost: number } => {
    const imbalance = (u0: number): number => {
      const uMin = Math.min(u0 - packSide(kids.slice(0, k), -1, g, u0), -g.vb);
      const uMax = Math.max(u0 + packSide(kids.slice(k), 1, g, u0), g.vb);
      return -uMin - uMax;
    };
    const atCentre = imbalance(0);
    if (Math.abs(atCentre) <= 1) return { u0: 0, cost: 0 };
    let lo = atCentre > 0 ? 0 : -limit, hi = atCentre > 0 ? limit : 0;
    for (let i = 0; i < 20 && hi - lo > 1; i++) {
      const mid = (lo + hi) / 2;
      if (imbalance(mid) > 0) lo = mid; else hi = mid;
    }
    const u0 = (lo + hi) / 2;
    // Uneven arms waste the page, so they cost the most. Between splits that
    // level equally well, prefer the one that keeps the founders near the centre.
    return { u0, cost: Math.abs(imbalance(u0)) + 0.5 * Math.abs(u0) };
  };

  let k = 1, u0 = 0, bestCost = Infinity;
  for (let i = 1; i < kids.length; i++) {
    const r = level(i);
    if (r.cost < bestCost) { bestCost = r.cost; k = i; u0 = r.u0; }
  }
  packSide(kids.slice(0, k), -1, g, u0);
  packSide(kids.slice(k), 1, g, u0);
  return u0;
}

// ── Public layout ─────────────────────────────────────────────────────────────

export interface UShapeNode {
  id: string;
  /** Blood parent this individual hangs from; null for the founders. */
  parent: string | null;
  depth: number;
  /** Signed position along the U: negative left arm, positive right arm. */
  u: number;
  x: number;
  y: number;
  /** Rotation in degrees that points the symbol's "down" outward. */
  rotation: number;
}

export interface UShapeLayout {
  nodes: Map<string, UShapeNode>;
  r0: number;
  ringGap: number;
  slot: number;
  maxDepth: number;
  /** The founder couple (or a lone individual) at the bottom of the U. */
  founders: string[];
  /** Individuals in the pedigree that are not drawn (married-in, other families). */
  omitted: string[];
}

interface Extent { minX: number; maxX: number; minY: number; maxY: number; }

function signedU(n: TNode, memberIndex: number, g: Geom): number {
  if (n.members.length === 2) return g.u0 + (memberIndex === 0 ? -1 : 1) * (COUPLE_GAP / 2);
  return g.u0 + n.side * n.v;
}

function extentOf(root: TNode, g: Geom): Extent {
  const e: Extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  walk(root, n => {
    n.members.forEach((_, i) => {
      const p = trackPoint(signedU(n, i, g), n.depth * g.ringGap, g);
      e.minX = Math.min(e.minX, p.x); e.maxX = Math.max(e.maxX, p.x);
      e.minY = Math.min(e.minY, p.y); e.maxY = Math.max(e.maxY, p.y);
    });
  });
  return e;
}

interface Built { root: TNode; consang: boolean; geom: Geom; maxDepth: number; labelLines: number; }

function build(pedigree: Pedigree): Built | null {
  const tree = buildBloodTree(pedigree);
  if (!tree) return null;
  const { root } = tree;

  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  let maxDepth = 0, labelLines = 0, labelChars = 0;
  walk(root, n => {
    maxDepth = Math.max(maxDepth, n.depth);
    for (const id of n.members) {
      const ind = byId.get(id);
      if (!ind) continue;
      labelLines = Math.max(labelLines, (ind.name ? 1 : 0) + (ind.dob ? 1 : 0));
      labelChars = Math.max(labelChars, ind.name?.length ?? 0, ind.dob?.length ?? 0);
    }
  });

  // A label sits between its symbol and the sibship bar beyond it, so the
  // tracks move apart when labels have more lines, and nodes move apart along
  // the track when labels are long.
  const ringGap = NODE_SIZE + 8 + labelLines * LABEL_LINE_HEIGHT + BAR_CLEARANCE + 6;
  const slot = Math.min(MAX_SLOT, Math.max(MIN_SLOT, labelChars * LABEL_CHAR_WIDTH + 12));

  // A bigger founder radius makes a wider, shorter figure, because more of the
  // family fits around the curve. Grow it until the figure is no taller than
  // the target aspect ratio.
  const minR0 = Math.max(1.4 * ringGap, COUPLE_GAP + NODE_SIZE);
  let geom = makeGeom(minR0, ringGap, slot);
  for (let r0 = minR0, i = 0; i < 60; r0 *= 1.08, i++) {
    geom = makeGeom(r0, ringGap, slot);
    geom.u0 = packTree(root, geom);
    const e = extentOf(root, geom);
    const w = e.maxX - e.minX + 2 * ringGap, h = e.maxY - e.minY + 2 * ringGap;
    if (h / w <= TARGET_ASPECT) break;
  }

  return { root, consang: tree.consang, geom, maxDepth, labelLines };
}

function toLayout(pedigree: Pedigree, b: Built): UShapeLayout {
  const nodes = new Map<string, UShapeNode>();
  walk(b.root, n => {
    n.members.forEach((id, i) => {
      const u = signedU(n, i, b.geom);
      const p = trackPoint(u, n.depth * b.geom.ringGap, b.geom);
      nodes.set(id, { id, parent: n.parent ? n.parent.members[0] : null, depth: n.depth, u, x: p.x, y: p.y, rotation: (-p.theta * 180) / Math.PI });
    });
  });
  return {
    nodes,
    r0: b.geom.r0,
    ringGap: b.geom.ringGap,
    slot: b.geom.slot,
    maxDepth: b.maxDepth,
    founders: b.root.members,
    omitted: pedigree.individuals.filter(i => !nodes.has(i.id)).map(i => i.id),
  };
}

/** Positions only, no SVG. Origin is the centre of the curve, y grows downward. */
export function layoutUShape(pedigree: Pedigree): UShapeLayout | null {
  const b = build(pedigree);
  return b ? toLayout(pedigree, b) : null;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function r(n: number): number { return Math.round(n * 10) / 10; }

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const LINE_ATTRS = `fill="none" stroke="black" stroke-width="${STROKE}" stroke-linecap="round"`;

/** A path that follows one track from u1 to u2: true arcs on the curve, lines on the arms. */
function trackPath(u1: number, u2: number, offset: number, g: Geom, attrs = LINE_ATTRS): string {
  const a = Math.min(u1, u2), b = Math.max(u1, u2);
  const eps = 1e-6;
  const cuts = [a, ...[-g.vb, 0, g.vb].filter(c => c > a + eps && c < b - eps), b];
  const rad = r(g.r0 + offset);
  const at = (u: number) => { const p = trackPoint(u, offset, g); return `${r(p.x)} ${r(p.y)}`; };
  let d = `M ${at(a)}`;
  for (let i = 1; i < cuts.length; i++) {
    const onCurve = Math.abs((cuts[i - 1] + cuts[i]) / 2) < g.vb;
    d += onCurve ? ` A ${rad} ${rad} 0 0 0 ${at(cuts[i])}` : ` L ${at(cuts[i])}`;
  }
  return `<path d="${d}" ${attrs}/>`;
}

/** A straight segment across the tracks at position u, from offset o1 to o2. */
function normalSeg(u: number, o1: number, o2: number, g: Geom): string {
  const p1 = trackPoint(u, o1, g), p2 = trackPoint(u, o2, g);
  return `<line x1="${r(p1.x)}" y1="${r(p1.y)}" x2="${r(p2.x)}" y2="${r(p2.y)}" ${LINE_ATTRS}/>`;
}

function renderConnectors(b: Built): string[] {
  const g = b.geom;
  const out: string[] = [];

  if (b.root.members.length === 2) {
    const uL = signedU(b.root, 0, g), uR = signedU(b.root, 1, g);
    if (b.consang) {
      out.push(trackPath(uL, uR, -CONSANG_GAP / 2, g), trackPath(uL, uR, CONSANG_GAP / 2, g));
    } else {
      out.push(trackPath(uL, uR, 0, g));
    }
  }

  walk(b.root, n => {
    if (n.children.length === 0) return;
    const isCouple = n.members.length === 2;
    const uP = isCouple ? g.u0 : signedU(n, 0, g);
    const from = n.depth * g.ringGap + (isCouple ? 0 : HALF);
    const childEdge = (n.depth + 1) * g.ringGap - HALF;
    const bar = childEdge - BAR_CLEARANCE;
    const us = n.children.map(c => signedU(c, 0, g));

    out.push(normalSeg(uP, from, bar, g));
    const lo = Math.min(uP, ...us), hi = Math.max(uP, ...us);
    if (hi - lo > 0.01) out.push(trackPath(lo, hi, bar, g));
    for (const u of us) out.push(normalSeg(u, bar, childEdge, g));
  });

  return out;
}

function renderShape(ind: Individual): string {
  const fill = ind.affected ? "black" : "white";
  let shape: string;
  if (ind.sex === "male") {
    shape = `<rect x="${-HALF}" y="${-HALF}" width="${NODE_SIZE}" height="${NODE_SIZE}" stroke="black" stroke-width="${STROKE}" fill="${fill}"/>`;
  } else if (ind.sex === "female") {
    shape = `<circle cx="0" cy="0" r="${HALF - 1}" stroke="black" stroke-width="${STROKE}" fill="${fill}"/>`;
  } else {
    const h = HALF - 1;
    shape = `<polygon points="0,${-h} ${h},0 0,${h} ${-h},0" stroke="black" stroke-width="${STROKE}" fill="${fill}"/>`;
  }
  if (ind.carrier && !ind.affected) shape += `<circle cx="0" cy="0" r="${NODE_SIZE * 0.15}" fill="black"/>`;
  return shape;
}

function renderDeceasedSlash(): string {
  const o = HALF + DECEASED_OVERHANG;
  return `<line x1="${-o}" y1="${-o}" x2="${o}" y2="${o}" stroke="black" stroke-width="${STROKE}"/>`;
}

function renderProbandArrow(): string {
  const tipX = -HALF, tipY = HALF;
  return `<line x1="${tipX - PROBAND_TAIL}" y1="${tipY + PROBAND_TAIL}" x2="${tipX}" y2="${tipY}" stroke="black" stroke-width="${STROKE}" marker-end="url(#proband-arrowhead)"/>`;
}

/**
 * Labels sit on the outward side of the symbol, rotated with it. For anyone
 * with children the descent line runs through that spot, so the text gets a
 * white backing to stay readable.
 */
function renderLabel(ind: Individual, hasDescent: boolean): string {
  const lines = [ind.name, ind.dob].filter((s): s is string => !!s);
  if (lines.length === 0) return "";
  const out: string[] = [];
  if (hasDescent) {
    const w = Math.max(...lines.map(l => l.length)) * LABEL_CHAR_WIDTH + 4;
    const h = lines.length * LABEL_LINE_HEIGHT;
    out.push(`<rect x="${r(-w / 2)}" y="${HALF + 3}" width="${r(w)}" height="${h}" fill="white"/>`);
  }
  lines.forEach((text, i) => {
    const y = HALF + 3 + LABEL_FONT_SIZE + i * LABEL_LINE_HEIGHT;
    out.push(`<text x="0" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" fill="black">${escapeXml(text)}</text>`);
  });
  return out.join("");
}

function renderSymbols(pedigree: Pedigree, b: Built, layout: UShapeLayout): string[] {
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const out: string[] = [];
  walk(b.root, n => {
    // The founders' descent line leaves from their couple line, not from them.
    const hasDescent = n.children.length > 0 && n.members.length === 1;
    for (const id of n.members) {
      const ind = byId.get(id), pos = layout.nodes.get(id);
      if (!ind || !pos) continue;
      out.push(
        `<g data-id="${escapeXml(id)}" transform="translate(${r(pos.x)} ${r(pos.y)}) rotate(${r(pos.rotation)})">` +
        renderLabel(ind, hasDescent) +
        renderShape(ind) +
        (ind.deceased ? renderDeceasedSlash() : "") +
        (ind.proband ? renderProbandArrow() : "") +
        `</g>`,
      );
    }
  });
  return out;
}

function renderDebugTracks(b: Built, layout: UShapeLayout): string[] {
  let lo = 0, hi = 0;
  for (const n of layout.nodes.values()) { lo = Math.min(lo, n.u); hi = Math.max(hi, n.u); }
  const attrs = `fill="none" stroke="red" stroke-width="0.75" stroke-dasharray="4 3"`;
  const out: string[] = [];
  for (let d = 0; d <= b.maxDepth; d++) out.push(trackPath(lo, hi, d * b.geom.ringGap, b.geom, attrs));
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportUShapeSvg(pedigree: Pedigree, options: SvgExportOptions = {}): string {
  const working = options.deidentify ? deidentify(pedigree, options) : pedigree;
  const b = build(working);
  if (!b) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="white"/>
</svg>`;
  }
  const layout = toLayout(working, b);

  // Everything hangs off the symbols, so the bounds are the symbol centres plus
  // room for the furthest thing attached to one: the label or the proband arrow.
  const reach = Math.max(
    HALF + 6 + b.labelLines * LABEL_LINE_HEIGHT,
    (HALF + PROBAND_TAIL) * Math.SQRT2,
  );
  const padding = options.padding ?? 40;
  const margin = reach + padding;
  const titleH = options.title ? 28 : 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of layout.nodes.values()) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  const width = Math.ceil(maxX - minX + 2 * margin);
  const height = Math.ceil(maxY - minY + 2 * margin + titleH);

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    `<defs>
  <marker id="proband-arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
    <path d="M 0 0 L 6 3 L 0 6 Z" fill="black"/>
  </marker>
</defs>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];
  if (options.title) {
    out.push(
      `<text x="${width / 2}" y="${padding / 2 + 14}" text-anchor="middle" font-family="sans-serif" ` +
      `font-size="14" font-weight="bold" fill="black">${escapeXml(options.title)}</text>`,
    );
  }
  out.push(`<g transform="translate(${r(margin - minX)} ${r(margin - minY + titleH)})">`);
  if (options.debugSpine) out.push(...renderDebugTracks(b, layout));
  out.push(...renderConnectors(b));
  out.push(...renderSymbols(working, b, layout));
  out.push(`</g>`, `</svg>`);
  return out.join("\n");
}
