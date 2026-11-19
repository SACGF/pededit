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
import { buildPartnerSetFromPedigree, resolveCouple } from "./couples.js";
import { isAffected } from "./affected.js";
import { couplePortHeights, descentX, hopHeight, hopTurn, symbolSideDx } from "./hopLine.js";
import type { HopLineConstants } from "./hopLine.js";
import type { Pedigree, Individual, LayoutResult } from "./types.js";

// ── Rendering constants (match frontend/src/pedigree/constants.ts) ────────────

export interface RenderingConstants extends HopLineConstants {
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
  /**
   * Height (px) a couple line rises to pass over an intermediate partner when
   * someone has three or more partners. Must clear nodeSize / 2. Default: 28.
   */
  coupleHop: number;
  /** Extra rise (px) for each additional slot a hop passes over. Default: 10. */
  coupleHopStep: number;
  /**
   * How far a hopping line stays clear of the people it passes, as a fraction
   * of the gap between such a person and the partner beside them. Default: 0.25.
   */
  coupleHopClearance: number;
  /**
   * Distance (px) a hop's riser moves out for each additional slot it passes,
   * so two hops from one side (five or more partners) never share a riser.
   * Default: 4.
   */
  coupleHopNestStep: number;
  /**
   * Height (px) between neighbouring couple lines on one side of a symbol: a
   * line hopping to a further partner leaves this far above the line to the
   * nearer one. Default: 8.
   */
  couplePortStep: number;
  /**
   * Greatest height (px) above a symbol's centre at which a couple line
   * leaves its side; more lines than fit at couplePortStep close up. Default: 12.
   */
  couplePortMax: number;
  /** Added to couplePortStep and couplePortMax when a line on that side is a double line. Default: 4. */
  couplePortDoubleExtra: number;
}

const DEFAULT_CONSTANTS: RenderingConstants = {
  slotWidth: 80,
  rowHeight: 120,
  nodeSize:  40,
  sibBarFactor: 0.4,
  coupleHop: 28,
  coupleHopStep: 10,
  coupleHopClearance: 0.25,
  coupleHopNestStep: 4,
  couplePortStep: 8,
  couplePortMax: 12,
  couplePortDoubleExtra: 4,
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

/**
 * A couple line between two partners on one row. Usually a straight line
 * between the facing sides of two neighbouring symbols. When the partners are
 * not neighbours (someone with three or more partners) it hops over the
 * people between them: it leaves the side of each symbol (never its top) at
 * that end's port height, runs level to that end's turn, rises to
 * `y - hopHeight`, passes over, comes down and runs level into the other
 * partner's side. `points` is that route.
 *
 * A consanguineous couple is drawn as two lines either side of this one; for
 * a hop keep them parallel round the corners (risers moved apart as the line
 * moves up).
 */
export interface CoupleGeometry {
  /** Left partner's individual ID. */
  leftId: string;
  /** Right partner's individual ID. */
  rightId: string;
  /** "consanguineous" when the couple shares ancestry. */
  kind: "couple" | "consanguineous";
  /**
   * x where the line leaves the left partner: the right edge of the symbol
   * box, or for a hop leaving above the centre, the outline at that height.
   */
  x1: number;
  /** x where the line meets the right partner, as x1 on the other side. */
  x2: number;
  /** y of the row (centre of both nodes, which share the same y). */
  y: number;
  /**
   * 0 for an ordinary line. Otherwise the partners are not adjacent and the
   * line rises by this many px above the row to pass over the slot(s)
   * between them.
   */
  hopHeight: number;
  /** For a hopping line (hopHeight above 0), where it leaves each side and turns. */
  hop?: CoupleHop;
  /** The line as a polyline from (x1, …) to (x2, …): two points, or six for a hop. */
  points: [number, number][];
}

/** Where a hopping couple line leaves its partners and turns. */
export interface CoupleHop {
  /**
   * Height (px above the row) at which the line leaves the left partner's
   * side: 0 for their only line on that side, higher for each line on that
   * side to a further partner.
   */
  leftPort: number;
  /** As leftPort, for the right partner. */
  rightPort: number;
  /** x of the riser beside the left partner, where the line turns up. */
  leftTurnX: number;
  /** x of the riser beside the right partner, where the line comes down. */
  rightTurnX: number;
  /**
   * The further partner, the one beside the people passed over at the far end
   * of the run. The line to the couple's children hangs from the level
   * stretch on this side (SibshipGeometry.dropY).
   */
  far: "left" | "right";
}

/**
 * The three-segment T-shape that connects a parent couple to their children:
 *   1. Vertical drop from (coupleX, dropY) on the couple line down to the
 *      sibship bar.
 *   2. Horizontal bar spanning all children.
 *   3. Verticals from the bar down to each child's top edge.
 */
export interface SibshipGeometry {
  /**
   * x of the vertical drop: the middle of the two slots the couple marker
   * sits between, or the x of an only child within a quarter of a symbol of
   * it (`descentX`). When the parents' line hops over someone that is the
   * middle of the level stretch beside the further partner, never the
   * raised part.
   */
  coupleX: number;
  /** y of the parent generation centre. */
  coupleY: number;
  /**
   * y where the drop leaves the couple line: coupleY, or for a hopping line
   * the height at which it runs into the further partner's side (above
   * coupleY when that partner has another line on the same side).
   */
  dropY: number;
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
        affected:    isAffected(ind, pedigree),
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

  const partners = buildPartnerSetFromPedigree(pedigree);
  /** centre x of the slot at (lev, slot) */
  const xAt = (lev: number, slot: number) => result.pos[lev]![slot]! * c.slotWidth;
  const sexAt = (lev: number, slot: number) => nodeAt.get(`${lev}-${slot}`)!.sex;

  interface Pending {
    lev: number; leftSlot: number; rightSlot: number;
    /** the end beside the marker */ far: "left" | "right";
    geo: CoupleGeometry;
  }
  const pending: Pending[] = [];
  for (let lev = 0; lev < result.n.length; lev++) {
    for (let slot = 0; slot < result.n[lev]! - 1; slot++) {
      const sp = result.spouse[lev]![slot]!;
      if (sp === 0) continue;
      const rc    = resolveCouple(result, partners, lev, slot);
      const left  = nodeAt.get(`${lev}-${rc.leftSlot}`)!;
      const right = nodeAt.get(`${lev}-${rc.rightSlot}`)!;
      pending.push({
        lev, leftSlot: rc.leftSlot, rightSlot: rc.rightSlot,
        far: rc.rightSlot === slot + 1 ? "right" : "left",
        geo: {
          leftId:  left.id,
          rightId: right.id,
          kind:    sp === 2 ? "consanguineous" : "couple",
          x1:      left.cx + half,
          x2:      right.cx - half,
          y:       left.cy,
          hopHeight: rc.hop ? hopHeight(rc.rightSlot - rc.leftSlot, c) : 0,
          points:  [],
        },
      });
    }
  }

  // The lines on one side of a symbol each leave it at their own height,
  // nearest partner lowest.
  const ports = new Map<Pending, { left: number; right: number }>();
  for (const p of pending) ports.set(p, { left: 0, right: 0 });
  for (const end of ["left", "right"] as const) {
    const sides = new Map<string, Pending[]>();
    for (const p of pending) {
      const key = `${p.lev}-${end === "left" ? p.leftSlot : p.rightSlot}`;
      sides.set(key, [...(sides.get(key) ?? []), p]);
    }
    for (const side of sides.values()) {
      side.sort((a, b) => (a.rightSlot - a.leftSlot) - (b.rightSlot - b.leftSlot));
      const heights = couplePortHeights(side.length, side.some(p => p.geo.kind === "consanguineous"), c);
      side.forEach((p, i) => { ports.get(p)![end] = heights[i]!; });
    }
  }

  const couples: CoupleGeometry[] = [];
  const coupleAt = new Map<string, Pending>(); // "lev-leftSlot-rightSlot"
  for (const p of pending) {
    const g = p.geo;
    coupleAt.set(`${p.lev}-${p.leftSlot}-${p.rightSlot}`, p);
    if (g.hopHeight === 0) {
      g.points = [[g.x1, g.y], [g.x2, g.y]];
      couples.push(g);
      continue;
    }
    const span = p.rightSlot - p.leftSlot;
    const lx = xAt(p.lev, p.leftSlot), rx = xAt(p.lev, p.rightSlot);
    const leftTurn  = hopTurn(xAt(p.lev, p.leftSlot + 1) - lx, p.far === "left" ? 2 : span, c).turn;
    const rightTurn = hopTurn(rx - xAt(p.lev, p.rightSlot - 1), p.far === "right" ? 2 : span, c).turn;
    const { left: leftPort, right: rightPort } = ports.get(p)!;
    g.x1 = lx + (leftPort  ? symbolSideDx(sexAt(p.lev, p.leftSlot),  leftPort,  c.nodeSize) : half);
    g.x2 = rx - (rightPort ? symbolSideDx(sexAt(p.lev, p.rightSlot), rightPort, c.nodeSize) : half);
    g.hop = { leftPort, rightPort, leftTurnX: lx + leftTurn, rightTurnX: rx - rightTurn, far: p.far };
    const y1 = g.y - leftPort, y2 = g.y - rightPort, top = g.y - g.hopHeight;
    g.points = [
      [g.x1, y1], [g.hop.leftTurnX, y1], [g.hop.leftTurnX, top],
      [g.hop.rightTurnX, top], [g.hop.rightTurnX, y2], [g.x2, y2],
    ];
    couples.push(g);
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

      const middleX = (xAt(lev - 1, leftParentSlot) + xAt(lev - 1, rightParentSlot)) / 2;
      const coupleY = (lev - 1) * c.rowHeight;
      const sibBarY = (lev - c.sibBarFactor) * c.rowHeight;
      const childY  = lev * c.rowHeight;
      const childXs = slots.map(s => xAt(lev, s));

      // The marker sits between the further parent and the person beside
      // them, so coupleX is on the level stretch of a hopping line.
      let dropY = coupleY;
      const rc = resolveCouple(result, partners, lev - 1, leftParentSlot);
      const line = rc.hop ? coupleAt.get(`${lev - 1}-${rc.leftSlot}-${rc.rightSlot}`) : undefined;
      if (line?.geo.hop) dropY = coupleY - (line.far === "right" ? line.geo.hop.rightPort : line.geo.hop.leftPort);

      // Straight down to an only child who is all but under the middle.
      const coupleX = rc.hop ? middleX : descentX(middleX, childXs, c.nodeSize);

      sibships.push({ coupleX, coupleY, dropY, sibBarY, childXs, childY });
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
