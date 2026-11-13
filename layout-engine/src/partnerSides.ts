import type { Hints, LayoutInput, LayoutResult, Pedigree } from "./types.js";

/**
 * Which side a partner is drawn on (#106).
 *
 * kinship2 decides the left to right order of a couple: the father-role
 * member on the left unless a spouse hint says otherwise, and `autohint`
 * writes such hints to merge the copies of someone with children by several
 * partners. NSGC 2022 leaves partner order free, so the user can choose:
 * `Partnership.leftPartner` names the partner drawn on the left, and
 * `applyPartnerSides` turns it into a spouse hint row `[left, right, anchor]`,
 * the same input kinship2 itself uses. Nobody is pinned.
 *
 * A row autohint already wrote for the couple keeps its anchor (which
 * member's family the marriage hangs from), flipped with the row so it stays
 * on the same person; otherwise the row is unanchored, as a plain parent
 * pair is. kinship2 honours the side whenever the couple is drawn side by
 * side; where the hint conflicts with merging someone's copies the layout
 * stays a valid kinship2 layout but may keep a duplicate (dashed arc) instead.
 */
export function applyPartnerSides(hints: Hints, pedigree: Pedigree): Hints {
  const chosen = pedigree.partnerships.filter(p => p.leftPartner);
  if (chosen.length === 0) return hints;
  const idToIdx = new Map(pedigree.individuals.map((ind, i) => [ind.id, i + 1]));

  const rows: [number, number, number][] = [];
  const hsp = hints.spouse;
  if (hsp) for (let k = 0; k + 2 < hsp.length; k += 3) rows.push([hsp[k]!, hsp[k + 1]!, hsp[k + 2]!]);

  const userRows: [number, number, number][] = [];
  const done = new Set<number>();
  const n = pedigree.individuals.length;
  for (const p of chosen) {
    const a = idToIdx.get(p.individual1) ?? 0;
    const b = idToIdx.get(p.individual2) ?? 0;
    if (a === 0 || b === 0 || a === b) continue;
    const left = p.leftPartner === p.individual1 ? a : p.leftPartner === p.individual2 ? b : 0;
    if (left === 0) continue;
    const right = left === a ? b : a;
    const key = Math.min(a, b) * (n + 1) + Math.max(a, b);
    if (done.has(key)) continue;
    done.add(key);
    let anchor = 0;
    for (let r = rows.length - 1; r >= 0; r--) {
      const [l, rt, an] = rows[r]!;
      if (l === left && rt === right) { anchor = an; rows.splice(r, 1); }
      else if (l === right && rt === left) { anchor = an === 0 ? 0 : 3 - an; rows.splice(r, 1); }
    }
    userRows.push([left, right, anchor]);
  }
  if (userRows.length === 0) return hints;

  // The user's rows go first: buildSpouseList keeps the first row per couple.
  const all = [...userRows, ...rows];
  const spouse = new Int32Array(all.length * 3);
  all.forEach((r, i) => { spouse[i * 3] = r[0]; spouse[i * 3 + 1] = r[1]; spouse[i * 3 + 2] = r[2]; });
  return { order: hints.order, spouse };
}

/**
 * The partner drawn on the left in `layout`, a layout of `pedigree`, or null
 * when the two are not drawn on one row. With several copies of either, the
 * closest pair on a row decides.
 */
export function drawnLeftPartner(pedigree: Pedigree, layout: LayoutResult, partnershipId: string): string | null {
  const p = pedigree.partnerships.find(q => q.id === partnershipId);
  if (!p) return null;
  const idx = new Map(pedigree.individuals.map((ind, i) => [ind.id, i + 1]));
  const a = idx.get(p.individual1), b = idx.get(p.individual2);
  if (!a || !b) return null;
  let best: { gap: number; aLeft: boolean } | null = null;
  for (let lev = 0; lev < layout.n.length; lev++) {
    const xa: number[] = [], xb: number[] = [];
    for (let c = 0; c < layout.n[lev]!; c++) {
      const id = layout.nid[lev]![c]!;
      if (id === a) xa.push(layout.pos[lev]![c]!);
      else if (id === b) xb.push(layout.pos[lev]![c]!);
    }
    for (const x1 of xa) for (const x2 of xb) {
      const gap = Math.abs(x1 - x2);
      if (!best || gap < best.gap) best = { gap, aLeft: x1 < x2 };
    }
  }
  if (!best) return null;
  return best.aLeft ? p.individual1 : p.individual2;
}

/**
 * When both partners of a couple with a chosen side have parents drawn, a
 * spouse hint alone cannot swap them: each is drawn beside their own
 * sibship, so the one moved across would be drawn twice. Swapping them means
 * swapping their families, so the ancestors of the left partner (and the
 * partner) take the earlier ranks among the slots their two lines hold at
 * each generation, people on neither line keeping theirs. kinship2 places
 * founders and sibships in rank order, and autohint then pulls the two
 * towards each other as usual. Shared ancestors (a cousin couple) stay put;
 * it is the lines below them that swap. The same goes for two partners of
 * one person drawn either side of them: the left one's line comes first.
 * `horder` is changed in place.
 */
export function preferPartnerLineages(horder: Float64Array, input: LayoutInput, pedigree: Pedigree, depth: Int32Array): void {
  const idToIdx = new Map(pedigree.individuals.map((ind, i) => [ind.id, i + 1]));
  const hasParents = (x: number) => (input.findex[x] ?? 0) > 0;
  const lineOf = (x: number): Set<number> => {
    const out = new Set<number>([x]);
    const stack = [x];
    while (stack.length) {
      const y = stack.pop()!;
      for (const p of [input.findex[y] ?? 0, input.mindex[y] ?? 0]) {
        if (p > 0 && !out.has(p)) { out.add(p); stack.push(p); }
      }
    }
    return out;
  };

  // [left, right] pairs whose lines should be drawn in that order.
  const pairs: [number, number][] = [];
  const sidesOf = new Map<number, { left: number[]; right: number[] }>(); // person -> partners left / right of them
  for (const p of pedigree.partnerships) {
    if (!p.leftPartner) continue;
    const a = idToIdx.get(p.individual1) ?? 0, b = idToIdx.get(p.individual2) ?? 0;
    if (a === 0 || b === 0 || a === b) continue;
    const left = p.leftPartner === p.individual1 ? a : p.leftPartner === p.individual2 ? b : 0;
    if (left === 0) continue;
    const right = left === a ? b : a;
    pairs.push([left, right]);
    if (!sidesOf.has(left)) sidesOf.set(left, { left: [], right: [] });
    if (!sidesOf.has(right)) sidesOf.set(right, { left: [], right: [] });
    sidesOf.get(left)!.right.push(right);
    sidesOf.get(right)!.left.push(left);
  }
  for (const { left, right } of sidesOf.values()) {
    for (const l of left) for (const r of right) pairs.push([l, r]);
  }

  for (const [left, right] of pairs) {
    if (!hasParents(left) || !hasParents(right)) continue;
    const lline = lineOf(left), rline = lineOf(right);
    const byDepth = new Map<number, { l: number[]; r: number[] }>();
    const add = (x: number, side: "l" | "r") => {
      const d = depth[x]!;
      if (!byDepth.has(d)) byDepth.set(d, { l: [], r: [] });
      byDepth.get(d)![side].push(x);
    };
    for (const x of lline) if (!rline.has(x)) add(x, "l");
    for (const x of rline) if (!lline.has(x)) add(x, "r");
    for (const { l, r } of byDepth.values()) {
      if (l.length === 0 || r.length === 0) continue;
      const byRank = (u: number, v: number) => horder[u]! - horder[v]!;
      l.sort(byRank); r.sort(byRank);
      const slots = [...l, ...r].map(x => horder[x]!).sort((u, v) => u - v);
      [...l, ...r].forEach((x, k) => { horder[x] = slots[k]!; });
    }
  }
}
