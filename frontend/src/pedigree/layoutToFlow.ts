import type { Node, Edge } from "@xyflow/react";
import { alignPedigreeByFamily, buildPartnerSetFromPedigree, resolveCouple } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult, Individual, PartnerSet, ChildlessStatus, Zygosity, Sex } from "@pedigree-editor/layout-engine";
import { NODE_SIZE, DUPLICATE_ARC_BULGE } from "./constants";
import { duplicateArcPoints, hopGeometry } from "./couplePath";
import { layoutSpacing, scalePinnedPosition } from "./spacing";
import { consanguinityTest } from "./consanguinity";
import type { LayoutSpacing } from "./spacing";
import { activeSnapGrid, snapSlotPositions } from "./snap";
import { activeChildless } from "./childless";
import { middleTaken } from "./ended";
import { consanguinityLabelLimits, consanguinityLabelRoom, consanguinityLabelText, placeConsanguinityLabel, wrapConsanguinityLabel } from "./consanguinityLabel";
import type { ConsanguinityLabelOffset, TextBlock } from "./consanguinityLabel";
import { copyNumberBlock, textBlockUnder } from "./labelBlock";
import { drawnPedigree, branchOf } from "./collapse";
import type { CollapsedBranch } from "./collapse";
import { twinMembership } from "./twins";
import { sibshipBarOffsets } from "./sibshipPath";
import { wrapLabel, labelMaxWidth, nameLabelMode, canvasLabelLines, detailLines, detailsBacked, nameLabelText } from "./labels";
import { numberFromLayout, showsNumbers } from "./numbering";
import { symbolSex } from "./gender";
import { assistedLinks, assistedEdgeSegment, type AssistedLink, type LinePoint } from "./assisted";

// ── Output types ──────────────────────────────────────────────────────────────

export interface RFNodeData extends Record<string, unknown> {
  individual: Individual;
  /**
   * True when the same individual is drawn in more than one slot (kinship2
   * could not place them both with their siblings and beside every partner).
   * Every copy renders with a superscript, joined by a dashed duplicateEdge.
   */
  isDuplicate: boolean;
  /**
   * 1 = first drawn copy of a duplicate, 2 = second, and so on, in reading
   * order. Shown as a superscript. Undefined when isDuplicate = false.
   */
  duplicateIndex?: number;
  /** True if individual has a parent partnership in the pedigree. */
  hasParents: boolean;
  /**
   * The symbol shape drawn (#26): the gender identity's when shown, else the
   * sex (`symbolSex` in gender.ts). Never use it for genetics.
   */
  shape?: Sex;
  /**
   * True if this node sits at the individual's pinned (dragged) position. For
   * someone drawn more than once only the copy nearest the pin is moved.
   */
  isPinned: boolean;
  /** Twin set key ("partnershipId:index") and zygosity when the individual is a twin (#11). */
  twinSet?: string;
  zygosity?: Zygosity;
  /**
   * The name fitted to the slot width and cut with an ellipsis (#68): at most
   * two lines, or one when canvasSettings.nameLabels is "truncate". Empty when unnamed.
   */
  nameLines: string[];
  /**
   * The lines under the name, in NSGC order (`detailSections` in labels.ts):
   * age or year of birth, ages of onset, then the pedigree number (#8) when shown.
   */
  detailLines: string[];
  /** The detail block runs past the age line, so it gets a white backing (`detailsBacked`). */
  detailsBacked?: boolean;
  /**
   * A line of descent leaves the bottom of this symbol straight down through
   * its labels (#45: the woman carrying a pregnancy by assisted reproduction
   * has it below her, NSGC 2008 Fig. 3), so the labels get a white backing
   * and the line passes behind them (`labelsOverLines`).
   */
  labelsBacked?: boolean;
  /**
   * Set on the diamond standing for a collapsed branch (#1), whose
   * `individual` is a stand-in that is not in the stored pedigree. Such a
   * node has type "collapsedBranch" and can be neither selected nor dragged.
   */
  branch?: CollapsedBranch;
}

/**
 * Geometry is derived from the source/target node positions. hopHeight is 0
 * for an ordinary line; otherwise the partners are not adjacent (someone with
 * three or more partners) and the line rises by that many px to pass over the
 * slot(s) between them.
 */
export interface CoupleEdgeData extends Record<string, unknown> {
  hopHeight: number;
  /** Distance (px) from each symbol edge at which a hopping line turns up. */
  hopInset: number;
  /** The partnership the line draws, for the couple line's right-click menu (#95). */
  partnershipId?: string;
  /** Childless couple mark under the line (#15), when the partnership has one and no children. */
  childless?: ChildlessStatus;
  childlessReason?: string;
  /** Ended relationship (#98): two strokes across the line. */
  ended?: boolean;
  /** A line of descent or a childless mark hangs from the middle of the line, so the break moves aside. */
  middleTaken?: boolean;
  /** Degree of relationship written above a double line (#97), wrapped. */
  consanguinityLabel?: string[];
  /** Where the label goes when its usual place is taken by text above (#109). */
  consanguinityLabelOffset?: ConsanguinityLabelOffset;
}

/**
 * All geometry for a sibship connection. The SibshipEdge renderer uses
 * leftParentId/rightParentId/childIds to look up current node positions
 * dynamically (via useNodes), so edges stay correct as nodes are dragged.
 * The pre-computed coupleX/Y/sibBarY/childXs/childY values are kept for
 * the minimap renderer which doesn't need real-time updates.
 */
export interface SibshipEdgeData extends Record<string, unknown> {
  /** React Flow node ID of the left parent. */
  leftParentId: string;
  /** React Flow node ID of the right parent. */
  rightParentId: string;
  /** React Flow node IDs of the children, in slot order. */
  childIds: string[];
  // Pre-computed geometry used by the minimap:
  /** x (canvas px) of the midpoint of the couple line above this family. */
  coupleX: number;
  /** y (canvas px) of the parent generation centre = (level-1) * ROW_HEIGHT. */
  coupleY: number;
  /** Rise (px) of the parents' couple line when it hops over an intermediate partner; 0 otherwise. */
  hopHeight: number;
  /** y (canvas px) of the sibship bar: halfway between the couple and the highest child, plus `barOffset`. */
  sibBarY: number;
  /** How far (px) the bar is lowered so it does not overlap another couple's bar (#80); usually 0. */
  barOffset: number;
  /** x (canvas px) of each child's slot centre, in slot order. */
  childXs: number[];
  /** y (canvas px) of each child's centre, in slot order (differs when a child is pinned off the row). */
  childYs: number[];
  /** y (canvas px) of the highest child row; the sibship bar sits halfway up to the couple. */
  childY: number;
  /**
   * The parents are not a couple (`Partnership.donorConception`, #45): no
   * couple line, and a line from each parent's symbol down to the bar in
   * place of the drop from the couple line. The parents' positions, for the
   * minimap; the canvas edge reads the live node positions.
   */
  apart?: LinePoint[];
  /**
   * An only child of a donor pair (#45): no bar, a line from each parent
   * runs straight to the top of its symbol (see `sibshipSegments`).
   */
  converge?: boolean;
}

/**
 * A line of assisted reproduction (#45) from a woman who carried the child
 * (solid) or a parent who is not genetic (dashed). Source is that person's
 * node, target the child's. When the same person is linked the same way to
 * every child of a sibship, one line runs to the point where the sibship's
 * line of descent meets the bar instead (`bar`), so it is not repeated.
 */
export interface AssistedEdgeData extends Record<string, unknown> {
  kind: AssistedLink["kind"];
  /** Individual ids of the children the line stands for. */
  children: string[];
  /** The sibship the line joins: the same ids as its SibshipEdgeData, to find the join point live. */
  bar?: { leftParentId: string; rightParentId: string; childIds: string[]; barOffset: number };
}

/** Dashed arc joining two copies of the same person. */
export interface DuplicateEdgeData extends Record<string, unknown> {
  /** How far (px) the arc rises above the higher of the two symbol tops. */
  bulge: number;
}

export interface FlowData {
  nodes: Node<RFNodeData>[];
  coupleEdges: Edge<CoupleEdgeData>[];
  sibshipEdges: Edge<SibshipEdgeData>[];
  /** One per pair of consecutive copies of someone drawn more than once. */
  duplicateEdges: Edge<DuplicateEdgeData>[];
  /** Lines of assisted reproduction (#45): carrier and social parent to child. */
  assistedEdges: Edge<AssistedEdgeData>[];
}

export interface LayoutToFlowOptions {
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

// ── Pedigree numbers (#8) ────────────────────────────────────────────────────

const numbersCache = new WeakMap<Pedigree, Map<string, string>>();

/**
 * Pedigree numbers ("II-3") of everyone drawn, from the same layout the
 * canvas and the SVG export draw, so the numbers read left to right in each
 * row. Hidden people (#94) and empty pedigrees get none. Cached per pedigree
 * object. See `numbering.ts`.
 */
export function pedigreeNumbers(full: Pedigree): Map<string, string> {
  const pedigree = drawnPedigree(full);
  const cached = numbersCache.get(pedigree);
  if (cached) return cached;
  let numbers = new Map<string, string>();
  if (pedigree.individuals.length > 0) {
    const result = alignPedigreeByFamily(pedigree, { improve: true });
    numbers = numberFromLayout(pedigree, result, findLinelessCopies(result));
  }
  numbersCache.set(pedigree, numbers);
  return numbers;
}

/** The numbers to draw under the symbols (#8), or undefined when the pedigree does not show them. */
export function labelNumbers(pedigree: Pedigree): Map<string, string> | undefined {
  return showsNumbers(pedigree) ? pedigreeNumbers(pedigree) : undefined;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function layoutToFlow(full: Pedigree, options: LayoutToFlowOptions = {}): FlowData {
  // Hidden descendants (#94) are not laid out or drawn.
  const pedigree = drawnPedigree(full);
  if (pedigree.individuals.length === 0) {
    return { nodes: [], coupleEdges: [], sibshipEdges: [], duplicateEdges: [], assistedEdges: [] };
  }
  const result: LayoutResult = alignPedigreeByFamily(pedigree, { improve: options.improveLayout ?? true });
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
    const pinned = new Set(nodes.filter(n => n.data.isPinned).map(n => n.id));
    const snapped = snapSlotPositions(slotPos, pinned, grid);
    for (const node of nodes) node.position = snapped.get(node.id) ?? node.position;
    for (const [id, p] of snapped) slotPos.set(id, p);
  }

  const partners = buildPartnerSetFromPedigree(pedigree);
  const sibshipEdges = buildSibshipEdges(pedigree, result, partners, slotPos);

  const assistedEdges = buildAssistedEdges(pedigree, nodes, sibshipEdges);
  for (const id of labelsOverLines(nodes, sibshipEdges, assistedEdges)) {
    const n = nodes.find(x => x.id === id);
    if (n) n.data.labelsBacked = true;
  }

  const duplicateEdges = buildDuplicateEdges(nodes, spacing);
  const blocks = [...textBlocks(pedigree, nodes, spacing), ...duplicateArcBlocks(duplicateEdges, slotPos), ...sibshipBlocks(sibshipEdges)];
  return {
    nodes,
    coupleEdges:    buildCoupleEdges(pedigree, result, partners, slotPos, spacing.rowHeight, blocks),
    sibshipEdges,
    duplicateEdges,
    assistedEdges,
  };
}

/**
 * Nodes with a line running straight down from the bottom of the symbol,
 * through the labels under it (#45): a parent of a donor pair's only child
 * drawn below them (`converge`), or the source of a line of assisted
 * reproduction that leaves the symbol at the bottom middle.
 */
export function labelsOverLines(
  nodes: Node<RFNodeData>[],
  sibshipEdges: Edge<SibshipEdgeData>[],
  assistedEdges: Edge<AssistedEdgeData>[],
): Set<string> {
  const out = new Set<string>();
  if (assistedEdges.length === 0 && !sibshipEdges.some(e => e.data?.converge)) return out;
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
    const seg = assistedEdgeSegment(e, id => byId.get(id) && { position: byId.get(id)!.position, individual: byId.get(id)!.data.individual, shape: byId.get(id)!.data.shape });
    if (seg) below(e.source, seg[2], seg[3]);
  }
  return out;
}

// ── Assisted reproduction lines (#45) ─────────────────────────────────────────

/**
 * One edge per carrier or social parent and child, or per sibship when they
 * are linked to all of it (see AssistedEdgeData). Someone drawn twice is
 * joined from the copy nearest the child; the child end is the copy that
 * hangs from its parents.
 */
function buildAssistedEdges(
  pedigree: Pedigree,
  nodes: Node<RFNodeData>[],
  sibshipEdges: Edge<SibshipEdgeData>[],
): Edge<AssistedEdgeData>[] {
  const links = assistedLinks(pedigree);
  if (links.length === 0) return [];
  const copies = new Map<string, Node<RFNodeData>[]>();
  for (const n of nodes) {
    const id = n.data.individual.id;
    if (!copies.has(id)) copies.set(id, []);
    copies.get(id)!.push(n);
  }
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const indOf = (nodeId: string) => nodeById.get(nodeId)?.data.individual.id;
  // The sibship edge each child hangs from.
  const sibshipOf = new Map<string, Edge<SibshipEdgeData>>();
  for (const e of sibshipEdges) for (const c of e.data?.childIds ?? []) { const id = indOf(c); if (id) sibshipOf.set(id, e); }
  const nearest = (froms: Node<RFNodeData>[], to: { x: number; y: number }) => {
    const d = (n: Node) => (n.position.x - to.x) ** 2 + (n.position.y - to.y) ** 2;
    return froms.reduce((a, b) => (d(b) < d(a) ? b : a));
  };

  const edges: Edge<AssistedEdgeData>[] = [];
  const done = new Set<string>();
  for (const link of links) {
    const key = `${link.kind}|${link.from}|${link.child}`;
    if (done.has(key)) continue;
    const kids = copies.get(link.child), froms = copies.get(link.from);
    if (!kids?.length || !froms?.length) continue;
    const sib = sibshipOf.get(link.child);
    const sibKids = sib ? sib.data!.childIds.map(indOf).filter((x): x is string => !!x) : [];
    const whole = sibKids.length > 1 && sibKids.every(k => links.some(l => l.kind === link.kind && l.from === link.from && l.child === k));
    if (whole) {
      for (const k of sibKids) done.add(`${link.kind}|${link.from}|${k}`);
      const d = sib!.data!;
      edges.push({
        id:     `assisted-${link.kind}-${link.from}-${sib!.id}`,
        source: nearest(froms, { x: d.coupleX, y: d.sibBarY }).id,
        target: d.childIds[0]!,
        type:   "assistedEdge",
        data:   {
          kind: link.kind,
          children: sibKids,
          bar: { leftParentId: d.leftParentId, rightParentId: d.rightParentId, childIds: d.childIds, barOffset: d.barOffset },
        },
      });
      continue;
    }
    done.add(key);
    const child = kids.find(k => sib?.data?.childIds.includes(k.id)) ?? kids[0]!;
    edges.push({
      id:     `assisted-${link.kind}-${link.from}-${link.child}`,
      source: nearest(froms, child.position).id,
      target: child.id,
      type:   "assistedEdge",
      data:   { kind: link.kind, children: [link.child] },
    });
  }
  return edges;
}

/**
 * Rise of the couple line for the spouse marker at (level, slot): 0 when the
 * adjacent slots are partners, otherwise enough to clear the slots between the
 * real partners.
 */
function hopHeightAt(result: LayoutResult, partners: PartnerSet, level: number, slot: number): number {
  return hopAt(result, partners, level, slot).hopHeight;
}

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
): Node<RFNodeData>[] {
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
  const childIds = new Set(Object.values(pedigree.parentOf).flat());
  const twins = twinMembership(pedigree);
  const labelLines = canvasLabelLines(nameLabelMode(pedigree));
  const numbers = showsNumbers(pedigree) ? numberFromLayout(pedigree, result, hidden) : undefined;

  const nodes: Node<RFNodeData>[] = [];
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

      nodes.push({
        id,
        type:     branch ? "collapsedBranch" : "pedigreeSymbol",
        position: isPinned && pinnedPos ? scalePinnedPosition(pinnedPos, spacing) : autoPos(level, slot),
        draggable: !branch && (nodesMoveable || unlockedSet.has(individual.id)),
        // Not selectable or draggable, so React Flow would turn its pointer
        // events off; the diamond is clicked to show the branch again.
        ...(branch ? { selectable: false, style: { pointerEvents: "all" as const } } : {}),
        width:  NODE_SIZE,
        height: NODE_SIZE,
        data: {
          individual,
          isDuplicate,
          duplicateIndex: isDuplicate ? copies.indexOf(id) + 1 : undefined,
          hasParents: childIds.has(individual.id),
          isPinned,
          shape: symbolSex(individual, pedigree),
          ...(twins.get(individual.id) ?? {}),
          nameLines: wrapLabel(nameLabelText(individual), labelMaxWidth(slotWidth), labelLines),
          detailLines: detailLines(individual, labelMaxWidth(slotWidth), pedigree, numbers),
          detailsBacked: detailsBacked(individual, labelMaxWidth(slotWidth), pedigree, numbers),
          ...(branch ? { branch } : {}),
        },
      });
    }
  }

  return nodes;
}

// ── Duplicate connectors ──────────────────────────────────────────────────────

/** Joins consecutive drawn copies of one person, left to right (R: arcconnect). */
function buildDuplicateEdges(nodes: Node<RFNodeData>[], spacing: LayoutSpacing): Edge<DuplicateEdgeData>[] {
  const byPerson = new Map<string, Node<RFNodeData>[]>();
  for (const n of nodes) {
    if (!n.data.isDuplicate) continue;
    const pid = n.data.individual.id;
    if (!byPerson.has(pid)) byPerson.set(pid, []);
    byPerson.get(pid)!.push(n);
  }
  const edges: Edge<DuplicateEdgeData>[] = [];
  for (const [pid, copies] of byPerson) {
    const sorted = [...copies].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
    for (let i = 0; i + 1 < sorted.length; i++) {
      edges.push({
        id:     `duplicate-${pid}-${i}`,
        source: sorted[i]!.id,
        target: sorted[i + 1]!.id,
        type:   "duplicateEdge",
        data:   { bulge: DUPLICATE_ARC_BULGE * (spacing.rowHeight / 2 - NODE_SIZE / 2) },
      });
    }
  }
  return edges;
}

/**
 * The text under every drawn symbol, as the export writes it, and the copy
 * number beside the top of a symbol drawn twice, for placing couple labels
 * (#109).
 */
function textBlocks(pedigree: Pedigree, nodes: Node<RFNodeData>[], spacing: LayoutSpacing): TextBlock[] {
  const labelMax = labelMaxWidth(spacing.slotWidth);
  const numbers = labelNumbers(pedigree);
  return nodes.flatMap(n => [
    ...[textBlockUnder(n.data.individual, pedigree, n.position.x, n.position.y, labelMax, numbers) ?? []].flat(),
    ...(n.data.isDuplicate && n.data.duplicateIndex !== undefined ? [copyNumberBlock(n.position.x, n.position.y, n.data.duplicateIndex)] : []),
  ]);
}

/** The dashed arcs between copies of someone, as a thin box per stretch, for placing couple labels (#109). */
function duplicateArcBlocks(edges: Edge<DuplicateEdgeData>[], slotPos: Map<string, { x: number; y: number }>): TextBlock[] {
  return edges.flatMap(e => {
    const a = slotPos.get(e.source), b = slotPos.get(e.target);
    if (!a || !b) return [];
    const pts = duplicateArcPoints(a.x, a.y, b.x, b.y, e.data?.bulge ?? DUPLICATE_ARC_BULGE, NODE_SIZE / 2);
    return pts.slice(1).map(([x, y], i) => {
      const [px, py] = pts[i]!;
      return { x: (x + px) / 2, halfWidth: Math.abs(x - px) / 2 + 1, top: Math.min(y, py) - 2, bottom: Math.max(y, py) + 2, arc: true };
    });
  });
}

/** Sibship bars and the drops from them, as thin boxes, so a raised couple label stays under them (#109). */
function sibshipBlocks(edges: Edge<SibshipEdgeData>[]): TextBlock[] {
  return edges.flatMap(e => {
    const d = e.data;
    if (!d) return [];
    const xs = [d.coupleX, ...d.childXs];
    const lo = Math.min(...xs), hi = Math.max(...xs);
    return [
      { x: (lo + hi) / 2, halfWidth: (hi - lo) / 2 + 1, top: d.sibBarY - 2, bottom: d.sibBarY + 2 },
      ...d.childXs.map((x, i) => ({ x, halfWidth: 1, top: d.sibBarY, bottom: (d.childYs[i] ?? d.childY) - NODE_SIZE / 2 })),
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
): Edge<CoupleEdgeData>[] {
  const edges: Edge<CoupleEdgeData>[] = [];
  const related = consanguinityTest(pedigree);
  const idAt = (level: number, slot: number) => pedigree.individuals[result.nid[level][slot] - 1]!.id;
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const partnershipOf = new Map(pedigree.partnerships.map(p => [pairKey(p.individual1, p.individual2), p]));
  // Partners with no parents drawn have nothing landing on their symbol tops (#97).
  const hasParents = new Set(Object.values(pedigree.parentOf).flat());

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level] - 1; slot++) {
      const sp = result.spouse[level][slot];
      if (sp === 0) continue;

      // A marker between two people who are not partners is a marriage line
      // passing through to a further partner: connect the real partners and
      // hop over whatever sits between them.
      const rc = resolveCouple(result, partners, level, slot);
      // Gamete donation (#45): the genetic parents are not a couple, so no line.
      if (partnershipOf.get(pairKey(idAt(level, rc.leftSlot), idAt(level, rc.rightSlot)))?.donorConception) continue;
      const double = related(idAt(level, rc.leftSlot), idAt(level, rc.rightSlot));

      edges.push({
        id:           `couple-${level}-${slot}`,
        source:       `${level}-${rc.leftSlot}`,
        target:       `${level}-${rc.rightSlot}`,
        sourceHandle: "couple-out",  // right edge of left partner
        targetHandle: "couple-in",   // left edge of right partner
        // Line style from the real partners, not the slots the marker sits
        // between (see consanguinityTest).
        type:         double ? "consanguineousEdge" : "coupleEdge",
        data:         {
          ...hopAt(result, partners, level, slot),
          partnershipId: partnershipOf.get(pairKey(idAt(level, rc.leftSlot), idAt(level, rc.rightSlot)))?.id,
          ...childlessData(idAt(level, rc.leftSlot), idAt(level, rc.rightSlot)),
          ...endedData(idAt(level, rc.leftSlot), idAt(level, rc.rightSlot)),
          ...(double ? labelData(idAt(level, rc.leftSlot), idAt(level, rc.rightSlot), `${level}-${rc.leftSlot}`, `${level}-${rc.rightSlot}`, hopAt(result, partners, level, slot).hopHeight ?? 0) : {}),
        },
      });
    }
  }

  return edges;

  function childlessData(a: string, b: string): Pick<CoupleEdgeData, "childless" | "childlessReason"> {
    const partnership = partnershipOf.get(pairKey(a, b));
    const childless = partnership && activeChildless(partnership, pedigree);
    if (!childless) return {};
    return { childless, childlessReason: partnership!.childlessReason || undefined };
  }

  function labelData(a: string, b: string, left: string, right: string, hop: number): Pick<CoupleEdgeData, "consanguinityLabel" | "consanguinityLabelOffset"> {
    const partnership = partnershipOf.get(pairKey(a, b));
    const text = partnership && consanguinityLabelText(pedigree, partnership);
    const l = slotPos.get(left), r = slotPos.get(right);
    if (!text || !l || !r) return {};
    const top = (id: string) => ({
      hasParents: hasParents.has(id),
      familyHistoryUnknown: !!pedigree.individuals.find(i => i.id === id)?.familyHistoryUnknown,
    });
    const [lx, rx] = l.x <= r.x ? [l.x, r.x] : [r.x, l.x];
    const [lt, rt] = l.x <= r.x ? [top(a), top(b)] : [top(b), top(a)];
    const lines = wrapConsanguinityLabel(text, consanguinityLabelRoom(lx, rx, lt, rt), rowHeight);
    // Out of the way of the text under the people above (#109); not drawn
    // when there is no room for it anywhere near the line.
    const offset = placeConsanguinityLabel({
      lx, rx, cy: (l.y + r.y) / 2, hop, lines, blocks,
      limits: consanguinityLabelLimits(lx, rx, lt, rt), ended: !!partnership.ended,
    });
    if (!offset) return {};
    return { consanguinityLabel: lines, ...(offset.dx || offset.dy || offset.backed ? { consanguinityLabelOffset: offset } : {}) };
  }

  function endedData(a: string, b: string): Pick<CoupleEdgeData, "ended" | "middleTaken"> {
    const partnership = partnershipOf.get(pairKey(a, b));
    if (!partnership?.ended) return {};
    return { ended: true, middleTaken: middleTaken(partnership, pedigree) };
  }
}

// ── Sibship edges ─────────────────────────────────────────────────────────────

const pairKeyOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Partner pairs who are genetic parents through gamete donation, not a couple (#45). */
function donorPairs(pedigree: Pedigree): Set<string> {
  return new Set(pedigree.partnerships.filter(p => p.donorConception).map(p => pairKeyOf(p.individual1, p.individual2)));
}

function buildSibshipEdges(
  pedigree: Pedigree,
  result: LayoutResult,
  partners: PartnerSet,
  slotPos: Map<string, { x: number; y: number }>,
): Edge<SibshipEdgeData>[] {
  const edges: Edge<SibshipEdgeData>[] = [];
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

      const coupleX  = (leftPos.x + rightPos.x) / 2;
      const coupleY  = (leftPos.y + rightPos.y) / 2;

      const firstChildPos = slotPos.get(resolvedChildIds[0]!);
      if (!firstChildPos) continue;
      const childXs  = resolvedChildIds.map(id => slotPos.get(id)?.x ?? 0);
      const childYs  = resolvedChildIds.map(id => slotPos.get(id)?.y ?? firstChildPos.y);
      const childY   = Math.min(...childYs);
      const sibBarY  = (coupleY + childY) / 2;
      const hopHeight = hopHeightAt(result, partners, level - 1, leftParentSlot);
      const rc = resolveCouple(result, partners, level - 1, leftParentSlot);
      const isApart = apart.has(pairKeyOf(idAt(level - 1, rc.leftSlot), idAt(level - 1, rc.rightSlot)));
      const converge = slots.length === 1 && isApart;

      // Source = left parent node; target = leftmost resolved child node.
      edges.push({
        id:           `sibship-${level}-${f}`,
        source:       `${level - 1}-${leftParentSlot}`,
        target:       resolvedChildIds[0]!,
        sourceHandle: "sibship-out",
        targetHandle: "sibship-in",
        type:         "sibshipEdge",
        data:         {
          leftParentId:  `${level - 1}-${leftParentSlot}`,
          rightParentId: `${level - 1}-${rightParentSlot}`,
          childIds:      resolvedChildIds,
          coupleX, coupleY, hopHeight, sibBarY, barOffset: 0, childXs, childYs, childY,
          ...(isApart ? { apart: [
            { ...leftPos, sex: shapeAt(level - 1, leftParentSlot) },
            { ...rightPos, sex: shapeAt(level - 1, rightParentSlot) },
          ] } : {}),
          ...(converge ? { converge: true } : {}),
        },
      });
    }
  }

  // Bars that would run along the same line get a height each (#80).
  const offsets = sibshipBarOffsets(edges.map(e => e.data!));
  edges.forEach((e, i) => {
    e.data!.barOffset = offsets[i]!;
    e.data!.sibBarY += offsets[i]!;
  });

  return edges;
}
