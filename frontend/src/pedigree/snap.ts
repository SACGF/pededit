import type { Pedigree } from "@pedigree-editor/layout-engine";
import { NODE_SIZE } from "./constants";

/**
 * Snap-to-grid rules shared by the canvas (layoutToFlow), the store and the
 * SVG exporter. Framework-free.
 *
 * When snap is on, every node is drawn on the grid, not only dragged ones:
 * auto-placed nodes are rounded at render time, so a dragged node can be
 * lined up under them. Rows are rounded as a whole (every auto-placed node in
 * a row gets the same y), so couple lines stay horizontal and a horizontal
 * drag keeps a node on its row whatever the row height (compact or not).
 */

type Pos = { x: number; y: number };

/** The grid size in force for a pedigree, or 0 when snap is off. */
export function activeSnapGrid(pedigree: Pedigree): number {
  const cs = pedigree.canvasSettings;
  if (!cs?.snapToGrid) return 0;
  return cs.snapGridSize > 0 ? cs.snapGridSize : 0;
}

/** Round one coordinate to the nearest multiple of grid (identity when grid is 0). */
export function snapValue(v: number, grid: number): number {
  if (grid <= 0) return v;
  const r = Math.round(v / grid) * grid;
  return r === 0 ? 0 : r; // no -0
}

export function snapPoint(p: Pos, grid: number): Pos {
  return { x: snapValue(p.x, grid), y: snapValue(p.y, grid) };
}

/**
 * Snap the positions of one layout, keyed by slot id "level-slot". Pinned
 * slots are rounded as they are. Auto-placed slots are rounded too, but
 * within a row they keep their left-to-right order and never end up closer
 * than they were or than a symbol's width, so a coarse grid cannot stack two
 * symbols on one grid point. Returns a new map; the input is not changed.
 */
export function snapSlotPositions(
  positions: Map<string, Pos>,
  pinned: Set<string>,
  grid: number,
): Map<string, Pos> {
  const out = new Map<string, Pos>();
  if (grid <= 0) {
    for (const [id, p] of positions) out.set(id, p);
    return out;
  }

  const rows = new Map<number, { slot: number; id: string; p: Pos }[]>();
  for (const [id, p] of positions) {
    if (pinned.has(id)) {
      out.set(id, snapPoint(p, grid));
      continue;
    }
    const [lev, sl] = id.split("-").map(Number);
    if (!rows.has(lev!)) rows.set(lev!, []);
    rows.get(lev!)!.push({ slot: sl!, id, p });
  }

  for (const row of rows.values()) {
    row.sort((a, b) => a.slot - b.slot);
    let prevOrig: number | undefined;
    let prevSnapped: number | undefined;
    for (const { id, p } of row) {
      let x = snapValue(p.x, grid);
      if (prevOrig !== undefined && prevSnapped !== undefined && p.x >= prevOrig) {
        const minGap = Math.ceil(Math.min(p.x - prevOrig, NODE_SIZE) / grid) * grid;
        x = Math.max(x, prevSnapped + minGap);
      }
      out.set(id, { x, y: snapValue(p.y, grid) });
      prevOrig = p.x;
      prevSnapped = x;
    }
  }
  return out;
}

/** Smallest spacing (canvas px) between background dots; finer grids show every nth point. */
export const MIN_DOT_GAP = 10;

/** Spacing of the canvas background dots for a grid: the grid itself, or a multiple of it. */
export function backgroundDotGap(grid: number): number {
  return grid * Math.max(1, Math.ceil(MIN_DOT_GAP / grid));
}
