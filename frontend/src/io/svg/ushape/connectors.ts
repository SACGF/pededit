/**
 * U-shape export, step 3: the lines. Couple lines, sibship bars, descent
 * lines, twin forks, assisted reproduction lines and the dashed links between
 * copies, drawn along the tracks. This geometry is the U-shape's own.
 */
import { type Pedigree } from "@pedigree-editor/layout-engine";
import { childDropEndOffset } from "../symbolSvg";
import { assistedLinks } from "../../../pedigree/assisted";
import { ADOPTION_DASH } from "../../../pedigree/adoption";
import { endedBreakX, endedMarkSegments, middleTaken } from "../../../pedigree/ended";
import { twinMembership, TWIN_QUESTION_FONT_SIZE } from "../../../pedigree/twins";
import { activeChildless, CHILDLESS_DROP, CHILDLESS_BAR, CHILDLESS_BAR_GAP, CHILDLESS_REASON_FONT_SIZE } from "../../../pedigree/childless";
import { HALF, STROKE, CONSANG_GAP, BAR_CLEARANCE, DUP_LINK_INSET, r, escapeXml } from "./constants";
import { walk, type TNode } from "./tree";
import { trackPoint, memberU, descentU, type Geom, type UShapeLayout, type Built } from "./layout";

export const LINE_ATTRS = `fill="none" stroke="black" stroke-width="${STROKE}" stroke-linecap="round"`;

/** A path that follows one track from u1 to u2: true arcs on the curve, lines elsewhere. */
export function trackPath(u1: number, u2: number, offset: number, g: Geom, attrs = LINE_ATTRS): string {
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

/** Group items by a key, dropping items whose key is undefined. */
export function groupBy<T>(items: T[], keyOf: (t: T) => string | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    if (k === undefined) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(it);
  }
  return out;
}

/** A short segment along the track direction at (u, offset), centred there, 2 * halfLen long. */
export function tangentSeg(u: number, offset: number, halfLen: number, g: Geom): string {
  const eps = 0.01;
  const a = trackPoint(u - eps, offset, g), b = trackPoint(u + eps, offset, g);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dx = (b.x - a.x) / len * halfLen, dy = (b.y - a.y) / len * halfLen;
  const c = trackPoint(u, offset, g);
  return `<line x1="${r(c.x - dx)}" y1="${r(c.y - dy)}" x2="${r(c.x + dx)}" y2="${r(c.y + dy)}" ${LINE_ATTRS}/>`;
}

/** The ended relationship strokes (#98) across the track at position u, leaning with the track. */
export function endedSegs(u: number, offset: number, g: Geom): string[] {
  const eps = 0.01;
  const a = trackPoint(u - eps, offset, g), b = trackPoint(u + eps, offset, g);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const tx = (b.x - a.x) / len, ty = (b.y - a.y) / len;
  const c = trackPoint(u, offset, g);
  // The canvas segments are in (along, down) coordinates; down is towards the
  // children, which is outward on the U.
  return endedMarkSegments(0, 0).map(([x1, y1, x2, y2]) => {
    const px = (s: number, d: number) => r(c.x + s * tx + d * c.nx);
    const py = (s: number, d: number) => r(c.y + s * ty + d * c.ny);
    return `<line x1="${px(x1, y1)}" y1="${py(x1, y1)}" x2="${px(x2, y2)}" y2="${py(x2, y2)}" ${LINE_ATTRS}/>`;
  });
}

/** A straight segment across the tracks at position u, from offset o1 to o2. */
export function normalSeg(u: number, o1: number, o2: number, g: Geom, attrs = LINE_ATTRS): string {
  const p1 = trackPoint(u, o1, g), p2 = trackPoint(u, o2, g);
  return `<line x1="${r(p1.x)}" y1="${r(p1.y)}" x2="${r(p2.x)}" y2="${r(p2.y)}" ${attrs}/>`;
}

export const ADOPTED_IN_ATTRS = `${LINE_ATTRS} stroke-dasharray="${ADOPTION_DASH}"`;

/**
 * A diagonal from (u1, o1) to (u2, o2) in track coordinates, drawn as a
 * polyline that follows the curve (a straight chord in the plane would cut
 * across the tracks when the two points are far apart along the U).
 */
export function diagonalPath(u1: number, o1: number, u2: number, o2: number, g: Geom, attrs = LINE_ATTRS): string {
  const steps = Math.max(1, Math.ceil(Math.abs(u2 - u1) / 12));
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = trackPoint(u1 + t * (u2 - u1), o1 + t * (o2 - o1), g);
    pts.push(`${r(pt.x)} ${r(pt.y)}`);
  }
  return `<path d="M ${pts.join(" L ")}" ${attrs}/>`;
}

/** The point half way along such a diagonal. */
export function diagonalMid(u1: number, o1: number, u2: number, o2: number, g: Geom): { x: number; y: number } {
  const pt = trackPoint((u1 + u2) / 2, (o1 + o2) / 2, g);
  return { x: pt.x, y: pt.y };
}

export const DUP_ATTRS = `fill="none" stroke="black" stroke-width="1" stroke-dasharray="4 3"`;

export function renderConnectors(b: Built, layout: UShapeLayout, pedigree: Pedigree): string[] {
  const g = b.geom;
  const byId = new Map(pedigree.individuals.map(i => [i.id, i]));
  const partnershipById = new Map(pedigree.partnerships.map(p => [p.id, p]));
  const twins = twinMembership(pedigree);
  const out: string[] = [];
  // Assisted reproduction (#45): carrier and social parent lines. One that
  // covers a whole sibship goes to the bar under its line of descent.
  const links = assistedLinks(pedigree);
  const linkDone = new Set<string>();
  const linkKey = (l: { kind: string; from: string; child: string }) => `${l.kind}|${l.from}|${l.child}`;
  const linkAttrs = (kind: string) => (kind === "social" ? ADOPTED_IN_ATTRS : LINE_ATTRS);

  walk(b.root, n => {
    const track = n.depth * g.ringGap;
    const childEdge = track + g.ringGap - HALF;
    const bar = childEdge - BAR_CLEARANCE;

    for (const w of n.unions) {
      // Gamete donation (#45): no couple line; a line from each parent to the bar.
      const donor = w.kind !== "solo" && w.pids.length === 1 && !!partnershipById.get(w.pids[0]!)?.donorConception;
      if (w.kind !== "solo" && !donor) {
        const uA = memberU(n, w.a, g);
        const uB = w.kind === "join" ? w.joinNode!.u : memberU(n, w.b!, g);
        if (w.consang) out.push(trackPath(uA, uB, track - CONSANG_GAP / 2, g), trackPath(uA, uB, track + CONSANG_GAP / 2, g));
        else out.push(trackPath(uA, uB, track, g));
        // Ended relationship (#98): two strokes across the line, aside from
        // the descent line or childless mark in its middle.
        const partnership = w.pids.length === 1 ? partnershipById.get(w.pids[0]!) : undefined;
        if (partnership?.ended) {
          const lo = Math.min(uA, uB) + HALF, hi = Math.max(uA, uB) - HALF;
          out.push(...endedSegs(endedBreakX(lo, hi, 0, 0, middleTaken(partnership, pedigree)), track, g));
        }
      }
      if (!w.kids.length) {
        // Childless couple mark (#15): outward from the middle of the couple
        // line, one bar (by choice) or two (infertility), reason text beyond.
        const partnership = w.kind !== "solo" && w.pids.length === 1 ? partnershipById.get(w.pids[0]!) : undefined;
        const childless = partnership && activeChildless(partnership, pedigree);
        if (partnership && childless) {
          const uP = descentU(n, w, g);
          const barOff = track + CHILDLESS_DROP;
          out.push(normalSeg(uP, track, barOff, g), tangentSeg(uP, barOff, CHILDLESS_BAR / 2, g));
          if (childless === "infertility") out.push(tangentSeg(uP, barOff - CHILDLESS_BAR_GAP, CHILDLESS_BAR / 2, g));
          if (partnership.childlessReason) {
            const t = trackPoint(uP, barOff + CHILDLESS_REASON_FONT_SIZE + 2, g);
            out.push(`<text x="${r(t.x)}" y="${r(t.y)}" text-anchor="middle" font-family="sans-serif" font-size="${CHILDLESS_REASON_FONT_SIZE}" fill="black">${escapeXml(partnership.childlessReason)}</text>`);
          }
        }
        continue;
      }
      // Each sibship descends from the middle of its couple line, or from the
      // parent's symbol when the partner is not drawn.
      const uP = descentU(n, w, g);
      if (donor) {
        const uA = memberU(n, w.a, g);
        const uB = w.kind === "join" ? w.joinNode!.u : memberU(n, w.b!, g);
        out.push(diagonalPath(uA, track + HALF, uP, bar, g), diagonalPath(uB, track + HALF, uP, bar, g));
      } else {
        out.push(normalSeg(uP, track + (w.kind === "solo" ? HALF : 0), bar, g));
      }
      // Twins share one fork point on the bar, at the mean of their positions (#11).
      const forkU = new Map<string, number>();
      for (const [key, members] of groupBy(w.kids, c => twins.get(c.blood)?.twinSet)) {
        if (members.length >= 2) forkU.set(key, members.reduce((a, c) => a + c.u, 0) / members.length);
      }
      // The bar ends where the outermost drops start, at a twin fork rather than over the twin (#104).
      const starts = w.kids.map(c => { const key = twins.get(c.blood)?.twinSet; return key !== undefined && forkU.has(key) ? forkU.get(key)! : c.u; });
      const lo = Math.min(uP, ...starts), hi = Math.max(uP, ...starts);
      if (hi - lo > 0.01) out.push(trackPath(lo, hi, bar, g));
      for (const l of links) {
        if (linkDone.has(linkKey(l)) || l.child !== w.kids[0]!.blood) continue;
        const from = layout.nodes.get(l.from);
        if (!from || from.depth >= n.depth + 1) continue;
        const all = w.kids.every(c => links.some(m => m.kind === l.kind && m.from === l.from && m.child === c.blood));
        if (!all) continue;
        for (const c of w.kids) linkDone.add(linkKey({ ...l, child: c.blood }));
        out.push(diagonalPath(from.u, from.depth * g.ringGap + HALF, uP, bar, g, linkAttrs(l.kind)));
      }
      // A loss triangle's apex sits below the top of the symbol box. An
      // adopted-in child's drop is dashed (#12).
      w.kids.forEach(c => {
        const ind = byId.get(c.blood);
        const attrs = ind?.adopted === "in" ? ADOPTED_IN_ATTRS : LINE_ATTRS;
        const end = childEdge + HALF + childDropEndOffset(ind);
        const key = twins.get(c.blood)?.twinSet;
        if (key !== undefined && forkU.has(key)) {
          out.push(diagonalPath(forkU.get(key)!, bar, c.u, end, g, attrs));
        } else {
          out.push(normalSeg(c.u, bar, end, g, attrs));
        }
      });
      // Monozygotic: a bar between the midpoints of neighbouring drops; unknown: "?".
      for (const [key, members] of groupBy(w.kids, c => twins.get(c.blood)?.twinSet)) {
        if (members.length < 2) continue;
        const z = twins.get(members[0]!.blood)!.zygosity;
        if (z === "dizygotic") continue;
        const fu = forkU.get(key)!;
        const sorted = [...members].sort((a, b) => a.u - b.u);
        const mid = (c: TNode) => diagonalMid(fu, bar, c.u, childEdge + HALF + childDropEndOffset(byId.get(c.blood)), g);
        for (let i = 0; i + 1 < sorted.length; i++) {
          const pa = mid(sorted[i]!), pb = mid(sorted[i + 1]!);
          if (z === "monozygotic") out.push(`<line x1="${r(pa.x)}" y1="${r(pa.y)}" x2="${r(pb.x)}" y2="${r(pb.y)}" ${LINE_ATTRS}/>`);
          else out.push(`<text x="${r((pa.x + pb.x) / 2)}" y="${r((pa.y + pb.y) / 2 + TWIN_QUESTION_FONT_SIZE * 0.35)}" text-anchor="middle" font-family="sans-serif" font-size="${TWIN_QUESTION_FONT_SIZE}" font-weight="bold" fill="black">?</text>`);
        }
      }
    }
  });

  // Assisted reproduction (#45): a line from the woman who carried the child
  // (solid) or a parent who is not genetic (dashed), when both are drawn.
  for (const link of links) {
    const from = layout.nodes.get(link.from), child = layout.nodes.get(link.child);
    if (!from || !child || linkDone.has(linkKey(link))) continue;
    const below = child.depth > from.depth;
    const o1 = from.depth * g.ringGap + (below ? HALF : -HALF);
    const o2 = child.depth * g.ringGap + (below ? childDropEndOffset(byId.get(link.child)) : HALF);
    out.push(diagonalPath(from.u, o1, child.u, o2, g, linkAttrs(link.kind)));
  }

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
