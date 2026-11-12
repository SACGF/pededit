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
  drag handling (drag end pins every dragged node, one undo step), pane
  click clears selection. New individuals are added from the Toolbar and
  hover pill, not by clicking the canvas.
- Multi-select (#21): the store's `selectedIds` is the selection, and the
  canvas copies it onto each node's React Flow `selected` flag (every copy
  of a selected person), which is what makes React Flow drag the selected,
  draggable nodes together and snap the group's delta rather than each
  node. React Flow's own select changes are dropped except inside a
  rubber band (Shift+drag, `onSelectionStart` / `onSelectionEnd`, added to
  the selection at the end); clicks select through `PedigreeSymbolNode`
  (Shift / Ctrl / Cmd toggles). Pressing on an unselected person selects
  them alone on pointerdown, before React Flow collects the drag items,
  so dragging them does not take an old selection along. The hover pill
  and more menu are portals whose React events bubble to the node, so the
  node checks DOM containment before treating an event as a click on the
  symbol. React Flow's box round a finished selection is hidden in
  `index.css`, and its delete key is off (the store deletes).
  `selection.ts` has the batch lock counts used by the more menu's
  "N selected" section and the edit panel's `SelectionPanel`.
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
  The items are `MoreMenuItems`, so the right-click menu shows the same list:
  add new items there, not in `MoreMenu`.
- `CanvasContextMenu.tsx` — the right-click menu (#95), opened by
  `PedigreeCanvas`'s `onNodeContextMenu` / `onEdgeContextMenu` at the cursor
  (a Radix `PopoverAnchor` on a fixed zero-size span). A person gets
  `MoreMenuItems`; a couple line gets `CoupleMenuItems` (consanguinity,
  add existing child, childless mark). The browser menu is suppressed only
  on nodes and couple lines, and not while picking. Couple edges carry
  `partnershipId` in their data and draw a wide transparent stroke so the
  2px line can be hit. Radix's outside-click dismissal never fires for
  presses on the canvas (React Flow stops the mouse events the Popover waits
  for, `deferPointerDownOutside`), so `PedigreeCanvas` closes the menu itself
  on a pointerdown or wheel outside it. The harness drives it with
  `--right-click`.
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

- `onset.ts` — age of onset (#93): `Individual.onset` for the affected
  status and `Individual.tagOnset` per quadrant tag, both free text since
  onset is often known only as "40s" or "childhood". `onsetsOf` is the one
  reader and skips values that no longer apply (not affected, tag not
  carried, not a quadrant tag), so the panel, canvas and exports agree. The
  store also deletes them when the tag is untagged or deleted, or the
  person is set unaffected. Edited in the panel next to "Affected" and
  under each ticked quadrant tag row of the legend. Drawn under the symbol
  as "onset 40s" or "BC 45y" (tag abbrev, cut before the age is).

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
- `relationship.ts` — `nameRelationship` (#90), the plain-language name for
  any two people ("great-aunt", "half first cousin once removed", "identical
  twin brother"), shown by the pair panel (`components/SelectionPanel.tsx`)
  when exactly two are selected. It reads the closest common ancestors, then
  names the pair only if the kinship that relationship implies equals the
  engine's kinship; any second line of descent, inbred ancestor or
  monozygotic twin up the tree makes them differ, and then there is no name,
  only the coefficient and degree. That check is what keeps it honest, so do
  not relax it to "name the closest path". `pairLabels` names the two people
  (name, else "the unnamed female", else selection order).
- `consanguinity.ts` — `consanguinityTest`, the one rule for a double couple
  line (#85), shared by the canvas, the legend and both SVG exporters. The
  line is double when the couple's kinship is above 0, so it follows blood:
  an adopted-in partner is not related. `Partnership.consanguineous` is only
  an override on top, for a couple known to be related whose common
  ancestors are not drawn, and only the explicit controls write it
  (`setPartnershipConsanguineous`): the panel's "Consanguineous with"
  checkbox and the "Consanguineous" toggle in the more and right-click menus
  (#92), which all read `coupleConsanguinity` and are ticked and disabled
  when the kinship already relates the couple. Do not set it when creating a
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
- `collapse.ts` — hidden descendants (#94). `Individual.descendantsHidden`
  hides everyone below that person (by any line, so a child of the hidden
  branch and a visible cousin goes too) and partners who married into the
  hidden part only (`withMarriedInPartners` in `removal.ts`, shared with
  remove with descendants). `drawnPedigree` / `collapseInfo` give the
  stripped copy, cached per pedigree object and returning the input itself
  when nothing is hidden. Everything that draws calls it at its entry point
  (`layoutToFlow`, `lintFlow`, `Legend`, the export key, `exportSvg`,
  `exportUShapeSvg`, `deidentify`), so the layout runs on drawn people only
  and nothing downstream needs to know. A new drawing path must do the same.
  Data exports (JSON, PED, CSV) keep everyone. `collapseInfo(...).branches`
  maps each drawn collapsed person to the hidden people under them, the
  count for a collapsed-branch node (#1). A stale flag on someone with no
  descendants is dropped from the drawn copy, so the mark (a boxed "+" off
  the symbol's lower right, `COLLAPSED_MARK`) only shows when something is
  hidden; the flag on a drawn individual is the test for drawing it. A
  derived copy of a drawn pedigree (de-identified names) must go through
  `asDrawn`, or its collapsed people have no descendants left and lose the
  mark. The store's `mutate` reveals a branch when an edit would add or move
  someone into it (`rootsHidingNew`), so "add child" to a collapsed person
  never makes the child vanish; only `setDescendantsHidden` hides people.
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
in the data, the edit panel and CSV). After it, one line per age of onset
(#93, `onsetLines`): these do reach the sibship bar of the person's own
children, so when someone has an onset their detail block gets a white
backing (canvas div background, a `<rect>` in the export's labels group,
which `exportLint` ignores) and the bar shows a gap under the text rather
than running through it. The canvas (`PedigreeSymbolNode`),
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
- Pedigree numbers (#8, "II-3"): `pedigreeNumbers(pedigree)` in
  `layoutToFlow.ts` (counting and Roman numerals in `numbering.ts`) numbers
  the drawn pedigree from the same `alignPedigreeByFamily` layout the
  canvas and SVG export draw, row by row in slot order, skipping the
  lineless copies the canvas leaves out. Pins do not renumber: a dragged
  person keeps their layout number. Hidden people (#94) get none, and a
  generation with nobody drawn is not counted, so there are no gaps. Never
  stored. With `canvasSettings.showNumbers` the number goes before the name
  (`nameLabelText`) and wraps with it, on the canvas, in both SVG exporters
  and in the lints, so it adds no line of its own; `RFNodeData.labelText`
  is the wrapped text, which `isLabelCut` compares against. The U-shape
  uses the standard figure's numbers so the two exports agree. Tests:
  `__tests__/numbering.test.ts`.

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
