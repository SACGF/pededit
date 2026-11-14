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
  "N selected" section and the edit panel's `SelectionPanel`.
- The minimap (#6, #125) is React Flow's `<MiniMap pannable>`: always the
  whole pedigree with the viewport as a rectangle; dragging pans the main
  view and a click centres it (a press that moved is a drag, not a click).
  It is only for a sense of where you are, so `MinimapNode` draws each
  person as a plain square, circle or diamond (`RFNodeData.shape`), black
  when `isAffected`. `MinimapEdges` draws plain couple lines (doubled when
  consanguineous), lines of descent and assisted lines, with no dashes,
  marks or text, from live node positions. React Flow's MiniMap has no slot
  for edges, so the first node's `nodeComponent` draws them before its own
  shape, which keeps them under every symbol. An earlier custom minimap drew the real
  symbols and lines scaled down; it was too small to read and on a wide
  pedigree its 1px outlines covered sub-pixel symbols, so people looked
  black. Its strokes are in flow units (4 on a 40px symbol) so they shrink
  with the symbol. The chart title node is in its bounds but not drawn.
- `nodes/symbols.tsx` — the SVG for square / circle / diamond, affected fill,
  deceased slash, proband arrow, carrier dot, tag quadrants and annotation row.
- `nodes/PedigreeSymbolNode.tsx` — wraps the symbol with hover pill, more menu,
  name/DOB labels and pin indicator.
- `nodes/HoverPill.tsx` — add parents / child / sibling / partner buttons.
- `nodes/MoreMenu.tsx` — affected, deceased (Mark living also clears the date of death, #103), proband, consultand, sex, lock/unlock,
  move sib left/right, delete, and "Add children..." (count stepper, plus a
  partner choice when the person has several partnerships). The menu is
  about 600px tall, so it is capped at Radix's
  `--radix-popover-content-available-height` and scrolls; check it at
  1280x720 after adding items. It is portalled: when an item closes it, the
  element under the cursor vanishes and the pill gets no mouseleave, so the
  menu calls `onClose` and the pill schedules its own hide.
  The items are `MoreMenuItems`, so the right-click menu shows the same list:
  add new items there, not in `MoreMenu`.
  With several people selected and the menu opened on one of them (#35),
  `MoreMenuItems` shows only the "N selected" section and `BatchMenuItems`
  (status, carrier status, tags, sex, delete, each acting on all of them);
  single-person items (add, proband, twins, adoption, couples...) are left
  out until one person is clicked. A new person item that is safe to apply
  to a group belongs in `BatchMenuItems` too.
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
  `sibshipPath.ts`, shared with `svgExporter`: the bar sits
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
  within the pedigree's quadrant-style tags. How many sections a symbol has
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
  fixed section; someone carrying a fifth or later quadrant tag gets equal
  slices of just the quadrant tags they carry, so other people's symbols
  never gain empty wedges. An affected person with any quadrant sector keeps
  a black centre (the outline scaled by `AFFECTED_CORE_SCALE`, white rim),
  otherwise four tagged quarters hide the affected fill. `symbols.tsx`
  (`AffectedCore`) and `renderAffectedCoreSvg` draw it; keep them in step.
  Black is last in `TAG_PALETTE` so a new tag never defaults to it.
- `tagFills.ts` — pattern fills and the monochrome setting (#67). A
  quadrant tag's `fill` (solid, diagonal, horizontal, vertical, crosshatch,
  dots, shade) is drawn in its colour on white; `canvasSettings.tagFills`
  "monochrome" draws every tag black, quadrant tags each with a pattern
  (their own, else the first free one in `MONOCHROME_PATTERN_ORDER`).
  Renderers never read `tag.color` directly: `sectorsFor` puts the resolved
  `color` / `fill` on each `Sector`, `annotationRow` on each item, and the
  legends call `tagPaint` (cached per pedigree object, like `kinshipOf`).
  Patterns are plain clipped paths, not SVG `<pattern>`, so svg2pdf draws
  them (checked by rendering an exported PDF with Ghostscript).
  `fillLayers` is the geometry, `renderRegionFillSvg` (exporters, export
  key) and `RegionFill` in `symbols.tsx` (canvas, app legend) its
  two renderers; per-condition carrier fills (#115) use them.
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
  The carrier dot (NSGC 2008 only, #115) is never drawn on an affected
  symbol (the edit panel says so); a carrier condition (#115) or a gene
  result text tag ("+/-" built-in suggestion in `tags.ts`) shows it.

- `proband.ts` — proband and consultand arrows (#99, NSGC 2008 Fig. 1):
  the proband's arrow has a bold "P" below-left of its tail, a consultand's
  (`Individual.consultand`, several allowed) has none, and someone who is
  both is drawn as the proband (`arrowKind`). `arrowGeometry` is shared by
  `ProbandArrow` on the canvas and the legend, `renderArrowSvg` by both
  exporters (the U-shape turns the P upright), `renderArrowKeySwatchSvg` by
  the export key, which had no proband row before. The P ends 4px left of
  the tail so it clears the line of descent that drops half a slot gap left
  of a proband whose partner is on their left; a white box behind it gives
  any other line a gap instead of running through the letter.

- `gender.ts` — gender identity on the symbol (#26, NSGC 2022).
  `symbolSex(ind, pedigree)` is the one rule for which shape is drawn and
  `assignedAtBirthText` for the AMAB / AFAB / UAAB line (a `gender` section
  in `labels.ts` `detailSections`). Everything that draws a person's shape
  must call it rather than read `ind.sex`: `layoutToFlow` puts it on the
  node data as `shape` (the canvas node passes it to `SymbolShape`, the minimap picks its shape by it),
  both exporters' `renderShape`, the legend and the export key swatches.
  Nothing genetic may call it: layout, kinship, twins, PED and the CSV
  father/mother columns read `sex`. A non-binary person always gets the
  code (the diamond alone does not say their sex); a man who is male or a
  woman who is female gets none. Pregnancies and losses ignore any stored
  gender identity, and the edit panel hides the field for them.

- `familyHistory.ts` — "family history not known" (#100, NSGC 2008 Fig. 2):
  `Individual.familyHistoryUnknown` draws a bold "?" above the symbol,
  centred, or 9px left of centre when a line of descent comes into the top
  of the symbol (the person has parents drawn). Set from the edit panel
  checkbox and the more / right-click menus. `FamilyHistoryMark` on the
  canvas and legend, `renderFamilyHistorySvg` in both exporters (upright in
  the U-shape). It reaches about 13px above the row, inside the title gap.

- `notation.ts`: `canvasSettings.notation`, which NSGC edition is drawn.
  Absent means "nsgc2008" (#115): pedigrees saved before the setting keep
  their look. Everything made now gets "nsgc2022" through
  `withCurrentNotation`: `pedigreeApi.create`, `importPed` and `EXAMPLES`
  (JSON import keeps the file's). A new way of making a pedigree must call
  it too. Read the setting through `notationOf`; test pedigrees without
  `canvasSettings` are 2008.
- `conditions.ts` — affected and carrier per condition (#115). A condition
  is a quadrant tag that is not a trait (`isConditionTag`; `Tag.kind:
  "trait"`, #118, is a coloured section only: it takes a section in
  `sectionInfo` like a condition, is a plain tag in the store and menus,
  never affected, never solid black in monochrome). Test conditions with
  `isConditionTag` / `conditionTags`, never `style === "quadrant"`. A
  condition tag in `Individual.tags` is affected with that condition, in
  `Individual.carrierTags` a carrier of it. The plain flags are what the
  conditions do not say: `affected` is affected with something not
  recorded, `carrier` a carrier with no condition recorded. Recording or
  clearing a condition never sets or clears `affected` (#118: the old
  coupling made the flag beside a condition ambiguous, so marking someone
  with a quadrant tag affected drew nothing). "Is this person affected?"
  is `isAffected` (layout-engine, re-exported here: the flag or any
  affected condition), used by PED/CSV, filters, sibling order, collapse
  and warnings; never read `ind.affected` for that. The plain Affected
  control's state (A, more menu, batch counts) is `affectedControlOn`: the
  flag, or with one condition, that condition. Every editor path
  (panel, more menu, batch, legend checkbox, "A" shortcut, warning fixes)
  goes through `applyConditionState` / `applyAffected` / `applyCarrier`, so
  the rules live in one place: recording a carrier condition clears the
  plain carrier flag; with exactly one condition the plain Affected and
  Carrier controls record it; with two or more the panel
  (`ConditionsForm`) and menus ask per condition, and a plain flag (alone,
  or beside recorded conditions) gets the "condition-not-recorded" warning
  with one fix per condition (`Problem.moreFixes`), built with
  `resolvePlainAffected` as one `updateIndividual` so a click is one undo
  step. Drawing is decided once in
  `symbolPaint` (tags.ts): sectors (carrier ones flagged, with
  `carrierPaint` from tagFills.ts, plus the 2022 dotted half for a plain
  carrier as the `PLAIN_CARRIER_TAG` sector, left off when the person's
  affected conditions cover the right half, which the edit panel then
  reports as not drawn), black base, black centre,
  2008 dot. The black base is `plainAffected` in 2022 (sectors over it, the
  black centre on top) and `affectedControlOn` in 2008, so with two
  conditions a 2008 person affected only with recorded ones has quarters on
  white, as NSGC 2008 shades a quadrant per condition. Canvas, both exporters and the legends read it; never
  test `ind.affected` / `ind.carrier` for drawing. `statusKeyRows` and
  `keyTagRows` are the key rows for the app legend and the export key.
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
  vertical line through the symbol, drawn inside `SymbolShape` and by `renderPresymptomaticSvg`; like the carrier dot
  it is not drawn on an affected fill. The editor offers carrier and
  presymptomatic as one "Carrier" select, and the store setters keep them
  exclusive; old data with only `carrier` loads unchanged. De-identified
  exports keep the evaluations, details included, as they keep onset.

- `onset.ts` — age of onset (#93): `Individual.onset` for the affected
  status and `Individual.tagOnset` per quadrant tag, both free text since
  onset is often known only as "40s" or "childhood". `onsetsOf` is the one
  reader and skips values that no longer apply (not affected, tag not
  carried, not a quadrant tag), so the panel, canvas and exports agree. The
  store also deletes them when the tag is untagged or deleted, or the
  person is set unaffected. Edited in the panel next to "Affected" and
  under each ticked quadrant tag row of the legend. Drawn under the symbol
  as "onset 40s" or "BC 45y" (tag abbrev, cut before the age is).

- `validation.ts` — editor warnings (#116). `problemsOf(pedigree)` runs
  `RULES` once per pedigree object (WeakMap, so every canvas node can ask)
  and gives `{ id, rule, severity, individualId | partnershipId, field,
  message, fix? }`. A new check is one `Rule` with an `individual` or
  `partnership` function returning a draft; `RuleContext` is the place for
  facts worked out once per pass (e.g. the condition tag count #115 needs).
  `field` must be a `ProblemField` that the edit panel wraps in
  `data-problem-field` (via `Field`'s `problemField` or `ProblemHighlight`),
  or the list cannot focus it. `fix.apply` gets the store as `FixActions`;
  add the setter a new fix needs to that interface. Problems only advise:
  nothing may refuse a save or an edit because of one. Shown three ways:
  the field outline and message in `EditPanel`, the toolbar's
  `ProblemsMenu` (hidden at zero; a click selects the person, or a couple's
  first partner, and focuses the field), and a small "!" circle at the
  top left of the canvas node (`data-problem-marker`, filled for an
  error). The marker is drawn by `PedigreeSymbolNode` only, so
  exports never get it. Kept here, not as warnings: action
  refusals (picking, twins, swap sides notices), the PED export loss
  dialog, and display notes such as "carrier mark not drawn on an
  affected fill" (for a plain carrier that is also affected it is now the
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
  rule offering a fix with the same label (`problemsLike`) and applies each
  one's own fix inside the store's `groupEdits`, which folds the undo
  snapshots into one. The list names people by pedigree number
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
- `consanguinityLabel.ts` — the degree of relationship above a double line
  (#97, NSGC "if not obvious from the pedigree, state it above the line").
  `consanguinityLabelText` is the one rule: the couple's own
  `Partnership.consanguinityLabel` always (the only way to say anything for
  the manual override, whose common ancestors are not drawn); otherwise,
  with `canvasSettings.relationshipLabels` ("Name consanguineous
  relationships" in Settings, off by default), `nameCoupleRelationship`
  from `relationship.ts` ("first cousins", "uncle and niece"), which is null
  whenever `nameRelationship` cannot name the pair for certain, so inbred
  lines get nothing. Never drawn on a single line. `layoutToFlow` puts the
  wrapped lines on the double edge's data (`consanguinityLabel`): wrapped to
  `consanguinityLabelRoom`, which keeps clear of what lands on each symbol
  top (the line of descent, the "?" of #100) and runs over a bare top; one
  line when rows are compact. A new mark above the symbol must be added
  there and to the lint. The text sits above the symbol tops and any
  deceased slash, or above the line where it hops higher.
  `ConsanguineousEdge` and `svgExporter` (group `consanguinity-labels`)
  draw it from `consanguinityLabelBaselines`; both raise the chart title
  over a top-row label (`highestConsanguinityLabel`, `chartTitleNode`'s
  `aboveTop`). Placement (#109, `placeConsanguinityLabel`): `layoutToFlow`
  hands it every obstacle near a label as a box (`TextBlock`): the text
  under each symbol as the export writes it (`labelBlock.ts`, lower and
  taller than the canvas's, so clear there means clear on the canvas too),
  copy numbers, sibship bars and drops, and the dashed arcs between copies.
  It tries the usual place, then slid along the line, then raised up to
  12px, then low between wide-apart symbols; then the same with the arcs
  allowed to pass behind a white backing (`backed`); otherwise the label is
  not drawn. That last fallback happens in compact rows, where a parent's
  two or more lines of text hang down to the symbol tops of the row below:
  siblings side by side under such a parent have no room anywhere
  (House Targaryen's Aegon and Shaera, the Habsburg uncle and niece). The
  result is `CoupleEdgeData.consanguinityLabelOffset`; the canvas, the
  export and `highestConsanguinityLabel` all read it. The export lint's
  `consanguinity-label-collides` checks the label against symbols, lines,
  other text, copy numbers and dashed arcs (unless backed), compact rows
  included. The U-shape export has its own rule (`claude/export_u_plan.md`).
  Edited in the
  panel under the "Consanguineous with" checkbox (with a "Write <name>"
  button when the pedigree names the relationship) and "Text above line..."
  in the couple line's right-click menu.
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
  maps each drawn collapsed person to the hidden people under them. A stale
  flag on someone with no descendants is dropped from the drawn copy.
- Collapsed-branch group symbols (#1), following NSGC 2008 Fig. 1 (a
  number inside a symbol means that many siblings; affected people are not
  grouped). For each drawn couple of a collapsed person, children who are
  affected or carry a quadrant (condition) tag (`drawnIndividually`) stay in
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
  count inside (`renderBranchCountSvg`, `CollapsedBranchNode`). On the canvas it is its own node type
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
  proband, consultand and quadrant-tag people; their ancestors are kept, and
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
  `FilterMenu` and the banner read that list.
- `twins.ts` — twin sets (#11). `twinMembership` maps each drawable member
  to a set key and zygosity; `layoutToFlow` copies that onto the node data
  so `SibshipEdge` (and `svgExporter`, from the pedigree directly) can fork:
  in `sibshipPath.ts` every member's drop starts at the set's shared point
  on the bar (the mean of their x), and `twinForkMarks` gives the bar across
  monozygotic drops and the "?" for unknown zygosity, both at the points
  halfway down the drops as R's plot.pedigree does.
  `twinSetProblem` is the one rule list (two members, same couple, same sex
  for monozygotic); the store's `setTwins` returns its message when refused.
- `adoption.ts` — adoption brackets (#12): the six bracket segments round
  the symbol box, drawn by `AdoptionBrackets` in `symbols.tsx` (so the
  legend gets them for free through `SymbolShape`), `renderAdoptionBrackets`
  in `svgExporter` (shared with the U-shape) and the export key. An
  adopted-in child's drop from the sibship bar is dashed: `sibshipPath.ts`
  gained `sibshipPaths`, which splits `sibshipSegments` into solid and dashed
  by the children's `dashed` flag, keeping the per-child order (couple drop,
  bar, then one drop per child).
- `assisted.ts` — assisted reproduction (#45, NSGC 2008 Fig. 3). The model
  keeps genetics in the ordinary structure so kinship, X-linked kinship,
  relationship names, the double line and PED need nothing special: the
  child's partnership is its GENETIC parents (donor included), flagged
  `Partnership.donorConception` when one is a gamete donor. Such a pair gets
  no couple edge (`layoutToFlow` skips it, both lints skip
  `partnership-not-drawn` for it), and its sibship edge carries `apart`: a
  line from each parent's symbol to the bar replaces the couple drop
  (`sibshipSegments`' last argument). kinship2 lays the pair out as a
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
  the link, scenarios 1 and 4), and nobody is drawn twice. They are `assistedEdges` in the
  flow (edge type `assistedEdge`), one per person and child, or one per
  sibship when the person is linked the same way to every child of it (the
  line then ends where the sibship's descent meets the bar, so siblings do
  not each get a crossing line). `assistedEdgeSegment` is the one geometry,
  for the canvas and `svgExporter` (group `assisted-lines`,
  read by the export lint); the U-shape draws its own along the tracks.
  Lines leave the symbol from a lower corner (`symbolExitPoint`) so they
  clear the name under it. A surrogate with no partner of her own would be
  an isolated founder: `families.ts` keeps her in the child's family and
  `alignPedigree` appends her to the row above the child, not the top row.
  Editing: `applyAddDonor` / `applyAddSurrogate` (store `addDonor`,
  `addSurrogate`, more menu "Assisted reproduction"); the edit panel's
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
  middle of the couple line (raised by the hop when the line hops; on a
  consanguineous double line, from the lower line). `layoutToFlow` puts
  `childless` / `childlessReason` on the couple edge data only when the
  partnership has no children (`activeChildless`), so a stale flag on a
  couple with children is never drawn; `edges/ChildlessMark.tsx` draws it on
  the canvas, `svgExporter` and `uShapeExporter` draw the same segments. The
  reason text shares the name-label row, so long reasons run into long names.
- `ended.ts` — ended relationship (#98, NSGC "relationship no longer
  exists"): `Partnership.ended` draws two short diagonal strokes across the
  couple line (`endedMarkSegments`). They sit in the middle of the line
  unless the line of descent or a childless mark hangs there
  (`middleTaken`), then halfway between the left end of the line's run and
  the middle (`endedBreakX`), so they never cross the drop. On a double line
  they are tall enough to cross both lines. Drawn by `edges/EndedMark.tsx`,
  `svgExporter` (as `class="mark"` lines, which the export lint skips), the
  U-shape (`endedSegs`, along the track), and the legend and export key
  ("Relationship ended"). Set from the panel's "Relationship" section and
  the "Relationship" / couple-line items of the more and right-click menus
  (`setPartnershipEnded`). PED cannot carry it; Export PED warns.

Below a symbol, top to bottom: "SB" / "ECT" caption, tag annotation row, name
(one or two lines), then the detail lines in NSGC order (2008 Fig. 1: age,
then evaluation, then pedigree number; `claude/nsgc_nomenclature.md`).
`detailSections` in `labels.ts` is the one place that orders them; add new
text under the symbol there as its own section, not by appending to a
renderer:

1. age (`ageText`): the free-text `Individual.age` when set, otherwise the
   year of birth, "b. 1978" (#20). NSGC prefers a year or an age to a full
   date for privacy, so the full DOB is never drawn; it stays in the data,
   the edit panel and CSV. A DOB not starting with a year (the age range a
   de-identified export puts in `dob`) is drawn as it is. One line, on
   purpose: a two-line name plus DOB plus age ran into the sibship bar
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
4. the pedigree number (#8), last, on its own line.

A two-line name plus the age line clears the sibship bar of the person's own
children; anything past the age line can reach it, so then the detail block
gets a white backing (`detailsBacked`: canvas div background, a `<rect>` in
the export's labels group, which `exportLint` ignores) and the bar shows a
gap under the text rather than running through it. The canvas
(`PedigreeSymbolNode`), `svgExporter` and `uShapeExporter` each offset these
by hand, so change all three together.

- Chart title (#20): `chartTitle(pedigree, name)` in `labels.ts` is the one
  rule. `Pedigree.chartTitle` wins when set, `""` meaning no title; absent
  falls back to the pedigree's name (`useAppStore.activeTitle`), except the
  default "Untitled pedigree". On the canvas it is an extra React Flow node
  (`nodes/ChartTitleNode.tsx`, id `__chart-title`, not selectable, no
  pointer events) added in `PedigreeCanvas` beside `rfNodes`, not by
  `layoutToFlow`, so lints never see it; being a node keeps
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
  stored. With `canvasSettings.showNumbers` the number is the last detail
  line under the symbol (NSGC order, see above), on the canvas, in both SVG
  exporters and in the lints. It was first put before the name on the same
  line, which the standard does not do. The U-shape
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
