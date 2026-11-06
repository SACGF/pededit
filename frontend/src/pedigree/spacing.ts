import { SLOT_WIDTH, ROW_HEIGHT } from "./constants";

/** Scale applied to ROW_HEIGHT in compact layout mode. */
export const COMPACT_ROW_SCALE = 0.7;

/** Scale applied to SLOT_WIDTH in compact layout mode. */
export const COMPACT_SLOT_SCALE = 0.85;

/** Horizontal and vertical spacing (px) used to place slots on the canvas. */
export interface LayoutSpacing {
  slotWidth: number;
  rowHeight: number;
}

/** Spacing for the normal layout, or the tighter compact layout. */
export function layoutSpacing(compact = false): LayoutSpacing {
  return compact
    ? { slotWidth: SLOT_WIDTH * COMPACT_SLOT_SCALE, rowHeight: ROW_HEIGHT * COMPACT_ROW_SCALE }
    : { slotWidth: SLOT_WIDTH, rowHeight: ROW_HEIGHT };
}

/**
 * Pinned positions are stored at normal spacing. Map one into the canvas
 * space of the given spacing so a pinned node keeps its place relative to
 * the automatically laid out nodes in compact mode.
 */
export function scalePinnedPosition(
  pos: { x: number; y: number },
  spacing: LayoutSpacing,
): { x: number; y: number } {
  return {
    x: pos.x * (spacing.slotWidth / SLOT_WIDTH),
    y: pos.y * (spacing.rowHeight / ROW_HEIGHT),
  };
}

/** Inverse of scalePinnedPosition: canvas position back to normal spacing. */
export function unscalePinnedPosition(
  pos: { x: number; y: number },
  spacing: LayoutSpacing,
): { x: number; y: number } {
  return {
    x: pos.x * (SLOT_WIDTH / spacing.slotWidth),
    y: pos.y * (ROW_HEIGHT / spacing.rowHeight),
  };
}
