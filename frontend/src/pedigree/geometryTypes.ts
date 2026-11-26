/**
 * Plain shapes the line and text geometry modules pass between them. They
 * live here, apart from any of those modules, so a module can name one
 * without importing another's code.
 */
import type { Individual } from "@pedigree-editor/layout-engine";

/** A straight line segment [x1, y1, x2, y2]. */
export type Segment = [number, number, number, number];

/** A symbol centre, with its sex when the line should leave from the symbol's outline. */
export interface LinePoint { x: number; y: number; sex?: Individual["sex"] }

/**
 * Something drawn that a couple label must keep off, as a box (x centre,
 * top, bottom, half width): the text under a symbol, a copy number, a
 * stretch of sibship line or of the dashed arc between two copies.
 */
export interface TextBlock { x: number; top: number; bottom: number; halfWidth: number; arc?: boolean }
