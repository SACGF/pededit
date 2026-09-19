import type { Pedigree, Individual } from "@pedigree-editor/layout-engine";
import { deidentify } from "./deidentify";
import type { SvgExportOptions } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// U-shape (horseshoe) pedigree export. Issue #2.
//
// Very wide pedigrees do not fit a journal figure. Bending the pedigree around
// a U lets the long bottom generation run up both arms and around the curve.
//
// The figure is a descendant chart of one founder couple. Each descendant is
// drawn with their partners beside them on the same track (unless partners
// are switched off), and each sibship hangs from the middle of its parents'
// couple line. Ancestors of married-in partners are not drawn.
//
// The whole thing is an ordinary tidy tree in a bent coordinate system:
//
//   u      position ALONG the U. 0 is the bottom centre, negative runs up the
//          left arm, positive runs up the right arm. Measured as distance on
//          the innermost track (the founder track).
//   depth  position ACROSS the U. Depth 0 (founders) is the innermost track,
//          and every generation sits one ringGap further out.
//
// The U itself is a short flat bottom (so the founders stand upright), a
// quarter circle on each side, and two vertical arms.
//
// So a "horizontal" sibship bar or couple line becomes a path that follows a
// track, and a "vertical" descent line becomes a segment along the local
// outward normal. Symbols and labels are rotated so "down" points outward.
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
const COUPLE_GAP = 80;          // couple centre-to-centre spacing
const BAR_CLEARANCE = 12;       // gap between a sibship bar and the child symbols
const DUP_LINK_INSET = 6;       // "same person" link runs this far inside the symbols
const TARGET_ASPECT = 1.35;     // height / width the figure aims for (portrait page)
const MIN_ASPECT = 0.5;         // a fan flatter than this is no better than the ordinary export
const MAX_PLACE_ATTEMPTS = 4;
const FAN_MAX_WIDTH = 1200;     // a fan wider than this is no longer a page-sized figure
const MAX_FLAT = 260;           // longest half flat bottom that generation 1 may claim

type Partnership = Pedigree["partnerships"][number];

export interface UShapeOptions {
  /** Draw married-in partners beside their blood partner. Default true. */
  partners?: boolean;
}

// ── Tree ──────────────────────────────────────────────────────────────────────

/** One symbol. dx is its distance along the track from the node's reference point, in px. */
interface Member { id: string; dx: number; dup: boolean; }

/**
 * A partnership of a node's blood member, or its children by partners who are
 * not drawn ("solo").
 *   spouse  partner drawn beside the blood member
 *   dup     partner is drawn elsewhere too (a blood relative, or somebody with
 *           two partners in the tree). A second copy is drawn here, with a
 *           dashed link to the first.
 *   join    partner is a blood relative who is the neighbouring node on the
 *           same track, so the couple line runs straight to them
 */
interface Union {
  kind: "solo" | "spouse" | "dup" | "join";
  order: number;
  pids: string[];
  partner: string | null;
  /** Double couple line: flagged consanguineous, or the partner is a blood relative. */
  consang: boolean;
  kids: TNode[];
  /** Member indices of the couple. b is null for solo and join. */
  a: number;
  b: number | null;
  joinNode: TNode | null;
  /** Which side the partner is on, for join. For dup, which side is preferred. */
  joinSide: -1 | 1;
}

interface TNode {
  /** The individual whose parents place this node. For the root, the shared founder. */
  blood: string;
  isRoot: boolean;
  members: Member[];
  /** Left to right. Children are the unions' kids in this order. */
  unions: Union[];
  depth: number;
  parent: TNode | null;
  parentUnion: Union | null;
  /** A neighbour's couple line arrives on this side, so no partner can stand there. */
  reservedL: boolean;
  reservedR: boolean;
  /** Unsigned distance from the centre of the packing, in u units. */
  v: number;
  /** -1 left arm, +1 right arm, 0 on the trunk. */
  side: -1 | 0 | 1;
  /** Signed position of the reference point along the U. */
  u: number;
}

const kidsOf = (n: TNode): TNode[] => (n.unions.length === 1 ? n.unions[0].kids : n.unions.flatMap(w => w.kids));

function walk(root: TNode, fn: (n: TNode) => void): void {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    fn(n);
    for (const w of n.unions) stack.push(...w.kids);
  }
}

/** Nodes on each track, left to right. */
function levelLists(root: TNode): TNode[][] {
  const lists: TNode[][] = [];
  // Iterative pre-order, because a deep pedigree is not worth a stack overflow.
  const stack: TNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    (lists[n.depth] ??= []).push(n);
    const kids = kidsOf(n);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
  return lists;
}

/**
 * Put a node's partners around its blood member and order its unions left to
 * right. Returns false if there is no free side for a partner.
 */
function arrange(n: TNode, sexOf: (id: string) => string | undefined): boolean {
  if (n.isRoot) return true;
  const couples = n.unions.filter(w => w.kind !== "solo").sort((x, y) => x.order - y.order);
  const plain = couples.filter(w => w.kind === "spouse");
  const prefer = (w: Union): -1 | 1 => {
    if (w.kind !== "spouse") return w.joinSide;
    if (plain.length === 2) return w === plain[0] ? -1 : 1;
    // Male on the left, as in a standard pedigree.
    return sexOf(w.partner!) === "male" && sexOf(n.blood) !== "male" ? -1 : 1;
  };
  let left: Union | null = null, right: Union | null = null;
  const free = (s: -1 | 1) => (s < 0 ? !n.reservedL && !left : !n.reservedR && !right);
  const rank = { join: 0, dup: 1, spouse: 2, solo: 3 };
  for (const w of [...couples].sort((x, y) => rank[x.kind] - rank[y.kind] || x.order - y.order)) {
    let s = prefer(w);
    if (!free(s)) {
      if (w.kind === "join" || !free(-s as -1 | 1)) return false;
      s = -s as -1 | 1;
    }
    if (s < 0) left = w; else right = w;
  }
  const members: Member[] = [];
  if (left && left.kind !== "join") members.push({ id: left.partner!, dx: -COUPLE_GAP, dup: left.kind === "dup" });
  const me = members.length;
  members.push({ id: n.blood, dx: 0, dup: false });
  if (right && right.kind !== "join") members.push({ id: right.partner!, dx: COUPLE_GAP, dup: right.kind === "dup" });
  if (left) { left.a = me; left.b = left.kind === "join" ? null : 0; }
  if (right) { right.a = me; right.b = right.kind === "join" ? null : members.length - 1; }
  const solo = n.unions.find(w => w.kind === "solo");
  if (solo) solo.a = me;
  n.members = members;
  n.unions = [left, solo, right].filter((w): w is Union => !!w);
  return true;
}

function buildTree(pedigree: Pedigree, partners: boolean): TNode | null {
  if (pedigree.individuals.length === 0) return null;

  const byId = new Map<string, Individual>(pedigree.individuals.map(i => [i.id, i]));
  const sexOf = (id: string) => byId.get(id)?.sex;
  const partnershipsOf = new Map<string, Partnership[]>();
  const hasParents = new Set<string>();
  for (const p of pedigree.partnerships) {
    for (const id of [p.individual1, p.individual2]) {
      if (!partnershipsOf.has(id)) partnershipsOf.set(id, []);
      partnershipsOf.get(id)!.push(p);
    }
    for (const c of pedigree.parentOf[p.id] ?? []) hasParents.add(c);
  }
  const kidIds = (p: Partnership): string[] => pedigree.parentOf[p.id] ?? [];
  const otherOf = (p: Partnership, id: string) => (p.individual1 === id ? p.individual2 : p.individual1);

  const descendants = (ids: string[]): Set<string> => {
    const seen = new Set<string>();
    const stack = [...ids];
    while (stack.length) {
      for (const p of partnershipsOf.get(stack.pop()!) ?? []) {
        for (const c of kidIds(p)) if (!seen.has(c)) { seen.add(c); stack.push(c); }
      }
    }
    return seen;
  };

  // Root: a founder couple, preferably one whose line includes the proband,
  // then the one with the most descendants. If no couple has two founder
  // partners, fall back to whichever couple has the most descendants.
  const probands = pedigree.individuals.filter(i => i.proband).map(i => i.id);
  let rootP: Partnership | undefined;
  let best = -1;
  for (const p of pedigree.partnerships) {
    if (!kidIds(p).length) continue;
    const founders = !hasParents.has(p.individual1) && !hasParents.has(p.individual2);
    const line = descendants([p.individual1, p.individual2]);
    line.add(p.individual1).add(p.individual2);
    const showsProband = probands.some(q =>
      line.has(q) || (partners && (partnershipsOf.get(q) ?? []).some(pp => line.has(otherOf(pp, q)))));
    const score = (founders ? 1e7 : 0) + (showsProband ? 1e6 : 0) + line.size;
    if (score > best) { best = score; rootP = p; }
  }

  let nextOrder = 0;
  const mkUnion = (kind: Union["kind"], pids: string[], partner: string | null, consang: boolean): Union =>
    ({ kind, order: nextOrder++, pids, partner, consang, kids: [], a: 0, b: null, joinNode: null, joinSide: 1 });
  const mkNode = (blood: string, depth: number, parent: TNode | null, parentUnion: Union | null): TNode => ({
    blood, isRoot: parent === null, members: [{ id: blood, dx: 0, dup: false }], unions: [], depth, parent, parentUnion,
    reservedL: false, reservedR: false, v: 0, side: 0, u: 0,
  });

  if (!rootP) {
    // Nobody has children. Draw the first couple, or else the first individual.
    const p = pedigree.partnerships[0];
    if (!p) return mkNode(pedigree.individuals[0].id, 0, null, null);
    const root = mkNode(p.individual1, 0, null, null);
    root.members = [{ id: p.individual1, dx: -COUPLE_GAP / 2, dup: false }, { id: p.individual2, dx: COUPLE_GAP / 2, dup: false }];
    root.unions = [{ ...mkUnion("spouse", [p.id], p.individual2, !!p.consanguineous), a: 0, b: 1 }];
    return root;
  }

  const bloodLine = descendants([rootP.individual1, rootP.individual2]);
  bloodLine.add(rootP.individual1).add(rootP.individual2);

  // A founder with children by a second partner (remarriage, half-siblings) is
  // drawn between both partners, each couple with its own sibship on its own
  // side of the U. Only one such partnership is drawn. Children of any further
  // partnerships of the founders are omitted rather than shown under the wrong
  // couple.
  let extraP: Partnership | undefined;
  for (const p of pedigree.partnerships) {
    if (p === rootP || !kidIds(p).length) continue;
    const inRoot = [p.individual1, p.individual2].filter(id => id === rootP!.individual1 || id === rootP!.individual2);
    if (inRoot.length !== 1) continue;
    extraP = p;
    break;
  }

  // Anybody drawn. A partner who is a blood relative, or who is already drawn
  // beside somebody else, is a duplicate.
  const drawn = new Set<string>();
  const consumed = new Set<string>([rootP.id]);
  const isRelated = (p: Partnership, of: string) => bloodLine.has(otherOf(p, of));

  let root: TNode;
  if (!extraP) {
    // Male on the left, as in a standard pedigree.
    const first = sexOf(rootP.individual1) === "female" ? rootP.individual2 : rootP.individual1;
    const second = otherOf(rootP, first);
    root = mkNode(first, 0, null, null);
    root.members = [{ id: first, dx: -COUPLE_GAP / 2, dup: false }, { id: second, dx: COUPLE_GAP / 2, dup: false }];
    root.unions = [{ ...mkUnion("spouse", [rootP.id], second, !!rootP.consanguineous), a: 0, b: 1 }];
  } else {
    // Earlier partnership on the left, the shared parent in the middle.
    consumed.add(extraP.id);
    const [pl, pr] = pedigree.partnerships.indexOf(extraP) < pedigree.partnerships.indexOf(rootP) ? [extraP, rootP] : [rootP, extraP];
    const hub = pl.individual1 === pr.individual1 || pl.individual1 === pr.individual2 ? pl.individual1 : pl.individual2;
    root = mkNode(hub, 0, null, null);
    const isDup = (p: Partnership) => p === extraP && bloodLine.has(otherOf(p, hub));
    root.members = [
      { id: otherOf(pl, hub), dx: -COUPLE_GAP, dup: isDup(pl) },
      { id: hub, dx: 0, dup: false },
      { id: otherOf(pr, hub), dx: COUPLE_GAP, dup: isDup(pr) },
    ];
    root.unions = [pl, pr].map((p, i) => ({
      ...mkUnion(isDup(p) ? "dup" : "spouse", [p.id], otherOf(p, hub), !!p.consanguineous || isDup(p)),
      a: 1, b: i === 0 ? 0 : 2,
    }));
  }
  for (const m of root.members) if (!m.dup) drawn.add(m.id);

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

  // Breadth-first, so a child of two blood relatives hangs from whichever
  // parent is closer to the founders. Each individual has exactly one node.
  const nodeOf = new Map<string, TNode>();
  const assigned = new Set<string>(root.members.filter(m => !m.dup).map(m => m.id));
  const queue: TNode[] = [root];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    if (node !== root) {
      // Partnerships with children first. At most two partners fit beside one
      // symbol. Further partnerships are omitted along with their children.
      const ps = (partnershipsOf.get(node.blood) ?? []).filter(p => !consumed.has(p.id));
      // With partners off, children by partners who are not drawn hang from
      // the symbol itself, which leaves room for one couple line only.
      const solo = partners ? [] : ps.filter(p => !isRelated(p, node.blood) && kidIds(p).length);
      const couples = ps.filter(p => partners || isRelated(p, node.blood))
        .sort((x, y) => Number(!kidIds(x).length) - Number(!kidIds(y).length))
        .slice(0, solo.length ? 1 : 2);
      // Keep the pedigree's own order among the partnerships that are drawn.
      couples.sort((x, y) => ps.indexOf(x) - ps.indexOf(y));
      for (const p of couples) {
        consumed.add(p.id);
        const other = otherOf(p, node.blood);
        const related = bloodLine.has(other);
        const dup = related || drawn.has(other);
        if (!dup) drawn.add(other);
        node.unions.push(mkUnion(dup ? "dup" : "spouse", [p.id], other, !!p.consanguineous || related));
      }
      if (solo.length) node.unions.push(mkUnion("solo", solo.map(p => p.id), null, false));
    }
    for (const w of node.unions) {
      const ids = sortSibs(w.pids.flatMap(pid => pedigree.parentOf[pid] ?? [])).filter(c => !assigned.has(c));
      for (const kid of ids) {
        assigned.add(kid);
        const child = mkNode(kid, node.depth + 1, node, w);
        w.kids.push(child);
        nodeOf.set(kid, child);
        queue.push(child);
      }
    }
  }

  // A blood relative whose own node was never reached (their parents'
  // partnership was omitted) is drawn as an ordinary partner.
  for (const n of queue) {
    for (const w of n.unions) {
      if (w.kind !== "dup" || nodeOf.has(w.partner!) || drawn.has(w.partner!)) continue;
      w.kind = "spouse";
      drawn.add(w.partner!);
      if (n.isRoot) n.members[w.b!].dup = false;
    }
  }

  for (const n of queue) arrange(n, sexOf);

  // A duplicate stands on the side nearer the original.
  const preorder = new Map<TNode, number>();
  { let i = 0; const st = [root]; while (st.length) { const n = st.pop()!; preorder.set(n, i++); const k = kidsOf(n); for (let j = k.length - 1; j >= 0; j--) st.push(k[j]); } }
  for (const n of queue) {
    if (n.isRoot) continue;
    let changed = false;
    for (const w of n.unions) {
      const other = w.kind === "dup" ? nodeOf.get(w.partner!) : undefined;
      if (!other) continue;
      w.joinSide = preorder.get(other)! < preorder.get(n)! ? -1 : 1;
      changed = true;
    }
    if (changed) arrange(n, sexOf);
  }

  // Blood relatives on the same track are joined directly where the tree can
  // be reordered to make them neighbours. Otherwise the duplicate stays.
  const joins: Array<{ host: TNode; w: Union }> = [];
  for (const host of queue) {
    for (const w of [...host.unions]) {
      const other = w.kind === "dup" ? nodeOf.get(w.partner!) : undefined;
      if (!other || other.depth !== host.depth || host.isRoot) continue;
      if (tryJoin(root, host, w, other, sexOf, joins)) joins.push({ host, w });
    }
  }

  return root;
}

function joinsHold(root: TNode, joins: Array<{ host: TNode; w: Union }>): boolean {
  const lists = levelLists(root);
  return joins.every(({ host, w }) => {
    const level = lists[host.depth];
    return level[level.indexOf(host) + w.joinSide] === w.joinNode;
  });
}

/**
 * Reorder siblings so that host and other become neighbours on their track,
 * facing each other with nobody between. Undoes everything and returns false
 * if that cannot be done without breaking an earlier join.
 */
function tryJoin(
  root: TNode, host: TNode, w: Union, other: TNode,
  sexOf: (id: string) => string | undefined,
  joins: Array<{ host: TNode; w: Union }>,
): boolean {
  const level = levelLists(root)[host.depth];
  const hostLeft = level.indexOf(host) < level.indexOf(other);
  if (hostLeft ? other.reservedL : other.reservedR) return false;
  const lp = hostLeft ? host : other, rp = hostLeft ? other : host;
  let l = lp, r = rp;
  while (l.parent !== r.parent) { l = l.parent!; r = r.parent!; }

  const log: Array<[TNode[], TNode[]]> = [];
  const move = (m: TNode, where: "start" | "end" | TNode) => {
    const arr = m.parentUnion!.kids;
    log.push([arr, arr.slice()]);
    arr.splice(arr.indexOf(m), 1);
    if (where === "start") arr.unshift(m);
    else if (where === "end") arr.push(m);
    else arr.splice(arr.indexOf(where) + 1, 0, m);
  };
  if (l.parentUnion === r.parentUnion) move(r, l);
  else { move(l, "end"); move(r, "start"); }
  for (let m = lp; m !== l; m = m.parent!) move(m, "end");
  for (let m = rp; m !== r; m = m.parent!) move(m, "start");

  const hint = w.joinSide;
  w.kind = "join"; w.joinNode = other; w.joinSide = hostLeft ? 1 : -1;
  if (hostLeft) other.reservedL = true; else other.reservedR = true;
  if (arrange(host, sexOf) && arrange(other, sexOf) && joinsHold(root, [...joins, { host, w }])) return true;

  for (const [arr, copy] of log.reverse()) { arr.length = 0; arr.push(...copy); }
  w.kind = "dup"; w.joinNode = null; w.joinSide = hint;
  if (hostLeft) other.reservedL = false; else other.reservedR = false;
  arrange(host, sexOf);
  arrange(other, sexOf);
  return false;
}

// ── Geometry ──────────────────────────────────────────────────────────────────

interface Geom {
  r0: number;       // radius of the founder track around the curve
  ringGap: number;  // distance between consecutive generation tracks
  slot: number;     // min centre-to-centre spacing along a track
  flat: number;     // half the length of the flat bottom
  vb: number;       // length of each quarter circle on the founder track
  u0: number;       // where the founders sit along the U (0 = bottom centre)
}

function makeGeom(r0: number, ringGap: number, slot: number, flat: number): Geom {
  return { r0, ringGap, slot, flat, vb: (Math.PI * r0) / 2, u0: 0 };
}

/**
 * Move `dist` real pixels along the track `offset` px outside the founder
 * track, starting at signed position u and heading in direction dir (-1 toward
 * the left tip, +1 toward the right tip). Returns the new u. On the curve a
 * pixel on an outer track is worth less than a unit of u. On the flat bottom
 * and the arms they are equal. A negative dist walks the other way.
 */
function advance(u: number, dir: -1 | 1, offset: number, dist: number, g: Geom): number {
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

interface TrackPoint { x: number; y: number; nx: number; ny: number; theta: number; }

/** Point at signed position u on the track `offset` px outside the founder track. */
function trackPoint(u: number, offset: number, g: Geom): TrackPoint {
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
function memberU(n: TNode, i: number, g: Geom): number {
  const dx = n.members[i].dx;
  return dx === 0 ? n.u : advance(n.u, dx < 0 ? -1 : 1, n.depth * g.ringGap, Math.abs(dx), g);
}

/** Where a union's descent line leaves the track: the middle of the couple line. */
function descentU(n: TNode, w: Union, g: Geom): number {
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
function packSide(tops: TNode[], side: -1 | 1, g: Geom, uC: number, firstMin = -Infinity): number {
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
      ? step(0, offset, (g.slot + FAMILY_GAP) / 2 + inward)
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
function packTree(root: TNode, g: Geom, slide: boolean): number {
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
  else for (let i = 1; i < kids.length; i++) splits.push(i);
  const firstMin = groups.length > 1 ? COUPLE_GAP / 2 : -Infinity;

  // Two ways to even out the arms: choose where the sibship is split between
  // them, and slide the founders along the U. A family that fits on the curve
  // has no arms to level, so its founders stay at the bottom centre.
  //
  // imbalance() is positive when the left arm ends higher than the right one.
  // It falls steadily as the founders move right, so bisection finds the level
  // point.
  const armStart = g.flat + g.vb;
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
}

interface Extent { minX: number; maxX: number; minY: number; maxY: number; }

function extentOf(root: TNode, g: Geom): Extent {
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

interface Built { root: TNode; geom: Geom; maxDepth: number; labelLines: number; }

function build(pedigree: Pedigree, opts: UShapeOptions = {}): Built | null {
  const root = buildTree(pedigree, opts.partners ?? true);
  if (!root) return null;

  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  let maxDepth = 0, labelLines = 0, labelChars = 0;
  walk(root, n => {
    maxDepth = Math.max(maxDepth, n.depth);
    for (const { id } of n.members) {
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
  const minR0 = Math.max(1.4 * ringGap, (root.members.length - 1) * COUPLE_GAP + NODE_SIZE);

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
  const slide = geom === null;

  // Otherwise it needs the arms, and they are levelled by sliding the
  // founders along the U. A bigger founder radius makes a wider, shorter
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
  geom!.u0 = packTree(root, geom!, slide);

  return { root, geom: geom!, maxDepth, labelLines };
}

function nodeAt(n: TNode, i: number, g: Geom): UShapeNode {
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

function toLayout(pedigree: Pedigree, b: Built): UShapeLayout {
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
  };
}

/** Positions only, no SVG. Origin is the centre of the curve, y grows downward. */
export function layoutUShape(pedigree: Pedigree, opts: UShapeOptions = {}): UShapeLayout | null {
  const b = build(pedigree, opts);
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

/** A path that follows one track from u1 to u2: true arcs on the curve, lines elsewhere. */
function trackPath(u1: number, u2: number, offset: number, g: Geom, attrs = LINE_ATTRS): string {
  const a = Math.min(u1, u2), b = Math.max(u1, u2);
  const eps = 1e-6;
  const ends = [-g.flat - g.vb, -g.flat, g.flat, g.flat + g.vb];
  const cuts = [a, ...ends.filter((c, i) => c > a + eps && c < b - eps && c !== ends[i - 1]), b];
  const rad = r(g.r0 + offset);
  const at = (u: number) => { const p = trackPoint(u, offset, g); return `${r(p.x)} ${r(p.y)}`; };
  let d = `M ${at(a)}`;
  for (let i = 1; i < cuts.length; i++) {
    const mid = Math.abs((cuts[i - 1] + cuts[i]) / 2);
    const onCurve = mid > g.flat && mid < g.flat + g.vb;
    d += onCurve ? ` A ${rad} ${rad} 0 0 0 ${at(cuts[i])}` : ` L ${at(cuts[i])}`;
  }
  return `<path d="${d}" ${attrs}/>`;
}

/** A straight segment across the tracks at position u, from offset o1 to o2. */
function normalSeg(u: number, o1: number, o2: number, g: Geom): string {
  const p1 = trackPoint(u, o1, g), p2 = trackPoint(u, o2, g);
  return `<line x1="${r(p1.x)}" y1="${r(p1.y)}" x2="${r(p2.x)}" y2="${r(p2.y)}" ${LINE_ATTRS}/>`;
}

const DUP_ATTRS = `fill="none" stroke="black" stroke-width="1" stroke-dasharray="4 3"`;

function renderConnectors(b: Built, layout: UShapeLayout): string[] {
  const g = b.geom;
  const out: string[] = [];

  walk(b.root, n => {
    const track = n.depth * g.ringGap;
    const childEdge = track + g.ringGap - HALF;
    const bar = childEdge - BAR_CLEARANCE;

    for (const w of n.unions) {
      if (w.kind !== "solo") {
        const uA = memberU(n, w.a, g);
        const uB = w.kind === "join" ? w.joinNode!.u : memberU(n, w.b!, g);
        if (w.consang) out.push(trackPath(uA, uB, track - CONSANG_GAP / 2, g), trackPath(uA, uB, track + CONSANG_GAP / 2, g));
        else out.push(trackPath(uA, uB, track, g));
      }
      if (!w.kids.length) continue;
      // Each sibship descends from the middle of its couple line, or from the
      // parent's symbol when the partner is not drawn.
      const uP = descentU(n, w, g);
      const us = w.kids.map(c => c.u);
      out.push(normalSeg(uP, track + (w.kind === "solo" ? HALF : 0), bar, g));
      const lo = Math.min(uP, ...us), hi = Math.max(uP, ...us);
      if (hi - lo > 0.01) out.push(trackPath(lo, hi, bar, g));
      for (const u of us) out.push(normalSeg(u, bar, childEdge, g));
    }
  });

  // Somebody drawn twice: a dashed link between the copies. On one track it
  // follows the track just inside the symbols. Across tracks it is a straight
  // line, drawn under the symbols.
  for (const dup of layout.duplicates) {
    const orig = layout.nodes.get(dup.id);
    if (!orig) continue;
    if (orig.depth === dup.depth) {
      const top = dup.depth * g.ringGap - HALF, inset = top - DUP_LINK_INSET;
      const stub = (u: number) => { const p = trackPoint(u, inset, g), q = trackPoint(u, top, g); return `<line x1="${r(p.x)}" y1="${r(p.y)}" x2="${r(q.x)}" y2="${r(q.y)}" ${DUP_ATTRS}/>`; };
      out.push(stub(dup.u), trackPath(dup.u, orig.u, inset, g, DUP_ATTRS), stub(orig.u));
    } else {
      out.push(`<line x1="${r(dup.x)}" y1="${r(dup.y)}" x2="${r(orig.x)}" y2="${r(orig.y)}" ${DUP_ATTRS}/>`);
    }
  }

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

function renderSymbols(pedigree: Pedigree, b: Built): string[] {
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const out: string[] = [];
  walk(b.root, n => {
    // A sibship by partners who are not drawn descends from the symbol itself,
    // straight through the label.
    const solo = n.unions.some(w => w.kind === "solo" && w.kids.length > 0);
    n.members.forEach((m, i) => {
      const ind = byId.get(m.id);
      if (!ind) return;
      const pos = nodeAt(n, i, b.geom);
      out.push(
        `<g ${m.dup ? "data-dup-of" : "data-id"}="${escapeXml(m.id)}" transform="translate(${r(pos.x)} ${r(pos.y)}) rotate(${r(pos.rotation)})">` +
        renderLabel(ind, solo && m.id === n.blood) +
        renderShape(ind) +
        (ind.deceased ? renderDeceasedSlash() : "") +
        (ind.proband ? renderProbandArrow() : "") +
        `</g>`,
      );
    });
  });
  return out;
}

function renderDebugTracks(b: Built, layout: UShapeLayout): string[] {
  let lo = 0, hi = 0;
  for (const n of [...layout.nodes.values(), ...layout.duplicates]) { lo = Math.min(lo, n.u); hi = Math.max(hi, n.u); }
  const attrs = `fill="none" stroke="red" stroke-width="0.75" stroke-dasharray="4 3"`;
  const out: string[] = [];
  for (let d = 0; d <= b.maxDepth; d++) out.push(trackPath(lo, hi, d * b.geom.ringGap, b.geom, attrs));
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportUShapeSvg(pedigree: Pedigree, options: SvgExportOptions = {}): string {
  const working = options.deidentify ? deidentify(pedigree, options) : pedigree;
  const b = build(working, { partners: options.uShapePartners });
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
  for (const n of [...layout.nodes.values(), ...layout.duplicates]) {
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
  out.push(...renderConnectors(b, layout));
  out.push(...renderSymbols(working, b));
  out.push(`</g>`, `</svg>`);
  return out.join("\n");
}
