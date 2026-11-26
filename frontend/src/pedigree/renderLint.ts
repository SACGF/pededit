/**
 * Structural checks on what the canvas will draw (the output of buildScene),
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
 *   assisted-not-drawn     a carrier or social parent has no line to the child
 *   sibship-bars-overlap   two couples' sibship bars run along the same line, so they read as one sibship
 *   symbols-overlap        two symbols sit on top of each other, or touch
 *   labels-overlap         two name or date labels on one row run into each other
 *   arc-through-symbol     the dashed arc between two copies of someone passes through
 *                          another person's symbol
 *   arc-through-label      the same arc passes through the text under someone else
 *   title-collides         the chart title runs into a symbol, a dashed arc between
 *                          two copies, a couple label or a hopping couple line;
 *                          only when `options.title` is given, as the canvas draws it
 *
 * Used by `__pededit.check()` (devHooks.ts), `scripts/browser/lint.mjs` and the
 * vitest over every example. Framework-free so all three share it.
 */
import type { Pedigree, LayoutResult } from "@pedigree-editor/layout-engine";
import { placementParentOf } from "@pedigree-editor/layout-engine";
import { cachedLayout } from "./layoutCache";
import { drawnPedigree } from "./collapse";
import { assistedLinks } from "./assisted";
import type { Scene, ScenePerson } from "./scene";
import { DECEASED_OVERHANG, NODE_SIZE } from "./constants";
import { chartTitlePlace, linesWidth, titleWidth } from "./labels";
import { consanguinityLabelBaseline, consanguinityLabelPlacements, consanguinityLabelTop, consanguinityLabelWidth } from "./consanguinityLabel";
import { duplicateArcPoints } from "./duplicateArc";
import { textBlockUnder } from "./labelBlock";
import { arcCollisions } from "./duplicateArc";
import { pairKey } from "./graph";

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
  | "labels-overlap"
  | "arc-through-symbol"
  | "arc-through-label"
  | "title-collides";

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

export function lintScene(full: Pedigree, scene: Scene, options: { title?: string } = {}): LintFinding[] {
  const pedigree = drawnPedigree(full); // hidden descendants are meant to be missing
  const out: LintFinding[] = [];
  const nodeById = new Map(scene.people.map(n => [n.id, n]));
  const indOf = (nodeId: string) => nodeById.get(nodeId)?.individual.id;
  const label = (id: string) => {
    const ind = pedigree.individuals.find(i => i.id === id);
    return ind?.name ? `${ind.name} (${id})` : id;
  };
  // A node id is a layout slot ("level-slot"). When one is not drawn, name the
  // person kinship2 put in that slot, from the same layout buildScene uses.
  let layout: LayoutResult | undefined;
  const slotLabel = (nodeId: string) => {
    layout ??= cachedLayout(pedigree);
    const [lev, slot] = nodeId.split("-").map(Number);
    const idx = layout.nid[lev!]?.[slot!];
    const id = idx ? pedigree.individuals[Math.floor(idx) - 1]?.id : undefined;
    return id ? `slot ${nodeId}, ${label(id)}` : `slot ${nodeId}`;
  };

  // Partnerships, by unordered pair and by id.
  const partnerPairs = new Map<string, string>();
  for (const p of pedigree.partnerships) partnerPairs.set(pairKey(p.individual1, p.individual2), p.id);

  // 1. Everyone is drawn at least once.
  const drawn = new Set(scene.people.map(n => n.individual.id));
  for (const ind of pedigree.individuals) {
    if (!drawn.has(ind.id)) {
      out.push({ code: "missing-individual", message: `${label(ind.id)} has no symbol`, individuals: [ind.id] });
    }
  }

  // 2. Couple lines.
  const drawnPairs = new Set<string>();
  const couples: { y: number; x1: number; x2: number; hop: number; ids: [string, string] }[] = [];
  for (const e of scene.couples) {
    const s = nodeById.get(e.source), t = nodeById.get(e.target);
    if (!s || !t) {
      const present = [s, t].filter(Boolean).map(n => n!.individual.id);
      out.push({
        code: "missing-node",
        message: `couple line ${e.id} ends at a node that is not drawn (${slotLabel(!s ? e.source : e.target)})`,
        individuals: present,
      });
      continue;
    }
    const a = s.individual.id, b = t.individual.id;
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
    const hop = e.data.hopHeight;
    const x1 = Math.min(s.position.x, t.position.x), x2 = Math.max(s.position.x, t.position.x);
    couples.push({ y: (s.position.y + t.position.y) / 2, x1, x2, hop, ids: [a, b] });
    if (hop === 0 && Math.abs(s.position.y - t.position.y) < EPS) {
      for (const n of scene.people) {
        if (n === s || n === t) continue;
        if (Math.abs(n.position.y - s.position.y) >= NODE_SIZE / 2) continue;
        if (n.position.x > x1 + EPS && n.position.x < x2 - EPS) {
          const c = n.individual.id;
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
    if (p.donorConception) continue; // gamete donation: not a couple, no line
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
  // Where the child is drawn: under the couple carrying it, for an egg donor's child.
  for (const [pid, kids] of Object.entries(placementParentOf(pedigree))) for (const k of kids) parentsOf.set(k, pid);
  const partnershipById = new Map(pedigree.partnerships.map(p => [p.id, p]));
  const hasLineFrom = new Map<string, Set<string>>(); // child id -> pair keys of couples it hangs from
  for (const e of scene.sibships) {
    const d = e.data;
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
    // a partner in between, the drop hangs from the level end of the hopping
    // line, beside the further partner. Several hops can pass over one gap
    // (five or more partners), but only one of them ends at that partner.
    if (!partnerPairs.has(pairKey(lp, rp))) {
      const l = nodeById.get(d.leftParentId)!, r = nodeById.get(d.rightParentId)!;
      const mid = (l.position.x + r.position.x) / 2, y = (l.position.y + r.position.y) / 2;
      const far = d.hopDrop && indOf(d.hopDrop.parentId);
      const hop = couples.find(c => c.hop > 0 && !!far && c.ids.includes(far) && Math.abs(c.y - y) < EPS && c.x1 < mid && c.x2 > mid);
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

  // 3a. Lines of assisted reproduction.
  const linked = new Set(scene.assisted.flatMap(e => e.data.children.map(c => `${indOf(e.source)}>${c}`)));
  for (const link of assistedLinks(pedigree)) {
    if (!drawn.has(link.from) || !drawn.has(link.child) || linked.has(`${link.from}>${link.child}`)) continue;
    out.push({
      code: "assisted-not-drawn",
      message: `${label(link.from)} has no line to ${label(link.child)}, whom they ${link.kind === "carrier" ? "carried" : "parent"}`,
      individuals: [link.from, link.child],
    });
  }

  // 3b. Sibship bars of different couples along the same line. Bars
  // that only meet end to end count too: they still read as one bar.
  const bars = scene.sibships.flatMap(e => {
    const d = e.data;
    if (!d || d.childXs.length === 0 || d.converge) return [];
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
  for (let i = 0; i < scene.people.length; i++) {
    for (let j = i + 1; j < scene.people.length; j++) {
      const A = scene.people[i]!, B = scene.people[j]!;
      const dx = Math.abs(A.position.x - B.position.x), dy = Math.abs(A.position.y - B.position.y);
      if (dx < near && dy < near) {
        const a = A.individual.id, b = B.individual.id;
        const how = dx < NODE_SIZE - EPS && dy < NODE_SIZE - EPS ? "overlap" : "touch";
        out.push({ code: "symbols-overlap", message: `${label(a)} and ${label(b)} ${how}`, individuals: [a, b] });
      }
    }
  }

  // 5. Labels on one row running into each other. Names are wrapped to
  // the slot width, so this catches dragged nodes and long dates.
  const labelW = (n: ScenePerson) =>
    Math.max(linesWidth(n.glyph.nameLines), linesWidth(n.glyph.detailLines));
  for (let i = 0; i < scene.people.length; i++) {
    for (let j = i + 1; j < scene.people.length; j++) {
      const A = scene.people[i]!, B = scene.people[j]!;
      if (Math.abs(A.position.y - B.position.y) >= NODE_SIZE / 2) continue;
      const wa = labelW(A), wb = labelW(B);
      if (wa === 0 || wb === 0) continue;
      const gap = Math.abs(A.position.x - B.position.x) - (wa + wb) / 2;
      if (gap < 2) {
        const a = A.individual.id, b = B.individual.id;
        if (a === b) continue; // two copies of one person never share a row this closely unless pinned
        out.push({ code: "labels-overlap", message: `the labels of ${label(a)} and ${label(b)} overlap`, individuals: [a, b] });
      }
    }
  }

  // 6. Dashed arcs between two copies of someone: through nobody else's
  // symbol and nobody else's text. Lines are crossed, as any arc must.
  const half = NODE_SIZE / 2;
  for (const e of scene.duplicates) {
    const s = nodeById.get(e.source), t = nodeById.get(e.target);
    if (!s || !t) continue;
    const who = s.individual.id;
    const hit = arcCollisions(
      duplicateArcPoints(s.position.x, s.position.y, t.position.x, t.position.y, e.data.bulge, half, 48, e.data.legDx),
      scene.people.filter(n => n.individual.id !== who).map(n => ({
        id: n.individual.id, x: n.position.x, y: n.position.y,
        text: textBlockUnder(n.glyph, n.position.x, n.position.y),
      })),
      half,
    );
    for (const id of hit.symbols) {
      out.push({ code: "arc-through-symbol", message: `the dashed arc between the copies of ${label(who)} runs through the symbol of ${label(id)}`, individuals: [who, id] });
    }
    for (const id of hit.labels) {
      out.push({ code: "arc-through-label", message: `the dashed arc between the copies of ${label(who)} runs through the text under ${label(id)}`, individuals: [who, id] });
    }
  }

  if (options.title) out.push(...lintTitle(options.title, scene));
  return out;
}

/**
 * The canvas title, placed as `ChartTitleNode` places it, against
 * everything drawn near the top of the chart. The title is raised to clear
 * the scene's `aboveTop`, so a finding means that missed something.
 */
function lintTitle(title: string, scene: Scene): LintFinding[] {
  const half = NODE_SIZE / 2;
  const place = chartTitlePlace(title, scene.people, half, scene.aboveTop);
  if (!place) return [];
  const w = titleWidth(title);
  const box = [place.x - w / 2, place.y - place.height / 2, place.x + w / 2, place.y + place.height / 2] as const;
  const inBox = ([x, y]: readonly [number, number]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
  const overlaps = (b: readonly [number, number, number, number]) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1];
  const found = (what: string, individuals: string[] = []): LintFinding[] =>
    [{ code: "title-collides", message: `the chart title "${title}" is drawn through ${what}`, individuals }];

  for (const n of scene.people) {
    const { x, y } = n.position;
    if (overlaps([x - half, y - half - DECEASED_OVERHANG, x + half, y + half])) return found(`the symbol of ${n.individual.id}`, [n.individual.id]);
  }
  const pos = new Map(scene.people.map(n => [n.id, n.position]));
  for (const e of scene.duplicates) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (a && b && duplicateArcPoints(a.x, a.y, b.x, b.y, e.data.bulge, half, 48, e.data.legDx).some(inBox)) return found("a dashed arc between two copies");
  }
  for (const p of consanguinityLabelPlacements(scene)) {
    const lw = Math.max(...p.lines.map(consanguinityLabelWidth));
    if (overlaps([p.x - lw / 2, consanguinityLabelTop(p.cy, p.hop, p.lines.length, p.dy), p.x + lw / 2, consanguinityLabelBaseline(p.cy, p.hop) + p.dy + 3])) {
      return found(`the label "${p.lines.join(" ")}" above a double line`);
    }
  }
  for (const e of scene.couples) {
    const a = pos.get(e.source), b = pos.get(e.target), hop = e.data.hopHeight;
    if (!a || !b || hop <= 0) continue;
    const y = Math.min(a.y, b.y) - hop;
    if (overlaps([Math.min(a.x, b.x), y - 1, Math.max(a.x, b.x), y + 1])) return found("a couple line hopping over a symbol");
  }
  return [];
}
