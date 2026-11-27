# frontend/src/pedigree/ — agent notes

The drawing of a pedigree: the scene, the canvas and the NSGC symbols.

- `scene.ts` (#146): `buildScene(pedigree, options)` turns the layout
  engine's output into a `Scene`, the whole drawing as plain data: `people`
  (slot id, symbol centre, glyph, pin, draggable), `couples` (`double` for a
  consanguineous line), `sibships`, `duplicates` (dashed arcs), `assisted`
  lines, the couple text on the couple lines' data, `aboveTop` and the
  `bounds` of everything drawn. Lines name their ends by slot id
  ("level-slot"). It applies `pinnedPositions` overrides and snapping. It
  imports nothing of React Flow (a test holds it and everything under
  `io/` and the lints to that), so the exports, the lints, de-identification
  and the dev hooks read it as it is, and it can be built in Node.
  Read `claude/layout_engine_guide.md` first; the three rendering rules
  there are implemented here.
- `sceneToFlow.ts`: the canvas's React Flow nodes (`pedigreeSymbol`,
  `collapsedBranch`) and edges (`coupleEdge` / `consanguineousEdge`,
  `sibshipEdge`, `duplicateEdge`, `assistedEdge`) for a scene. Only canvas
  code imports it. The export's size comes from `scene.bounds`; the canvas
  fits the view to the same box (with the title), so labels under the
  bottom row and arcs over the top one are in view.
- `chart/` (#147): the drawing as React components that take scene data
  and positions as props and return SVG: `symbols.tsx` (the symbol and
  its marks, the text under it), `PersonSymbol` (everything at one person,
  from the glyph), `CoupleLine`, `ChildlessMark`, `SibshipLines`,
  `AssistedLine`, `DuplicateArc`, `ConsanguinityLabel`, `ChartTitle`,
  `keySwatches` (the key's swatches), and `Chart`, a whole scene, which is
  what `exportSvg` draws (the one place a scene is mapped to the
  components for a file). Nothing under `chart/` imports React Flow or a
  store (`sceneImports.test.ts`), uses page CSS (presentation attributes
  only, as the export needs; `Chart`'s group classes are only for the
  export lint), or makes up its own ids: clip path and marker ids are props.
  The canvas's nodes and edges (`nodes/`, `edges/`) are wrappers that read
  live positions and the store and add what only the editor has: hover,
  selection, picking, the hover pill, the pin dot and problem marker, the
  wide invisible stroke that makes a couple line right-clickable (#95),
  and the `data-individual-id` / `data-partnership-id` the page checks
  select by. Draw something new in `chart/`, never in a wrapper.
- Someone kinship2 places in several slots (cousin marriages, partners on
  both sides of the tree) is drawn once per slot that carries a line, each
  copy numbered, joined by a dashed `duplicateEdge` arc (R's `arcconnect`).
  Copies with no line at all are left out. Never merge or move copies to
  "tidy" them: that draws many of the historic and classic examples wrong
  while the R oracle tests still pass. A pin is
  stored per individual, so it moves only the copy laid out nearest to it.
  `svgExporter` takes its positions from `buildScene` so it matches.
- `constants.ts` — SLOT_WIDTH 80, ROW_HEIGHT 120, NODE_SIZE 40, and the
  sizes more than one drawing shares (`LINE_WIDTH`, `CONSANGUINEOUS_GAP`,
  `DECEASED_OVERHANG`): the SVG exporters, the U-shape included, import
  them rather than repeat them. The layout engine's `pedigreeToGeometry`
  has its own copies of the first three; change them together.
- `PedigreeCanvas.tsx` — the React Flow instance, minimap,
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
  "N selected" section and the Person tab's `SelectionPanel`.
- The minimap (#6, #125) is React Flow's `<MiniMap pannable>`, on by
  default; Settings > "Show minimap" turns it off per browser (localStorage
  `showMinimap`, read in `CanvasPage`, only `"false"` hides it). It is always the
  whole pedigree with the viewport as a rectangle; dragging pans the main
  view and a click centres it (a press that moved is a drag, not a click).
  It is only for a sense of where you are, so `MinimapNode` draws each
  person as a plain square, circle or diamond (`glyph.shape`), black
  when `isAffected`. `MinimapEdges` draws plain couple lines (doubled when
  consanguineous), lines of descent and assisted lines, with no dashes,
  marks or text, from live node positions. React Flow's MiniMap has no slot
  for edges, so the first node's `nodeComponent` draws them before its own
  shape, which keeps them under every symbol. Its strokes are in flow units
  (4 on a 40px symbol) so they shrink with the symbol: 1px outlines on a
  wide pedigree would cover sub-pixel symbols and make people look black. The chart title node is in its bounds but not drawn.
- `personGlyph.ts` (#144): everything drawn at one person, as plain data
  (`PersonGlyph`: shape, paint, brackets, letter, slash, arrow, "?", "*",
  caption, annotation row, name and detail lines, white backings, copy
  number, group count). `buildScene` puts it on every person
  (`ScenePerson.glyph`), which holds nothing that repeats it (#174);
  `PedigreeSymbolNode`, `svgExporter`, the lints and the minimap read it there,
  and the U-shape export, which has its own layout, calls `personGlyph` per
  person. None of the three imports `symbolPaint`, `annotationRow`,
  `arrowKind`, `symbolSex` or the label functions (a test holds
  them to that), so a renderer cannot decide differently from the others.
  The symbol renderer (`SymbolShape`, `PersonMarks`) takes the
  glyph and never the person; a legend swatch, which has no pedigree, gets
  one from `standaloneGlyph`.
  Add a new mark or line of text for a person as a field of the glyph first.
  The SVG snapshots (#69) are the record of what is drawn; glyphs are not
  recorded as well (#175). The
  canvas node reads the pedigree from the store only for the problem
  marker. `nameLines` is what the canvas draws (one line when names are
  truncated), `figureNameLines` what a file writes (always wrapped).
- `chart/symbols.tsx` — the SVG for square / circle / diamond, affected fill,
  deceased slash, proband arrow, carrier dot, condition and trait sections and annotation row.
- `nodes/PedigreeSymbolNode.tsx` — wraps `PersonSymbol` with the hover
  pill, more menu, selection outline, pin indicator and problem marker.
- `nodes/HoverPill.tsx`: add parents / son / daughter / child of unknown
  sex / sibling buttons, and lock / unlock. The add buttons are
  `personAddActions` (`personActions.ts`), which the Person tab's row
  (`components/PersonActions.tsx`) renders too. They ask the stored
  pedigree, never the drawn one or the glyph: under a view filter a
  married-in partner's parents are not drawn but exist. The pill's buttons
  are in a child that NodeToolbar mounts only while the pill shows, so it
  can read the whole pedigree without costing the other nodes (#197).
  By touch (#169) there is no hover: a tap on the symbol opens the pill and
  it stays while the person is selected, closing when the selection clears.
  A finger selects and opens the pill on the click, not on `pointerdown` as
  the mouse does: a touch that starts on a person is as often a pan or a
  pinch, and the browser sends a click only for a tap. Below `lg` a tap
  shows no pill (#214): it opens the Person tab's sheet, which starts with
  the same buttons (`components/PersonActions.tsx`); a new one goes in
  `personAddActions`. A large touch screen keeps the pill. Do not lean on the mouse events a browser makes up after
  a tap: they differ between browsers (and chromium's emulation moves its
  mouse away again, which closed the pill at once). Its buttons are larger
  under `pointer-coarse:`. The pill is centred on the person and is wider
  than a phone, so `KeepOnCanvas` slides it sideways to stay inside the
  canvas (on any screen); it is not moved up when the person is at the
  bottom edge, where it would cover the symbol.
- The four invisible `Handle`s on a node only anchor edges. `index.css` gives
  them `pointer-events: none` (#169): React Flow marks handles `nopan` and
  lets them take the pointer, so a drag that began on one did not pan, and a
  finger on a chart fitted to a phone lands on one often.
- `nodes/MoreMenu.tsx` — affected, deceased (Mark living also clears the date of death, #103), proband, consultand, sex, lock/unlock,
  move sib left/right, delete, and "Add children..." (count stepper, plus a
  partner choice when the person has several partnerships). The menu is
  about 600px tall, so it is capped at Radix's
  `--radix-popover-content-available-height` and scrolls; check it at
  1280x720 after adding items. It is portalled: when an item closes it, the
  element under the cursor vanishes and the pill gets no mouseleave, so the
  menu calls `onClose` and the pill schedules its own hide.
  The items are `MoreMenuItems`, so the right-click menu shows the same list:
  add new items there, not in `MoreMenu`. A person's couples are one
  `CoupleMenuItems` group each (`personCouples`, donor pairs left out),
  the same items as the couple line's menu. Tag swatches are the key's
  `TagSwatchSvg`, so they follow black and white patterns. A tooltip or
  rule the Person tab shares lives with its module: `ENDED_TITLE`
  (`ended.ts`), `lifeStatusLocked` and its titles (`lifeStatus.ts`),
  `probandTitle` (`proband.ts`), `adjacentSibling` (`twins.ts`), the
  delete titles (`removal.ts`), the batch lock titles (`selection.ts`).
  With several people selected and the menu opened on one of them (#35),
  `MoreMenuItems` shows only the "N selected" section and `BatchMenuItems`
  (status, carrier status, tags, sex, delete, each acting on all of them);
  single-person items (add, proband, twins, adoption, couples...) are left
  out until one person is clicked. A new person item that is safe to apply
  to a group belongs in `BatchMenuItems` too.
  Files: `MoreMenu.tsx` (the popover and `MoreMenuItems`),
  `CoupleMenuItems.tsx`, `BatchMenuItems.tsx` (with the "Select" / "N
  selected" section), `AddChildrenPanel.tsx`, and `menuParts.tsx`
  (`MenuItem`, `MenuSection`, the tag swatch and `menuAction`, which runs
  an item's edit and closes the menu). The menus subscribe to the pedigree
  and the selection only and take their actions from
  `usePedigreeStore.getState()`, since actions never change.
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
  character; `buildScene` puts the lines on the glyph (`nameLines`),
  `svgExporter` writes one text element per line with the full name in a
  `<title>`, and the U-shape wraps at its widest slot. The `labels-overlap`
  lint code uses the same estimate, so names fit by construction and it
  mainly catches dragged nodes. Slots are never widened for labels: the
  layout is in slot units.
  `canvasSettings.nameLabels` "truncate" (Settings, "Truncate long names")
  gives one line on the canvas only; exports always wrap, because a file
  cannot be hovered.
- Notes on the chart: `Individual.notes` is drawn unless
  `canvasSettings.showNotes` is false ("Show notes on the chart", on by
  default: notes someone wrote are expected on the chart). They are the
  `notes` detail section, just above the pedigree number, so the canvas
  and every figure export draw them. De-identification drops the notes and
  turns the setting off unless the export's "Include notes" is ticked
  (`DeidentifyKeep.notes`). `noteLines` keeps the note's own line breaks and
  wraps each to the slot width. `canvasSettings.notesLength` "twoLines"
  (Settings, "Notes: Up to two lines", shown only with the notes on) stops
  them at `NOTE_LINES` (2) with an ellipsis (a two-line name, an age, three
  note lines and a number reach the symbol of anyone drawn directly below,
  which no lint catches) and keeps rows a fixed `rowHeight` apart. In
  full, the default (`noteLineLimit`), rows are not a fixed `rowHeight` apart: `rowYs` in `scene.ts`
  moves each row down until the text of anyone above clears the symbols
  under it by `ROW_TEXT_CLEARANCE` (room for the sibship bar to pass under
  the text). The canvas and the standard export both draw the scene, so
  they agree; the U-shape already spaces its tracks by the most lines
  anyone has. Pins are absolute, so a pinned person stays put while the
  rows move.
- Reading a cut name: the full name is repeated under the hover pill, which
  sits on top of the name label. A cut label (`data-name-cut`) also takes
  the mouse itself: hovering it shows the name alone, without the pill
  buttons, since a pill opening under the cursor turns a click on the name
  into a click on a button. A `title` attribute on the label does nothing
  while it has `pointer-events: none`.
- `lineGeometry.ts` (#143): what is drawn for a couple line
  (`coupleLineGeometry`: the path or the two paths of a double line, its hop,
  the childless and ended marks) and for a sibship (`sibshipLineGeometry`),
  from the edge data `buildScene` made and the positions of the symbols at
  the ends. The canvas edge components call it with live node positions and
  `svgExporter` with the laid out ones, so the two cannot disagree. A couple line runs between the facing edges of the
  two symbol boxes, never centre to centre. Add anything new on a line
  there, not in a renderer.
- **A couple line always leaves the side of a symbol, never its top** (#177):
  the top is where the line from the parents lands, and the maintainer
  treats this as fixed pedigree grammar. NSGC has no figure for someone with
  three or more partners, so a line that hops over a partner follows
  Madeline and pedigreejs: it leaves the same side as the line to the
  partner beside the person, a little higher (`couplePortHeights`, the
  nearest partner lowest), trimmed to the outline of a circle or a diamond
  (`symbolSideDx`), runs level until it is a quarter of a gap short of the
  first person it passes, then rises and crosses. It comes back down the
  same distance past the last of them (`hopTurn`), so the route round them
  is symmetrical, and runs level into the centre of the far partner's side.
  The route is square whatever shape it passes, like every other solid
  line; curves are kept for the dashed lines joining two copies of a person. The line to the couple's children hangs from that level
  stretch, in the middle of the gap, and so does a childless mark: a line of
  descent only ever leaves a level couple line (the maintainer's rule, and
  what Madeline draws). Nothing hangs from the raised part; the ended mark
  and a consanguinity label sit on it. `buildScene` puts the heights,
  shapes and turns on the couple line (`CoupleLineData.hopEnds`) and the
  drop on the sibship (`SibshipData.hopDrop`), both measured from the far
  partner, so the two stay joined while a node is dragged and the renderers
  need nothing new. The numbers (`hopHeight`, `couplePortHeights`, `hopTurn`,
  `symbolSideDx`) are the layout engine's (`layout-engine/src/hopLine.ts`),
  which `couplePath.ts` calls with this directory's constants, so the
  engine's `pedigreeToGeometry` describes the same route (#206).
- `edges/SibshipEdge.tsx` — looks up live node positions with `useNodes` so
  the sibship bar follows dragged nodes, and draws `chart/SibshipLines`. The segments come from
  `sibshipPath.ts`: the bar sits
  halfway to the highest child and every child gets its own drop, so a child
  pinned off its siblings' row is still reached. Bars of different couples
  that would run along one line each get their own height (#80,
  `sibshipBarOffsets`): this happens whenever a row of children is wider
  than the row of their parents, so each sibship sits to one side of its
  parents. Offsets only lower a bar (labels hang above the halfway line),
  and the order is chosen so drops cross other bars as little as possible.
  A bar is also lowered to pass under text that hangs past the halfway line
  (a tag row and a two-line name, a long detail block; `barsUnderLabels`,
  measured on the text as a figure writes it, names always wrapped). Where
  that cannot clear it (compact rows, or it would land on another bar) the
  bar stays and the text gets the white backing (`labelsBacked`), unless the
  text reaches the symbols below, which a backing would cover. An only child
  within a quarter of a symbol of the middle of its parents gets one
  straight line and no bar (`descentX`, layout engine).
  `buildScene` puts the offset on the edge data (`barOffset`), so during a
  drag the heights are as of the last layout; `svgExporter` reads the same
  edge data. The U-shape export has its own geometry and does not use it.
  `edges/CoupleEdge.tsx` (`CoupleEdge`, and `ConsanguineousEdge` for the
  double line) draws `chart/CoupleLine` between partners. `DuplicateEdge`
  is the dashed arc between copies; its path is `duplicateArcD` in
  `duplicateArc.ts`, shared with the SVG exporter.
- `duplicateArc.ts` — the dashed arc's path, and keeps it off other people (#192). The usual
  line is kept whenever it passes through nobody's symbol and nobody's text,
  so most arcs are R's. Otherwise `chooseArcRoute` (called from
  `buildScene`, result on the edge data) picks: for copies on one row a
  flatter arc (a smaller `bulge`) that passes under text hanging from the
  row above; for copies on different rows `legDx`, which sends the arc out
  of the upper copy's side, down the gap beside it and along above the lower
  row's symbol tops, where an arc on that row runs. The usual cross-row
  curve starts along the upper row, so it passes through everyone between
  the copies. Crossing a line costs nothing (any arc must); running along
  one does, which is what keeps a route off a sibship bar and off a couple
  line leaving the same side of the symbol. Routed arcs ending on one row
  each take their own height. The path is M, L and Q commands only:
  `pathPoints` samples it for the lints, the title and the couple labels,
  so a new command needs adding there. During a drag the route is as of the
  last layout, as the sibship bar heights are. The lints report what is
  left as `arc-through-symbol` and `arc-through-label` (`arcCollisions`,
  in `renderLint.ts`); text that hangs to within
  8px of the symbol tops the arc ends at is not counted, since no arc could
  pass under it (compact rows with four lines of text). The U-shape export
  has its own links and does not use any of this.
- `snap.ts` — snap to grid. With snap on, `buildScene` and `svgExporter`
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
  exporters and the legend. A section's place is set by the tag's order
  among the pedigree's `style: "quadrant"` tags (conditions and traits). How many sections a symbol has
  follows the number of conditions in use in NSGC 2022 (`sectionConditions`,
  `sectionLayout`): someone on the drawn pedigree (`drawnPedigree`, so not
  a collapsed branch) is affected with or a carrier of it. One is the whole
  symbol, two the left and right halves, three or four the quarters, in tag
  order among those in use. NSGC 2008 (and no notation saved) gives every
  defined condition its quarter so old pedigrees keep their look. Always go
  through `sectionConditions` / `sectorAngles`, or `conditionSection(tag)`
  for a swatch (it previews where an unused condition would go), never a
  quarter table or an index into `quadrantTags`, or a legend swatch will
  disagree with the symbol. Paint condition sections with `conditionPaint`
  / `conditionCarrierPaint`, not `tagPaint`: in 2022 black and white a
  single condition in use is solid black (NSGC shading), unless the tag
  has its own pattern or someone drawn is a plain black "affected,
  condition not recorded". The cache is per pedigree object, and the
  canvas (full pedigree) and exporters (drawn copy) get the same answer.
  The editor's per-condition controls (`conditionMode`) still count the
  conditions defined, so every defined condition can be recorded. Only the first four have a
  fixed section; someone with a fifth or later condition or trait gets equal
  slices of just the ones they have, so other people's symbols
  never gain empty wedges. An affected person with any section keeps
  a black centre (the outline scaled by `AFFECTED_CORE_SCALE`, white rim),
  otherwise four tagged quarters hide the affected fill. `symbols.tsx`
  (`AffectedCore`) draws it for the canvas, the legend and the exports.
  Black is last in `TAG_PALETTE` so a new tag never defaults to it.
- `tagFills.ts` — pattern fills and the monochrome setting (#67). A
  condition's or trait's `fill` (solid, diagonal, horizontal, vertical, crosshatch,
  dots, shade) is drawn in its colour on white; `canvasSettings.tagFills`
  "monochrome" draws every tag black, conditions and traits each with a pattern
  (their own, else the first free one in `MONOCHROME_PATTERN_ORDER`).
  Renderers never read `tag.color` directly: `symbolPaint` puts the resolved
  `color` / `fill` on each `Sector`, `annotationRow` on each item, and the
  legends call `tagPaint` (cached per pedigree object, like `kinshipOf`).
  Patterns are plain clipped paths, not SVG `<pattern>`, so svg2pdf draws
  them (checked by rendering an exported PDF with Ghostscript).
  `fillLayers` is the geometry and `RegionFill` in `chart/symbols.tsx` its
  one renderer (canvas, legend, export key, exports); per-condition carrier
  fills (#115) use it.
- `lifeStatus.ts` — pregnancy and pregnancy-loss symbols (NSGC 2008), shared
  with the exporters. Miscarriage, termination and ectopic replace the sex
  symbol with a small triangle; sections are clipped to that triangle.
  A pregnancy or loss can have no partner or children, enforced in the store
  actions and greyed out in the menus.
  Positions that depend on the status live here too, so canvas and exports
  agree: `carrierDot` (centred; below a shrunk, raised "P" on a pregnancy;
  low left in a triangle to clear the termination slash) and
  `symbolTopInset` (sibship drops end at a triangle's apex, not the box top).
  On an affected symbol the termination / stillbirth slash is redrawn in
  white clipped to the symbol outline, so it stays visible over the fill.
  The carrier dot (NSGC 2008 only, #115) is never drawn on an affected
  symbol (the Person tab says so); a carrier condition (#115) or a gene
  result text tag ("+/-" built-in suggestion in `tags.ts`) shows it.

- `proband.ts` — proband and consultand arrows (#99, NSGC 2008 Fig. 1):
  the proband's arrow has a bold "P" below-left of its tail, a consultand's
  (`Individual.consultand`, several allowed) has none, and someone who is
  both is drawn as the proband (`arrowKind`). `arrowGeometry` is shared by
  `ProbandArrow` everywhere it is drawn (the U-shape turns the P upright
  with its `upright` prop). The P ends 4px left of
  the tail so it clears the line of descent that drops half a slot gap left
  of a proband whose partner is on their left; a white box behind it gives
  any other line a gap instead of running through the letter.

- `gender.ts` — gender identity on the symbol (#26, NSGC 2022).
  `symbolSex(ind, pedigree)` is the one rule for which shape is drawn and
  `assignedAtBirthText` for the AMAB / AFAB / UAAB line (a `gender` section
  in `labels.ts` `detailSections`). Everything that draws a person's shape
  must call it rather than read `ind.sex`: `buildScene` puts it on the
  glyph as `shape` (`SymbolShape` draws it, the minimap picks its shape by it),
  which every drawing of a person goes through, and the key swatches.
  Nothing genetic may call it: layout, kinship, twins, PED and the CSV
  father/mother columns read `sex`. A non-binary person always gets the
  code (the diamond alone does not say their sex); a man who is male or a
  woman who is female gets none. Pregnancies and losses ignore any stored
  gender identity, and the Person tab hides the field for them.

- `familyHistory.ts` — "family history not known" (#100, NSGC 2008 Fig. 2):
  `Individual.familyHistoryUnknown` draws a bold "?" above the symbol,
  centred, or 9px left of centre when a line of descent comes into the top
  of the symbol (the person has parents drawn). Set from the Person tab
  checkbox and the more / right-click menus. `FamilyHistoryMark` on the
  canvas, the legend and both exports (turned with the symbol in the U-shape). It reaches about 13px above the row, inside the title gap.

- `notation.ts`: `canvasSettings.notation`, which NSGC edition is drawn.
  Absent means "nsgc2008" (#115): pedigrees saved before the setting keep
  their look. Everything made now gets "nsgc2022" through
  `withCurrentNotation`: `pedigreeApi.create`, `importPed` and `EXAMPLES`
  (JSON import keeps the file's). A new way of making a pedigree must call
  it too. Read the setting through `notationOf`; test pedigrees without
  `canvasSettings` are 2008.
- `conditions.ts` — affected and carrier per condition (#115). A condition
  is a `Tag` with `style: "quadrant"` that is not a trait (`isConditionTag`; `Tag.kind:
  "trait"`, #118, is a coloured section only: it takes a section in
  `sectionInfo` like a condition, is a plain tag in the store and menus,
  never affected, never solid black in monochrome). Test conditions with
  `isConditionTag` / `conditionTags`, never `style === "quadrant"`. A
  condition in `Individual.tags` is affected with that condition, in
  `Individual.carrierTags` a carrier of it. The plain flags are what the
  conditions do not say: `affected` is affected with something not
  recorded, `carrier` a carrier with no condition recorded. Recording or
  clearing a condition never sets or clears `affected` (#118). "Is this person affected?"
  is `isAffected` (layout-engine, re-exported here: the flag or any
  affected condition), used by PED/CSV, filters, sibling order, collapse
  and warnings; never read `ind.affected` for that. The plain Affected
  control's state (A, more menu, batch counts) is `affectedControlOn`: the
  flag, or with one condition, that condition. Every editor path
  (panel, more menu, batch, "A" shortcut, warning fixes)
  goes through `applyConditionState` / `applyAffected` / `applyCarrier`, so
  the rules live in one place: recording a carrier condition clears the
  plain carrier flag; with exactly one condition the plain Affected and
  Carrier controls of A, the more menu and batch record it; with two or
  more the menus ask per condition. The Person tab records a condition only
  in "Conditions and tags" (`components/ConditionsAndTags.tsx`, #136), at any
  number of conditions, and once any is defined its Status shows only the
  plain flags (`PlainStatusForm`, which sets the flag itself, never the one
  condition), so the two never record the same thing. A plain flag (alone,
  or beside recorded conditions) gets the "condition-not-recorded" warning
  with one fix per condition (`Problem.moreFixes`), built with
  `resolvePlainAffected` as one `updateIndividual` so a click is one undo
  step. Drawing is decided once in
  `symbolPaint` (tags.ts): sectors (carrier ones flagged, painted by
  `conditionCarrierPaint`: the condition's `carrierFill` when one is
  chosen in the tags dialog, else `carrierPaintFrom` from tagFills.ts; a
  chosen fill that `carrierFillClash` finds equal to an affected section,
  the plain black fill or the plain carrier's dots, as drawn now, so in
  black and white any section with that pattern, is drawn in the lighter
  carrier tint, and the dialog says so under the row), plus the 2022 dotted half for a plain
  carrier as the `PLAIN_CARRIER_TAG` sector, left off when the person's
  affected conditions cover the right half, which the Person tab then
  reports as not drawn), black base, black centre,
  2008 dot. The black base is `plainAffected` in 2022 (sectors over it, the
  black centre on top) and `affectedControlOn` in 2008, so with two
  conditions a 2008 person affected only with recorded ones has quarters on
  white, as NSGC 2008 shades a quadrant per condition. Canvas, both exporters and the legends read it; never
  test `ind.affected` / `ind.carrier` for drawing. `statusKeyRows` and
  `keyTagRows` (in `keyRows.ts`) work out the affected, carrier and tag rows of the key for
  `keyRows` (below).
- `keyRows.ts` (#148): the rows of the chart's key as plain data, for the
  legend on the Pedigree tab and for the key of the exports:
  `keyRows(pedigree, "legend" | "export")` gives the tag, symbol,
  relationship and clinical detail rows, each with a `kind`, a label and
  what its swatch shows. `chart/keySwatches.tsx` (`KeySwatch`) draws a
  row's swatch through a switch on its kind ending in a `never` check, so a
  new kind does not compile until it is drawn; the legend shows the swatch
  as it is and the export key (`exportKey.tsx`) scales it from the legend's
  24px symbols to its own 16px (tag swatches are already 16px). A new row for the key is a member of
  `KeyRow`, a line in `keyRows` and a place in `SYMBOL_ORDER` or
  `RELATIONSHIP_ORDER`, never a test of the pedigree in either renderer.
  The two lists differ on purpose, and every difference is in that file
  (`KEY_DIFFERENCES`, the two order tables, "Legend only" / "Export only"):
  the legend also explains the plain shapes and the plain couple line and
  lists unused tags; the export names a stillbirth and an ectopic pregnancy
  by their caption. The rows come in one order in both (#173: status, then
  the proband and consultand arrows, then family history, as NSGC's key
  reads), the legend's shapes first. `__tests__/keyRows.test.tsx` holds
  them to exactly those differences, order included, over every fixture
  and example.
- `evaluation.ts` — evaluation results and presymptomatic carrier (#101,
  #114). `Individual.evaluations` is a list of `{ result, detail,
  documented }`; `labels.ts` writes each as a detail section between onset
  and the pedigree number, up to two lines each because variant names
  rarely fit a slot. NSGC 2022 (default): "BRCA1 c.5266dupC +", detail then
  result, a cut keeps the result; an empty evaluation writes nothing.
  NSGC 2008: "E+ (BRCA1 c.5266dupC)", numbered E1, E2 per person only when
  there are several. The key row is "+/-" in 2022 (only when a result is
  recorded) and "E" in 2008. Any documented evaluation puts a "*" just right of
  the symbol's lower right corner (outside adoption brackets), canvas and
  both exporters. `Individual.presymptomatic` is a
  vertical line through the symbol, drawn inside `SymbolShape` (from
  `SymbolPaint.line`). It is not drawn on
  anyone `isAffected` (the flag or any condition), the same test as the
  "presymptomatic-affected" warning, so the warning never says a line is
  hidden that is in fact drawn. With no conditions defined the editor
  offers carrier and presymptomatic as one "Carrier" select; with
  conditions, Status has a "Presymptomatic" checkbox and carriers are per
  condition (#136). The store setters keep the plain carrier and
  presymptomatic exclusive; old data with only `carrier` loads unchanged. De-identified
  exports drop the evaluation detail and onset by default (`io/AGENTS.md`, `deidentify.ts`).

- `onset.ts` — age of onset (#93): `Individual.onset` for the affected
  status and `Individual.tagOnset` per condition, both free text since
  onset is often known only as "40s" or "childhood". `onsetsOf` is the one
  reader and skips values that no longer apply (not affected, tag not
  carried, not a condition), so the panel, canvas and exports agree. The
  store also deletes them when the tag is untagged or deleted, or the
  person is set unaffected. Edited on the Person tab next to "Affected" and
  beside each condition marked Affected in "Conditions and tags" (#136). Drawn under the symbol
  as "onset 40s" or "BC 45y" (tag abbrev, cut before the age is).

- `validation.ts` — editor warnings (#116): the rules only. It imports the
  data model, `graph.ts`, `conditions.ts` and the date helpers and nothing of the
  editor (no store, layout or React; a test holds it to that, #126), so the
  checks can run anywhere. `findProblems(pedigree)` runs `RULES` and gives
  `{ id, rule, severity, individualId | partnershipId, field, message,
  fix? }`. What the editor adds is in `components/problemList.ts`:
  `problemsOf(pedigree)` (once per pedigree object, WeakMap, so every canvas
  node can ask), `fieldProblems`, `problemSubject`, `problemTarget`,
  `adjacentProblem`. A new check is one `Rule` with an `individual` or
  `partnership` function returning a draft; `RuleContext` is the place for
  facts worked out once per pass (e.g. the condition count #115 needs).
  `field` must be a `ProblemField` that the Person tab wraps in
  `data-problem-field` (via `Field`'s `problemField` or `ProblemHighlight`),
  or the list cannot focus it. A fix is data (#126): `{ label, edit }`,
  where `edit` is a `FixEdit`, one named edit with its arguments
  (`{ op: "setDeceased", id, deceased: true }`, or `updateIndividual` with a
  patch). The store's `applyFix` / `applyFixes` make it through
  `applyFixEdit`, the one switch from an edit to a setter call. A fix that
  needs a new setter: add it to `FixActions`, a member to `FixEdit` and a
  case to `applyFixEdit`. Never put a function on a fix. Problems only advise:
  nothing may refuse a save or an edit because of one. Shown three ways:
  the field outline and message in `EditPanel`, the toolbar's
  `ProblemsMenu` (hidden at zero; a click selects the person, or a couple's
  first partner, and focuses the field), and a small "!" circle at the
  top left of the canvas node (`data-problem-marker`, filled for an
  error). The marker is drawn by `PedigreeSymbolNode` only, so
  exports never get it. Kept here, not as warnings: action
  refusals (picking, twins, swap sides notices), the PED export loss
  dialog, and display notes such as "carrier mark not drawn on an
  affected fill" (a plain carrier who is also affected gets the
  `affected-and-carrier` warning instead). Ages and dates are checked only
  where they parse.
  Dates are partial ("1950", "1950-03"), so date checks ask what is
  certain over every day a date could be (`dateRanges.ts`: `certainlyBefore`,
  `ageRange`, `minDaysApart`); a year of birth leaves an age a year either
  way. "Today" is a `findProblems` argument so tests pin it. Parent checks
  use genetic parents only: the child's partnership in `parentOf` (a donor
  is one, #45; a same-sex couple's child has one partner and a donor,
  #105), nobody for someone adopted in (#12), and the woman who carried the
  pregnancy (`carriedBy`) for "born after the mother died". A sperm donor's
  death is not checked against the birth. Free-text ages (#20) are checked
  only when they read as whole years (`ageInYears`: "34", "34y", "d. 72"),
  against the age at death, else on `clinicalDetails.recordedOn`, else
  today. The sibling order check runs only in "insertion" mode ("manual" is
  chosen on purpose, "birthDate" is already that order) and places siblings
  as `autohint` does (affected first, twin sets at their mean). Do not list
  the rules or fields here: `RULES` and `ProblemField` are the list.
  Fixes are drawn by one component, `components/ProblemFixes.tsx`, in the
  panel and the list alike. "Fix all like this" groups problems of the same
  rule offering a fix with the same label (`problemsLike`) and hands each
  one's own fix to the store's `applyFixes`, which runs them inside
  `groupEdits` so the undo snapshots fold into one. The list names people by pedigree number
  (`problemSubject`, "II-2, unnamed female"); hovering an item sets the
  store's `problemHighlightId`, a dashed outline on that node. F8 /
  Shift+F8 (`stepProblem`, `adjacentProblem`) go to the next / previous
  problem from the last one gone to, or from where it was when it has
  since been fixed.

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
  stores nothing about their being related (see `consanguinity.ts`).
  `personCouples(pedigree, id)` is every couple of one person, as the more
  menu, the Person tab and "Add children..." list them: relationships
  first, then donor pairs (`donorPair`), each with `childless` and the
  partner's `label` / `phrase` ("Partner 2 (male)" alone, "partner 2
  (male)" in a sentence), numbered in that order. `couplePartnerLabel`
  names a partner of one couple the same way seen from the other partner,
  and from the couple line numbers them by the side drawn on (1 is left).
- `personLabel.ts`: `personLabel(pedigree, id, style)`, the one way to name
  a person who may be unnamed: "this person" (the subject of a refusal),
  "unnamed" ("unnamed female", in a list or a pair) or `{ partner: n }`.
  The problems list and the PED warning add the pedigree number
  (`personSubject`, here too). A
  cross-generation link draws
  the older partner twice with the dashed arc, as kinship2 does; that is the
  layout, not a bug in the link.
- `relatedness.ts` — what the Person tab's Relatedness section says (#32):
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
  checkbox; a donor pair has no line, so it is not listed.
  Drawn on the figure only with `canvasSettings.showCoefficients` ("Show
  kinship and inbreeding coefficients" in Settings, off by default, #86):
  `inbreedingLabel` is the "F = 1/16" detail line under anyone whose
  parents are related and `kinshipLabel` the "φ = 1/16" that
  `consanguinityLabelText` writes above a related couple's double line,
  alone or after the words ("first cousins (φ = 1/16)"; a named
  relationship that already ends with the kinship, "siblings (3/8)", gives
  the number once). Both are autosomal, written with `briefCoefficient`,
  and never drawn for 0, so a couple marked consanguineous by hand gets no
  number. Both read `wholePedigree(pedigree)` (`collapse.ts`): the drawn
  pedigree can lack a couple's common ancestors under a view filter, and a
  number on the chart must not change with the view. The double line reads
  it too (`consanguinityTest`), so a related couple keeps their double line
  and φ when a view filter or a figure of the selected people (#215) leaves
  their common ancestors out. Since the label
  functions are shared, the canvas, both SVG exporters, the lints and the
  key (rows `inbreeding` and `kinship`, only when someone drawn has one)
  follow with no code of their own. `consanguinityWording` is the label
  without the number: what a de-identified export may leave out.
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
- `referenceRelatedness.ts` (#134): the Person tab's line for one person's
  relationship to each proband and to each consultand who is not a proband
  (so the consultands alone when nobody is proband; this differs from
  `referencePeople` in `viewFilters.ts`, which drops the consultands once
  there is a proband). `nameRelationship` names whichever of the pair is
  nearer the common ancestors, which is often the proband ("aunt"), so the
  panel goes through `relationshipTermFor`, which turns the term round to
  the selected person ("niece").
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
  `linkPartner`, `setParents` and PED import do not write it. Pedigrees
  saved before #85 may carry the flag on couples who are related anyway; it
  is harmless there and shows as a ticked, editable checkbox only if a later
  edit removes the relationship.
- `consanguinityLabel.ts` — the degree of relationship above a double line
  (#97, NSGC "if not obvious from the pedigree, state it above the line").
  `consanguinityLabelText` is the one rule: the couple's own
  `Partnership.consanguinityLabel` always (the only way to say anything for
  the manual override, whose common ancestors are not drawn); otherwise,
  with `canvasSettings.relationshipLabels` ("Name consanguineous
  relationships" in Settings, off by default), `nameCoupleRelationship`
  from `relationship.ts` ("first cousins", "uncle and niece", "double first
  cousins"). A couple more closely related than their name says (inbred
  ancestry, a second line of descent: `RelationshipName.extra`) keeps the
  name with their kinship after it, short for the figure ("siblings (3/8)",
  `briefCoefficient`: fractions to /64, else two significant figures); the
  panels say "and related in other ways too" instead. `wrapConsanguinityLabel`
  keeps that "(...)" on its own last line and cuts the name when both do not
  fit. Null, so nothing drawn, only when the closest common ancestors fit no
  single relationship (two people who are not a couple, or reached at
  different distances). Never drawn on a single line. `buildScene` puts the
  wrapped lines on the double edge's data (`consanguinityLabel`): wrapped to
  `consanguinityLabelRoom`, which keeps clear of what lands on each symbol
  top (the line of descent, the "?" of #100) and runs over a bare top; one
  line when rows are compact. A new mark above the symbol must be added
  there and to the lint. The text sits above the symbol tops and any
  deceased slash, or above the line where it hops higher.
  `chart/ConsanguinityLabel` and `svgExporter` (group `consanguinity-labels`)
  draw it from `consanguinityLabelBaselines`; both raise the chart title
  over a top-row label and over the dashed arc of someone drawn twice in
  the top row (#172), through one helper (`highestAboveSymbols` in `scene.ts`, passed as
  `chartTitleNode`'s `aboveTop` and to the export's `computeBounds`):
  anything new drawn above the top row's symbols belongs in it. The
  canvas lint checks it (`title-collides` in `renderLint.ts`, #188, with
  the title placed by `chartTitlePlace` in `labels.ts`, which
  `chartTitleNode` also uses). Placement (#109, `placeConsanguinityLabel`): `buildScene`
  hands it every obstacle near a label as a box (`TextBlock`): the text
  under each symbol as a figure writes it (`textBlockUnder` in
  `labelBlock.ts`; the canvas's is the same or shorter, a name cut to one line),
  copy numbers, sibship bars and drops, and the dashed arcs between copies.
  It tries the usual place, then slid along the line, then raised up to
  12px, then low between wide-apart symbols; then the same with the arcs
  allowed to pass behind a white backing (`backed`); otherwise the label is
  not drawn. That last fallback happens in compact rows, where a parent's
  two or more lines of text hang down to the symbol tops of the row below:
  siblings side by side under such a parent have no room anywhere
  (House Targaryen's Aegon and Shaera, the Habsburg uncle and niece). The
  result is `CoupleLineData.consanguinityLabelOffset`; the canvas, the
  export and `highestConsanguinityLabel` all read it. The render lint's
  `consanguinity-label-collides` checks the label against symbols, "?"
  marks, lines, the figure's text, copy numbers and dashed arcs (unless
  backed), compact rows included. The U-shape export has its own rule (`claude/export_u_plan.md`).
  Edited in the
  panel under the "Consanguineous with" checkbox (with a "Write <name>"
  button when the pedigree names the relationship) and "Text above line..."
  in the couple line's right-click menu.
- `graph.ts`: where questions about the family graph are answered. Ask
  it rather than walking `partnerships` and `parentOf`: `parentCoupleOf`
  (the couple someone is a child of; a child listed under two keeps the
  first), `couplesOf(pedigree, id, { donorPairs })` (say whether a
  `donorConception` pair counts; menus and forms about relationships leave
  them out, anything about who descends from whom keeps them), `partnerIn`,
  `childrenOf` (genetic children, as `parentOf` lists them) and
  `raisedChildrenOf` (adds a same-sex couple's donor-conceived children),
  `hasParents`, `descendantsOf`, `ancestorsOf`, `parentRoles` (father and
  mother of a couple, the man and the woman whichever way round they were
  recorded, a partner of unknown sex taking the role the other leaves; the
  CSV and PED exporters and the side filter use it) and `pairKey`.
  `fatherFirst` (`store/pedigree/draft.ts`) and the U-shape's root couple
  (`io/svg/ushape/tree.ts`) decide drawing order, not roles, and are
  separate. A frozen pedigree (everything immer produces) is
  indexed once in a `WeakMap`; any other (a draft, one being built, a
  drawn copy) is read directly each call, so changes made in place are
  seen. The layout engine has its own copies, since it is published on its
  own. Who is drawn under whom (`placementParentOf`) is a different
  question and stays with the layout engine.
- `removal.ts` — branch removal sets (#34): "remove with descendants" (which also takes partners who married in and
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
  (`buildScene`, `lintScene`, `Legend`, the export key, `exportSvg`,
  `exportUShapeSvg`, `deidentify`), so the layout runs on drawn people only
  and nothing downstream needs to know. A new drawing path must do the same.
  Data exports (JSON, PED, CSV) keep everyone. `collapseInfo(...).branches`
  maps each drawn collapsed person to the hidden people under them. A stale
  flag on someone with no descendants is dropped from the drawn copy.
- Collapsed-branch group symbols (#1), following NSGC 2008 Fig. 1 (a
  number inside a symbol means that many siblings; affected people are not
  grouped). For each drawn couple of a collapsed person, children who are
  affected or carriers (plain, of a condition, or presymptomatic;
  `drawnIndividually`) stay in
  the drawn copy as themselves, real selectable people, with their own
  partners and descendants hidden and their own partnerships dropped. The
  other children become one stand-in child (id
  `collapsed-branch:<partnershipId>`, `isBranchPlaceholderId`), never in the
  stored pedigree: sex male or female when all grouped children share it,
  unknown (diamond) otherwise, with the first grouped child's sibOrder and
  dob so it sits in that child's birth order place. No grouped children, no
  symbol (the branch is then shown again from the menu). Being an ordinary
  child, kinship2 lays it out and every renderer draws it and its descent
  line with no special geometry; `collapseInfo(...).placeholders` /
  `branchOf` say what it stands for (`children` is the number drawn inside,
  `hidden` everyone hidden under the couple for the tooltip, the collapsed
  partner or partners whose flag it clears). Each renderer adds only the
  count inside (`BranchCount`, turned with the symbol in the U-shape like the counts in the FAME figure, `claude/export_u_plan.md`). On the canvas it is its own node type
  (`collapsedBranch`), not selectable or draggable, so it needs
  `style.pointerEvents: "all"` or React Flow makes it click-through. Code
  that walks the drawn pedigree's people as people (legend sex rows,
  de-identified numbering, and #8's pedigree numbers) must skip the
  placeholders. Someone below two collapsed people (descendants who
  intermarry) is counted in both. A collapsed person whose every couple
  with children is gone from the drawing (the partner hidden under another
  collapsed person) has no symbol of their own. A derived copy of a drawn
  pedigree (de-identified names) must go through `asDrawn`, or the
  placeholders are taken for real people. Making a drawn affected child
  unaffected would hide them, so `rootsHidingNew` shows the branch instead.
  The store's `mutate` reveals a branch when an edit would add or move
  someone into it (`rootsHidingNew`), so "add child" to a collapsed person
  never makes the child vanish; only `setDescendantsHidden` hides people.
- `viewFilters.ts` — view filters (#4), saved in `Pedigree.filters`. A
  filter only decides who is drawn (`filterHidden`); `collapseInfo` adds
  those people to its hidden set, so they go exactly like a collapsed
  branch, and every drawn partnership (not only collapsed couples) whose
  children are not all drawn gets the #1 group symbol. A group made by the
  filter alone has `roots: []`: clicking it does nothing (its tooltip says to
  turn the filter off), unlike a collapsed one. The drawn copy drops
  `filters`, so it is never filtered twice; `CollapseInfo.filtered` carries
  the count for the canvas chip. A filter that would draw nobody (nobody
  affected) has no effect. `rootsHidingNew` ignores filters (it runs on
  `withoutFilters`), and the store turns the filters off when any other edit
  would hide someone new (`filterHidingNew`), so an added unaffected child
  never vanishes into a count. "Affected only" seeds are affected, carrier
  (plain or of a condition, #115),
  proband, consultand and people with a condition; their ancestors are kept, and
  a seed with no parents and no drawn children keeps their partners (an
  affected person who married in would otherwise float). Half sibs by a
  partner who is not kept are not drawn or counted. `affectedCondition`
  narrows the seeds to one condition (the menu offers it with two or more
  conditions; a stale id means any). "Blood relatives only" and "Mother's /
  Father's side only" (`side`) keep `bloodRelativesKept(roots)`: the roots,
  their ancestors, everyone descended from those, and every partner of
  one of them, so a married-in partner's own family goes with no group
  symbol (their parents' couple is not drawn at all). Roots are the
  probands, else the consultands (`referencePeople`); the side filters
  root at that parent, so the other parent is kept as a partner. With
  several filters on, anyone one of them leaves out is hidden. A filter
  with nothing to work from (nobody affected, no proband, proband without
  parents) is skipped and the banner says why. Changing the proband can
  hide people, so under these filters it turns them off like any other
  edit that hides someone. New filters: a field on `ViewFilters`, a row in
  `VIEW_FILTERS` (whether it is on, its patch, its `result`); the toolbar
  `FilterMenu` and the banner read that list; rows sharing a `group` are
  alternatives, drawn as one row of radio buttons.
- `twins.ts` — twin sets (#11). `twinMembership` maps each drawable member
  to a set key and zygosity; `buildScene` copies that onto each
  `ScenePerson` (`twinSet`, `zygosity`) so `sibshipLineGeometry` can fork
  for the canvas and `svgExporter` alike: in `sibshipPath.ts` every member's drop starts at the set's shared point
  on the bar (the mean of their x), and `twinForkMarks` gives the bar across
  monozygotic drops and the "?" for unknown zygosity, both at the points
  halfway down the drops as R's plot.pedigree does.
  `twinSetProblem` is the one rule list (two members, same couple, same sex
  for monozygotic); the store's `setTwins` returns its message when refused.
- `adoption.ts` — adoption brackets (#12): the six bracket segments round
  the symbol box, drawn by `AdoptionBrackets` in `chart/symbols.tsx`
  wherever a symbol is drawn (canvas, legend, export key, both exports). An
  adopted-in child's drop from the sibship bar is dashed: `sibshipPaths` in
  `sibshipPath.ts` splits `sibshipSegments` into solid and dashed
  by the children's `dashed` flag, keeping the per-child order (couple drop,
  bar, then one drop per child).
- `assisted.ts` — assisted reproduction (#45, NSGC 2008 Fig. 3), with its line
  geometry in `assistedLines.ts` and its edits in `assistedEdits.ts`. The model
  keeps genetics in the ordinary structure so kinship, X-linked kinship,
  relationship names, the double line and PED need nothing special: the
  child's partnership is its GENETIC parents (donor included), flagged
  `Partnership.donorConception` when one is a gamete donor. Whoever carried
  a pregnancy (a surrogate, or a child's `carriedBy`) cannot be made male:
  `batchSexProblem` refuses it for every Sex control, `setReproductiveRole`
  refuses S on a man, and `validation.ts` flags imports that have either. Such a pair gets
  no couple edge (`buildScene` skips it, both lints skip
  `partnership-not-drawn` for it), and its sibship edge carries `apart`: a
  line from each parent's symbol to the bar replaces the couple drop
  (`sibshipSegments`' `apart`). kinship2 lays the pair out as a
  couple, which is what puts the donor beside the other parent. A donor
  pair's ONLY child is drawn as NSGC Fig. 3 draws a pregnancy (`converge`
  on the sibship edge): no bar, a line from each parent straight to the top
  of its symbol. Where the child is drawn is not always its genetic
  parents: `placementParentOf` (layout-engine) hangs a child carried by the
  partner of its genetic father from that couple (scenario 2), and the
  renderer, both lints and the U-shape read that map for structure while
  kinship, relationship names and PED read `parentOf`. The layout puts an
  only child under the woman carrying it (`shiftUnderCarrier`), so her
  line runs straight down through her labels: `labelsOverLines` marks such
  nodes `labelsBacked`, and the canvas and the export give their labels a
  white backing. The other lines are per child (`assistedLinks`): "genetic"
  (solid, a genetic parent the child is not drawn under, the egg donor of
  scenario 2), "carrier" (solid, the woman who carried it, when she is not
  a parent it hangs from) and "social" (dashed). A social parent whose
  partner has a biological line to the child gets none (the couple line is
  the link, scenarios 1 and 4), and nobody is drawn twice. They are the
  scene's `assisted` lines (edge type `assistedEdge` on the canvas), one per person and child, or one per
  sibship when the person is linked the same way to every child of it (the
  line then ends where the sibship's descent meets the bar, so siblings do
  not each get a crossing line). `assistedEdgeSegment` (`assistedLines.ts`) is the one geometry,
  for the canvas and `Chart` (group `assisted-lines`); the U-shape draws its own along the tracks.
  Lines leave the symbol from a lower corner (`symbolExitPoint`) so they
  clear the name under it. A surrogate with no partner of her own would be
  an isolated founder: `families.ts` keeps her in the child's family and
  `alignPedigree` appends her to the row above the child, not the top row.
  Editing: `applyAddDonor` / `applyAddSurrogate` (`assistedEdits.ts`, store `addDonor`,
  `addSurrogate`, more menu "Assisted reproduction"); the Person tab's
  `AssistedForm` sets the letter, carrier and social parents.
- `sameSex.ts`: same-sex couples (#105, NSGC 2022 Fig. 5). Partners may
  share a sex; a child's genetic parents (its `parentOf` partnership) may
  not. So a child added to a same-sex couple (`applySameSexChildren`, used
  by the store's `addChild` / `addChildren` when the partnership is
  same-sex and by `setSameSexChild` for "Existing child...") hangs from a
  `donorConception` pair of the genetic parent and a donor of the other
  sex, with the other partner as a social parent, who gets no line (their
  partner has one, Fig. 5 example 1b). The next child by the same partner
  reuses that donor pair (`donorPairFor`: the newest pair of that parent
  with a donor whose child the partner raises), so they are full siblings.
  The couple's own `parentOf` entry stays empty. No surrogate is added for
  two men: the user adds one on the child if wanted.
- `childless.ts` — childless couple marks (#15): segments hung from the
  middle of the couple line (from the level end of a line that hops, beside
  the further partner; on a consanguineous double line, from the lower
  line). `buildScene` puts
  `childless` / `childlessReason` on the couple edge data only when the
  partnership has no children (`activeChildless`), so a stale flag on a
  couple with children is never drawn; `chart/ChildlessMark.tsx` draws it
  for the canvas and `svgExporter`, and the U-shape draws the same marks
  along its track. The
  reason text shares the name-label row, so long reasons run into long names.
- `ended.ts` — ended relationship (#98, NSGC "relationship no longer
  exists"): `Partnership.ended` draws two short diagonal strokes across the
  couple line (`endedMarkSegments`). They sit in the middle of the line
  unless the line of descent or a childless mark hangs there
  (`middleTaken`), then halfway between the left end of the line's run and
  the middle (`endedBreakX`), so they never cross the drop. On a line that
  hops they sit in the middle of the raised part, which nothing hangs from.
  On a double line
  they are tall enough to cross both lines. Drawn by `chart/CoupleLine.tsx`
  for the canvas and the export (a `<path data-ended>`, which the export
  lint skips), the U-shape (`endedSegs`, along the track), and the legend and export key
  ("Relationship ended"). Set from the panel's "Relationship" section and
  the "Relationship" / couple-line items of the more and right-click menus
  (`setPartnershipEnded`). PED cannot carry it; Export PED warns.

Below a symbol, top to bottom: "SB" / "ECT" caption, tag annotation row, name
(one or two lines), then the detail lines in NSGC order (2008 Fig. 1: age,
then evaluation, then pedigree number; `claude/nsgc_nomenclature.md`).
`detailSections` in `labels.ts` is the one place that orders them; add new
text under the symbol there as its own entry of the list, not by appending to a
renderer:

1. age (`ageText`): the free-text `Individual.age` when set, otherwise the
   year of birth, "b. 1978" (#20). NSGC prefers a year or an age to a full
   date for privacy, so the full DOB is never drawn; it stays in the data,
   the Person tab and CSV. A DOB not starting with a year (the age range a
   de-identified export puts in `dob`) is drawn as it is. One line, on
   purpose: a two-line name plus DOB plus age would run into the sibship bar
   halfway to the next row, so the age replaces the year. The date of death
   (#103, `ageLines`): with full dates of birth and death the line is the
   age at death alone, "d. 72y" ("4 mo", "5 d" for infants); otherwise
   "d. 2007" (from a year, year-month or full date), under "b. 1935" when
   that is known too. Those two lines count as past the age line for
   `detailsBacked`. A `dod` shows only while `deceased` is set (the store
   sets one with the other, and unticking deceased deletes `dod`). The
   free-text age still wins over all of it;
2. one line per age of onset (#93, `onsetLines`);
3. (gender identity #26 and evaluation #101 belong here, before the number);
4. the inbreeding coefficient, "F = 1/16" (#86, `inbreedingLabel`), only
   when the pedigree draws coefficients and the person's parents are related;
5. the pedigree number (#8), last, on its own line.

A two-line name plus the age line clears the sibship bar of the person's own
children; anything past the age line can reach it, so then the detail block
gets a white backing (`detailsBacked`: a white `<rect>`) and the bar shows a
gap under the text rather than running through it. Which lines there are comes from the
person's glyph (#144); where they sit is `textUnder` in `labelBlock.ts`
(#145): first baseline 12px below the symbol, 13px lines, the caption and
annotation row shifts and the white backings. The canvas draws it as SVG
text in the node (`TextUnderSymbol`, `font-family="sans-serif"` as in the
export, so the 5.8px a character that `labels.ts` wraps by means the same
in both) and `svgExporter` writes the same numbers; the lints and the
placement of bars and couple labels read `textBlockUnder`. A cut name's
group (`data-name-label`, `data-name-cut`) takes the mouse through a
transparent box the size of its lines; the `text-under-symbols` flow checks
the hover and the click. The U-shape draws the same `TextUnderSymbol`,
turned with the symbol along its track: `io/AGENTS.md`.

- Chart title (#20): `chartTitle(pedigree, name)` in `labels.ts` is the one
  rule. `Pedigree.chartTitle` wins when set, `""` meaning no title; absent
  falls back to the pedigree's name (`useAppStore.activeTitle`), except the
  default "Untitled pedigree". On the canvas it is an extra React Flow node
  (`nodes/ChartTitleNode.tsx`, id `__chart-title`, not selectable, no
  pointer events, drawing `chart/ChartTitle` as SVG text) added in
  `PedigreeCanvas` beside `rfNodes`, not by `buildScene`, so lints never
  see it; the canvas's fit to view includes it. It sits `TITLE_GAP` above the highest symbol, as in the
  SVG export. The export dialog and `__pededit.checkExport()` pass the same
  string as `SvgExportOptions.title`.
- Pedigree numbers (#8, "II-3"): `pedigreeNumbers(pedigree)` in
  `scene.ts` (counting and Roman numerals in `numbering.ts`) numbers
  the drawn pedigree from the same `alignPedigreeByFamily` layout the
  canvas and SVG export draw, row by row in slot order, skipping the
  lineless copies the canvas leaves out. Pins do not renumber: a dragged
  person keeps their layout number. Hidden people (#94) get none, and a
  generation with nobody drawn is not counted, so there are no gaps. Never
  stored. With `canvasSettings.showNumbers` the number is the last detail
  line under the symbol (NSGC order, see above), on the canvas, in both SVG
  exporters and in the lints. The U-shape
  uses the standard figure's numbers so the two exports agree. Tests:
  `__tests__/numbering.test.ts`.

Tests: `__tests__/scene.test.ts`, `__tests__/tags.test.ts` and
`__tests__/symbols.test.tsx`.

- `layoutCost.ts` — duplicates, hops, arc length and width of a drawn
  layout, the regression guard for layout passes beyond kinship2 (#76, see
  `layout-engine/AGENTS.md`). `buildScene`'s `improveLayout: false` gives
  the plain port to compare against.

## U-shape view (#220)

- `UShapeView.tsx` replaces `PedigreeCanvas` while the store's `uShapeView`
  is on (`CanvasPage`). It draws `uShapeViewDrawing` (`uShapeView.ts`), which
  is `renderUShape`, the U-shape export with `key: false`, so the view and
  the export cannot differ. Not React Flow: the SVG string is set as HTML in
  a div that is panned and zoomed with a CSS transform (pointer events for
  drag and pinch, a non-passive wheel listener, since React's is passive).
- Who is clicked is read from the `data-id` / `data-dup-of` on each
  person's `<g>`, written only because the view passes `personIds` (exported
  files carry no ids, #225). The selection outline (and the dashed outline of a
  hovered problem) is a `<rect data-u-highlight>` appended to that `<g>`
  after each draw, so it turns with the track.
- It only looks. Every refusal is a notice from `U_SHAPE_REFUSALS`: a mouse
  drag that starts on a person (it still pans, and a finger's drag never
  warns), right-click on a person, Shift+drag, the toolbar's add buttons
  and Reset layout (dimmed but clickable, `aria-disabled`, because a
  disabled button shows no hover text). Picking needs the chart, so when the
  More options menu on the Person tab starts it, the view turns itself off.
- The Person tab shows `PersonActions` (the hover pill's buttons) in this
  view on any screen, since there is no pill, without the lock button.
- The figure is drawn from `useDeferredValue(pedigree)` so typing a name
  stays quick; layout plus SVG is about 17 ms at 96 people, 100 ms at 347.
  The view fits on opening, on a pedigree opened and on a filter change,
  and keeps the pan and zoom through edits.
- Not saved: `initialize` and `reset` turn it off, and nothing goes in the
  `Pedigree`. Editing on the U itself waits for the U to draw everyone
  (#213).

## Layout cache (#189)

- **Every layout in the frontend goes through `cachedLayout`
  (`layoutCache.ts`), never `alignPedigreeByFamily` directly.** The engine's
  quadratic program is nearly all of the cost of an edit on a large pedigree
  (4.8 s of a 5 s edit at 513 people), so its result is kept while the
  structure is unchanged: `buildScene`, `pedigreeNumbers`, the swap sides
  check and the render lint share one layout, and marking someone affected,
  typing a name or dropping a dragged person does not lay out again.
- **It is correct by construction, not by a list of what matters.** The
  engine is given `layoutInput(pedigree)`, a copy with the fields the layout
  does not read left out, and the result is kept under that copy's JSON.
  What the engine was not given cannot change its answer. So a field missing
  from `PERSON_FIELDS_NOT_LAID_OUT` only costs speed, and a field wrongly in
  it changes the drawing, which `layoutCache.test.ts` catches by laying out
  every example, fixture and test data file both ways, in each sibling order.
  A new field that the layout never reads should be added to the list, or
  editing it lays out again.
- `dob` is given to the engine only when siblings are ordered by date of
  birth, and `affected` and `tags` only with "affected first": those two
  settings are what read them.
- Unconnected families are kept one by one as well (the engine's
  `alignFamily` option), so a change in one family does not lay out the
  others. A few structures are kept, for undo and redo.
- The result is shared: never change a `LayoutResult` you were given.
- What it does not help: an edit that changes structure in one large family
  still runs the whole quadratic program (about 4 s at 513 people).

## Render lint

`renderLint.ts` checks `buildScene`'s output for drawings a reader would
misread (lines through symbols, lines to dropped nodes or ending in space,
children with no line from their parents, couple lines between
non-partners, sibship bars of two couples along one line, overlapping
symbols or text, couple text running into anything). It holds every check
on the drawing, for the canvas and the exports alike (#222): the geometric
ones run on `sceneDrawing.ts`, the lines and text the chart components
draw, worked out with their own functions, and text is measured as a file
writes it (`figureNameLines`; the canvas's is the same or shorter). The
export lint (`io/svg/exportLint.ts`) runs it on the export's scene and
checks only the file on top.
The kinship2 oracle tests compare slots with R, so a bug in the duplicate
handling here passes them and is only caught by this lint. Its vitest keeps a
`KNOWN_BROKEN` list of examples; remove an entry when a fix makes it draw
cleanly. Also run by `__pededit.check()` and `scripts/browser/lint.mjs`.

## Export only the selected people (#215)

- `selectionSubset.ts` works out who the figure draws and `drawnSubset()`
  (`collapse.ts`) makes the pedigree: a copy of the drawn pedigree with
  everyone else removed, registered as drawn so group symbols, coefficients
  and `wholePedigree()` carry over. It is built from what is drawn now, so a
  selection under a view filter or beside a collapsed branch gives what the
  canvas shows, minus the people not selected.
- The joining rule is a cheapest path counted in people added, repeated until
  the selection is one piece: stepping onto a couple costs every partner not
  yet in the figure, because a child cannot hang from one parent. A tie goes
  to the way through shared ancestors over the way through a marriage.
- A kept couple's children who are not selected are left out with no group
  symbol, unlike a view filter: the figure is what was selected, and the
  "+N to connect them" in the tickbox is the only thing added. A group symbol
  that is itself selected is kept, and not counted as a person.
- The layout is run again on the subset, so a person the full chart draws
  twice is drawn once when the loop is cut, with no dashed line.
