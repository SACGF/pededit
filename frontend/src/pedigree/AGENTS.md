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
- The minimap (#6) draws each person with the canvas's own `SymbolShape` and
  `DeceasedSlash`, at NODE_SIZE inside a scaled `<g>`, so new symbol features
  reach it for free. A scoped `<style>` makes black strokes (and the white
  slash over an affected fill) a 1px non-scaling hairline, since 2px scaled
  by about 0.2 vanishes. Left out on purpose, being unreadable at that size:
  the "SB" / "ECT" caption (`caption={false}`), the annotation row, names
  and the proband arrow. Its lines stay plain (no hops, twin marks, dashed
  adoption drops or childless marks).
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
  there, and longer file ids to the slot width, so they do not overlap.
  Unnamed people have no label in production.
- `labels.ts` — name labels wrap to the slot width (#68): `wrapLabel` gives
  at most two lines, cut with an ellipsis, from an estimated 5.8px per
  character; `layoutToFlow` puts the lines on the node data (`nameLines`),
  `svgExporter` writes one text element per line with the full name in a
  `<title>`, and the U-shape wraps at its widest slot. The `labels-overlap`
  lint code uses the same estimate, so names fit by construction and it
  mainly catches dragged nodes. Slots are never widened for labels: the
  layout is in slot units.
  `canvasSettings.nameLabels` "truncate" (Settings, "Truncate long names")
  gives one line on the canvas only; exports always wrap, because a file
  cannot be hovered.
- Reading a cut name: the full name is repeated under the hover pill, which
  sits on top of the name label. A cut label (`data-name-cut`) also takes
  the mouse itself: hovering it shows the name alone, without the pill
  buttons, since a pill opening under the cursor turns a click on the name
  into a click on a button. A `title` attribute on the label does nothing
  while it has `pointer-events: none`, which is how the first version of
  #68 shipped a tooltip that never appeared.
- `edges/SibshipEdge.tsx` — looks up live node positions with `useNodes` so
  the sibship bar follows dragged nodes. The lines come from
  `sibshipPath.ts`, shared with the minimap and `svgExporter`: the bar sits
  halfway to the highest child and every child gets its own drop, so a child
  pinned off its siblings' row is still reached. Bars of different couples
  that would run along one line each get their own height (#80,
  `sibshipBarOffsets`): this happens whenever a row of children is wider
  than the row of their parents, so each sibship sits to one side of its
  parents. Offsets only lower a bar (labels hang above the halfway line),
  and the order is chosen so drops cross other bars as little as possible.
  `layoutToFlow` puts the offset on the edge data (`barOffset`), so during a
  drag the heights are as of the last layout; `svgExporter` calls the same
  function. The U-shape export has its own geometry and does not use it. `CoupleEdge` and
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

- `parents.ts` and `PickingBanner.tsx` — linking a child to existing
  parents (#36). The store's `picking` state turns node clicks into picks
  (`PedigreeSymbolNode` calls `pickIndividual` first and only selects when
  it returns false; the hover pill hides while picking). `setParentsProblem`
  is the one rule list (self, descendant, pregnancy, two of the same known
  sex); the store's `setParents` attaches to the parents' existing
  partnership or creates one (father role first), a single parent gets a
  placeholder partner, and a
  re-parented child leaves their old twin set. The banner is a React Flow
  `Panel` with a name search for people off screen. Escape cancels.
- `partners.ts` — linking two existing people as partners (#84), the third
  picking kind (`{ kind: "partner" }`, one click applies). `linkPartnerProblem`
  is the one rule list (self, already partners, pregnancy, two of the same
  known sex). Relatives are deliberately not refused, parent and child
  included: inbred pedigrees are the reason the feature exists. The store's
  `linkPartner` makes a childless partnership, father role first, and
  stores nothing about their being related (see `consanguinity.ts`). A
  cross-generation link draws
  the older partner twice with the dashed arc, as kinship2 does; that is the
  layout, not a bug in the link.
- `relatedness.ts` — what the edit panel's Relatedness section says (#32):
  `formatCoefficient` (a fraction with its decimal up to a denominator of
  256, a decimal alone beyond), `degreeOfRelationship` (1/4 first degree,
  halving per degree, "between" when it lands in a gap) and `relatednessOf`.
  The numbers come from the layout engine's `kinshipCoefficients`, through
  `kinshipOf`, which caches the matrix per pedigree object (every edit makes
  a new object, so the canvas, legend and panel share one computation), and
  `kinshipXOf` for the X-linked values (#87). Those are NaN when they depend
  on an unknown sex, and `formatCoefficient` writes NaN as "0", so the panel
  checks for NaN first. The coefficients are never stored, and since they
  are cached per object, a test that mutates a pedigree after reading it
  must build a fresh one. The section appears for anyone who is
  inbred or has a partner, since each couple carries the double-line
  checkbox.
- `consanguinity.ts` — `consanguinityTest`, the one rule for a double couple
  line (#85), shared by the canvas, the legend and both SVG exporters. The
  line is double when the couple's kinship is above 0, so it follows blood:
  an adopted-in partner is not related. `Partnership.consanguineous` is only
  an override on top, for a couple known to be related whose common
  ancestors are not drawn, and only the panel's checkbox
  (`setPartnershipConsanguineous`) writes it. Do not set it when creating a
  partnership: a stored flag does not follow later edits, which is why
  `linkPartner`, `setParents` and PED import stopped writing it. Pedigrees
  saved before #85 may carry the flag on couples who are related anyway; it
  is harmless there and shows as a ticked, editable checkbox only if a later
  edit removes the relationship.
- `removal.ts` — branch removal sets (#34): descendants, ancestors,
  "remove with descendants" (which also takes partners who married in and
  have no partnership with anyone staying) and `removeIndividuals`, the one
  routine that strips a set of people out of a draft (partnerships, parentOf,
  twin sets, pins, unlocks). The store's `removeWithDescendants` /
  `removeWithAncestors` refuse an empty result with an error notice.
- `twins.ts` — twin sets (#11). `twinMembership` maps each drawable member
  to a set key and zygosity; `layoutToFlow` copies that onto the node data
  so `SibshipEdge` (and `svgExporter`, from the pedigree directly) can fork:
  in `sibshipPath.ts` every member's drop starts at the set's shared point
  on the bar (the mean of their x), and `twinForkMarks` gives the bar across
  monozygotic drops and the "?" for unknown zygosity, both at the points
  halfway down the drops as R's plot.pedigree does. The minimap stays plain.
  `twinSetProblem` is the one rule list (two members, same couple, same sex
  for monozygotic); the store's `setTwins` returns its message when refused.
- `adoption.ts` — adoption brackets (#12): the six bracket segments round
  the symbol box, drawn by `AdoptionBrackets` in `symbols.tsx` (so the
  legend gets them for free through `SymbolShape`), `renderAdoptionBrackets`
  in `svgExporter` (shared with the U-shape) and the export key. An
  adopted-in child's drop from the sibship bar is dashed: `sibshipPath.ts`
  gained `sibshipPaths`, which splits `sibshipSegments` into solid and dashed
  by the children's `dashed` flag, keeping the per-child order (couple drop,
  bar, then one drop per child). The minimap keeps everything solid.
- `childless.ts` — childless couple marks (#15): segments hung from the
  middle of the couple line (raised by the hop when the line hops; on a
  consanguineous double line, from the lower line). `layoutToFlow` puts
  `childless` / `childlessReason` on the couple edge data only when the
  partnership has no children (`activeChildless`), so a stale flag on a
  couple with children is never drawn; `edges/ChildlessMark.tsx` draws it on
  the canvas, `svgExporter` and `uShapeExporter` draw the same segments. The
  reason text shares the name-label row, so long reasons run into long names.

Below a symbol, top to bottom: "SB" / "ECT" caption, tag annotation row, name
(one or two lines), then one detail line: the free-text `Individual.age` when
set, otherwise the DOB (`detailLines` in `labels.ts`, #20). Only one line, on
purpose: a two-line name plus DOB plus age ran into the sibship bar halfway
to the next row, so the age replaces the DOB under the symbol (the DOB stays
in the data, the edit panel and CSV). The canvas (`PedigreeSymbolNode`),
`svgExporter` and `uShapeExporter` each offset these by hand, so change all
three together.

- Chart title (#20): `chartTitle(pedigree, name)` in `labels.ts` is the one
  rule. `Pedigree.chartTitle` wins when set, `""` meaning no title; absent
  falls back to the pedigree's name (`useAppStore.activeTitle`), except the
  default "Untitled pedigree". On the canvas it is an extra React Flow node
  (`nodes/ChartTitleNode.tsx`, id `__chart-title`, not selectable, no
  pointer events) added in `PedigreeCanvas` beside `rfNodes`, not by
  `layoutToFlow`, so lints and the minimap never see it; being a node keeps
  it in fit view. It sits `TITLE_GAP` above the highest symbol, as in the
  SVG export. The export dialog and `__pededit.checkExport()` pass the same
  string as `SvgExportOptions.title`.

Tests: `__tests__/layoutToFlow.test.ts`, `__tests__/tags.test.ts` and
`__tests__/symbols.test.tsx`.

- `layoutCost.ts` — duplicates, hops, arc length and width of a drawn
  layout, the regression guard for layout passes beyond kinship2 (#76, see
  `layout-engine/AGENTS.md`). `layoutToFlow`'s `improveLayout: false` gives
  the plain port to compare against.

## Render lint

`renderLint.ts` checks `layoutToFlow`'s output for drawings a reader would
misread (lines through symbols, lines to dropped nodes, children with no line
from their parents, couple lines between non-partners, sibship bars of two
couples along one line, overlapping symbols or labels).
The kinship2 oracle tests compare slots with R, so a bug in the duplicate
handling here passes them and is only caught by this lint. Its vitest keeps a
`KNOWN_BROKEN` list of examples; remove an entry when a fix makes it draw
cleanly. Also run by `__pededit.check()` and `scripts/browser/lint.mjs`.
