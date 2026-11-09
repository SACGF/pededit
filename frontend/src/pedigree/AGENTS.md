# frontend/src/pedigree/ — agent notes

The canvas renderer. Converts a `Pedigree` into React Flow nodes and edges and
draws NSGC symbols.

- `layoutToFlow.ts` — the bridge from `alignPedigree()` output to React Flow.
  Produces `pedigreeSymbol` nodes, `coupleEdge` / `consanguineousEdge` edges
  between partners, and one `sibshipEdge` per partnership with children.
  Applies `pinnedPositions` overrides. Read `claude/layout_engine_guide.md`
  first; the three rendering rules there are implemented here.
- Someone kinship2 places in several slots (cousin marriages, partners on
  both sides of the tree) is drawn once per slot that carries a line, each
  copy numbered, joined by a dashed `duplicateEdge` arc (R's `arcconnect`).
  Copies with no line at all are left out. Never merge or move copies to
  "tidy" them: an earlier version did, and drew 7 of the 13 historic and
  classic examples wrong while the R oracle tests still passed. A pin is
  stored per individual, so it moves only the copy laid out nearest to it.
  `svgExporter` takes its positions from `layoutToFlow` so it matches.
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
  move sib left/right, delete, and "Add children..." (count stepper, plus a
  partner choice when the person has several partnerships). The menu is
  about 600px tall, so it is capped at Radix's
  `--radix-popover-content-available-height` and scrolls; check it at
  1280x720 after adding items. It is portalled: when an item closes it, the
  element under the cursor vanishes and the pill gets no mouseleave, so the
  menu calls `onClose` and the pill schedules its own hide.
- The grey id under each symbol is dev-only; UUIDs are cut to 6 characters
  there so a batch of new children does not overlap. Unnamed people have no
  label in production.
- `edges/SibshipEdge.tsx` — looks up live node positions with `useNodes` so
  the sibship bar follows dragged nodes. The lines come from
  `sibshipPath.ts`, shared with the minimap and `svgExporter`: the bar sits
  halfway to the highest child and every child gets its own drop, so a child
  pinned off its siblings' row is still reached. `CoupleEdge` and
  `ConsanguineousEdge` (double line) connect partners. `DuplicateEdge` is
  the dashed arc between copies; its path is `duplicateArcD` in
  `couplePath.ts`, shared with the SVG exporter.
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
  within the pedigree's quadrant-style tags. Only the first four have a
  fixed quarter; someone carrying a fifth or later quadrant tag gets equal
  slices of just the quadrant tags they carry, so other people's symbols
  never gain empty wedges. An affected person with any quadrant sector keeps
  a black centre (the outline scaled by `AFFECTED_CORE_SCALE`, white rim),
  otherwise four tagged quarters hide the affected fill. `symbols.tsx`
  (`AffectedCore`) and `renderAffectedCoreSvg` draw it; keep them in step.
  Black is last in `TAG_PALETTE` so a new tag never defaults to it.
- `lifeStatus.ts` — pregnancy and pregnancy-loss symbols (NSGC 2008), shared
  with the exporters. Miscarriage, termination and ectopic replace the sex
  symbol with a small triangle; quadrant tags are clipped to that triangle.
  A pregnancy or loss can have no partner or children, enforced in the store
  actions and greyed out in the menus.
  Positions that depend on the status live here too, so canvas and exports
  agree: `carrierDot` (centred; below a shrunk, raised "P" on a pregnancy;
  low left in a triangle to clear the termination slash) and
  `symbolTopInset` (sibship drops end at a triangle's apex, not the box top).
  On an affected symbol the termination / stillbirth slash is redrawn in
  white clipped to the symbol outline, so it stays visible over the fill.
  The carrier dot is never drawn on an affected symbol (the edit panel says
  so); a gene result text tag ("+/-" built-in suggestion in `tags.ts`) is the
  way to show it.

- `childless.ts` — childless couple marks (#15): segments hung from the
  middle of the couple line (raised by the hop when the line hops; on a
  consanguineous double line, from the lower line). `layoutToFlow` puts
  `childless` / `childlessReason` on the couple edge data only when the
  partnership has no children (`activeChildless`), so a stale flag on a
  couple with children is never drawn; `edges/ChildlessMark.tsx` draws it on
  the canvas, `svgExporter` and `uShapeExporter` draw the same segments. The
  reason text shares the name-label row, so long reasons run into long names.

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
