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
 *   child-without-parents  someone with parents has no line from those parents
 *   child-wrong-parents    a sibship line comes from a couple who are not the parents
 *   assisted-not-drawn     a carrier or social parent (#45) has no line to the child
 *   sibship-bars-overlap   two couples' sibship bars run along the same line, so they read as one sibship
 *   symbols-overlap        two symbols sit on top of each other, or touch
 *   labels-overlap         two name or date labels on one row run into each other
 *
 * Used by `__pededit.check()` (devHooks.ts), `scripts/browser/lint.mjs` and the
 * vitest over every example. Framework-free so all three share it.
 */
import type { Pedigree, LayoutResult } from "@pedigree-editor/layout-engine";
import { alignPedigreeByFamily } from "@pedigree-editor/layout-engine";
import { drawnPedigree } from "./collapse";
import { assistedLinks } from "./assisted";
import type { FlowData } from "./layoutToFlow";
import { NODE_SIZE } from "./constants";
import { linesWidth } from "./labels";

export type LintCode =
  | "missing-individual"
  | "missing-node"
  | "couple-not-partners"
  | "partnership-not-drawn"
  | "couple-through-symbol"
  | "couple-lines-overlap"
  | "couple-line-slanted"
  | "child-without-parents"
  | "child-wrong-parents"
  | "assisted-not-drawn"
  | "sibship-bars-overlap"
  | "symbols-overlap"
  | "labels-overlap";

export interface LintFinding {
  code: LintCode;
  message: string;
  /** Individual ids involved, for selectors like [data-individual-id="..."]. */
  individuals: string[];
}

const EPS = 1;

/**
 * Smallest gap (px) between symbol edges that is not flagged. Symbols one slot
 * apart are 40px apart at normal spacing and 28px in compact mode.
 */
const MIN_SYMBOL_GAP = 8;

/** Two sibship bars closer than this (px) vertically read as one line where they overlap. */
const MIN_BAR_GAP = 4;

export function lintFlow(full: Pedigree, flow: FlowData): LintFinding[] {
  const pedigree = drawnPedigree(full); // hidden descendants (#94) are meant to be missing
  const out: LintFinding[] = [];
  const nodeById = new Map(flow.nodes.map(n => [n.id, n]));
  const indOf = (nodeId: string) => nodeById.get(nodeId)?.data.individual.id;
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    return ind?.name ? `${ind.name} (${id})` : id;
  };
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  // A node id is a layout slot ("level-slot"). When one is not drawn, name the
  // person kinship2 put in that slot, from the same layout layoutToFlow uses.
  let layout: LayoutResult | undefined;
  const slotLabel = (nodeId: string) => {
    layout ??= alignPedigreeByFamily(pedigree);
    const [lev, slot] = nodeId.split("-").map(Number);
    const idx = layout.nid[lev!]?.[slot!];
    const id = idx ? pedigree.individuals[Math.floor(idx) - 1]?.id : undefined;
    return id ? `slot ${nodeId}, ${label(id)}` : `slot ${nodeId}`;
  };

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
        message: `couple line ${e.id} ends at a node that is not drawn (${slotLabel(!s ? e.source : e.target)})`,
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
    if (p.donorConception) continue; // gamete donation (#45): not a couple, no line
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
        message: `sibship line ${e.id} refers to node(s) that are not drawn: ${missing.map(slotLabel).join("; ")}`,
        individuals: ids.map(indOf).filter((x): x is string => !!x),
      });
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

  // 3a. Lines of assisted reproduction (#45).
  const linked = new Set(flow.assistedEdges.flatMap(e => (e.data?.children ?? []).map(c => `${indOf(e.source)}>${c}`)));
  for (const link of assistedLinks(pedigree)) {
    if (!drawn.has(link.from) || !drawn.has(link.child) || linked.has(`${link.from}>${link.child}`)) continue;
    out.push({
      code: "assisted-not-drawn",
      message: `${label(link.from)} has no line to ${label(link.child)}, whom they ${link.kind === "carrier" ? "carried" : "parent"}`,
      individuals: [link.from, link.child],
    });
  }

  // 3b. Sibship bars of different couples along the same line (#80). Bars
  // that only meet end to end count too: they still read as one bar.
  const bars = flow.sibshipEdges.flatMap(e => {
    const d = e.data;
    if (!d || d.childXs.length === 0) return [];
    const kids = d.childIds.map(indOf).filter((x): x is string => !!x);
    return [{ y: d.sibBarY, x1: Math.min(d.coupleX, ...d.childXs), x2: Math.max(d.coupleX, ...d.childXs), kids }];
  });
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      const A = bars[i]!, B = bars[j]!;
      if (Math.abs(A.y - B.y) >= MIN_BAR_GAP) continue;
      if (Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1) < -EPS) continue;
      out.push({
        code: "sibship-bars-overlap",
        message: `the sibship bars above ${A.kids.map(label).join(", ")} and above ${B.kids.map(label).join(", ")} run along the same line, so they read as one sibship`,
        individuals: [...A.kids, ...B.kids],
      });
    }
  }

  // 4. Symbols on top of each other, or touching. Touching symbols (half a slot
  // apart) read as one shape, so they count too.
  const near = NODE_SIZE + MIN_SYMBOL_GAP;
  for (let i = 0; i < flow.nodes.length; i++) {
    for (let j = i + 1; j < flow.nodes.length; j++) {
      const A = flow.nodes[i]!, B = flow.nodes[j]!;
      const dx = Math.abs(A.position.x - B.position.x), dy = Math.abs(A.position.y - B.position.y);
      if (dx < near && dy < near) {
        const a = A.data.individual.id, b = B.data.individual.id;
        const how = dx < NODE_SIZE - EPS && dy < NODE_SIZE - EPS ? "overlap" : "touch";
        out.push({ code: "symbols-overlap", message: `${label(a)} and ${label(b)} ${how}`, individuals: [a, b] });
      }
    }
  }

  // 5. Labels on one row running into each other (#68). Names are wrapped to
  // the slot width, so this catches dragged nodes and long dates.
  const labelW = (n: FlowData["nodes"][0]) =>
    Math.max(linesWidth(n.data.nameLines ?? []), linesWidth(n.data.detailLines ?? []));
  for (let i = 0; i < flow.nodes.length; i++) {
    for (let j = i + 1; j < flow.nodes.length; j++) {
      const A = flow.nodes[i]!, B = flow.nodes[j]!;
      if (Math.abs(A.position.y - B.position.y) >= NODE_SIZE / 2) continue;
      const wa = labelW(A), wb = labelW(B);
      if (wa === 0 || wb === 0) continue;
      const gap = Math.abs(A.position.x - B.position.x) - (wa + wb) / 2;
      if (gap < 2) {
        const a = A.data.individual.id, b = B.data.individual.id;
        if (a === b) continue; // two copies of one person never share a row this closely unless pinned
        out.push({ code: "labels-overlap", message: `the labels of ${label(a)} and ${label(b)} overlap`, individuals: [a, b] });
      }
    }
  }

  return out;
}
