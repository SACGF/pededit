/** Horizontal distance (px) between adjacent slot centres. */
export const SLOT_WIDTH = 80;

/** Vertical distance (px) between generation row centres. */
export const ROW_HEIGHT = 120;

/** Width and height (px) of the symbol bounding box. */
export const NODE_SIZE = 40;

/**
 * Fraction of ROW_HEIGHT at which the sibship bar is drawn between
 * generations. 0.5 = exactly midway (= sibBarY = (level - 0.5) * ROW_HEIGHT).
 */
export const SIB_BAR_FACTOR = 0.5;

/**
 * Height (px) a couple line rises to pass over an intermediate partner when
 * someone has three or more partners. Must clear NODE_SIZE / 2.
 */
export const COUPLE_HOP = 28;

/** Extra rise (px) for each additional slot a hop passes over. */
export const COUPLE_HOP_STEP = 10;

/** Distance (px) from a node edge at which a hopping couple line turns upward. */
export const COUPLE_HOP_INSET = 10;

/**
 * Inset (px) taken off for each additional slot a hop passes over, so two
 * hops from the same person on the same side (five or more partners) rise at
 * different x instead of sharing one riser. Wider hops turn up closer to the
 * symbol: they rise higher, so they nest outside the narrower hop instead of
 * crossing it, and stay clear of the sibship drop at the slot midpoint.
 */
export const COUPLE_HOP_INSET_STEP = 4;

/** Smallest inset (px) a hop gets, however wide. */
export const COUPLE_HOP_INSET_MIN = 3;

/**
 * Rise of the dashed arc joining two copies of one person above the symbol
 * tops, as a fraction of the gap between a symbol top and the sibship bar
 * above its row. R's plot.pedigree rises half a row, into the bar; staying
 * below it keeps the arc from reading as part of the bar.
 */
export const DUPLICATE_ARC_BULGE = 0.7;
