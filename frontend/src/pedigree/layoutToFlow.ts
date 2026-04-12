import type { Node, Edge } from "@xyflow/react";
import { alignPedigree } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult, Individual } from "@pedigree-editor/layout-engine";
import { SLOT_WIDTH, ROW_HEIGHT, SIB_BAR_FACTOR, NODE_SIZE } from "./constants";

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
}

/** No extra data needed — geometry is derived from source/target handle positions. */
export type CoupleEdgeData = Record<string, unknown>;

/**
 * All geometry for a sibship connection is pre-computed here and passed as
 * edge data. The SibshipEdge renderer ignores sourceX/Y, targetX/Y and uses
 * this data instead.
 */
export interface SibshipEdgeData extends Record<string, unknown> {
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

// ── Main entry point ──────────────────────────────────────────────────────────

export function layoutToFlow(pedigree: Pedigree): FlowData {
  if (pedigree.individuals.length === 0) {
    return { nodes: [], coupleEdges: [], sibshipEdges: [] };
  }
  const result: LayoutResult = alignPedigree(pedigree);
  return {
    nodes:        buildNodes(pedigree, result),
    coupleEdges:  buildCoupleEdges(result),
    sibshipEdges: buildSibshipEdges(result),
  };
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

function buildNodes(pedigree: Pedigree, result: LayoutResult): Node<RFNodeData>[] {
  // First pass: count how many slots each baseNid occupies (across all levels).
  const nidSlotCount = new Map<number, number>();
  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const baseNid = Math.floor(result.nid[level][slot]);
      nidSlotCount.set(baseNid, (nidSlotCount.get(baseNid) ?? 0) + 1);
    }
  }

  // Second pass: emit one React Flow node per (level, slot).
  const nidOccurrence = new Map<number, number>();
  const nodes: Node<RFNodeData>[] = [];

  for (let level = 0; level < result.n.length; level++) {
    for (let slot = 0; slot < result.n[level]; slot++) {
      const baseNid = Math.floor(result.nid[level][slot]);
      const individual = pedigree.individuals[baseNid - 1]; // 1-based → 0-based

      const occurrence = (nidOccurrence.get(baseNid) ?? 0) + 1;
      nidOccurrence.set(baseNid, occurrence);
      const isDuplicate = (nidSlotCount.get(baseNid) ?? 1) > 1;

      const hasParents = Object.values(pedigree.parentOf).some(
        children => children.includes(individual.id)
      );

      nodes.push({
        id:       `${level}-${slot}`,
        type:     "pedigreeSymbol",
        position: {
          x: result.pos[level][slot] * SLOT_WIDTH,
          y: level * ROW_HEIGHT,
        },
        width:  NODE_SIZE,
        height: NODE_SIZE,
        data: {
          individual,
          isDuplicate,
          duplicateIndex: isDuplicate ? (occurrence as 1 | 2) : undefined,
          hasParents,
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

function buildSibshipEdges(result: LayoutResult): Edge<SibshipEdgeData>[] {
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

      const coupleX = (
        result.pos[level - 1][leftParentSlot] +
        result.pos[level - 1][rightParentSlot]
      ) / 2 * SLOT_WIDTH;

      const coupleY  = (level - 1) * ROW_HEIGHT;
      const sibBarY  = (level - SIB_BAR_FACTOR) * ROW_HEIGHT;
      const childY   = level * ROW_HEIGHT;
      const childXs  = slots.map((s) => result.pos[level][s] * SLOT_WIDTH);

      // Source = left parent node; target = leftmost child node.
      // The SibshipEdge renderer ignores these positions and uses data instead.
      edges.push({
        id:           `sibship-${level}-${f}`,
        source:       `${level - 1}-${leftParentSlot}`,
        target:       `${level}-${slots[0]}`,
        sourceHandle: "sibship-out",
        targetHandle: "sibship-in",
        type:         "sibshipEdge",
        data:         { coupleX, coupleY, sibBarY, childXs, childY },
      });
    }
  }

  return edges;
}
