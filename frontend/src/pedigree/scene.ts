import { buildPartnerSetFromPedigree, descentX, resolveCouple } from "@pedigree-editor/layout-engine";
import { cachedLayout } from "./layoutCache";
import type { Pedigree, LayoutResult, Individual, Partnership, PartnerSet, ChildlessStatus, Zygosity, Sex } from "@pedigree-editor/layout-engine";
import { NODE_SIZE, DUPLICATE_ARC_BULGE } from "./constants";
import { couplePortHeights, highestHop, hopGeometry, hopTurn } from "./couplePath";
import { chooseArcRoute, duplicateArcPoints, highestDuplicateArc } from "./duplicateArc";
import type { ArcLine, ArcObstacle } from "./duplicateArc";
import { layoutSpacing, scalePinnedPosition } from "./spacing";
import { consanguinityTest } from "./consanguinity";
import type { LayoutSpacing } from "./spacing";
import { activeSnapGrid, snapSlotPositions } from "./snap";
import { activeChildless } from "./childless";
import { middleTaken } from "./ended";
import { consanguinityLabelLimits, consanguinityLabelRoom, consanguinityLabelText, placeConsanguinityLabel, wrapConsanguinityLabel } from "./consanguinityLabel";
import { highestConsanguinityLabel, type ConsanguinityLabelOffset } from "./consanguinityLabel";
import type { TextBlock, LinePoint } from "./geometryTypes";
import { copyNumberBlock, textBlockUnder, TEXT_OFFSET_Y, ANNOTATION_SHIFT, CAPTION_SHIFT } from "./labelBlock";
import { drawnPedigree, branchOf } from "./collapse";
import type { CollapsedBranch } from "./collapse";
import { twinMembership } from "./twins";
import { barsUnderLabels, sibBarHeight, sibshipBarOffsets } from "./sibshipPath";
import { labelMaxWidth, nameLabelMode, canvasLabelLines, LABEL_LINE_HEIGHT } from "./labels";
import { ARROW_TAIL, PROBAND_LETTER_SIZE } from "./proband";
import { personGlyph, type PersonGlyph } from "./personGlyph";
import { numberFromLayout, showsNumbers } from "./numbering";
import { symbolSex } from "./gender";
import { assistedLinks, type AssistedLink } from "./assisted";
import { assistedEdgeSegment } from "./assistedLines";
import { hasParents, pairKey } from "./graph";

/**
 * The drawing as plain data (#146): who is drawn where, every line and the
 * text above couple lines, with no React Flow in it. `buildScene` makes it
 * from a pedigree; the canvas turns it into React Flow nodes and edges
 * (`sceneToFlow.ts`), and the exports, the lints, de-identification and the
 * dev hooks read it as it is. Positions are symbol centres, in px.
 */

// ── Output types ──────────────────────────────────────────────────────────────

/** One drawn symbol: a person, or one copy of someone drawn more than once. */
export type ScenePerson = {
  /** The layout slot, "level-slot": one per drawn copy. Lines name their ends by it. */
  id: string;
  /** Centre of the symbol. */
  position: { x: number; y: number };
  individual: Individual;
  /** Everything drawn at this person, decided once (`personGlyph`). */
  glyph: PersonGlyph;
  /**
   * True if this symbol sits at the individual's pinned (dragged) position. For
   * someone drawn more than once only the copy nearest the pin is moved.
   */
  isPinned: boolean;
  /** The canvas lets this symbol be dragged. */
  draggable: boolean;
  /** Twin set key ("partnershipId:index") and zygosity when the individual is a twin. */
  twinSet?: string;
  zygosity?: Zygosity;
  /**
   * Set on the symbol standing for a collapsed branch, whose `individual`
   * is a stand-in that is not in the stored pedigree. It can be neither
   * selected nor dragged.
   */
  branch?: CollapsedBranch;
};

/** A line between two drawn symbols, named by their slot ids. */
export interface SceneLine<D> {
  id: string;
  source: string;
  target: string;
  data: D;
}

/** A couple line: `source` is the left partner, `target` the right. */
export interface SceneCoupleLine extends SceneLine<CoupleLineData> {
  /** Drawn double: the couple are related (`consanguinityTest`). */
  double: boolean;
}

/** The box everything is drawn in, symbols, text under them and marks above, before any title or key. */
export interface SceneBounds { left: number; top: number; width: number; height: number }

export interface Scene {
  people: ScenePerson[];
  couples: SceneCoupleLine[];
  sibships: SceneLine<SibshipData>[];
  /** One per pair of consecutive copies of someone drawn more than once. */
  duplicates: SceneLine<DuplicateArcData>[];
  /** Lines of assisted reproduction: carrier and social parent to child. */
  assisted: SceneLine<AssistedLineData>[];
  /** The width (px) names and details under a symbol are wrapped to. */
  labelMax: number;
  /**
   * The highest point drawn above the symbols (couple text, the dashed arcs
   * between copies, hopping couple lines), Infinity when nothing is: the
   * chart title is raised to clear it (`highestAboveSymbols`).
   */
  aboveTop: number;
  /** Null when nobody is drawn. */
  bounds: SceneBounds | null;
}

/**
 * The highest point of anything drawn over the symbols, or Infinity when
 * there is nothing: the couple labels, the dashed arcs between two copies of
 * someone and the couple lines that hop over a partner. The chart title is
 * raised to clear it, on the canvas (`chartTitleNode`) and in the export
 * (`computeBounds`).
 */
export function highestAboveSymbols(scene: Pick<Scene, "people" | "couples" | "duplicates">): number {
  return Math.min(highestConsanguinityLabel(scene), highestDuplicateArc(scene, NODE_SIZE / 2), highestHop(scene));
}

/**
 * One end of a hopping couple line: see `CoupleLineData.hopEnds`. `turn` is
 * where the line turns between the row and its raised part (px from this
 * partner's centre). The end at the further partner also says where a
 * childless mark hangs from the level stretch there (`drop`): see `hopTurn`.
 */
export interface HopEnd { shape?: Sex; port: number; turn?: number; drop?: number }

/**
 * Geometry is derived from the source/target node positions. hopHeight is 0
 * for an ordinary line; otherwise the partners are not adjacent (someone with
 * three or more partners) and the line rises by that many px to pass over the
 * slot(s) between them.
 */
export type CoupleLineData = {
  hopHeight: number;
  /**
   * How a hopping line meets the left partner's symbol (`source`) and the
   * right partner's: the shape drawn there, the height (px) above its
   * centre at which the line leaves its side, clear of the line to a nearer
   * partner on that side, and where it turns up or comes back down. Unset
   * for a line that does not hop.
   */
  hopEnds?: { source: HopEnd; target: HopEnd };
  /** The partnership the line draws, for the couple line's right-click menu. */
  partnershipId?: string;
  /** Childless couple mark under the line, when the partnership has one and no children. */
  childless?: ChildlessStatus;
  childlessReason?: string;
  /** Ended relationship: two strokes across the line. */
  ended?: boolean;
  /** A line of descent or a childless mark hangs from the middle of the line, so the break moves aside. */
  middleTaken?: boolean;
  /** Degree of relationship written above a double line, wrapped. */
  consanguinityLabel?: string[];
  /** Where the label goes when its usual place is taken by text above. */
  consanguinityLabelOffset?: ConsanguinityLabelOffset;
};

/**
 * All geometry for a sibship connection. The lines are drawn from where
 * the symbols named by leftParentId/rightParentId/childIds are, so on the
 * canvas they follow a symbol being dragged (`sibshipLineGeometry`). The
 * pre-computed coupleX/Y/sibBarY/childXs/childY values are the layout's own
 * geometry, read by `renderLint`.
 */
export type SibshipData = {
  /** Slot id ("level-slot") of the left parent. */
  leftParentId: string;
  /** Slot id of the right parent. */
  rightParentId: string;
  /** Slot ids of the children, in slot order. */
  childIds: string[];
  // Pre-computed geometry (the layout's, not the live node positions):
  /** x (canvas px) where the line of descent leaves the couple line: its midpoint, or an only child's x when that is all but under it (`descentX`). */
  coupleX: number;
  /** y (canvas px) of the parent generation centre = (level-1) * ROW_HEIGHT. */
  coupleY: number;
  /**
   * Set when the parents' couple line hops over a partner in between: the
   * line to the children hangs from the level end of that line, `dx` px from
   * the centre of the further partner (`parentId`, one of the two above).
   */
  hopDrop?: { parentId: string; dx: number };
  /** y (canvas px) of the sibship bar (`sibBarHeight`), plus `barOffset`. */
  sibBarY: number;
  /** Furthest (px) the bar hangs below the couple line before `barOffset`: half a row (`sibBarHeight`). */
  maxDrop: number;
  /** How far (px) the bar is lowered so it does not overlap another couple's bar; usually 0. */
  barOffset: number;
  /** x (canvas px) of each child's slot centre, in slot order. */
  childXs: number[];
  /** y (canvas px) of each child's centre, in slot order (differs when a child is pinned off the row). */
  childYs: number[];
  /** y (canvas px) of the highest child row; the sibship bar sits halfway up to the couple. */
  childY: number;
  /**
   * The parents are not a couple (`Partnership.donorConception`): no
   * couple line, and a line from each parent's symbol down to the bar in
   * place of the drop from the couple line. The parents' positions as laid
   * out; the canvas edge reads the live node positions.
   */
  apart?: LinePoint[];
  /**
   * An only child of a donor pair: no bar, a line from each parent
   * runs straight to the top of its symbol (see `sibshipSegments`).
   */
  converge?: boolean;
};

/**
 * A line of assisted reproduction from a woman who carried the child
 * (solid) or a parent who is not genetic (dashed). Source is that person's
 * node, target the child's. When the same person is linked the same way to
 * every child of a sibship, one line runs to the point where the sibship's
 * line of descent meets the bar instead (`bar`), so it is not repeated.
 */
export type AssistedLineData = {
  kind: AssistedLink["kind"];
  /** Individual ids of the children the line stands for. */
  children: string[];
  /** The sibship the line joins: the same ids as its SibshipData, to find the join point live. */
  bar?: { leftParentId: string; rightParentId: string; childIds: string[]; barOffset: number };
};

/** Dashed arc joining two copies of the same person. */
export type DuplicateArcData = {
  /**
   * How far (px) the arc rises above the higher of the two symbol tops
   * (less than usual when text hangs in its way); for a routed arc
   * (`legDx`), how far above the lower copy's top it runs.
   */
  bulge: number;
  /**
   * Set when the arc joins copies on different rows and its usual curve
   * would pass through someone: the arc goes down the gap this far (px,
   * signed) from the upper copy's centre instead (`duplicateArcD`).
   */
  legDx?: number;
};

export interface SceneOptions {
  /**
   * Compact mode: rows are placed at 70% of ROW_HEIGHT and slots at 85% of
   * SLOT_WIDTH so larger pedigrees fit on screen. Pinned positions (stored
   * at normal spacing) are scaled by the same factors. Default: false.
   */
  compact?: boolean;
  /** Layout improvements beyond kinship2 (#76). Default true; false gives the plain port, for comparisons. */
  improveLayout?: boolean;
}

// ── Duplicate copies ──────────────────────────────────────────────────────────

/**
 * kinship2 draws someone in more than one slot when one copy cannot sit both
 * with their parents' other children and beside every partner (cousin
 * marriages, people with partners on both sides of the tree). Every copy that
 * carries a line is drawn, as R's plot.pedigree does, and the copies are
 * joined by a dashed arc (see duplicateEdges).
 *
 * A copy with no line at all (no parents above it, no spouse marker beside
 * it) carries no information once its other copies are drawn, so it is left
 * out. kinship2 leaves these behind in the founder row when someone has
 * partners on both sides of a chain (e.g. "Quadruple half first cousins").
 */
function findLinelessCopies(result: LayoutResult): Set<string> {
  const copies = new Map<number, number>(); // nid → slot count
  for (let lev = 0; lev < result.n.length; lev++) {
    for (let sl = 0; sl < result.n[lev]; sl++) {
      const nid = result.nid[lev][sl];
      copies.set(nid, (copies.get(nid) ?? 0) + 1);
    }
  }

  // Slots a family hangs from (always a marked couple, but be safe).
  const parentSlots = new Set<string>();
  for (let lev = 1; lev < result.n.length; lev++) {
    for (let sl = 0; sl < result.n[lev]; sl++) {
      const f = result.fam[lev][sl];
      if (f > 0) { parentSlots.add(`${lev - 1}-${f - 1}`); parentSlots.add(`${lev - 1}-${f}`); }
    }
  }

  const out = new Set<string>();
  const remaining = new Map(copies);
  for (let lev = 0; lev < result.n.length; lev++) {
    const sp = result.spouse[lev] ?? [];
    for (let sl = 0; sl < result.n[lev]; sl++) {
      const nid = result.nid[lev][sl];
      if ((remaining.get(nid) ?? 1) < 2) continue; // keep the last copy standing
      const id = `${lev}-${sl}`;
      const married = (sp[sl] ?? 0) > 0 || (sl > 0 && (sp[sl - 1] ?? 0) > 0);
      if (married || result.fam[lev][sl] > 0 || parentSlots.has(id)) continue;
      out.add(id);
      remaining.set(nid, remaining.get(nid)! - 1);
    }
  }
  return out;
}

// ── Pedigree numbers ────────────────────────────────────────────────────────

const numbersCache = new WeakMap<Pedigree, Map<string, string>>();

/**
 * Pedigree numbers ("II-3") of everyone drawn, from the same layout the
 * canvas and the SVG export draw, so the numbers read left to right in each
 * row. Hidden people and empty pedigrees get none. Cached per pedigree
 * object. See `numbering.ts`.
 */
export function pedigreeNumbers(full: Pedigree): Map<string, string> {
  const pedigree = drawnPedigree(full);
  const cached = numbersCache.get(pedigree);
  if (cached) return cached;
  let numbers = new Map<string, string>();
  if (pedigree.individuals.length > 0) {
    const result = cachedLayout(pedigree, { improve: true });
    numbers = numberFromLayout(pedigree, result, findLinelessCopies(result));
  }
  numbersCache.set(pedigree, numbers);
  return numbers;
}

/** The numbers to draw under the symbols, or undefined when the pedigree does not show them. */
export function labelNumbers(pedigree: Pedigree): Map<string, string> | undefined {
  return showsNumbers(pedigree) ? pedigreeNumbers(pedigree) : undefined;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function buildScene(full: Pedigree, options: SceneOptions = {}): Scene {
  // Hidden descendants are not laid out or drawn.
  const pedigree = drawnPedigree(full);
  if (pedigree.individuals.length === 0) {
    return {
      people: [], couples: [], sibships: [], duplicates: [], assisted: [],
      labelMax: labelMaxWidth(layoutSpacing(options.compact).slotWidth), aboveTop: Infinity, bounds: null,
    };
  }
  const result: LayoutResult = cachedLayout(pedigree, { improve: options.improveLayout ?? true });
  const spacing = layoutSpacing(options.compact);

  const hidden = findLinelessCopies(result);
  const nodes = buildNodes(pedigree, result, hidden, spacing);

  // Map from slot id ("level-slot") → final pixel position (reflects pin overrides).
  const slotPos = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    slotPos.set(node.id, node.position);
  }

  // With snap on, every node is drawn on the grid (see snap.ts).
  const grid = activeSnapGrid(pedigree);
  if (grid > 0) {
    const pinned = new Set(nodes.filter(n => n.isPinned).map(n => n.id));
    const snapped = snapSlotPositions(slotPos, pinned, grid);
    for (const node of nodes) node.position = snapped.get(node.id) ?? node.position;
    for (const [id, p] of snapped) slotPos.set(id, p);
  }

  const partners = buildPartnerSetFromPedigree(pedigree);
  const sibshipEdges = buildSibshipEdges(pedigree, result, partners, slotPos, spacing.rowHeight);
  clearLabelsOfBars(nodes, sibshipEdges);

  const assistedEdges = buildAssistedEdges(pedigree, nodes, sibshipEdges);
  for (const id of labelsOverLines(nodes, sibshipEdges, assistedEdges)) {
    const n = nodes.find(x => x.id === id);
    if (n) n.glyph.labelsBacked = true;
  }

  const text = textBlocks(nodes), bars = sibshipBlocks(sibshipEdges, nodes);
  let coupleEdges = buildCoupleEdges(pedigree, result, partners, slotPos, spacing.rowHeight, [...text, ...bars]);
  // The arcs keep off the couple lines, and the couple labels off the arcs.
  const duplicateEdges = buildDuplicateEdges(nodes, spacing, sibshipEdges, coupleEdges);
  if (duplicateEdges.length) {
    coupleEdges = buildCoupleEdges(pedigree, result, partners, slotPos, spacing.rowHeight, [...text, ...duplicateArcBlocks(duplicateEdges, slotPos), ...bars]);
  }
  const aboveTop = highestAboveSymbols({ people: nodes, couples: coupleEdges, duplicates: duplicateEdges });
  return {
    people: nodes,
    couples: coupleEdges,
    sibships: sibshipEdges,
    duplicates: duplicateEdges,
    assisted: assistedEdges,
    labelMax: labelMaxWidth(spacing.slotWidth),
    aboveTop,
    bounds: sceneBounds(nodes, aboveTop),
  };
}

/**
 * The box of everything drawn: the symbols, the proband's arrow on the left
 * and below, room under the lowest row for the most lines of text anyone
 * has, and whatever is drawn above the top row. The export's size and the
 * canvas's fit to view are both worked out from it.
 */
function sceneBounds(people: ScenePerson[], aboveTop: number): SceneBounds {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { position: { x, y } } of people) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const glyphs = people.map(p => p.glyph);
  const proband = glyphs.some(g => g.arrow) ? ARROW_TAIL + PROBAND_LETTER_SIZE + 4 : 0;
  // Names wrap to the slot width, the age or DOB takes a line, so does each
  // age of onset and the pedigree number: allow for the most lines anyone takes.
  const textLines = Math.max(1, ...glyphs.map(g => g.figureNameLines.length + g.detailLines.length));
  const labelHeight = TEXT_OFFSET_Y + textLines * LABEL_LINE_HEIGHT
    + (glyphs.some(g => g.annotations.length > 0) ? ANNOTATION_SHIFT : 0) + (glyphs.some(g => g.caption) ? CAPTION_SHIFT : 0);
  const above = Math.max(0, Math.ceil(minY - NODE_SIZE / 2 - aboveTop));
  return {
    left: minX - NODE_SIZE / 2 - proband,
    top: minY - NODE_SIZE / 2 - above,
    width: maxX - minX + NODE_SIZE + proband,
    height: maxY - minY + NODE_SIZE + labelHeight + proband + above,
  };
}

/**
 * A bar never runs through the text under someone above it: it is lowered
 * to pass under the text, or, where it cannot be, the text gets a white
 * backing (`barsUnderLabels`). Changes the edges and nodes in place.
 */
function clearLabelsOfBars(nodes: ScenePerson[], sibshipEdges: SceneLine<SibshipData>[]): void {
  const labelled = nodes.flatMap(node => {
    const box = textBlockUnder(node.glyph, node.position.x, node.position.y);
    return box ? [{ node, box }] : [];
  });
  const drawn = sibshipEdges.filter(e => e.data && e.data.childXs.length > 0 && !e.data.converge);
  const { lower, through } = barsUnderLabels(
    drawn.map(e => {
      const d = e.data, xs = [d.coupleX, ...d.childXs];
      return { x1: Math.min(...xs), x2: Math.max(...xs), y: d.sibBarY, childY: d.childY };
    }),
    labelled.map(l => l.box),
  );
  drawn.forEach((e, i) => {
    e.data.barOffset += lower[i]!;
    e.data.sibBarY += lower[i]!;
  });
  for (const k of through) {
    const { node } = labelled[k]!;
    node.glyph.labelsBacked = true;
  }
}

/**
 * Nodes with a line running straight down from the bottom of the symbol,
 * through the labels under it: a parent of a donor pair's only child
 * drawn below them (`converge`), or the source of a line of assisted
 * reproduction that leaves the symbol at the bottom middle.
 */
export function labelsOverLines(
  nodes: ScenePerson[],
  sibshipEdges: SceneLine<SibshipData>[],
  assistedEdges: SceneLine<AssistedLineData>[],
): Set<string> {
  const out = new Set<string>();
  if (assistedEdges.length === 0 && !sibshipEdges.some(e => e.data.converge)) return out;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const below = (from: string, x: number, y: number) => {
    const n = byId.get(from);
    if (n && Math.abs(n.position.x - x) < NODE_SIZE / 2 && y > n.position.y + NODE_SIZE) out.add(from);
  };
  for (const e of sibshipEdges) {
    const d = e.data;
    if (!d?.converge) continue;
    below(d.leftParentId, d.childXs[0]!, d.childYs[0]!);
    below(d.rightParentId, d.childXs[0]!, d.childYs[0]!);
  }
  for (const e of assistedEdges) {
    const seg = assistedEdgeSegment(e, id => byId.get(id) && { position: byId.get(id)!.position, glyph: byId.get(id)!.glyph });
    if (seg) below(e.source, seg[2], seg[3]);
  }
  return out;
}

// ── Assisted reproduction lines ─────────────────────────────────────────────

/**
 * One edge per carrier or social parent and child, or per sibship when they
 * are linked to all of it (see AssistedLineData). Someone drawn twice is
 * joined from the copy nearest the child; the child end is the copy that
 * hangs from its parents.
 */
function buildAssistedEdges(
  pedigree: Pedigree,
  nodes: ScenePerson[],
  sibshipEdges: SceneLine<SibshipData>[],
): SceneLine<AssistedLineData>[] {
  const links = assistedLinks(pedigree);
  if (links.length === 0) return [];
  const copies = new Map<string, ScenePerson[]>();
  for (const n of nodes) {
    const id = n.individual.id;
    if (!copies.has(id)) copies.set(id, []);
    copies.get(id)!.push(n);
  }
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const indOf = (nodeId: string) => nodeById.get(nodeId)?.individual.id;
  // The sibship edge each child hangs from.
  const sibshipOf = new Map<string, SceneLine<SibshipData>>();
  for (const e of sibshipEdges) for (const c of e.data.childIds) { const id = indOf(c); if (id) sibshipOf.set(id, e); }
  const nearest = (froms: ScenePerson[], to: { x: number; y: number }) => {
    const d = (n: ScenePerson) => (n.position.x - to.x) ** 2 + (n.position.y - to.y) ** 2;
    return froms.reduce((a, b) => (d(b) < d(a) ? b : a));
  };

  const edges: SceneLine<AssistedLineData>[] = [];
  const done = new Set<string>();
  for (const link of links) {
    const key = `${link.kind}|${link.from}|${link.child}`;
    if (done.has(key)) continue;
    const kids = copies.get(link.child), froms = copies.get(link.from);
    if (!kids?.length || !froms?.length) continue;
    const sib = sibshipOf.get(link.child);
    const sibKids = sib ? sib.data.childIds.map(indOf).filter((x): x is string => !!x) : [];
    const whole = sibKids.length > 1 && sibKids.every(k => links.some(l => l.kind === link.kind && l.from === link.from && l.child === k));
    if (whole) {
      for (const k of sibKids) done.add(`${link.kind}|${link.from}|${k}`);
      const d = sib!.data;
      edges.push({
        id:     `assisted-${link.kind}-${link.from}-${sib!.id}`,
        source: nearest(froms, { x: d.coupleX, y: d.sibBarY }).id,
        target: d.childIds[0]!,
        data:   {
          kind: link.kind,
          children: sibKids,
          bar: { leftParentId: d.leftParentId, rightParentId: d.rightParentId, childIds: d.childIds, barOffset: d.barOffset },
        },
      });
      continue;
    }
    done.add(key);
    const child = kids.find(k => sib?.data.childIds.includes(k.id)) ?? kids[0]!;
    edges.push({
      id:     `assisted-${link.kind}-${link.from}-${link.child}`,
      source: nearest(froms, child.position).id,
      target: child.id,
      data:   { kind: link.kind, children: [link.child] },
    });
  }
  return edges;
}

/**
 * Rise of the couple line for the spouse marker at (level, slot): none when
 * the adjacent slots are partners, otherwise enough to clear the slots
 * between the real partners.
 */
function hopAt(result: LayoutResult, partners: PartnerSet, level: number, slot: number) {
  const rc = resolveCouple(result, partners, level, slot);
  return hopGeometry(rc.hop ? rc.rightSlot - rc.leftSlot : 1);
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

function buildNodes(
  pedigree: Pedigree,
  result: LayoutResult,
  hidden: Set<string>,
  spacing: LayoutSpacing,
): ScenePerson[] {
  const { slotWidth, rowHeight } = spacing;

  // Drawn slots per individual, in reading order.
  const slotsOf = new Map<number, string[]>();
  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const id = `${level}-${slot}`;
      if (hidden.has(id)) continue;
      const nid = result.nid[level][slot];
      if (!slotsOf.has(nid)) slotsOf.set(nid, []);
      slotsOf.get(nid)!.push(id);
    }
  }

  const autoPos = (level: number, slot: number) => ({
    x: result.pos[level][slot] * slotWidth,
    y: level * rowHeight,
  });

  // A pin is stored per individual. When someone is drawn more than once it
  // moves only the copy laid out nearest to it (normally the one that was
  // dragged); the other copies keep their automatic places instead of all
  // landing on the same spot.
  const pinnedSlot = new Map<number, string>();
  for (const [nid, ids] of slotsOf) {
    const pin = pedigree.pinnedPositions?.[pedigree.individuals[nid - 1]!.id];
    if (!pin) continue;
    const p = scalePinnedPosition(pin, spacing);
    let best = ids[0]!, bestD = Infinity;
    for (const id of ids) {
      const [lv, sl] = id.split("-").map(Number) as [number, number];
      const a = autoPos(lv, sl);
      const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
      if (d < bestD) { bestD = d; best = id; }
    }
    pinnedSlot.set(nid, best);
  }

  // Determine which individuals are draggable.
  const nodesMoveable = pedigree.canvasSettings?.nodesMoveable ?? false;
  const unlockedSet = new Set(pedigree.unlockedIndividuals ?? []);
  const twins = twinMembership(pedigree);
  const labelLines = canvasLabelLines(nameLabelMode(pedigree));
  const numbers = showsNumbers(pedigree) ? numberFromLayout(pedigree, result, hidden) : undefined;

  const nodes: ScenePerson[] = [];
  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const id = `${level}-${slot}`;
      if (hidden.has(id)) continue;

      const nid = result.nid[level][slot];
      const individual = pedigree.individuals[nid - 1]; // 1-based → 0-based
      const copies = slotsOf.get(nid)!;
      const isDuplicate = copies.length > 1;
      const isPinned = pinnedSlot.get(nid) === id;
      const pinnedPos = pedigree.pinnedPositions?.[individual.id];
      const branch = branchOf(pedigree, individual.id);
      const glyph = personGlyph(individual, pedigree, {
        labelMax: labelMaxWidth(slotWidth), numbers, nameLineLimit: labelLines,
        hasParents: hasParents(pedigree, individual.id), copy: isDuplicate ? copies.indexOf(id) + 1 : undefined,
      });

      nodes.push({
        id,
        position: isPinned && pinnedPos ? scalePinnedPosition(pinnedPos, spacing) : autoPos(level, slot),
        individual,
        glyph,
        isPinned,
        draggable: !branch && (nodesMoveable || unlockedSet.has(individual.id)),
        ...(twins.get(individual.id) ?? {}),
        ...(branch ? { branch } : {}),
      });
    }
  }

  return nodes;
}

// ── Duplicate connectors ──────────────────────────────────────────────────────

/**
 * Joins consecutive drawn copies of one person, left to right (R:
 * arcconnect). An arc between rows whose curve would pass through someone is
 * routed round them (`chooseArcRoute`); routed arcs that end on one row each
 * run at their own height.
 */
function buildDuplicateEdges(
  nodes: ScenePerson[], spacing: LayoutSpacing,
  sibshipEdges: SceneLine<SibshipData>[], coupleEdges: SceneCoupleLine[],
): SceneLine<DuplicateArcData>[] {
  const byPerson = new Map<string, ScenePerson[]>();
  for (const n of nodes) {
    if (n.glyph.copy === undefined) continue;
    const pid = n.individual.id;
    if (!byPerson.has(pid)) byPerson.set(pid, []);
    byPerson.get(pid)!.push(n);
  }
  if (byPerson.size === 0) return [];

  const half = NODE_SIZE / 2;
  const bulge = DUPLICATE_ARC_BULGE * (spacing.rowHeight / 2 - half);
  const obstacles: ArcObstacle[] = nodes.map(n => ({
    id: n.individual.id, x: n.position.x, y: n.position.y,
    text: textBlockUnder(n.glyph, n.position.x, n.position.y),
  }));
  const at = new Map(nodes.map(n => [n.id, n.position]));
  const lines: ArcLine[] = [
    ...coupleEdges.flatMap((e): ArcLine[] => {
      const s = at.get(e.source), t = at.get(e.target);
      if (!s || !t) return [];
      const hop = e.data.hopHeight;
      if (hop <= 0) return [[s.x, s.y, t.x, t.y]];
      const top = Math.min(s.y, t.y) - hop;
      return [[s.x, top, t.x, top]];
    }),
    ...sibshipEdges.flatMap((e): ArcLine[] => {
      const d = e.data;
      if (!d || d.childXs.length === 0) return [];
      const xs = [d.coupleX, ...d.childXs];
      return [
        [d.coupleX, d.coupleY, d.coupleX, d.sibBarY],
        [Math.min(...xs), d.sibBarY, Math.max(...xs), d.sibBarY],
        ...d.childXs.map((x, i): ArcLine => [x, d.sibBarY, x, (d.childYs[i] ?? d.childY) - half]),
      ];
    }),
  ];

  const edges: SceneLine<DuplicateArcData>[] = [];
  const routedOnRow = new Map<number, number[]>();
  for (const [pid, copies] of byPerson) {
    const sorted = [...copies].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
    const others = obstacles.filter(o => o.id !== pid);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]!, b = sorted[i + 1]!;
      const row = Math.round(Math.max(a.position.y, b.position.y));
      const route = chooseArcRoute({ a: a.position, b: b.position, bulge, half }, { slotWidth: spacing.slotWidth, others, lines, taken: routedOnRow.get(row) });
      if (route?.legDx !== undefined) routedOnRow.set(row, [...(routedOnRow.get(row) ?? []), route.bulge]);
      const data: DuplicateArcData = { bulge, ...route };
      edges.push({ id: `duplicate-${pid}-${i}`, source: a.id, target: b.id, data });
    }
  }
  return edges;
}

/**
 * The text under every drawn symbol, as the export writes it, and the copy
 * number beside the top of a symbol drawn twice, for placing couple labels.
 */
function textBlocks(nodes: ScenePerson[]): TextBlock[] {
  return nodes.flatMap(n => [
    ...[textBlockUnder(n.glyph, n.position.x, n.position.y) ?? []].flat(),
    ...(n.glyph.copy !== undefined ? [copyNumberBlock(n.position.x, n.position.y, n.glyph.copy)] : []),
  ]);
}

/** The dashed arcs between copies of someone, as a thin box per stretch, for placing couple labels. */
function duplicateArcBlocks(edges: SceneLine<DuplicateArcData>[], slotPos: Map<string, { x: number; y: number }>): TextBlock[] {
  return edges.flatMap(e => {
    const a = slotPos.get(e.source), b = slotPos.get(e.target);
    if (!a || !b) return [];
    const pts = duplicateArcPoints({ a, b, half: NODE_SIZE / 2, ...e.data });
    return pts.slice(1).map(([x, y], i) => {
      const [px, py] = pts[i]!;
      return { x: (x + px) / 2, halfWidth: Math.abs(x - px) / 2 + 1, top: Math.min(y, py) - 2, bottom: Math.max(y, py) + 2, arc: true };
    });
  });
}

/**
 * Sibship bars and the drops from them, as thin boxes, so a raised couple
 * label stays under them. A twin's drop runs slantwise from the set's fork
 * on the bar, over the gap between twins who are partners, so it is a run of
 * short boxes along the slant.
 */
function sibshipBlocks(edges: SceneLine<SibshipData>[], nodes: ScenePerson[]): TextBlock[] {
  const twinSetOf = new Map(nodes.map(n => [n.id, n.twinSet]));
  return edges.flatMap(e => {
    const d = e.data;
    const xs = [d.coupleX, ...d.childXs];
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const forkX = new Map<string, number[]>();
    d.childIds.forEach((id, i) => {
      const set = twinSetOf.get(id);
      if (set !== undefined) forkX.set(set, [...(forkX.get(set) ?? []), d.childXs[i]!]);
    });
    return [
      { x: (lo + hi) / 2, halfWidth: (hi - lo) / 2 + 1, top: d.sibBarY - 2, bottom: d.sibBarY + 2 },
      ...d.childXs.flatMap((x, i) => {
        const bottom = (d.childYs[i] ?? d.childY) - NODE_SIZE / 2;
        const members = forkX.get(twinSetOf.get(d.childIds[i]!) ?? "");
        if (!members || members.length < 2) return [{ x, halfWidth: 1, top: d.sibBarY, bottom }];
        const from = members.reduce((a, b) => a + b, 0) / members.length;
        const steps = 8;
        return Array.from({ length: steps }, (_, k) => {
          const x0 = from + (x - from) * k / steps, x1 = from + (x - from) * (k + 1) / steps;
          const y0 = d.sibBarY + (bottom - d.sibBarY) * k / steps, y1 = d.sibBarY + (bottom - d.sibBarY) * (k + 1) / steps;
          return { x: (x0 + x1) / 2, halfWidth: Math.abs(x1 - x0) / 2 + 1, top: y0, bottom: y1 };
        });
      }),
    ];
  });
}

// ── Couple edges ──────────────────────────────────────────────────────────────

function buildCoupleEdges(
  pedigree: Pedigree,
  result: LayoutResult,
  partners: PartnerSet,
  slotPos: Map<string, { x: number; y: number }>,
  rowHeight: number,
  blocks: TextBlock[],
): SceneCoupleLine[] {
  const edges: SceneCoupleLine[] = [];
  const related = consanguinityTest(pedigree);
  const idAt = (level: number, slot: number) => pedigree.individuals[result.nid[level][slot] - 1]!.id;
  const partnershipOf = new Map(pedigree.partnerships.map(p => [pairKey(p.individual1, p.individual2), p]));
  // Partners with no parents drawn have nothing landing on their symbol tops.
  const shapeAt = (level: number, slot: number) => symbolSex(pedigree.individuals[result.nid[level][slot] - 1]!, pedigree);
  /** Slots from one partner to the other, for each edge: 1 when they are side by side. */
  const spans: number[] = [];

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level] - 1; slot++) {
      const sp = result.spouse[level][slot];
      if (sp === 0) continue;

      // A marker between two people who are not partners is a marriage line
      // passing through to a further partner: connect the real partners and
      // hop over whatever sits between them.
      const rc = resolveCouple(result, partners, level, slot);
      const left = idAt(level, rc.leftSlot), right = idAt(level, rc.rightSlot);
      const partnership = partnershipOf.get(pairKey(left, right));
      // Gamete donation: the genetic parents are not a couple, so no line.
      if (partnership?.donorConception) continue;
      const double = related(left, right);
      const source = `${level}-${rc.leftSlot}`, target = `${level}-${rc.rightSlot}`;
      const hop = hopAt(result, partners, level, slot);

      edges.push({
        id:           `couple-${level}-${slot}`,
        source,
        target,
        // Line style from the real partners, not the slots the marker sits
        // between (see consanguinityTest).
        double,
        data:         {
          ...hop,
          ...(rc.hop ? { hopEnds: hopEndsAt(level, slot, rc) } : {}),
          partnershipId: partnership?.id,
          ...(partnership ? childlessData(partnership) : {}),
          ...(partnership ? endedData(partnership) : {}),
          ...(double && partnership ? labelData(partnership, left, right, source, target, hop.hopHeight) : {}),
        },
      });
      spans.push(rc.rightSlot - rc.leftSlot);
    }
  }

  // The lines on one side of a symbol each leave it at their own height,
  // nearest partner lowest, so a hop is never drawn over the line beside it.
  for (const end of ["source", "target"] as const) {
    const sides = new Map<string, number[]>();
    edges.forEach((e, i) => sides.set(e[end], [...(sides.get(e[end]) ?? []), i]));
    for (const side of sides.values()) {
      side.sort((a, b) => spans[a]! - spans[b]!);
      const heights = couplePortHeights(side.length, side.some(i => edges[i]!.double));
      side.forEach((i, n) => {
        const hopEnds = edges[i]!.data.hopEnds;
        if (hopEnds) hopEnds[end].port = heights[n]!;
      });
    }
  }

  return edges;

  /**
   * The ends of the hopping line for the marker at `slot`. Each turns clear
   * of the person next to it, the first or last the line passes over. The
   * further partner is the one beside the marker: there the line runs level
   * after coming down, and a childless mark hangs from that stretch.
   */
  function hopEndsAt(level: number, slot: number, rc: { leftSlot: number; rightSlot: number }): { source: HopEnd; target: HopEnd } {
    const span = rc.rightSlot - rc.leftSlot;
    const farIsRight = rc.rightSlot === slot + 1;
    const end = (at: number, beside: number, far: boolean): HopEnd => {
      const a = slotPos.get(`${level}-${at}`), b = slotPos.get(`${level}-${beside}`);
      const { turn, drop } = a && b ? hopTurn(Math.abs(a.x - b.x), far ? 2 : span) : { turn: undefined, drop: undefined };
      return { shape: shapeAt(level, at), port: 0, turn, ...(far ? { drop } : {}) };
    };
    return {
      source: end(rc.leftSlot, rc.leftSlot + 1, !farIsRight),
      target: end(rc.rightSlot, rc.rightSlot - 1, farIsRight),
    };
  }

  function childlessData(partnership: Partnership): Pick<CoupleLineData, "childless" | "childlessReason"> {
    const childless = activeChildless(partnership, pedigree);
    if (!childless) return {};
    return { childless, childlessReason: partnership.childlessReason || undefined };
  }

  /** The label over a double line: `a` and `b` are the partners drawn at slots `left` and `right`. */
  function labelData(partnership: Partnership, a: string, b: string, left: string, right: string, hop: number): Pick<CoupleLineData, "consanguinityLabel" | "consanguinityLabelOffset"> {
    const text = consanguinityLabelText(pedigree, partnership);
    const l = slotPos.get(left), r = slotPos.get(right);
    if (!text || !l || !r) return {};
    const top = (id: string) => ({
      hasParents: hasParents(pedigree, id),
      familyHistoryUnknown: !!pedigree.individuals.find(i => i.id === id)?.familyHistoryUnknown,
    });
    const [lx, rx] = l.x <= r.x ? [l.x, r.x] : [r.x, l.x];
    const [lt, rt] = l.x <= r.x ? [top(a), top(b)] : [top(b), top(a)];
    const lines = wrapConsanguinityLabel(text, consanguinityLabelRoom(lx, rx, lt, rt), rowHeight);
    // Out of the way of the text under the people above; not drawn
    // when there is no room for it anywhere near the line.
    const offset = placeConsanguinityLabel({
      lx, rx, cy: (l.y + r.y) / 2, hop, lines, blocks,
      limits: consanguinityLabelLimits(lx, rx, lt, rt), ended: !!partnership.ended,
    });
    if (!offset) return {};
    return { consanguinityLabel: lines, ...(offset.dx || offset.dy || offset.backed ? { consanguinityLabelOffset: offset } : {}) };
  }

  function endedData(partnership: Partnership): Pick<CoupleLineData, "ended" | "middleTaken"> {
    if (!partnership.ended) return {};
    return { ended: true, middleTaken: middleTaken(partnership, pedigree) };
  }
}

// ── Sibship edges ─────────────────────────────────────────────────────────────

/** Partner pairs who are genetic parents through gamete donation, not a couple. */
function donorPairs(pedigree: Pedigree): Set<string> {
  return new Set(pedigree.partnerships.filter(p => p.donorConception).map(p => pairKey(p.individual1, p.individual2)));
}

function buildSibshipEdges(
  pedigree: Pedigree,
  result: LayoutResult,
  partners: PartnerSet,
  slotPos: Map<string, { x: number; y: number }>,
  rowHeight: number,
): SceneLine<SibshipData>[] {
  const edges: SceneLine<SibshipData>[] = [];
  const maxDrop = rowHeight / 2;
  const apart = donorPairs(pedigree);
  const idAt = (level: number, slot: number) => pedigree.individuals[result.nid[level][slot] - 1]?.id ?? "";
  const shapeAt = (level: number, slot: number) => {
    const ind = pedigree.individuals[result.nid[level][slot] - 1];
    return ind ? symbolSex(ind, pedigree) : undefined;
  };

  for (let level = 1; level < result.n.length; level++) {
    // Group slots at this level by their fam value.
    const groups = new Map<number, number[]>(); // fam (1-based) → [slot, ...]
    for (let slot = 0; slot < result.n[level]; slot++) {
      const f = result.fam[level][slot];
      if (f === 0) continue;
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f)!.push(slot);
    }

    for (const [f, slots] of groups) {
      const leftParentSlot  = f - 1;  // 0-based
      const rightParentSlot = f;       // 0-based

      const resolvedChildIds = slots.map(s => `${level}-${s}`);

      const leftPos  = slotPos.get(`${level - 1}-${leftParentSlot}`)!;
      const rightPos = slotPos.get(`${level - 1}-${rightParentSlot}`)!;
      if (!leftPos || !rightPos) continue; // parent node was suppressed (shouldn't happen)

      const middleX  = (leftPos.x + rightPos.x) / 2;
      const coupleY  = (leftPos.y + rightPos.y) / 2;

      const firstChildPos = slotPos.get(resolvedChildIds[0]!);
      if (!firstChildPos) continue;
      const childXs  = resolvedChildIds.map(id => slotPos.get(id)?.x ?? 0);
      const childYs  = resolvedChildIds.map(id => slotPos.get(id)?.y ?? firstChildPos.y);
      const childY   = Math.min(...childYs);
      const sibBarY  = sibBarHeight(coupleY, childY, 0, maxDrop);
      const rc = resolveCouple(result, partners, level - 1, leftParentSlot);
      // The real parents are not side by side: the further one is the one
      // beside the marker, and the drop hangs from the level end of their line.
      const [farPos, farSlot, besidePos] = rc.rightSlot === rightParentSlot ? [rightPos, rightParentSlot, leftPos] : [leftPos, leftParentSlot, rightPos];
      const hopDrop = rc.hop
        ? { parentId: `${level - 1}-${farSlot}`, dx: Math.sign(besidePos.x - farPos.x) * hopTurn(Math.abs(besidePos.x - farPos.x)).drop }
        : undefined;
      const isApart = apart.has(pairKey(idAt(level - 1, rc.leftSlot), idAt(level - 1, rc.rightSlot)));
      const converge = slots.length === 1 && isApart;
      // Straight down to an only child who is all but under the middle.
      const coupleX = hopDrop || isApart ? middleX : descentX(middleX, childXs, NODE_SIZE);

      // Source = left parent node; target = leftmost resolved child node.
      edges.push({
        id:           `sibship-${level}-${f}`,
        source:       `${level - 1}-${leftParentSlot}`,
        target:       resolvedChildIds[0]!,
        data:         {
          leftParentId:  `${level - 1}-${leftParentSlot}`,
          rightParentId: `${level - 1}-${rightParentSlot}`,
          childIds:      resolvedChildIds,
          coupleX, coupleY, sibBarY, maxDrop, barOffset: 0, childXs, childYs, childY,
          ...(hopDrop ? { hopDrop } : {}),
          ...(isApart ? { apart: [
            { ...leftPos, sex: shapeAt(level - 1, leftParentSlot) },
            { ...rightPos, sex: shapeAt(level - 1, rightParentSlot) },
          ] } : {}),
          ...(converge ? { converge: true } : {}),
        },
      });
    }
  }

  // Bars that would run along the same line get a height each.
  const offsets = sibshipBarOffsets(edges.map(e => e.data));
  edges.forEach((e, i) => {
    e.data.barOffset = offsets[i]!;
    e.data.sibBarY += offsets[i]!;
  });

  return edges;
}
