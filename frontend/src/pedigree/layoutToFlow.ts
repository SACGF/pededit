import type { Node, Edge } from "@xyflow/react";
import { alignPedigree } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult, Individual } from "@pedigree-editor/layout-engine";
import { SLOT_WIDTH, ROW_HEIGHT, NODE_SIZE } from "./constants";

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

/** No extra data needed — geometry is derived from source/target handle positions. */
export type CoupleEdgeData = Record<string, unknown>;

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
  /** y (canvas px) of the sibship bar = (level - SIB_BAR_FACTOR) * ROW_HEIGHT. */
  sibBarY: number;
  /** x (canvas px) of each child's slot centre, in slot order. */
  childXs: number[];
  /** y (canvas px) of the child generation centre = level * ROW_HEIGHT. */
  childY: number;
}

export interface FlowData {
  nodes: Node<RFNodeData>[];
  coupleEdges: Edge<CoupleEdgeData>[];
  sibshipEdges: Edge<SibshipEdgeData>[];
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

// ── Main entry point ──────────────────────────────────────────────────────────

export function layoutToFlow(pedigree: Pedigree): FlowData {
  if (pedigree.individuals.length === 0) {
    return { nodes: [], coupleEdges: [], sibshipEdges: [] };
  }
  const result: LayoutResult = alignPedigree(pedigree);

  // Detect orphan duplicates (both-spouses-have-parents case) and build
  // a redirect map so their parents' sibship edges point to the right node.
  const { orphanSlotIds, redirectSlot } = findOrphanDuplicates(result);

  const nodes = buildNodes(pedigree, result, orphanSlotIds);

  // Map from slot id ("level-slot") → final pixel position (reflects pin overrides).
  const slotPos = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    slotPos.set(node.id, node.position);
  }

  return {
    nodes,
    coupleEdges:  buildCoupleEdges(result),
    sibshipEdges: buildSibshipEdges(result, slotPos, redirectSlot),
  };
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

function buildNodes(
  pedigree: Pedigree,
  result: LayoutResult,
  orphanSlotIds: Set<string>,
): Node<RFNodeData>[] {
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
        position: pinnedPos ?? {
          x: result.pos[level][slot] * SLOT_WIDTH,
          y: level * ROW_HEIGHT,
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

function buildCoupleEdges(result: LayoutResult): Edge<CoupleEdgeData>[] {
  const edges: Edge<CoupleEdgeData>[] = [];

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level] - 1; slot++) {
      const sp = result.spouse[level][slot];
      if (sp === 0) continue;

      edges.push({
        id:           `couple-${level}-${slot}`,
        source:       `${level}-${slot}`,
        target:       `${level}-${slot + 1}`,
        sourceHandle: "couple-out",  // right edge of left partner
        targetHandle: "couple-in",   // left edge of right partner
        type:         sp === 1 ? "coupleEdge" : "consanguineousEdge",
        data:         {},
      });
    }
  }

  return edges;
}

// ── Sibship edges ─────────────────────────────────────────────────────────────

function buildSibshipEdges(
  result: LayoutResult,
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
      const childY   = firstChildPos.y;
      const sibBarY  = (coupleY + childY) / 2;
      const childXs  = resolvedChildIds.map(id => slotPos.get(id)?.x ?? 0);

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
          coupleX, coupleY, sibBarY, childXs, childY,
        },
      });
    }
  }

  return edges;
}
