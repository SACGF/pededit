import type { LayoutInput, Hints, Pedigree, Individual, SiblingOrderMode, LayoutResult } from "./types.js";
import { kindepth } from "./kindepth.js";
import { alignPedigree } from "./alignPedigree.js";
import { buildPartnerSet, isPartnerPair } from "./couples.js";
import { preferPartnerLineages, orderLineages, drawnLeftPartner } from "./partnerSides.js";
import { isAffected } from "./affected.js";

/**
 * Port of R kinship2 autohint().
 *
 * Produces the ordering hints consumed by alignPedigree:
 *   order  — relative left-to-right order of siblings within each sibship
 *   spouse — rows [left, right, anchor] saying which partner is drawn on the
 *            left of a couple and which family the marriage is anchored to
 *
 * The algorithm runs the alignment once with no spouse hints, looks for people
 * who were drawn more than once (someone with children by several partners),
 * and for each duplicate moves the person to the edge of their sibship nearest
 * their other copy and records a spouse hint so the two copies can merge.
 * The alignment is re-run after each generation is fixed, since a change on one
 * level shifts everything below it.
 *
 * Twins (R: the `relation` matrix with codes 1 = MZ, 2 = DZ, 3 = unknown)
 * come from `Partnership.twins`. As in R, the members of a twin set get
 * the mean of their ranks plus a small per-member offset, so they are drawn
 * side by side, and `shift` moves a whole twin set when the duplicate fixup
 * moves one of its members.
 */
export interface AutohintOptions {
  /**
   * After the duplicate fixup, when someone drawn once has two hinted
   * partners both placed on the same side of them, flip the later hint to
   * the other side (#76). Off by default so the default run stays faithful
   * to R; `alignPedigreeByFamily` turns it on for the editor.
   */
  balancePartners?: boolean;
  /**
   * When the fixup leaves someone drawn more than once, try drawing each
   * couple whose partners both have parents the other way round, by
   * swapping their families, and keep a swap that leaves fewer duplicates
   * or shorter dashed arcs (#77). Off by default, as `balancePartners` is.
   */
  swapFamilies?: boolean;
}

export function autohint(input: LayoutInput, pedigree: Pedigree, options: AutohintOptions = {}): Hints {
  const twins = twinSets(input, pedigree);
  const horder = initialOrder(input, pedigree, twins);
  // Chosen partner sides where both partners have parents swap families.
  const chosenSides = pedigree.partnerships.some(p => p.leftPartner);
  const applyChosenSides = (order: Float64Array) => {
    if (chosenSides) preferPartnerLineages(order, input, pedigree, kindepth(input, true));
  };
  applyChosenSides(horder);
  const fixup = (order: Float64Array): Hints => {
    try {
      // fixupDuplicates shifts sibling ranks in place, so give it a copy.
      return fixupDuplicates(pedigree, input, order.slice(), twins, options);
    } catch {
      // R wraps autohint in try() and, when it fails, lays out with a plain
      // ordering and no spouse hints. Discard any ranks the fixup had already
      // shifted before failing, as R does: its changes were local to autohint.
      return { order, spouse: null };
    }
  };
  const hints = fixup(horder);
  if (!options.swapFamilies) return hints;
  return swapFamilies(pedigree, input, horder, hints, fixup, applyChosenSides);
}

// ── Family swaps (#77) ─────────────────────────────────────────────────────────

/**
 * Rounds of swaps tried (each keeps the best single swap) and trial layouts
 * run in all. A trial is a whole fixup, several layouts without the
 * quadratic program, so the cap bounds the pass on a large inbred pedigree.
 */
const MAX_SWAP_ROUNDS = 3;
const MAX_SWAP_TRIALS = 40;

/**
 * People drawn again and how far apart their copies are, in slots. Copies on
 * different rows count one slot whatever lies between them: these trial
 * layouts are packed to the left, so columns of different rows do not line up.
 */
function duplicateCost(plist: LayoutResult): { duplicates: number; arcLength: number } {
  const copies = new Map<number, [number, number][]>();
  for (let lev = 0; lev < plist.n.length; lev++) {
    for (let s = 0; s < plist.n[lev]!; s++) {
      const id = Math.floor(plist.nid[lev]![s]!);
      if (!copies.has(id)) copies.set(id, []);
      copies.get(id)!.push([lev, plist.pos[lev]![s]!]);
    }
  }
  let duplicates = 0, arcLength = 0;
  for (const at of copies.values()) {
    for (let k = 1; k < at.length; k++) {
      duplicates++;
      arcLength += at[k]![0] === at[k - 1]![0] ? Math.abs(at[k]![1] - at[k - 1]![1]) : 1;
    }
  }
  return { duplicates, arcLength };
}

/**
 * The duplicate fixup moves a person to the edge of their own sibship
 * nearest their other copy and never reorders the generations above. Which
 * side of a couple each partner is on, when both have parents, follows from
 * the order of their families, and so does the order of everything below
 * them: one cousin marriage drawn the wrong way round can leave a branch at
 * the far end of its row from the people it marries into, joined by dashed
 * arcs across the whole generation.
 *
 * So when duplicates remain, each such couple is tried the other way round
 * (the lines of the two partners swap ranks, as for a chosen partner side),
 * the fixup is run again, and the swap that most reduces the duplicates,
 * then the length of their arcs, is kept. Couples with a side chosen by the
 * user are left alone and their lines keep the order that choice needs.
 */
function swapFamilies(
  pedigree: Pedigree,
  input: LayoutInput,
  horder: Float64Array,
  hints: Hints,
  fixup: (order: Float64Array) => Hints,
  applyChosenSides: (order: Float64Array) => void,
): Hints {
  const layoutOf = (h: Hints): LayoutResult | null => {
    try { return alignPedigree(pedigree, { hints: h, align: false }); } catch { return null; }
  };
  let layout = layoutOf(hints);
  if (!layout) return hints;
  let cost = duplicateCost(layout);
  if (cost.duplicates === 0) return hints;

  const idToIdx = new Map(pedigree.individuals.map((ind, i) => [ind.id, i + 1]));
  const hasParents = (id: string) => (input.findex[idToIdx.get(id) ?? 0] ?? 0) > 0;
  const couples = pedigree.partnerships.filter(p =>
    !p.leftPartner && p.individual1 !== p.individual2 && hasParents(p.individual1) && hasParents(p.individual2));
  if (couples.length === 0) return hints;
  const depth = kindepth(input, true);

  let order = horder;
  let trials = 0;
  for (let round = 0; round < MAX_SWAP_ROUNDS && cost.duplicates > 0; round++) {
    let best: { order: Float64Array; hints: Hints; layout: LayoutResult; cost: typeof cost } | null = null;
    for (const p of couples) {
      const left = drawnLeftPartner(pedigree, layout, p.id);
      if (!left) continue;
      const right = left === p.individual1 ? p.individual2 : p.individual1;
      const trial = order.slice();
      orderLineages(trial, input, depth, [[idToIdx.get(right)!, idToIdx.get(left)!]]);
      applyChosenSides(trial);
      if (trial.every((v, i) => v === order[i])) continue;
      if (++trials > MAX_SWAP_TRIALS) break;
      const h = fixup(trial);
      const l = layoutOf(h);
      if (!l) continue;
      const c = duplicateCost(l);
      const than = best?.cost ?? cost;
      if (c.duplicates < than.duplicates || (c.duplicates === than.duplicates && c.arcLength < than.arcLength)) {
        best = { order: trial, hints: h, layout: l, cost: c };
      }
    }
    if (!best) break;
    ({ order, hints, layout, cost } = best);
  }
  return hints;
}

// ── Twin sets (R: twinset, twinord, twinrel) ───────────────────────────────────

/**
 * Per 1-based individual: the set they belong to (0 = not a twin), their
 * order within it (1-based, R's twinord) and whether the set is monozygotic.
 * Sets with fewer than two resolvable members are ignored.
 */
interface TwinInfo {
  set: Int32Array;
  ord: Int32Array;
  mono: Uint8Array;
  any: boolean;
}

function twinSets(input: LayoutInput, pedigree: Pedigree): TwinInfo {
  const n = input.n;
  const info: TwinInfo = { set: new Int32Array(n + 1), ord: new Int32Array(n + 1), mono: new Uint8Array(n + 1), any: false };
  const idToIdx = new Map(pedigree.individuals.map((ind, i) => [ind.id, i + 1]));
  let nextSet = 0;
  for (const p of pedigree.partnerships) {
    const children = new Set(pedigree.parentOf[p.id] ?? []);
    for (const t of p.twins ?? []) {
      const members = t.members.filter(id => children.has(id)).map(id => idToIdx.get(id) ?? 0).filter(i => i > 0 && info.set[i] === 0);
      if (members.length < 2) continue;
      nextSet++;
      members.forEach((m, k) => { info.set[m] = nextSet; info.ord[m] = k + 1; info.mono[m] = t.zygosity === "monozygotic" ? 1 : 0; });
      info.any = true;
    }
  }
  return info;
}

// ── Initial sibling order ──────────────────────────────────────────────────────

function initialOrder(input: LayoutInput, pedigree: Pedigree, twins: TwinInfo): Float64Array {
  const n = input.n;
  const depth = kindepth(input, true);
  const horder = new Float64Array(n + 1);

  const { mode, affectedFirst } = pedigree.siblingOrder;

  const idToIdx = new Map<string, number>();
  for (let i = 0; i < pedigree.individuals.length; i++) {
    idToIdx.set(pedigree.individuals[i]!.id, i + 1);
  }

  const assignedOrder = new Map<number, number>();

  for (const [, childIds] of Object.entries(pedigree.parentOf)) {
    const siblings = childIds
      .map(id => ({ idx: idToIdx.get(id) ?? 0, ind: pedigree.individuals.find(i => i.id === id)! }))
      .filter(s => s.idx > 0 && s.ind);

    siblings.sort((a, b) => {
      const [ap, as_] = effectiveSibOrder(a.ind, pedigree, mode, affectedFirst);
      const [bp, bs]  = effectiveSibOrder(b.ind, pedigree, mode, affectedFirst);
      if (ap !== bp) return ap - bp;
      return as_ - bs;
    });

    for (let k = 0; k < siblings.length; k++) {
      assignedOrder.set(siblings[k]!.idx, k + 1);
    }
  }

  const depthGroups = new Map<number, number[]>();
  for (let i = 1; i <= n; i++) {
    const d = depth[i] ?? 0;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(i);
  }

  for (const [, members] of depthGroups) {
    const sorted = [...members].sort((a, b) => {
      const ao = assignedOrder.get(a) ?? (pedigree.individuals[a - 1]?.sibOrder ?? a);
      const bo = assignedOrder.get(b) ?? (pedigree.individuals[b - 1]?.sibOrder ?? b);
      return ao - bo;
    });
    for (let k = 0; k < sorted.length; k++) {
      horder[sorted[k]!] = k + 1;
    }
  }

  // R: twins get the mean of their ranks plus twinord/100, then each depth is
  // re-ranked, so a twin set is drawn together in its members' order.
  if (twins.any) {
    const bySet = new Map<number, number[]>();
    for (let i = 1; i <= n; i++) {
      if (twins.set[i]! > 0) {
        if (!bySet.has(twins.set[i]!)) bySet.set(twins.set[i]!, []);
        bySet.get(twins.set[i]!)!.push(i);
      }
    }
    for (const who of bySet.values()) {
      const mean = who.reduce((acc, i) => acc + horder[i]!, 0) / who.length;
      for (const i of who) horder[i] = mean + twins.ord[i]! / 100;
    }
    for (const [, members] of depthGroups) {
      const ranked = [...members].sort((a, b) => horder[a]! - horder[b]!);
      ranked.forEach((i, k) => { horder[i] = k + 1; });
    }
  }

  return horder;
}

function effectiveSibOrder(
  individual: Individual,
  pedigree: Pedigree,
  mode: SiblingOrderMode,
  affectedFirst: boolean,
): [number, number] {
  const affectedKey = affectedFirst ? (isAffected(individual, pedigree) ? 0 : 1) : 0;
  let orderKey: number;
  if (mode === "birthDate" && individual.dob) {
    orderKey = new Date(individual.dob).getTime();
  } else {
    orderKey = individual.sibOrder;
  }
  return [affectedKey, orderKey];
}

// ── Duplicate fixup (R: Doc fixup-2) ──────────────────────────────────────────

/** A spouse hint row: [left, right, anchor]. */
type SpouseHint = [number, number, number];

function toHintMatrix(rows: SpouseHint[]): Int32Array | null {
  if (rows.length === 0) return null;
  const out = new Int32Array(rows.length * 3);
  rows.forEach((r, i) => { out[i * 3] = r[0]; out[i * 3 + 1] = r[1]; out[i * 3 + 2] = r[2]; });
  return out;
}

function fixupDuplicates(pedigree: Pedigree, input: LayoutInput, horder: Float64Array, twins: TwinInfo, options: AutohintOptions): Hints {
  const partners = buildPartnerSet(input);
  let sptemp: SpouseHint[] = [];

  const run = (): LayoutResult =>
    alignPedigree(pedigree, { hints: { order: horder, spouse: toHintMatrix(sptemp) }, align: false });

  let plist = run();
  const maxlev = plist.n.length;

  for (let lev = 0; lev < maxlev; lev++) {
    const idlist = plist.nid[lev]!.slice(0, plist.n[lev]!);
    const dpairs = duporder(idlist, plist, lev, partners);
    if (dpairs.length === 0) continue;

    for (const [p1, p2, side] of dpairs) {
      const anchor: [number, number] = [0, 0];
      const spouse: [number, number] = [-1, -1];
      const positions = [p1, p2];

      for (let j = 0; j < 2; j++) {
        // First copy moves right (towards the second), second copy moves left.
        const goleft = j === 1;
        const mypos = positions[j]!;
        if (plist.fam[lev]![mypos]! > 0) {
          // Connected to parents at this position: familial anchor.
          anchor[j] = 1;
          const sibs = findsibs(mypos, plist, lev).map(s => idlist[s]!);
          if (sibs.length > 1) shift(idlist[mypos]!, sibs, goleft, horder, twins);
        } else {
          // Is the spouse at this position connected to parents?
          const sp = findspouse(mypos, plist, lev, partners);
          spouse[j] = sp;
          if (plist.fam[lev]![sp]! > 0) {
            anchor[j] = 2; // spousal anchor
            const sibs = findsibs(sp, plist, lev).map(s => idlist[s]!);
            if (sibs.length > 1) shift(idlist[sp]!, sibs, goleft, horder, twins);
          }
        }
      }

      const id1 = idlist[p1]!;                                   // the duplicated person
      const id2 = spouse[0] >= 0 ? idlist[spouse[0]]! : 0;      // spouse at the first copy
      const id3 = spouse[1] >= 0 ? idlist[spouse[1]]! : 0;      // spouse at the second copy

      switch (`${anchor[0]}${anchor[1]}`) {
        case "21": sptemp.push([id2, id1, side]); break;        // the most common case
        case "22": sptemp.push([id2, id1, 1], [id1, id3, 2]); break;
        case "02":
        case "20": sptemp.push([id2, id1, 0]); break;
        case "00": sptemp.push([id1, id3, 0], [id2, id1, 0]); break;
        case "01": sptemp.push([id2, id1, 2]); break;
        case "10": sptemp.push([id1, id3, 1]); break;
        default:
          throw new Error("autohint: unexpected anchor combination");
      }
    }

    // Recompute, since this shifts things on the levels below.
    plist = run();
  }

  if (options.balancePartners) sptemp = balanceSpouseHints(sptemp, plist);

  return { order: horder, spouse: toHintMatrix(sptemp) };
}

/**
 * Spread a person's hinted partners to both sides (#76).
 *
 * Each duplicate fixup hint pulls one partner towards that partner's other
 * copy, so someone married twice to people whose other copies both lie to
 * one side gets both hints on that side, e.g. `[Daemon, Rhaenyra, 2]` and
 * `[Laenor, Rhaenyra, 2]`, and alignped1 can only put one of them next to
 * her: the other marriage becomes a pass-through line. A hint anchored to a
 * person (anchor 1: they are the left member, partner on the right; anchor
 * 2: they are the right member, partner on the left) whose side is already
 * taken by an earlier hint is flipped to the free side, keeping its anchor
 * on the same person. Only people drawn once are touched: a duplicate's own
 * copies are what the hints are arranging.
 */
function balanceSpouseHints(sptemp: SpouseHint[], plist: LayoutResult): SpouseHint[] {
  const copies = new Map<number, number>();
  for (let lev = 0; lev < plist.n.length; lev++) {
    for (let s = 0; s < plist.n[lev]!; s++) {
      const id = Math.floor(plist.nid[lev]![s]!);
      copies.set(id, (copies.get(id) ?? 0) + 1);
    }
  }
  const sides = new Map<number, Set<"left" | "right">>(); // anchored person → sides of their partners
  return sptemp.map((row): SpouseHint => {
    const [left, right, anchor] = row;
    if (anchor === 0) return row;
    const person = anchor === 1 ? left : right;
    if ((copies.get(person) ?? 0) !== 1) return row;
    const side: "left" | "right" = anchor === 1 ? "right" : "left";
    const used = sides.get(person) ?? new Set();
    sides.set(person, used);
    if (!used.has(side)) { used.add(side); return row; }
    const other: "left" | "right" = side === "right" ? "left" : "right";
    if (used.has(other)) return row;
    used.add(other);
    return anchor === 1 ? [right, left, 2] : [right, left, 1];
  });
}

/**
 * Move `id` to the left or right edge of its sibship by rewriting the hints of
 * all `sibs` (individual indices), then re-rank so the hints stay 1..k.
 *
 * A twin's co-twins move with them, by the sibship's whole rank range so they
 * stay together past the edge; R moves a monozygotic set a second time, which
 * keeps it ahead of other twin sets moved the same way.
 */
function shift(id: number, sibs: number[], goleft: boolean, hint: Float64Array, twins: TwinInfo): void {
  const vals = sibs.map(s => hint[s]!);
  if (twins.set[id]! > 0) {
    const amt = 1 + (Math.max(...vals) - Math.min(...vals));
    const mates = sibs.filter(s => twins.set[s] === twins.set[id]);
    const times = twins.mono[id] ? 2 : 1;
    for (const s of mates) hint[s] = hint[s]! + (goleft ? -amt : amt) * times;
  }
  hint[id] = goleft ? Math.min(...sibs.map(s => hint[s]!)) - 1 : Math.max(...sibs.map(s => hint[s]!)) + 1;
  const ranked = [...sibs].sort((a, b) => hint[a]! - hint[b]!);
  ranked.forEach((s, i) => { hint[s] = i + 1; });
}

/** 0-based slots at `lev` that share a family with the slot `mypos`. */
function findsibs(mypos: number, plist: LayoutResult, lev: number): number[] {
  const family = plist.fam[lev]![mypos]!;
  if (family === 0) throw new Error("autohint: findsibs called on a slot without parents");
  const out: number[] = [];
  for (let s = 0; s < plist.n[lev]!; s++) {
    if (plist.fam[lev]![s] === family) out.push(s);
  }
  return out;
}

/**
 * Within the run of marriage-linked slots containing `mypos`, find the slot of
 * an actual partner of the person at `mypos` (leftmost first).
 *
 * R picks the leftmost opposite-sex person in the run; using the real
 * partnerships gives the same answer and also works when sex is unknown.
 */
function findspouse(mypos: number, plist: LayoutResult, lev: number, partners: Set<number>): number {
  const sp = plist.spouse[lev]!;
  const nlev = plist.n[lev]!;
  let lpos = mypos;
  while (lpos > 0 && sp[lpos - 1]! > 0) lpos--;
  let rpos = mypos;
  while (rpos < nlev - 1 && sp[rpos]! > 0) rpos++;
  if (rpos === lpos) throw new Error("autohint: duplicate slot has no spouse");

  const me = plist.nid[lev]![mypos]!;
  for (let p = lpos; p <= rpos; p++) {
    if (p !== mypos && isPartnerPair(partners, me, plist.nid[lev]![p]!)) return p;
  }
  throw new Error("autohint: no partner found in marriage run");
}

/**
 * List the duplicate pairs on one level as [slotA, slotB, side] rows (0-based
 * slots, slotA < slotB). Someone drawn k times contributes k-1 rows.
 *
 * `side` is 1 for the first half of the rows and 2 for the rest; it becomes the
 * anchor of the resulting spouse hint. Rows whose families do not already sit
 * side by side are processed first.
 */
function duporder(
  idlist: number[],
  plist: LayoutResult,
  lev: number,
  partners: Set<number>,
): [number, number, number][] {
  const positions = new Map<number, number[]>();
  idlist.forEach((id, s) => {
    if (!positions.has(id)) positions.set(id, []);
    positions.get(id)!.push(s);
  });

  // Duplicated ids, ordered by their second appearance (R: unique(idlist[duplicated(idlist)]))
  const dupIds = [...positions.entries()]
    .filter(([, slots]) => slots.length > 1)
    .sort(([, a], [, b]) => a[1]! - b[1]!)
    .map(([id]) => id);
  if (dupIds.length === 0) return [];

  const rows: [number, number, number][] = [];
  for (const id of dupIds) {
    const slots = positions.get(id)!;
    for (let k = 1; k < slots.length; k++) rows.push([slots[k - 1]!, slots[k]!, 2]);
  }
  const npair = rows.length;
  const nFirstHalf = Math.max(1, Math.floor(npair / 2));
  for (let i = 0; i < nFirstHalf; i++) rows[i]![2] = 1;
  if (npair === 1) return rows;

  // Do the two families already touch?
  const famtouch = rows.map(([a, b]) => {
    let sib1: number;
    if (plist.fam[lev]![a]! > 0) {
      sib1 = Math.max(...findsibs(a, plist, lev));
    } else {
      const sp = findspouse(a, plist, lev, partners);
      if (plist.fam[lev]![sp] === 0) return false; // married-in spouse: nothing to touch
      sib1 = Math.max(...findsibs(sp, plist, lev));
    }
    let sib2: number;
    if (plist.fam[lev]![b]! > 0) {
      sib2 = Math.min(...findsibs(b, plist, lev));
    } else {
      const sp = findspouse(b, plist, lev, partners);
      if (plist.fam[lev]![sp] === 0) return false;
      sib2 = Math.min(...findsibs(sp, plist, lev));
    }
    return sib2 - sib1 === 1;
  });

  return rows
    .map((r, i) => ({ r, touch: famtouch[i]! }))
    .sort((x, y) => {
      if (x.touch !== y.touch) return x.touch ? 1 : -1;      // non-touching first
      return (x.r[0] - x.r[1]) - (y.r[0] - y.r[1]);          // then widest separation first
    })
    .map(x => x.r);
}

export { kindepth };
