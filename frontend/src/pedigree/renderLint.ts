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
 *   couple-through-symbol  a couple line (hopping ones included) passes through another symbol
 *   couple-lines-overlap   two couple lines share a stretch of the same row
 *   couple-line-slanted    partners sit on different rows (usually a pin moved vertically)
 *   child-without-parents  someone with parents has no line from those parents
 *   child-wrong-parents    a sibship line comes from a couple who are not the parents
 *   assisted-not-drawn     a carrier or social parent has no line to the child
 *   line-through-symbol    a sibship or assisted line passes through a symbol it does not end at
 *   line-ends-nowhere      a couple line misses its partner's side, or a sibship or
 *                          assisted line ends where no symbol or line is drawn
 *   sibship-bars-overlap   two couples' sibship bars run along the same line, so they read as one sibship
 *   symbols-overlap        two symbols sit on top of each other, or touch
 *   labels-overlap         two people's text on one row runs together (names as a
 *                          file writes them, which the canvas's are no wider than)
 *   arc-through-symbol     the dashed arc between two copies of someone passes through
 *                          another person's symbol
 *   arc-through-label      the same arc passes through the text under someone else
 *   consanguinity-label-collides  the text over a double line runs into a symbol
 *                          (slash included), a "?", a line, other text, a copy number
 *                          or a dashed arc between two copies (unless on a white backing)
 *   title-collides         the chart title runs into a symbol, a dashed arc between
 *                          two copies, a couple label or a hopping couple line;
 *                          only when `options.title` is given, as the canvas draws it
 *
 * The geometric checks run on `sceneDrawing`: the lines and text the chart
 * components draw, worked out with their own functions, so they hold for
 * the canvas and for an export alike. The export lint (`io/svg/exportLint.ts`)
 * checks only what is about the file.
 *
 * Used by `__pededit.check()` (devHooks.ts), `scripts/browser/lint.mjs`, the
 * export lint (on the figure's scene) and the vitest over every example.
 * Framework-free so all of them share it.
 */
import type { Pedigree, LayoutResult } from "@pedigree-editor/layout-engine";
import { placementParentOf } from "@pedigree-editor/layout-engine";
import { cachedLayout } from "./layoutCache";
import { drawnPedigree } from "./collapse";
import { assistedLinks } from "./assisted";
import type { Scene, ScenePerson } from "./scene";
import { DECEASED_OVERHANG, NODE_SIZE } from "./constants";
import { chartTitlePlace, linesWidth, nameCharWidth, textWidth, titleWidth } from "./labels";
import { consanguinityLabelBaseline, consanguinityLabelPlacements, consanguinityLabelTop, consanguinityLabelWidth } from "./consanguinityLabel";
import { duplicateArcPoints } from "./duplicateArc";
import { textBlockUnder } from "./labelBlock";
import { arcCollisions } from "./duplicateArc";
import { pairKey } from "./graph";
import { sceneDrawing, segmentsOf, type Point, type SceneDrawing } from "./sceneDrawing";
import { symbolSideDx } from "./couplePath";
import type { Segment } from "./geometryTypes";

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
  | "line-through-symbol"
  | "line-ends-nowhere"
  | "sibship-bars-overlap"
  | "symbols-overlap"
  | "labels-overlap"
  | "arc-through-symbol"
  | "arc-through-label"
  | "consanguinity-label-collides"
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

/** Two drawn things closer than this (px) touch. */
const TOUCH = 1.5;
/** A sibship drop meets a double (consanguineous) couple line between its two lines, 2px from each. */
const COUPLE_TOUCH = 3;

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
    Math.max(linesWidth([...n.glyph.nameLines, ...n.glyph.figureNameLines], nameCharWidth(n.glyph.nameWeight)), linesWidth(n.glyph.detailLines));
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
      duplicateArcPoints({ a: s.position, b: t.position, half, ...e.data }, 48),
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

  const drawing = sceneDrawing(scene);
  out.push(...lintLines(drawing, scene, label), ...lintConsanguinityLabels(drawing, scene));
  if (options.title) out.push(...lintTitle(options.title, scene));
  return out;
}

/** Distance from point p to segment s. */
function distToSeg([px, py]: Point, [x1, y1, x2, y2]: Segment): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Does segment s cross the open box centred on c with half-size h? (Liang-Barsky clip.) */
function segCrossesBox([x1, y1, x2, y2]: Segment, [cx, cy]: Point, h: number): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, x1 - (cx - h)) && clip(dx, cx + h - x1) && clip(-dy, y1 - (cy - h)) && clip(dy, cy + h - y1) && t1 - t0 > 1e-6;
}

/**
 * Where the drawn lines go: through no symbol they do not end at, and each
 * end at something. A couple line ends at the side of its partner's symbol
 * facing the other partner (at the symbol's height, or 2px off it for a
 * double line), or for a line hopping to a further partner, on that side's
 * outline higher up. A sibship line ends at a symbol, on another sibship
 * line or on a couple line; a line of assisted reproduction at a symbol at
 * one end and a symbol or a sibship line at the other.
 */
function lintLines(drawing: SceneDrawing, scene: Scene, label: (id: string) => string): LintFinding[] {
  const out: LintFinding[] = [];
  const half = NODE_SIZE / 2;
  const at = ([x, y]: Point) => `(${Math.round(x)}, ${Math.round(y)})`;
  const reported = new Set<string>();
  const once = (key: string, f: LintFinding) => { if (!reported.has(key)) { reported.add(key); out.push(f); } };
  const pos = (n: ScenePerson): Point => [n.position.x, n.position.y];
  /** Symbols whose box (grown by pad) contains p. */
  const symbolsAt = ([px, py]: Point, pad = TOUCH) =>
    scene.people.filter(n => Math.abs(n.position.x - px) <= half + pad && Math.abs(n.position.y - py) <= half + pad);
  /** Does the end p of a couple line meet symbol n on its side `side` (1 right, -1 left)? */
  const meetsSide = (n: ScenePerson, [px, py]: Point, side: 1 | -1) => {
    const dx = side * (px - n.position.x), dy = n.position.y - py;
    if (Math.abs(dx - half) < 0.5 && Math.abs(dy) <= COUPLE_TOUCH) return true;
    return dy > 0 && dy < half && Math.abs(dx - symbolSideDx(n.glyph.shape, dy)) < 0.5;
  };

  const coupleSegs: Segment[] = [];
  for (const c of drawing.couples) {
    const a = c.left.individual.id, b = c.right.individual.id;
    for (const pts of c.paths) {
      coupleSegs.push(...segmentsOf(pts));
      const first = pts[0]!, last = pts[pts.length - 1]!;
      if (!meetsSide(c.left, first, 1) || !meetsSide(c.right, last, -1)) {
        const end = meetsSide(c.left, first, 1) ? last : first;
        once(`couple-end-${c.edge.id}`, { code: "line-ends-nowhere", message: `the couple line ${label(a)} = ${label(b)} ends at ${at(end)}, off the side of the symbol`, individuals: [a, b] });
      }
    }
    for (const n of scene.people) {
      if (n === c.left || n === c.right) continue;
      if (segmentsOf(c.course).some(sg => segCrossesBox(sg, pos(n), half - 1))) {
        once(`thru-${c.edge.id}-${n.id}`, { code: "couple-through-symbol", message: `couple line ${label(a)} = ${label(b)} runs through ${label(n.individual.id)}`, individuals: [a, b, n.individual.id] });
      }
    }
  }
  const onCouple = (p: Point) => coupleSegs.some(s => distToSeg(p, s) <= COUPLE_TOUCH);

  const sibs = drawing.sibships.flatMap(d => d.segments);
  const ends = (s: Segment): Point[] => [[s[0], s[1]], [s[2], s[3]]];
  const throughSymbol = (s: Segment, endsAt: ScenePerson[], what: string) => {
    for (const n of scene.people) {
      if (endsAt.includes(n) || !segCrossesBox(s, pos(n), half - 1)) continue;
      once(`lts-${what}-${n.id}`, { code: "line-through-symbol", message: `a ${what} runs through ${label(n.individual.id)}`, individuals: [n.individual.id] });
    }
  };
  sibs.forEach((s, i) => {
    for (const e of ends(s)) {
      if (symbolsAt(e).length || onCouple(e)) continue;
      if (sibs.some((t, j) => j !== i && distToSeg(e, t) <= TOUCH)) continue;
      once(`dangle-${at(e)}`, { code: "line-ends-nowhere", message: `a sibship line ends at ${at(e)}, where nothing is drawn`, individuals: [] });
    }
    throughSymbol(s, ends(s).flatMap(e => symbolsAt(e)), "sibship line");
  });
  for (const { segment: s } of drawing.assisted) {
    const [ea, eb] = ends(s);
    const sa = symbolsAt(ea!), sb = symbolsAt(eb!);
    const [fromSyms, toEnd] = sa.length ? [sa, eb!] : [sb, ea!];
    const toSyms = symbolsAt(toEnd);
    if (!fromSyms.length || (!toSyms.length && !sibs.some(t => distToSeg(toEnd, t) <= TOUCH))) {
      once(`dangle-assisted-${at(ea!)}`, { code: "line-ends-nowhere", message: `a line of assisted reproduction from ${at(ea!)} ends where nothing is drawn`, individuals: [] });
      continue;
    }
    throughSymbol(s, [...fromSyms, ...toSyms], "line of assisted reproduction");
  }
  return out;
}

/**
 * The text over each double line, line by line from cap height to just
 * below the baseline: it must touch no symbol (slash included), "?", line,
 * text under a symbol, copy number or other couple text, nor a dashed arc
 * between two copies unless it is on its white backing.
 */
function lintConsanguinityLabels(drawing: SceneDrawing, scene: Scene): LintFinding[] {
  const out: LintFinding[] = [];
  const half = NODE_SIZE / 2;
  type Box = [number, number, number, number];
  const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const textBox = (t: { x: number; y: number; width: number }, cap: number): Box => [t.x - t.width / 2 - 1, t.y - cap - 1, t.x + t.width / 2 + 1, t.y + 3];
  const segBox = ([x1, y1, x2, y2]: Segment): Box => [Math.min(x1, x2) - 1, Math.min(y1, y2) - 1, Math.max(x1, x2) + 1, Math.max(y1, y2) + 1];
  const lineSegs = [...drawing.sibships.flatMap(d => d.segments), ...drawing.couples.flatMap(c => c.paths.flatMap(segmentsOf))];
  const arcSegs = drawing.arcs.flatMap(a => segmentsOf(a.points));
  const boxes = drawing.coupleTexts.map(t => ({ t, box: textBox(t, 7) }));
  boxes.forEach(({ t, box }, i) => {
    const hit = (what: string) => out.push({ code: "consanguinity-label-collides", message: `the label "${t.text}" above a double line runs into ${what}`, individuals: [] });
    const sym = scene.people.find(({ position: { x, y } }) => overlaps(box, [x - half - DECEASED_OVERHANG, y - half - DECEASED_OVERHANG, x + half + DECEASED_OVERHANG, y + half]));
    if (sym) { hit(`the symbol of ${sym.individual.id}`); return; }
    const q = drawing.questionMarks.find(([x, y]) => overlaps(box, [x - 4, y - 10, x + 4, y + 1]));
    if (q) { hit(`the "?" at (${Math.round(q[0])}, ${Math.round(q[1])})`); return; }
    if (lineSegs.some(s => overlaps(box, segBox(s)))) { hit("a line"); return; }
    if (!t.backed && arcSegs.some(s => overlaps(box, segBox(s)))) { hit("a dashed arc between two copies"); return; }
    const other = drawing.texts.find(o => overlaps(box, textBox(o, 8)));
    if (other) { hit(`the label "${other.text}"`); return; }
    const copy = drawing.copyNumbers.find(c => overlaps(box, [c.x - 1, c.y - 8, c.x + textWidth(c.text) + 1, c.y + 3]));
    if (copy) { hit(`the copy number "${copy.text}"`); return; }
    const twin = boxes.find((o, j) => j !== i && overlaps(box, o.box));
    if (twin) hit(`the label "${twin.t.text}"`);
  });
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
    if (a && b && duplicateArcPoints({ a, b, half, ...e.data }, 48).some(inBox)) return found("a dashed arc between two copies");
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
