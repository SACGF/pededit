/**
 * Structural checks on what the canvas will draw (the output of layoutToFlow),
 * not on the kinship2 layout itself. The layout can match R slot for slot and
 * the drawing still be wrong when nodes are dropped or lines join the wrong
 * slots downstream, so these look for the shapes a reader would misread:
 *
 *   missing-individual     someone in the pedigree has no symbol
 *   missing-node           a line refers to a node that is not drawn
 *   couple-not-partners    a couple line joins two people who are not partners
 *   partnership-not-drawn  a partnership has no couple line
 *   couple-through-symbol  a straight couple line passes through another symbol
 *   couple-lines-overlap   two couple lines share a stretch of the same row
 *   couple-line-slanted    partners sit on different rows (usually a pin moved vertically)
 *   child-off-row          siblings sit on different rows, so a drop line misses a child
 *   child-without-parents  someone with parents has no line from those parents
 *   child-wrong-parents    a sibship line comes from a couple who are not the parents
 *   symbols-overlap        two symbols sit on top of each other
 *
 * Used by `__pededit.check()` (devHooks.ts), `scripts/browser/lint.mjs` and the
 * vitest over every example. Framework-free so all three share it.
 */
import type { Pedigree } from "@pedigree-editor/layout-engine";
import type { FlowData } from "./layoutToFlow";
import { NODE_SIZE } from "./constants";

export type LintCode =
  | "missing-individual"
  | "missing-node"
  | "couple-not-partners"
  | "partnership-not-drawn"
  | "couple-through-symbol"
  | "couple-lines-overlap"
  | "couple-line-slanted"
  | "child-off-row"
  | "child-without-parents"
  | "child-wrong-parents"
  | "symbols-overlap";

export interface LintFinding {
  code: LintCode;
  message: string;
  /** Individual ids involved, for selectors like [data-individual-id="..."]. */
  individuals: string[];
}

const EPS = 1;

export function lintFlow(pedigree: Pedigree, flow: FlowData): LintFinding[] {
  const out: LintFinding[] = [];
  const nodeById = new Map(flow.nodes.map(n => [n.id, n]));
  const indOf = (nodeId: string) => nodeById.get(nodeId)?.data.individual.id;
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    return ind?.name ? `${ind.name} (${id})` : id;
  };
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // Partnerships, by unordered pair and by id.
  const partnerPairs = new Map<string, string>();
  for (const p of pedigree.partnerships) partnerPairs.set(pairKey(p.individual1, p.individual2), p.id);

  // 1. Everyone is drawn at least once.
  const drawn = new Set(flow.nodes.map(n => n.data.individual.id));
  for (const ind of pedigree.individuals) {
    if (!drawn.has(ind.id)) {
      out.push({ code: "missing-individual", message: `${label(ind.id)} has no symbol`, individuals: [ind.id] });
    }
  }

  // 2. Couple lines.
  const drawnPairs = new Set<string>();
  const couples: { y: number; x1: number; x2: number; hop: number; ids: [string, string] }[] = [];
  for (const e of flow.coupleEdges) {
    const s = nodeById.get(e.source), t = nodeById.get(e.target);
    if (!s || !t) {
      const present = [s, t].filter(Boolean).map(n => n!.data.individual.id);
      out.push({
        code: "missing-node",
        message: `couple line ${e.id} ends at a node that is not drawn (${!s ? e.source : e.target})`,
        individuals: present,
      });
      continue;
    }
    const a = s.data.individual.id, b = t.data.individual.id;
    const key = pairKey(a, b);
    drawnPairs.add(key);
    if (!partnerPairs.has(key)) {
      out.push({
        code: "couple-not-partners",
        message: `couple line joins ${label(a)} and ${label(b)}, who are not partners`,
        individuals: [a, b],
      });
    }
    if (Math.abs(s.position.y - t.position.y) >= EPS) {
      out.push({
        code: "couple-line-slanted",
        message: `couple line ${label(a)} = ${label(b)} is slanted: they sit ${Math.round(Math.abs(s.position.y - t.position.y))}px apart vertically`,
        individuals: [a, b],
      });
    }
    const hop = e.data?.hopHeight ?? 0;
    const x1 = Math.min(s.position.x, t.position.x), x2 = Math.max(s.position.x, t.position.x);
    couples.push({ y: (s.position.y + t.position.y) / 2, x1, x2, hop, ids: [a, b] });
    if (hop === 0 && Math.abs(s.position.y - t.position.y) < EPS) {
      for (const n of flow.nodes) {
        if (n === s || n === t) continue;
        if (Math.abs(n.position.y - s.position.y) >= NODE_SIZE / 2) continue;
        if (n.position.x > x1 + EPS && n.position.x < x2 - EPS) {
          const c = n.data.individual.id;
          out.push({
            code: "couple-through-symbol",
            message: `couple line ${label(a)} = ${label(b)} runs through ${label(c)}`,
            individuals: [a, b, c],
          });
        }
      }
    }
  }
  for (const p of pedigree.partnerships) {
    if (!drawn.has(p.individual1) || !drawn.has(p.individual2)) continue; // already reported
    if (!drawnPairs.has(pairKey(p.individual1, p.individual2))) {
      out.push({
        code: "partnership-not-drawn",
        message: `partnership ${label(p.individual1)} = ${label(p.individual2)} has no couple line`,
        individuals: [p.individual1, p.individual2],
      });
    }
  }
  for (let i = 0; i < couples.length; i++) {
    for (let j = i + 1; j < couples.length; j++) {
      const A = couples[i]!, B = couples[j]!;
      if (Math.abs(A.y - B.y) >= EPS || A.hop !== B.hop) continue;
      const overlap = Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1);
      if (overlap > EPS) {
        out.push({
          code: "couple-lines-overlap",
          message: `couple lines ${label(A.ids[0])} = ${label(A.ids[1])} and ${label(B.ids[0])} = ${label(B.ids[1])} overlap, so they read as one line`,
          individuals: [...A.ids, ...B.ids],
        });
      }
    }
  }

  // 3. Children hang from their own parents.
  const parentsOf = new Map<string, string>(); // child id -> partnership id
  for (const [pid, kids] of Object.entries(pedigree.parentOf)) for (const k of kids) parentsOf.set(k, pid);
  const partnershipById = new Map(pedigree.partnerships.map(p => [p.id, p]));
  const hasLineFrom = new Map<string, Set<string>>(); // child id -> pair keys of couples it hangs from
  for (const e of flow.sibshipEdges) {
    const d = e.data;
    if (!d) continue;
    const ids = [d.leftParentId, d.rightParentId, ...d.childIds];
    const missing = ids.filter(id => !nodeById.has(id));
    if (missing.length) {
      out.push({
        code: "missing-node",
        message: `sibship line ${e.id} refers to node(s) that are not drawn: ${missing.join(", ")}`,
        individuals: ids.map(indOf).filter((x): x is string => !!x),
      });
    }
    // SibshipEdge draws every drop to the first child's row.
    const kids = d.childIds.map(id => nodeById.get(id)).filter(n => !!n);
    const rowY = kids[0]?.position.y;
    for (const k of kids.slice(1)) {
      if (rowY !== undefined && Math.abs(k.position.y - rowY) >= EPS) {
        const c = k.data.individual.id;
        out.push({
          code: "child-off-row",
          message: `${label(c)} sits ${Math.round(k.position.y - rowY)}px off their siblings' row, so the drop line does not reach them`,
          individuals: [c],
        });
      }
    }
    let lp = indOf(d.leftParentId), rp = indOf(d.rightParentId);
    if (!lp || !rp) continue;
    // The parent slots are adjacent; when the parents' couple line hops over
    // a partner in between, the drop hangs from the hopping line instead.
    if (!partnerPairs.has(pairKey(lp, rp))) {
      const l = nodeById.get(d.leftParentId)!, r = nodeById.get(d.rightParentId)!;
      const mid = (l.position.x + r.position.x) / 2, y = (l.position.y + r.position.y) / 2;
      const hop = couples.find(c => c.hop > 0 && Math.abs(c.y - y) < EPS && c.x1 < mid && c.x2 > mid);
      if (hop) [lp, rp] = hop.ids;
    }
    for (const cid of d.childIds) {
      const c = indOf(cid);
      if (!c) continue;
      if (!hasLineFrom.has(c)) hasLineFrom.set(c, new Set());
      hasLineFrom.get(c)!.add(pairKey(lp, rp));
    }
  }
  for (const [child, pid] of parentsOf) {
    const p = partnershipById.get(pid);
    if (!p || !drawn.has(child)) continue;
    const want = pairKey(p.individual1, p.individual2);
    const got = hasLineFrom.get(child);
    if (got?.has(want)) continue;
    if (got?.size) {
      const [from] = [...got];
      out.push({
        code: "child-wrong-parents",
        message: `${label(child)} hangs from ${from!.split("|").map(label).join(" = ")}, not from their parents ${label(p.individual1)} = ${label(p.individual2)}`,
        individuals: [child, p.individual1, p.individual2],
      });
    } else {
      out.push({
        code: "child-without-parents",
        message: `${label(child)} has no line from their parents ${label(p.individual1)} = ${label(p.individual2)}`,
        individuals: [child, p.individual1, p.individual2],
      });
    }
  }

  // 4. Symbols on top of each other.
  for (let i = 0; i < flow.nodes.length; i++) {
    for (let j = i + 1; j < flow.nodes.length; j++) {
      const A = flow.nodes[i]!, B = flow.nodes[j]!;
      if (Math.abs(A.position.x - B.position.x) < NODE_SIZE - EPS && Math.abs(A.position.y - B.position.y) < NODE_SIZE - EPS) {
        const a = A.data.individual.id, b = B.data.individual.id;
        out.push({ code: "symbols-overlap", message: `${label(a)} and ${label(b)} overlap`, individuals: [a, b] });
      }
    }
  }

  return out;
}
