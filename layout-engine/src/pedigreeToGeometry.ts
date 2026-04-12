/**
 * pedigreeToGeometry
 *
 * Converts a Pedigree to a flat, pixel-coordinate geometry description that
 * can be used for testing, export, and future API responses.
 *
 * Rendering constants default to the values used by the React frontend
 * (SLOT_WIDTH=80, ROW_HEIGHT=120, NODE_SIZE=40, SIB_BAR_FACTOR=0.4).
 * Pass custom values for different output sizes.
 */

import { alignPedigree } from "./alignPedigree.js";
import type { Pedigree, Individual, LayoutResult } from "./types.js";

// ── Rendering constants (match frontend/src/pedigree/constants.ts) ────────────

export interface RenderingConstants {
  /** Horizontal distance between slot centres, in pixels. Default: 80. */
  slotWidth: number;
  /** Vertical distance between generation centres, in pixels. Default: 120. */
  rowHeight: number;
  /** Width and height of each node symbol, in pixels. Default: 40. */
  nodeSize: number;
  /**
   * Fraction of rowHeight above the child row where the sibship horizontal
   * bar sits. sibBarY = (level - sibBarFactor) × rowHeight. Default: 0.4.
   */
  sibBarFactor: number;
}

const DEFAULT_CONSTANTS: RenderingConstants = {
  slotWidth: 80,
  rowHeight: 120,
  nodeSize:  40,
  sibBarFactor: 0.4,
};

// ── Output types ──────────────────────────────────────────────────────────────

/** Pixel-coordinate description of one rendered individual slot. */
export interface NodeGeometry {
  /** Individual's string ID from the Pedigree model. */
  id: string;
  /** 0-based generation level. */
  level: number;
  /** 0-based slot index within the generation. */
  slot: number;
  /** Centre x in canvas pixels. */
  cx: number;
  /** Centre y in canvas pixels. */
  cy: number;
  /** Half the node size (cx ± half gives the left/right edges). */
  half: number;
  sex: Individual["sex"];
  affected: boolean;
  carrier: boolean;
  deceased: boolean;
  proband: boolean;
  /**
   * True when the same individual appears in more than one slot (e.g. a parent
   * in two separate families). Both occurrences are included.
   */
  isDuplicate: boolean;
}

/** A horizontal couple line between two adjacent nodes. */
export interface CoupleGeometry {
  /** Left partner's individual ID. */
  leftId: string;
  /** Right partner's individual ID. */
  rightId: string;
  /** "consanguineous" when the couple shares ancestry. */
  kind: "couple" | "consanguineous";
  /** x where the line starts (right edge of left node). */
  x1: number;
  /** x where the line ends (left edge of right node). */
  x2: number;
  /** y of the line (centre of both nodes — they share the same y). */
  y: number;
}

/**
 * The three-segment T-shape that connects a parent couple to their children:
 *   1. Vertical drop from the couple midpoint down to the sibship bar.
 *   2. Horizontal bar spanning all children.
 *   3. Verticals from the bar down to each child's top edge.
 */
export interface SibshipGeometry {
  /** x of the couple's midpoint (top of the vertical drop). */
  coupleX: number;
  /** y of the parent generation centre. */
  coupleY: number;
  /** y of the horizontal sibling bar. */
  sibBarY: number;
  /** x centre of each child, in slot order. */
  childXs: number[];
  /** y of the child generation centre. */
  childY: number;
}

/** Complete pixel-coordinate geometry for one pedigree. */
export interface PedigreeGeometry {
  nodes:    NodeGeometry[];
  couples:  CoupleGeometry[];
  sibships: SibshipGeometry[];
  /** The bounding box of all content (useful for canvas sizing). */
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

// ── Main function ─────────────────────────────────────────────────────────────

export function pedigreeToGeometry(
  pedigree: Pedigree,
  constants: Partial<RenderingConstants> = {},
): PedigreeGeometry {
  const c = { ...DEFAULT_CONSTANTS, ...constants };

  if (pedigree.individuals.length === 0) {
    return {
      nodes: [], couples: [], sibships: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    };
  }

  const result: LayoutResult = alignPedigree(pedigree);
  const idByIndex = pedigree.individuals.map(i => i.id); // 0-based index → id

  // ── Nodes ────────────────────────────────────────────────────────────────

  const half = c.nodeSize / 2;

  // Count occurrences of each individual across all slots.
  const idSlotCount = new Map<string, number>();
  for (let lev = 0; lev < result.n.length; lev++) {
    for (let slot = 0; slot < result.n[lev]!; slot++) {
      const baseIdx = Math.floor(result.nid[lev]![slot]!) - 1; // 1-based → 0-based
      const id = idByIndex[baseIdx]!;
      idSlotCount.set(id, (idSlotCount.get(id) ?? 0) + 1);
    }
  }

  const nodes: NodeGeometry[] = [];
  for (let lev = 0; lev < result.n.length; lev++) {
    for (let slot = 0; slot < result.n[lev]!; slot++) {
      const baseIdx = Math.floor(result.nid[lev]![slot]!) - 1;
      const ind = pedigree.individuals[baseIdx]!;
      const cx = result.pos[lev]![slot]! * c.slotWidth;
      const cy = lev * c.rowHeight;
      nodes.push({
        id:          ind.id,
        level:       lev,
        slot,
        cx,
        cy,
        half,
        sex:         ind.sex,
        affected:    ind.affected,
        carrier:     ind.carrier  ?? false,
        deceased:    ind.deceased ?? false,
        proband:     ind.proband  ?? false,
        isDuplicate: (idSlotCount.get(ind.id) ?? 1) > 1,
      });
    }
  }

  // ── Couple edges ─────────────────────────────────────────────────────────

  // Build a fast lookup: (level, slot) → node geometry.
  const nodeAt = new Map<string, NodeGeometry>();
  for (const n of nodes) nodeAt.set(`${n.level}-${n.slot}`, n);

  const couples: CoupleGeometry[] = [];
  for (let lev = 0; lev < result.n.length; lev++) {
    for (let slot = 0; slot < result.n[lev]! - 1; slot++) {
      const sp = result.spouse[lev]![slot]!;
      if (sp === 0) continue;
      const left  = nodeAt.get(`${lev}-${slot}`)!;
      const right = nodeAt.get(`${lev}-${slot + 1}`)!;
      couples.push({
        leftId:  left.id,
        rightId: right.id,
        kind:    sp === 2 ? "consanguineous" : "couple",
        x1:      left.cx + half,
        x2:      right.cx - half,
        y:       left.cy,
      });
    }
  }

  // ── Sibship edges ────────────────────────────────────────────────────────

  const sibships: SibshipGeometry[] = [];
  for (let lev = 1; lev < result.n.length; lev++) {
    // Group slots by fam value.
    const groups = new Map<number, number[]>(); // fam (1-based) → child slots (0-based)
    for (let slot = 0; slot < result.n[lev]!; slot++) {
      const f = result.fam[lev]![slot]!;
      if (f === 0) continue;
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f)!.push(slot);
    }

    for (const [f, slots] of groups) {
      const leftParentSlot  = f - 1; // 0-based
      const rightParentSlot = f;     // 0-based

      const leftParentPos  = result.pos[lev - 1]![leftParentSlot]!;
      const rightParentPos = result.pos[lev - 1]![rightParentSlot]!;

      const coupleX = (leftParentPos + rightParentPos) / 2 * c.slotWidth;
      const coupleY = (lev - 1) * c.rowHeight;
      const sibBarY = (lev - c.sibBarFactor) * c.rowHeight;
      const childY  = lev * c.rowHeight;
      const childXs = slots.map(s => result.pos[lev]![s]! * c.slotWidth);

      sibships.push({ coupleX, coupleY, sibBarY, childXs, childY });
    }
  }

  // ── Bounding box ─────────────────────────────────────────────────────────

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.cx - half < minX) minX = n.cx - half;
    if (n.cx + half > maxX) maxX = n.cx + half;
    if (n.cy - half < minY) minY = n.cy - half;
    if (n.cy + half > maxY) maxY = n.cy + half;
  }
  if (nodes.length === 0) { minX = minY = maxX = maxY = 0; }

  return {
    nodes,
    couples,
    sibships,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}
