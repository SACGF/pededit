# frontend/src/pedigree/ — agent notes

The canvas renderer. Converts a `Pedigree` into React Flow nodes and edges and
draws NSGC symbols.

- `layoutToFlow.ts` — the bridge from `alignPedigree()` output to React Flow.
  Produces `pedigreeSymbol` nodes, `coupleEdge` / `consanguineousEdge` edges
  between partners, and one `sibshipEdge` per partnership with children.
  Applies `pinnedPositions` overrides. Marks duplicates (same person in two
  slots) so both get a superscript. Read `claude/layout_engine_guide.md`
  first; the three rendering rules there are implemented here.
- `constants.ts` — SLOT_WIDTH 80, ROW_HEIGHT 120, NODE_SIZE 40. The layout
  engine's `pedigreeToGeometry` and the SVG exporters use the same numbers;
  change them together.
- `PedigreeCanvas.tsx` — the React Flow instance, custom always-fit minimap,
  drag handling (drag end pins the node), click to select, pane click clears
  selection. New individuals are added from the Toolbar and hover pill, not by
  clicking the canvas.
- `nodes/symbols.tsx` — the SVG for square / circle / diamond, affected fill,
  deceased slash, proband arrow, carrier dot, tag quadrants and annotation row.
- `nodes/PedigreeSymbolNode.tsx` — wraps the symbol with hover pill, more menu,
  name/DOB labels and pin indicator.
- `nodes/HoverPill.tsx` — add parents / child / sibling / partner buttons.
- `nodes/MoreMenu.tsx` — affected, deceased, proband, sex, lock/unlock,
  move sib left/right, delete.
- `edges/SibshipEdge.tsx` — looks up live node positions with `useNodes` so
  the sibship bar follows dragged nodes. The lines come from
  `sibshipPath.ts`, shared with the minimap and `svgExporter`: the bar sits
  halfway to the highest child and every child gets its own drop, so a child
  pinned off its siblings' row is still reached. `CoupleEdge` and
  `ConsanguineousEdge` (double line) connect partners.
- `snap.ts` — snap to grid. With snap on, `layoutToFlow` and `svgExporter`
  round every node to the grid, auto-placed ones included, so a dragged node
  can line up with them. Whole rows round together (couple lines stay flat)
  and auto-placed neighbours keep at least a symbol's width apart on coarse
  grids. Compact rows (84px) are not grid multiples, which is why rounding
  happens at render time rather than through grid-friendly spacing: the grid
  size is user-set (4 to 80), so no fixed spacing fits every grid. Pins are
  stored on the grid in normal spacing (`pinIndividual`); because the compact
  scales are below 1, a compact drop unscaled, rounded and scaled back
  rounds to the same compact grid point. Background dots follow the grid,
  every nth point when the grid is under 10px; React Flow centres a dot in
  its pattern tile, so `PedigreeCanvas` offsets it by half a tile.
- `tags.ts` — framework-free tag geometry and palette shared with the
  exporters and the legend. Quadrant sector is determined by the tag's order
  within the pedigree's quadrant-style tags.
- `lifeStatus.ts` — pregnancy and pregnancy-loss symbols (NSGC 2008), shared
  with the exporters. Miscarriage, termination and ectopic replace the sex
  symbol with a small triangle; quadrant tags are clipped to that triangle.
  A pregnancy or loss can have no partner or children, enforced in the store
  actions and greyed out in the menus.

Below a symbol, top to bottom: "SB" / "ECT" caption, tag annotation row, name,
DOB. The canvas (`PedigreeSymbolNode`), `svgExporter` and `uShapeExporter`
each offset these by hand, so change all three together.

Tests: `__tests__/layoutToFlow.test.ts`, `__tests__/tags.test.ts` and
`__tests__/symbols.test.tsx`.

## Render lint

`renderLint.ts` checks `layoutToFlow`'s output for drawings a reader would
misread (lines through symbols, lines to dropped nodes, children with no line
from their parents, couple lines between non-partners, overlapping symbols).
The kinship2 oracle tests compare slots with R, so a bug in the duplicate
handling here passes them and is only caught by this lint. Its vitest keeps a
`KNOWN_BROKEN` list of examples; remove an entry when a fix makes it draw
cleanly. Also run by `__pededit.check()` and `scripts/browser/lint.mjs`.
