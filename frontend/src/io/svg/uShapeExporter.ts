// ─────────────────────────────────────────────────────────────────────────────
// U-shape (horseshoe) pedigree export.
//
// Very wide pedigrees do not fit a journal figure. Bending the pedigree around
// a U lets the long bottom generation run up both arms and around the curve.
//
// The figure is a descendant chart of one founder couple. Each descendant is
// drawn with their partners beside them on the same track (unless partners
// are switched off), and each sibship hangs from the middle of its parents'
// couple line. Ancestors of married-in partners are not drawn.
//
// The whole thing is an ordinary tidy tree in a bent coordinate system:
//
//   u      position ALONG the U. 0 is the bottom centre, negative runs up the
//          left arm, positive runs up the right arm. Measured as distance on
//          the innermost track (the founder track).
//   depth  position ACROSS the U. Depth 0 (founders) is the innermost track,
//          and every generation sits one ringGap further out.
//
// The U itself is a short flat bottom (so the founders stand upright), a
// quarter circle on each side, and two vertical arms.
//
// So a "horizontal" sibship bar or couple line becomes a path that follows a
// track, and a "vertical" descent line becomes a segment along the local
// outward normal. Symbols and labels are rotated so "down" points outward.
//
// Outer tracks are longer than inner ones around the curve, so the same step
// in u covers more distance further out. The packing below measures spacing in
// real pixels on each node's own track, which lets the curve hold more nodes
// in the outer generations, where the nodes actually are.
// ─────────────────────────────────────────────────────────────────────────────
//
// The code is in ushape/: tree.ts builds the descendant tree, layout.ts
// packs it along the tracks (no SVG), connectors.ts draws the lines along
// them, render.ts draws the symbols and text and assembles the figure.
// This file is the public entry.
export { exportUShapeSvg, renderUShape } from "./ushape/render";
export { layoutUShape } from "./ushape/layout";
export type { UShapeLayout, UShapeNode } from "./ushape/layout";
