/** Horizontal distance (px) between adjacent slot centres. */
export const SLOT_WIDTH = 80;

/** Vertical distance (px) between generation row centres. */
export const ROW_HEIGHT = 120;

/** Width and height (px) of the symbol bounding box. */
export const NODE_SIZE = 40;

/**
 * Height (px) a couple line rises to pass over an intermediate partner when
 * someone has three or more partners. Must clear NODE_SIZE / 2.
 */
export const COUPLE_HOP = 28;

/** Extra rise (px) for each additional slot a hop passes over. */
export const COUPLE_HOP_STEP = 10;

/**
 * How far a hopping couple line stays clear of the people it passes over, as
 * a fraction of the gap between such a person and the partner beside them.
 * The line turns up this far before the first of them and comes back down
 * this far after the last, so it is symmetrical about them. After coming down
 * it runs level into the further partner's side, and the line to the couple's
 * children hangs from the middle of the gap, on that level stretch.
 */
export const COUPLE_HOP_CLEARANCE = 0.25;

/**
 * Distance (px) added between a hop's riser and the people it passes over for
 * each additional slot it passes, so two hops from the same person on the
 * same side (five or more partners) rise at different x instead of sharing
 * one riser. The wider hop rises higher from further out, so it stays outside
 * the narrower one instead of crossing it.
 */
export const COUPLE_HOP_NEST_STEP = 4;

/**
 * Height (px) between neighbouring couple lines on one side of a symbol. A
 * line hopping to a further partner leaves the side this far above the line
 * to the nearer one, so the two run side by side and share nothing (#177).
 */
export const COUPLE_PORT_STEP = 8;

/**
 * Greatest height (px) above a symbol's centre at which a couple line leaves
 * its side: higher on a circle or a diamond is its top, where the line from
 * the parents lands. More lines than fit at COUPLE_PORT_STEP close up to stay
 * under it.
 */
export const COUPLE_PORT_MAX = 12;

/**
 * Added to COUPLE_PORT_STEP and COUPLE_PORT_MAX when one of the lines on that
 * side is a double line, so two double lines never read as four lines.
 */
export const COUPLE_PORT_DOUBLE_EXTRA = 4;

/**
 * Rise of the dashed arc joining two copies of one person above the symbol
 * tops, as a fraction of the gap between a symbol top and the sibship bar
 * above its row. R's plot.pedigree rises half a row, into the bar; staying
 * below it keeps the arc from reading as part of the bar.
 */
export const DUPLICATE_ARC_BULGE = 0.7;

/** Key row for the dashed arc joining copies of someone drawn more than once. */
export const DUPLICATE_LEGEND_LABEL = "Same person drawn more than once";
