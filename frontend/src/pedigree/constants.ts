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
 * Rise of the dashed arc joining two copies of one person above the symbol
 * tops, as a fraction of the gap between a symbol top and the sibship bar
 * above its row. R's plot.pedigree rises half a row, into the bar; staying
 * below it keeps the arc from reading as part of the bar.
 */
export const DUPLICATE_ARC_BULGE = 0.7;
