import type { Node, Edge } from "@xyflow/react";
import { alignPedigree, buildPartnerSetFromPedigree, resolveCouple } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult, Individual, PartnerSet } from "@pedigree-editor/layout-engine";
import { NODE_SIZE, COUPLE_HOP, COUPLE_HOP_STEP } from "./constants";
import { layoutSpacing, scalePinnedPosition } from "./spacing";
import type { LayoutSpacing } from "./spacing";
import { activeSnapGrid, snapSlotPositions } from "./snap";

// ── Output types ──────────────────────────────────────────────────────────────

export interface RFNodeData extends Record<string, unknown> {
  individual: Individual;
  /**
   * True when the same individual appears in two different slots (e.g. a
   * parent who has children with two different partners). Both occurrences
   * render — add a small superscript to both.
   */
  isDuplicate: boolean;
  /**
   * 1 = first occurrence of a duplicate, 2 = second. Used to pick the
   * superscript glyph. Undefined when isDuplicate = false.
   */
  duplicateIndex?: 1 | 2;
  /** True if individual has a parent partnership in the pedigree. */
  hasParents: boolean;
  /** True if this individual has a manually dragged (pinned) position. */
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

export interface FlowData {
  nodes: Node<RFNodeData>[];
  coupleEdges: Edge<CoupleEdgeData>[];
  sibshipEdges: Edge<SibshipEdgeData>[];
}

export interface LayoutToFlowOptions {
  /**
   * Compact mode: rows are placed at 70% of ROW_HEIGHT and slots at 85% of
   * SLOT_WIDTH so larger pedigrees fit on screen. Pinned positions (stored
   * at normal spacing) are scaled by the same factors. Default: false.
   */
  compact?: boolean;
}

// ── Orphan duplicate detection ────────────────────────────────────────────────

/**
 * When both spouses have parents, alignped1 processes one family first and
 * "claims" the other spouse — consuming the couple row. The second family then
 * has that spouse appear as a childless, partnerless orphan.
 *
 * This function finds same-level duplicate slots where one copy has no couple
 * edge (the orphan). Returns:
 *   orphanSlotIds  — slot IDs to suppress in node output
 *   redirectSlot   — maps orphan slot ID → canonical (couple-connected) slot ID,
 *                    so sibship edges can be redirected to the correct position
 */
function findOrphanDuplicates(result: LayoutResult): {
  orphanSlotIds: Set<string>;
  redirectSlot:  Map<string, string>;
} {
  const orphanSlotIds = new Set<string>();
  const redirectSlot  = new Map<string, string>();

  // Group slots by (baseNid, level) to find same-level duplicates.
  const nidLevelSlots = new Map<string, number[]>(); // "${nid}-${lev}" → [slot, ...]
  for (let lev = 0; lev < result.n.length; lev++) {
    for (let sl = 0; sl < result.n[lev]; sl++) {
      const baseNid = Math.floor(result.nid[lev][sl]);
      const key = `${baseNid}-${lev}`;
      if (!nidLevelSlots.has(key)) nidLevelSlots.set(key, []);
      nidLevelSlots.get(key)!.push(sl);
    }
  }

  for (const [key, slots] of nidLevelSlots) {
    if (slots.length < 2) continue;

    const lev = parseInt(key.split("-").at(-1)!);
    const spouseRow = result.spouse[lev] ?? [];

    // Canonical = the slot that participates in a couple edge.
    // A slot is the left partner if spouse[lev][sl] > 0.
    // A slot is the right partner if spouse[lev][sl-1] > 0.
    let canonical: number | null = null;
    for (const sl of slots) {
      const isLeft  = sl < result.n[lev] - 1 && (spouseRow[sl]     ?? 0) > 0;
      const isRight = sl > 0                  && (spouseRow[sl - 1] ?? 0) > 0;
      if (isLeft || isRight) {
        canonical = sl;
        break;
      }
    }
    if (canonical === null) continue;

    for (const sl of slots) {
      if (sl === canonical) continue;
      orphanSlotIds.add(`${lev}-${sl}`);
      redirectSlot.set(`${lev}-${sl}`, `${lev}-${canonical}`);
    }
  }

  return { orphanSlotIds, redirectSlot };
}

// ── Orphan position adjustment ────────────────────────────────────────────────

/**
 * When both partners have parents the orphan-redirect produces a layout where
 * one parent-pair sits on the wrong side of its child (because alignped1 placed
 * the child as a spouse copy next to the other partner first, then the second
 * family placed it again further right as a child).
 *
 * This function post-processes node positions so that:
 *   - Each redirected child (canonical) is centred under its own parents.
 *   - Its couple-partner is centred under the partner's own parents.
 *
 * Both slotPos and the nodes array are mutated in-place (positions only).
 * Pinned nodes are left untouched.
 */
function adjustOrphanPositions(
  result: LayoutResult,
  redirectSlot: Map<string, string>,
  nodes: Node<RFNodeData>[],
  slotPos: Map<string, { x: number; y: number }>,
): void {
  for (const [orphanSlotId, canonicalSlotId] of redirectSlot) {
    const parts = orphanSlotId.split("-");
    const orphanLevel = parseInt(parts[0]!);
    const orphanSlot  = parseInt(parts[1]!);

    if (orphanLevel < 1) continue;

    // Orphan's parents via fam (1-based left-parent slot in level above).
    const orphanFam = result.fam[orphanLevel]?.[orphanSlot] ?? 0;
    if (!orphanFam) continue;

    const parentLevel      = orphanLevel - 1;
    const leftParentSlot   = orphanFam - 1;  // 0-based
    const rightParentSlot  = orphanFam;       // 0-based

    const leftParentPos  = slotPos.get(`${parentLevel}-${leftParentSlot}`);
    const rightParentPos = slotPos.get(`${parentLevel}-${rightParentSlot}`);
    if (!leftParentPos || !rightParentPos) continue;

    const newCanonicalX = (leftParentPos.x + rightParentPos.x) / 2;

    // Update canonical child position (the spouse-copy that was already placed).
    const canonicalPos = slotPos.get(canonicalSlotId);
    if (!canonicalPos) continue;

    const setPos = (slotId: string, x: number) => {
      const pos = slotPos.get(slotId);
      if (!pos) return;
      slotPos.set(slotId, { ...pos, x });
      const node = nodes.find(n => n.id === slotId);
      if (node && !node.data.isPinned) {
        node.position = { ...node.position, x };
      }
    };

    setPos(canonicalSlotId, newCanonicalX);

    // Also centre the couple-partner under its own parents.
    const cParts        = canonicalSlotId.split("-");
    const canonicalLevel = parseInt(cParts[0]!);
    const canonicalSlot  = parseInt(cParts[1]!);

    const spouseRow = result.spouse[canonicalLevel] ?? [];
    let partnerSlot: number | null = null;
    if (canonicalSlot < result.n[canonicalLevel] - 1 && (spouseRow[canonicalSlot] ?? 0) > 0) {
      partnerSlot = canonicalSlot + 1;
    } else if (canonicalSlot > 0 && (spouseRow[canonicalSlot - 1] ?? 0) > 0) {
      partnerSlot = canonicalSlot - 1;
    }
    if (partnerSlot === null) continue;

    const partnerFam = result.fam[canonicalLevel]?.[partnerSlot] ?? 0;
    if (!partnerFam) continue;

    const pLeftParentPos  = slotPos.get(`${parentLevel}-${partnerFam - 1}`);
    const pRightParentPos = slotPos.get(`${parentLevel}-${partnerFam}`);
    if (!pLeftParentPos || !pRightParentPos) continue;

    setPos(
      `${canonicalLevel}-${partnerSlot}`,
      (pLeftParentPos.x + pRightParentPos.x) / 2,
    );
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function layoutToFlow(pedigree: Pedigree, options: LayoutToFlowOptions = {}): FlowData {
  if (pedigree.individuals.length === 0) {
    return { nodes: [], coupleEdges: [], sibshipEdges: [] };
  }
  const result: LayoutResult = alignPedigree(pedigree);
  const spacing = layoutSpacing(options.compact);

  // Detect orphan duplicates (both-spouses-have-parents case) and build
  // a redirect map so their parents' sibship edges point to the right node.
  const { orphanSlotIds, redirectSlot } = findOrphanDuplicates(result);

  const nodes = buildNodes(pedigree, result, orphanSlotIds, spacing);

  // Map from slot id ("level-slot") → final pixel position (reflects pin overrides).
  const slotPos = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    slotPos.set(node.id, node.position);
  }

  // When both partners have parents the orphan-redirect can leave a partner
  // visually offset from its parents.  Centre each redirected child under its
  // own parents, and centre the couple-partner under their parents too, so
  // both sibship lines drop vertically rather than diagonally.
  if (redirectSlot.size > 0) {
    adjustOrphanPositions(result, redirectSlot, nodes, slotPos);
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
    coupleEdges:  buildCoupleEdges(result, partners),
    sibshipEdges: buildSibshipEdges(result, partners, slotPos, redirectSlot),
  };
}

/**
 * Rise of the couple line for the spouse marker at (level, slot): 0 when the
 * adjacent slots are partners, otherwise enough to clear the slots between the
 * real partners.
 */
function hopHeightAt(result: LayoutResult, partners: PartnerSet, level: number, slot: number): number {
  const rc = resolveCouple(result, partners, level, slot);
  if (!rc.hop) return 0;
  return COUPLE_HOP + (rc.rightSlot - rc.leftSlot - 2) * COUPLE_HOP_STEP;
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

function buildNodes(
  pedigree: Pedigree,
  result: LayoutResult,
  orphanSlotIds: Set<string>,
  spacing: LayoutSpacing,
): Node<RFNodeData>[] {
  const { slotWidth, rowHeight } = spacing;
  // First pass: count non-orphan slots per baseNid to compute isDuplicate correctly.
  const nidSlotCount = new Map<number, number>();
  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      if (orphanSlotIds.has(`${level}-${slot}`)) continue;
      const baseNid = Math.floor(result.nid[level][slot]);
      nidSlotCount.set(baseNid, (nidSlotCount.get(baseNid) ?? 0) + 1);
    }
  }

  // Determine which individuals are draggable.
  const nodesMoveable = pedigree.canvasSettings?.nodesMoveable ?? false;
  const unlockedSet = new Set(pedigree.unlockedIndividuals ?? []);

  // Second pass: emit one React Flow node per (level, slot), skipping orphans.
  const nidOccurrence = new Map<number, number>();
  const nodes: Node<RFNodeData>[] = [];

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      if (orphanSlotIds.has(`${level}-${slot}`)) continue;

      const baseNid = Math.floor(result.nid[level][slot]);
      const individual = pedigree.individuals[baseNid - 1]; // 1-based → 0-based

      const occurrence = (nidOccurrence.get(baseNid) ?? 0) + 1;
      nidOccurrence.set(baseNid, occurrence);
      const isDuplicate = (nidSlotCount.get(baseNid) ?? 1) > 1;

      const hasParents = Object.values(pedigree.parentOf).some(
        children => children.includes(individual.id)
      );

      const pinnedPos = pedigree.pinnedPositions?.[individual.id];
      const isMoveable = nodesMoveable || unlockedSet.has(individual.id);

      nodes.push({
        id:       `${level}-${slot}`,
        type:     "pedigreeSymbol",
        position: pinnedPos ? scalePinnedPosition(pinnedPos, spacing) : {
          x: result.pos[level][slot] * slotWidth,
          y: level * rowHeight,
        },
        draggable: isMoveable,
        width:  NODE_SIZE,
        height: NODE_SIZE,
        data: {
          individual,
          isDuplicate,
          duplicateIndex: isDuplicate ? (occurrence as 1 | 2) : undefined,
          hasParents,
          isPinned: !!pinnedPos,
        },
      });
    }
  }

  return nodes;
}

// ── Couple edges ──────────────────────────────────────────────────────────────

function buildCoupleEdges(result: LayoutResult, partners: PartnerSet): Edge<CoupleEdgeData>[] {
  const edges: Edge<CoupleEdgeData>[] = [];

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
        type:         sp === 1 ? "coupleEdge" : "consanguineousEdge",
        data:         { hopHeight: hopHeightAt(result, partners, level, slot) },
      });
    }
  }

  return edges;
}

// ── Sibship edges ─────────────────────────────────────────────────────────────

function buildSibshipEdges(
  result: LayoutResult,
  partners: PartnerSet,
  slotPos: Map<string, { x: number; y: number }>,
  redirectSlot: Map<string, string>,
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

      // Resolve any orphan-duplicate children to their canonical slot.
      const resolvedChildIds = slots.map(s => {
        const slotId = `${level}-${s}`;
        return redirectSlot.get(slotId) ?? slotId;
      });

      const leftPos  = slotPos.get(`${level - 1}-${leftParentSlot}`)!;
      const rightPos = slotPos.get(`${level - 1}-${rightParentSlot}`)!;
      if (!leftPos || !rightPos) continue; // parent node was suppressed (shouldn't happen)

      const coupleX  = (leftPos.x + rightPos.x) / 2;
      const coupleY  = (leftPos.y + rightPos.y) / 2;

      // Use canonical child positions for geometry.
      const firstChildPos = slotPos.get(resolvedChildIds[0]!);
      if (!firstChildPos) continue; // canonical child not found
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
