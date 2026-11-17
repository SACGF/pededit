/**
 * U-shape export, step 1: the tree. From the pedigree to a descendant chart of
 * one founder couple: nodes (a person with their partners), unions and their
 * children, with consanguineous and repeated people joined. No positions and
 * no SVG.
 */
import { isAffected, placementParentOf, type Pedigree, type Individual } from "@pedigree-editor/layout-engine";
import { consanguinityTest } from "../../../pedigree/consanguinity";
import { twinMembership } from "../../../pedigree/twins";
import { consanguinityLabelText, consanguinityLabelWidth } from "../../../pedigree/consanguinityLabel";
import { NODE_SIZE, HALF, COUPLE_GAP, DUP_LINK_INSET, CLABEL_PAD, CLABEL_BASELINE, CLABEL_ENDED_BASELINE, CLABEL_CAP, CLABEL_REACH, MIN_LABEL_RADIUS } from "./constants";
import { groupBy } from "./connectors";

/** How far a label may be lifted off a curve before it reaches the dashed links just inside the symbols. */
export function maxLabelSag(w: Union): number {
  return HALF + DUP_LINK_INSET - 1.5 - CLABEL_CAP - (w.ended ? CLABEL_ENDED_BASELINE : CLABEL_BASELINE);
}

export type Partnership = Pedigree["partnerships"][number];

export interface UShapeOptions {
  /** Draw married-in partners beside their blood partner. Default true. */
  partners?: boolean;
}

// ── Tree ──────────────────────────────────────────────────────────────────────

/** One symbol. dx is its distance along the track from the node's reference point, in px. */
export interface Member { id: string; dx: number; dup: boolean; }

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
export interface Union {
  kind: "solo" | "spouse" | "dup" | "join";
  order: number;
  pids: string[];
  partner: string | null;
  /** Double couple line: the couple are related, or flagged as related (see consanguinityTest). */
  consang: boolean;
  kids: TNode[];
  /** Member indices of the couple. b is null for solo and join. */
  a: number;
  b: number | null;
  joinNode: TNode | null;
  /** Which side the partner is on, for join. For dup, which side is preferred. */
  joinSide: -1 | 1;
  /** Degree of relationship written along a double line, wrapped, and how wide it is. */
  label?: string[];
  labelWidth?: number;
  /** The relationship has ended: its strokes cross the line under the label. */
  ended?: boolean;
}

/**
 * Centre-to-centre distance of a couple drawn side by side: COUPLE_GAP, or
 * more when the label between them needs it. Joined couples get the
 * same room from the packing. On a curve each symbol is turned towards the
 * label by the angle between them, which brings its inner top corner closer
 * by about HALF times that angle; the radius is at least `labelRadius`.
 */
export function coupleGap(w: Union | undefined): number {
  if (!w?.labelWidth) return COUPLE_GAP;
  const turn = (w.labelWidth / 2 + CLABEL_PAD + HALF) / labelRadius(w);
  return Math.max(COUPLE_GAP, NODE_SIZE + w.labelWidth + 2 * (CLABEL_PAD + HALF * turn + 1));
}

/**
 * The tightest curve a labelled line can lie on: gentle enough to lift the
 * straight label clear of the line at its ends (`maxLabelSag`, enforced in
 * `build` through r0), and never tighter than the founder track can be.
 */
export function labelRadius(w: Union): number {
  const reach = w.labelWidth! / 2 + CLABEL_REACH;
  return Math.max((reach * reach) / (2 * maxLabelSag(w)), MIN_LABEL_RADIUS);
}

export interface TNode {
  /** Twin set key; the root sibship is never split between the arms inside a set. */
  twinSet?: string;
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
  /** Joined to a neighbour by a labelled double line: their centre-to-centre distance. */
  joinGap?: number;
}

export const kidsOf = (n: TNode): TNode[] => (n.unions.length === 1 ? n.unions[0].kids : n.unions.flatMap(w => w.kids));

export function walk(root: TNode, fn: (n: TNode) => void): void {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    fn(n);
    for (const w of n.unions) stack.push(...w.kids);
  }
}

/** Nodes on each track, left to right. */
export function levelLists(root: TNode): TNode[][] {
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
export function arrange(n: TNode, sexOf: (id: string) => string | undefined): boolean {
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
  if (left && left.kind !== "join") members.push({ id: left.partner!, dx: -coupleGap(left), dup: left.kind === "dup" });
  const me = members.length;
  members.push({ id: n.blood, dx: 0, dup: false });
  if (right && right.kind !== "join") members.push({ id: right.partner!, dx: coupleGap(right), dup: right.kind === "dup" });
  if (left) { left.a = me; left.b = left.kind === "join" ? null : 0; }
  if (right) { right.a = me; right.b = right.kind === "join" ? null : members.length - 1; }
  const solo = n.unions.find(w => w.kind === "solo");
  if (solo) solo.a = me;
  n.members = members;
  n.unions = [left, solo, right].filter((w): w is Union => !!w);
  return true;
}

export function buildTree(pedigree: Pedigree, partners: boolean): TNode | null {
  if (pedigree.individuals.length === 0) return null;

  const byId = new Map<string, Individual>(pedigree.individuals.map(i => [i.id, i]));
  const sexOf = (id: string) => byId.get(id)?.sex;
  const partnershipsOf = new Map<string, Partnership[]>();
  const hasParents = new Set<string>();
  // Where each child is drawn: under the couple carrying it, for an egg donor's child.
  const placed = placementParentOf(pedigree);
  for (const p of pedigree.partnerships) {
    for (const id of [p.individual1, p.individual2]) {
      if (!partnershipsOf.has(id)) partnershipsOf.set(id, []);
      partnershipsOf.get(id)!.push(p);
    }
    for (const c of placed[p.id] ?? []) hasParents.add(c);
  }
  const kidIds = (p: Partnership): string[] => placed[p.id] ?? [];
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

  const drawnDouble = consanguinityTest(pedigree);
  const isDouble = (p: Partnership) => drawnDouble(p.individual1, p.individual2);

  let nextOrder = 0;
  const partnershipById = new Map(pedigree.partnerships.map(p => [p.id, p]));
  const mkUnion = (kind: Union["kind"], pids: string[], partner: string | null, consang: boolean): Union => {
    const w: Union = { kind, order: nextOrder++, pids, partner, consang, kids: [], a: 0, b: null, joinNode: null, joinSide: 1 };
    // The label between the partners, on one line: the couple moves
    // apart for it when the usual gap is too narrow. A second line would
    // reach the dashed links and sibship bars that run along the track just
    // inside the symbols.
    const p = consang && pids.length === 1 ? partnershipById.get(pids[0]!) : undefined;
    const text = p && consanguinityLabelText(pedigree, p);
    if (text) {
      w.ended = !!p!.ended;
      w.label = [text];
      w.labelWidth = Math.max(...w.label.map(consanguinityLabelWidth));
    }
    return w;
  };
  const mkNode = (blood: string, depth: number, parent: TNode | null, parentUnion: Union | null): TNode => ({
    blood, isRoot: parent === null, members: [{ id: blood, dx: 0, dup: false }], unions: [], depth, parent, parentUnion,
    reservedL: false, reservedR: false, v: 0, side: 0, u: 0,
  });

  if (!rootP) {
    // Nobody has children. Draw the first couple, or else the first individual.
    const p = pedigree.partnerships[0];
    if (!p) return mkNode(pedigree.individuals[0].id, 0, null, null);
    const root = mkNode(p.individual1, 0, null, null);
    const w = { ...mkUnion("spouse", [p.id], p.individual2, isDouble(p)), a: 0, b: 1 };
    root.members = [{ id: p.individual1, dx: -coupleGap(w) / 2, dup: false }, { id: p.individual2, dx: coupleGap(w) / 2, dup: false }];
    root.unions = [w];
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
    const w = { ...mkUnion("spouse", [rootP.id], second, isDouble(rootP)), a: 0, b: 1 };
    root.members = [{ id: first, dx: -coupleGap(w) / 2, dup: false }, { id: second, dx: coupleGap(w) / 2, dup: false }];
    root.unions = [w];
  } else {
    // Earlier partnership on the left, the shared parent in the middle.
    consumed.add(extraP.id);
    const [pl, pr] = pedigree.partnerships.indexOf(extraP) < pedigree.partnerships.indexOf(rootP) ? [extraP, rootP] : [rootP, extraP];
    const hub = pl.individual1 === pr.individual1 || pl.individual1 === pr.individual2 ? pl.individual1 : pl.individual2;
    root = mkNode(hub, 0, null, null);
    const isDup = (p: Partnership) => p === extraP && bloodLine.has(otherOf(p, hub));
    root.unions = [pl, pr].map((p, i) => ({
      ...mkUnion(isDup(p) ? "dup" : "spouse", [p.id], otherOf(p, hub), isDouble(p)),
      a: 1, b: i === 0 ? 0 : 2,
    }));
    root.members = [
      { id: otherOf(pl, hub), dx: -coupleGap(root.unions[0]), dup: isDup(pl) },
      { id: hub, dx: 0, dup: false },
      { id: otherOf(pr, hub), dx: coupleGap(root.unions[1]), dup: isDup(pr) },
    ];
  }
  for (const m of root.members) if (!m.dup) drawn.add(m.id);

  const { mode, affectedFirst } = pedigree.siblingOrder ?? { mode: "insertion", affectedFirst: false };
  const orderKey = (id: string): [number, number] => {
    const ind = byId.get(id);
    if (!ind) return [0, 0];
    const a = affectedFirst ? (isAffected(ind, pedigree) ? 0 : 1) : 0;
    const o = mode === "birthDate" && ind.dob ? new Date(ind.dob).getTime() : ind.sibOrder ?? 0;
    return [a, o];
  };
  // Twins sort by the mean of their set's keys, then by their place in
  // the set, so they stay side by side as autohint keeps them on the canvas.
  const twinOf = twinMembership(pedigree);
  const sortSibs = (ids: string[]) => {
    const unique = [...new Set(ids)];
    const keys = new Map(unique.map(id => [id, [...orderKey(id), 0] as [number, number, number]]));
    for (const [, members] of groupBy(unique, id => twinOf.get(id)?.twinSet)) {
      if (members.length < 2) continue;
      const a = members.reduce((acc, id) => acc + keys.get(id)![0], 0) / members.length;
      const o = members.reduce((acc, id) => acc + keys.get(id)![1], 0) / members.length;
      members.forEach((id, k) => keys.set(id, [a, o, k + 1]));
    }
    return unique.sort((x, y) => {
      const [ax, ox, kx] = keys.get(x)!, [ay, oy, ky] = keys.get(y)!;
      return ax - ay || ox - oy || kx - ky;
    });
  };

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
        node.unions.push(mkUnion(dup ? "dup" : "spouse", [p.id], other, isDouble(p)));
      }
      if (solo.length) node.unions.push(mkUnion("solo", solo.map(p => p.id), null, false));
    }
    for (const w of node.unions) {
      const ids = sortSibs(w.pids.flatMap(pid => placed[pid] ?? [])).filter(c => !assigned.has(c));
      for (const kid of ids) {
        assigned.add(kid);
        const child = mkNode(kid, node.depth + 1, node, w);
        child.twinSet = twinOf.get(kid)?.twinSet;
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
  // Room for the label between joined partners, wherever the packing
  // puts them: side by side, or either side of the centre.
  for (const { host, w } of joins) {
    if (w.kind !== "join" || !w.labelWidth) continue;
    for (const n of [host, w.joinNode!]) n.joinGap = Math.max(n.joinGap ?? 0, coupleGap(w));
  }

  return root;
}

export function joinsHold(root: TNode, joins: Array<{ host: TNode; w: Union }>): boolean {
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
export function tryJoin(
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
