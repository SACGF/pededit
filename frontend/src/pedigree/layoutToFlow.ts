import type { Node, Edge } from "@xyflow/react";
import { alignPedigreeByFamily, buildPartnerSetFromPedigree, resolveCouple } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult, Individual, PartnerSet, ChildlessStatus } from "@pedigree-editor/layout-engine";
import { NODE_SIZE, DUPLICATE_ARC_BULGE } from "./constants";
import { hopGeometry } from "./couplePath";
import { layoutSpacing, scalePinnedPosition } from "./spacing";
import { consanguinityTest } from "./consanguinity";
import type { LayoutSpacing } from "./spacing";
import { activeSnapGrid, snapSlotPositions } from "./snap";
import { activeChildless } from "./childless";

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
   * True if this node sits at the individual's pinned (dragged) position. For
   * someone drawn more than once only the copy nearest the pin is moved.
   */
  isPinned: boolean;
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
  /** Childless couple mark under the line (#15), when the partnership has one and no children. */
  childless?: ChildlessStatus;
  childlessReason?: string;
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
  /** y (canvas px) of the sibship bar = (level - SIB_BAR_FACTOR) * ROW_HEIGHT. */
  sibBarY: number;
  /** x (canvas px) of each child's slot centre, in slot order. */
  childXs: number[];
  /** y (canvas px) of each child's centre, in slot order (differs when a child is pinned off the row). */
  childYs: number[];
  /** y (canvas px) of the highest child row; the sibship bar sits halfway up to the couple. */
  childY: number;
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
}

export interface LayoutToFlowOptions {
  /**
   * Compact mode: rows are placed at 70% of ROW_HEIGHT and slots at 85% of
   * SLOT_WIDTH so larger pedigrees fit on screen. Pinned positions (stored
   * at normal spacing) are scaled by the same factors. Default: false.
   */
  compact?: boolean;
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

// ── Main entry point ──────────────────────────────────────────────────────────

export function layoutToFlow(pedigree: Pedigree, options: LayoutToFlowOptions = {}): FlowData {
  if (pedigree.individuals.length === 0) {
    return { nodes: [], coupleEdges: [], sibshipEdges: [], duplicateEdges: [] };
  }
  const result: LayoutResult = alignPedigreeByFamily(pedigree);
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

  return {
    nodes,
    coupleEdges:    buildCoupleEdges(pedigree, result, partners),
    sibshipEdges:   buildSibshipEdges(result, partners, slotPos),
    duplicateEdges: buildDuplicateEdges(nodes, spacing),
  };
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

      nodes.push({
        id,
        type:     "pedigreeSymbol",
        position: isPinned && pinnedPos ? scalePinnedPosition(pinnedPos, spacing) : autoPos(level, slot),
        draggable: nodesMoveable || unlockedSet.has(individual.id),
        width:  NODE_SIZE,
        height: NODE_SIZE,
        data: {
          individual,
          isDuplicate,
          duplicateIndex: isDuplicate ? copies.indexOf(id) + 1 : undefined,
          hasParents: childIds.has(individual.id),
          isPinned,
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

// ── Couple edges ──────────────────────────────────────────────────────────────

function buildCoupleEdges(pedigree: Pedigree, result: LayoutResult, partners: PartnerSet): Edge<CoupleEdgeData>[] {
  const edges: Edge<CoupleEdgeData>[] = [];
  const related = consanguinityTest(pedigree);
  const idAt = (level: number, slot: number) => pedigree.individuals[result.nid[level][slot] - 1]!.id;
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const partnershipOf = new Map(pedigree.partnerships.map(p => [pairKey(p.individual1, p.individual2), p]));

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level] - 1; slot++) {
      const sp = result.spouse[level][slot];
      if (sp === 0) continue;

      // A marker between two people who are not partners is a marriage line
      // passing through to a further partner: connect the real partners and
      // hop over whatever sits between them.
      const rc = resolveCouple(result, partners, level, slot);

      edges.push({
        id:           `couple-${level}-${slot}`,
        source:       `${level}-${rc.leftSlot}`,
        target:       `${level}-${rc.rightSlot}`,
        sourceHandle: "couple-out",  // right edge of left partner
        targetHandle: "couple-in",   // left edge of right partner
        // Line style from the real partners, not the slots the marker sits
        // between (see consanguinityTest).
        type:         related(idAt(level, rc.leftSlot), idAt(level, rc.rightSlot))
          ? "consanguineousEdge" : "coupleEdge",
        data:         { ...hopAt(result, partners, level, slot), ...childlessData(idAt(level, rc.leftSlot), idAt(level, rc.rightSlot)) },
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
}

// ── Sibship edges ─────────────────────────────────────────────────────────────

function buildSibshipEdges(
  result: LayoutResult,
  partners: PartnerSet,
  slotPos: Map<string, { x: number; y: number }>,
): Edge<SibshipEdgeData>[] {
  const edges: Edge<SibshipEdgeData>[] = [];

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
          coupleX, coupleY, hopHeight, sibBarY, childXs, childYs, childY,
        },
      });
    }
  }

  return edges;
}
