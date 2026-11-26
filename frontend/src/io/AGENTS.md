# frontend/src/io/ — agent notes

Import and export, unit tested and run headlessly. Only the SVG exporters
(`svg/svgExporter.tsx`, `svg/ushape/render.tsx`) use React, to render the
chart components to markup.

## ped/ — PED file format

`importPed(text)` runs parse -> validate -> convert and never throws; all
problems come back as `issues` with a severity and a `ValidationIssueCode`.
Multiple families in one file become multiple pedigrees. Both the 6-column
PLINK layout and the headed R dialect (`id fid mid sex [aff]`, as read by
pedtools and kinship2) are read; "fid" is ambiguous between the two and is
resolved by column position. `exportPed` writes PLINK `FID IID PAT MAT SEX
PHENO` by default or the R dialect with `dialect: "r"`; the toolbar's Export
PED menu offers both. Sex codes 1/2/0 (M/F/U and the words are accepted on
import: `recogniseSex` in `converter.ts` is the one list, used by the
validator too), phenotype 1/2/0/-9/NA.

Rules that keep a bad file from importing as nonsense (#31):
- Every row must split into exactly as many cells as the header, or as the
  widest row when there is no header; anything else is a blocking
  `COLUMN_COUNT_MISMATCH`. Only a literal PLINK header allows trailing
  genotype cells. This is what catches a space-separated header over tab
  rows, and spaces inside IDs in a space-separated file. It deliberately
  does not reject mixed tabs and spaces between columns when every row still
  splits evenly (`edge_cases/mixed_whitespace.ped`).
- Parent IDs `0`, `NA` and an empty tab cell mean missing (`MISSING_PARENT_TOKENS`
  in `parser.ts`). Kept short on purpose: `-`, `.` or lowercase `na` may be
  real IDs.
- The one exception to the exact column count: a tab-separated row short only
  by trailing optional columns (`aff`, genotypes) is padded with empty cells
  (`ColumnMap.core`, #71), because text editors strip the trailing tab before
  an empty last cell. An empty `aff` cell is missing affection, no warning.
  Space-separated files get no padding: a short row there is a real error.
- One ID as father and as mother, in one row or across rows, is a blocking
  `PARENT_BOTH_SEXES`; it would otherwise become a self-partnership.
- kinship2 codes `affected` 0/1 (1 = affected), unlike PED 1/2. It is recoded
  only when the header uses kinship2's `dadid`/`momid` and no value is 2;
  pedtools-style headers keep PED coding.
- `SEX_MISMATCH` (female in PAT, male in MAT) is one warning per parent pair,
  not per child. It is cosmetic for us: defined people are drawn from their
  SEX column. It matters only for other PED readers, and our exporter always
  writes the male partner in PAT.
- The famid-or-aff guess for headerless 5-column files needs at least two
  rows; one row is always `id fid mid sex aff`.
- IDs in the file are not internal IDs (#66). `exportIds` in `exporter.ts`
  writes each person's canvas name (unique, never `0`/`NA`, spaces to `_`
  in PLINK), falls back to a non-UUID internal ID, then `ind1, ind2...`.
  Import sets `name` to the file's ID so the round trip keeps the labels.
- The converter invents `__phantom_*` IDs for the missing partner of a single
  parent (`isPhantomId`). They are never shown, not even as the dev-mode ID
  label.

PED cannot carry pregnancy / loss status, twins, adoption, childless couple
marks, ended relationships or assisted reproduction details (#45: the D/S
letter, `carriedBy`, `socialParents`; a donor is written as the genetic
parent, which is right), or consanguinity it cannot work out from the
parents. `pedExportLosses` in `exporter.ts` lists what a file would drop, one
line per person or couple (from the `pedLost*` functions there); the toolbar
shows the lines before writing.

## json/ — native lossless format

`exportJson` / `importJson` wrap the `Pedigree` in a versioned envelope
(`JSON_FORMAT`, `JSON_VERSION`). Unknown fields are preserved, never dropped,
so newer files survive a round trip through an older editor. The format is
documented in `docs/pedigree-json-format.md` and `docs/pedigree-json-schema.json`;
update both when adding a field to `Individual`, `Partnership` or `Pedigree`.
The schema is hand-written, not generated. `json/__tests__/schemaDrift.test.ts`
parses `types.ts` with the TypeScript compiler API and fails when a property,
its optionality or a string-literal enum differs from the schema, and
`backend/api/tests.py` checks the Django validating serializers against the same
schema, field by field (type, enum, required, blank strings, minimums). So a
new field fails both test suites until types.ts, the schema and the serializer
agree. The importer has no field list of its own: `json/schemaCheck.ts`
imports the schema (it is in the bundle, about 19 kB, 5 kB gzipped) and walks
its `$defs` for `type`, `enum`, `required`, `minLength`, `minItems` and
`minimum`; `importer.ts` adds only the checks between fields (ids, cycles,
twins, `leftPartner` / `drawnBeside` naming a partner), which
`structure_errors` in `backend/api/serializers.py` mirrors. A field added to
the schema is checked by the importer with no code. `pattern` and `format`
are not checked by either side.

A pedigree opened by its link (`openPedigree` in `store/useAppStore.ts`)
never passes the importer. `repairShape` reads it leniently instead: a value
of the wrong type that the server's DRF coerced and stored as sent (in
pedigrees saved before #229) is read as DRF read it, so a stored
`"deceased": "false"` is false, not a truthy string.
Test corpus: `test-data/ped/` (simple, edge_cases, malformed, consanguineous,
large). `large/kinship2_sample.ped` is the kinship2 reference family. Tests are
in `io/__tests__/` (parser, validator, converter, exporter, roundtrip).

## svg/ — figure export

- `svgExporter.tsx` draws everything from the scene (`buildScene`, #143,
  #146): positions from its people, couple and sibship lines through
  `pedigree/lineGeometry.ts`, assisted lines and duplicate arcs from theirs,
  and the figure's size from `scene.bounds`. Nothing under `io/` imports
  React Flow (`sceneImports.test.ts`).
  It never calls the layout engine and imports only types from it (a test in
  `svgExporter.test.ts` holds it to that). What is drawn for each person
  (shape, fill, marks, lines of text) is the person's `glyph` (#144,
  `pedigree/personGlyph.ts`); `uShapeExporter.ts` gets the same glyph from
  `personGlyph` through its `glyphOf`. Anything the export needs that
  the scene lacks is added to it in `buildScene`, not
  worked out again here.
- `svgExporter.tsx`: standard layout as an SVG string, including the key
  (`exportKeyMarkup` in `pedigree/exportKey.tsx`, its rows from
  `keyRows(pedigree, "export")`, #148: Affected, Carrier, Deceased
  rows when present, then tags in use), in a `<g class="pedigree-key">`.
  The "Same person drawn more than once" row (#124) cannot be read off the
  pedigree: each exporter passes `{ duplicates }` from its own drawing
  (`scene.duplicates` here, `layout.duplicates` in the U-shape, which
  draws different copies), and the in-app legend uses `drawsDuplicates`.
  Tests find symbols by `<g transform="translate(..)">` followed by a shape,
  so the key group needs that class to stay out of their way. Shares geometry with the canvas via `pedigree/tags.ts` and the layout
  constants.
- One renderer (#139): `svgExporter.tsx` and the U-shape draw people,
  lines and text with the canvas's components (`pedigree/chart/`),
  rendered to markup with `renderToStaticMarkup` inside an `<svg>` root
  (React needs one for SVG children). Nothing under `io/` writes a symbol,
  mark or line of text as a string; a drawing change is made once, in
  `chart/`. The markup carries data-* attributes (`data-copy-number`,
  `data-twin-mark`, `data-childless`, `data-ended`...) that the lints and
  tests read; never person ids, which could be names after a PED import
  (the U-shape writes them only with `personIds`, for the editor's view).
  A server render nested in another server render clears the outer
  component's hook state, so a component that exports during its own
  render (the guides' `GuideFigure`, in the prerender) must use no hooks.
- `uShapeExporter.ts` — the public entry (`layoutUShape`,
  `exportUShapeSvg`): horseshoe layout for large families (partners,
  consanguinity, flat bottom, fan for small families). Plan in
  `claude/export_u_plan.md`. The code is in `ushape/` (#149): `tree.ts` builds the descendant tree of one founder
  couple (nodes, unions, joins; no positions), `layout.ts` is the bent
  coordinate system, the packing along the tracks and the public
  `UShapeLayout` (no SVG in it, so it could move beside the layout engine),
  `connectors.ts` draws the lines along the tracks (this geometry is the
  U-shape's own and stays so), `render.tsx` places each person (`PersonMarks`
  and `TextUnderSymbol`, turned along the track with letters kept upright)
  and the consanguinity labels and assembles the figure, `constants.ts` has
  the shared sizes. No symbol or text under one is drawn in `ushape/`. `glyphOf` in `layout.ts` caches each person's glyph per
  pedigree object, so, as with `kinshipOf`, a test that changes a pedigree
  in place after laying it out must make a fresh object. Symbols, labels and slashes
  rotate with the track (that is the design, labels included); only the
  pregnancy "P" is counter-rotated to stay upright (#71), since a sideways P
  reads as another letter. A square's or diamond's outline (the group
  symbol's too), with its fill, sections, adoption brackets and
  presymptomatic line, turns only by the nearest multiple of 90 degrees
  (`outlineRotation`, `UShapeNode.symbolRotation`), since either turned 45
  degrees reads as the other; circles turn with the track. Slashes, the
  arrow, marks and text still turn with the track, and lines along the
  normal stop at the outline's edge (`edgeReach` in `connectors.ts`). Twins (#11): `sortSibs` averages a set's order
  keys so members stay side by side, the root sibship is never split between
  the arms inside a set (`TNode.twinSet`), and the fork is a `diagonalPath`
  in track coordinates, since a straight chord between twins far apart along
  the U would cut across the tracks.
- U-shape consanguinity labels (#97, #109): one line along the double
  line, between the two symbols, on the inward side. The couple moves apart
  for it (`coupleGap`, joins through the packing, `joinGap` for a join
  across the centre), with room for each symbol's top corner turning in on
  a curve. Straight text on a curve is lifted by the sagitta of its half
  width; `build` keeps r0 large enough (`labelRadius`) that the lift stays
  under the dashed links along the track (`maxLabelSag`). It slides along
  the line to clear a dashed link that runs straight across the tracks;
  where none is clear it goes on a white backing and the link passes
  behind. `UShapeLayout.coupleLabels` has the placements. Checked by
  `uShapeLint.ts` (`lintUShape`, `lint.mjs --u-shape`), which parses the SVG
  with its group transforms and tests every line, arc, shape and text
  against each label box in the label's rotated frame; it relies on the
  `consanguinity-labels` group with one `<g transform>` per label.
- Names in both SVG exporters wrap like the canvas (`pedigree/labels.ts`,
  #68); `computeBounds` allows for the most lines any name takes. They wrap
  even when the pedigree's `canvasSettings.nameLabels` is "truncate": that
  setting is for the canvas, where hovering gives the full name.
- `canvasSettings.layoutWidth` (#82) does apply to exports: it is read inside
  `alignPedigreeByFamily`, so SVG, PNG, PDF and de-identification get the
  same layout as the canvas with no code here. The U-shape has its own
  layout and ignores it.
- To look at an export without the dialog: `__pededit.exportSvg()` in
  `eval.mjs` (`{ uShape: true }` for the U-shape) returns the SVG, and
  `node frontend/scripts/browser/shot.mjs FILE.svg` renders it to PNG. A
  scratch entry bundled with plain esbuild does not build: it needs the
  layout engine alias of `vite.config.ts` and `--jsx=automatic`.
- `exportLint.ts` (#72) — render lint for the standard SVG export, run by
  `lint.mjs`, the page checks, CI and `exportLint.test.ts` over every
  example. It parses the SVG, so `svgExporter.tsx` must keep writing its
  group classes (`couple-lines`, `sibship-lines`, `duplicate-arcs`,
  `symbols`, `labels`, `consanguinity-labels`, whose white `<rect>` marks a
  label the dashed arcs may pass behind, #109, and `chart-title`), and the
  chart components their `data-childless`, `data-ended` and `data-twin-mark`
  on marks that join nobody. Sibship lines are read from their paths'
  "M x y L x y" runs. A dashed arc is read back with `pathPoints`
  and checked against other people's symbols and text
  (`arc-through-symbol`, `arc-through-label`, #192, the canvas lint's
  `arcCollisions`), with the lines of text under a symbol taken as one
  block. The chart title is outside the `labels` group
  on purpose (it is not a label), so it has a check of its own,
  `title-collides` (#172): the text in `<g class="chart-title">` against the
  symbols, the dashed arcs and the consanguinity labels. The canvas title
  is a React Flow node added by the canvas, not part of the scene, so `lintScene` takes
  the title as an option and places it with the same `chartTitlePlace`
  (#188); `lint.mjs` and `__pededit.check()` pass the pedigree's title.
  `uShapeLint.ts` has its own `title-collides`: the U-shape draws the title
  in its own band above a margin that holds everything it draws, and no
  example, fixture or test data file has needed more (#188). It never writes ids into the SVG: symbols are
  matched to people by position, because an id can be a name after a PED
  import and must not leak from a de-identified export. The U-shape writes
  `data-id` / `data-dup-of` on each person's `<g>` only with
  `options.personIds`, which only the editor's U-shape view passes (#225).
- `pngExporter.ts` — rasterises the SVG via canvas at a chosen DPI (#18),
  taking the SVG's CSS pixels as 96 to the inch, so the printed size is the
  same at every DPI. `pngDpi.ts` writes the DPI into a pHYs chunk after
  IHDR (Chromium's `toBlob` writes none; any existing one is replaced), which is what Word and journal
  upload checks read. Past `MAX_CANVAS_SIDE` (16384, Safari's limit;
  Chromium accepts more) or `MAX_CANVAS_AREA` (64 Mpx) `pngSizeForDpi`
  lowers the DPI to fit and the file records the lowered DPI; the export
  dialog says so before download. To get the bytes in a page check,
  `await import("/src/io/svg/index.ts")` inside `eval.mjs` and return the
  blob as base64.
- Clinical key fields (#102, `Pedigree.clinicalDetails`) are drawn by
  `exportKeyMarkup` as "Label: value" text lines in a
  `<g class="clinical-details">` under the symbol rows, so every exporter
  (standard, U-shape, PNG, PDF) gets them with no code of its own. Text is
  wrapped by character count (`wrapText`), continuation lines take a fixed
  hanging indent because the bold label's real width is unknown.
- `pdfExporter.ts` — jsPDF + svg2pdf.js.
- `deidentify.ts` — an allowlist (#225): `INDIVIDUAL_FIELDS`,
  `PARTNERSHIP_FIELDS`, `EVALUATION_FIELDS` and `PEDIGREE_FIELDS` give every
  field of the type a rule (keep, drop, rewritten, or a `DeidentifyKeep`
  choice), typed as `Record<keyof T, ...>`, so a new field fails the type
  check until someone decides, and the copy is built from the rules, so a
  field the types do not name is dropped. It strips names, DOB, free-text age and notes,
  blanks `chartTitle` and drops `clinicalDetails`
  entirely (reason and ancestry are free text that can name people); the export dialog also
  passes no title. Age ranges come from the DOB only: free text such as
  "3 mo" cannot be bucketed safely. The date of death (#103) is always
  dropped; with age ranges, someone deceased with both dates gets the range
  at death in `dob` ("d. 70s"), drawn as it is. The names become the pedigree numbers
  (`pedigreeNumbers`, #8), and the copy has `showNumbers` turned off so a
  numbered pedigree does not draw "II-3 II-3".
  Optional free text (#111) follows `options.deidentifyKeep`
  (`DeidentifyKeep` in `types.ts`, defaults `DEIDENTIFY_KEEP_DEFAULTS`, the
  maintainer's call on #111): evaluation detail, age of onset and a couple's
  childless reason (#225) are dropped,
  the result marks with the documented "*", the consanguinity text (own and
  named, by turning `relationshipLabels` off on the copy) and text tags are
  kept. Dropping the marks drops the evaluations entirely. The coefficients
  of `showCoefficients` (#86) are always kept: they come from the structure
  the figure already shows, so with the consanguinity text dropped a double
  line still reads "φ = 1/16", and `deidentifiableText` asks
  `consanguinityWording`, not the whole label, whether there is text to offer. Everything is
  dropped from the data, not the drawing, so the key loses its rows with no
  code of its own (it lists tags in use, evaluation rows from what is left).
  The export dialog shows one checkbox per kind the drawn pedigree has
  (`deidentifiableText`); the choices are dialog state for the page session,
  like the de-identify box itself, and are never saved.
- The chart title (#20) is `options.title`, resolved by the caller with
  `chartTitle()` from `pedigree/labels.ts`. Its width is estimated
  (`titleWidth`); a title wider than the drawing widens the figure and the
  drawing is centred under it, in both exporters. It is a
  `<g class="chart-title">` outside the `labels` group, checked by the
  lints' `title-collides`.
- Someone drawn more than once has their text under every copy, as on the
  canvas. The copy number alone does not say who a copy is.
- Hidden descendants (#94): `deidentify` works on the drawn pedigree, so the
  generation numbers count only people who are drawn, and returns its copy
  through `asDrawn` so the collapsed-branch group symbols (#1) stay group
  symbols. They take no generation number and no name; the affected children
  drawn beside them are real people and are numbered. `exportSvg` and
  `exportUShapeSvg` start from `drawnPedigree()` the same way; CSV, PED and
  JSON export everyone. View filters (#4, "affected only") ride on the same
  path, so figure exports draw whatever the canvas shows with no export
  option of their own.
- Only the selected people (#215): the export dialog's tickbox passes the
  exporters `selectionPedigree()` (`pedigree/selectionSubset.ts`) in place of
  the pedigree. It is already a drawn pedigree (`drawnSubset` registers it
  like `asDrawn` does), so `exportSvg`, `exportUShapeSvg` and `deidentify`
  take it unchanged and need no option. The exporters never see the
  selection. The tickbox is off each time the dialog opens and is never
  saved.
- `types.ts` — `SvgExportOptions`.
- Snapshots (#69): `__tests__/svgSnapshots.test.ts` exports every example
  and every feature fixture (#140) as the standard SVG (normal and compact,
  fixtures also de-identified) and the U-shape, and compares each with a
  committed file in `__tests__/snapshots/` (numbers with four or more
  decimals rounded to two). The lints check structure; this is what notices
  a change in how something looks. A refactoring must leave them alone. A
  change that is meant to move something: rerun with
  `npm -w frontend run test -- -u svgSnapshots`, look at old and new
  (`shot.mjs FILE.svg`), and say what changed in the commit message. Adding
  an example or fixture writes its files on the first local run; CI fails on
  a missing file, so commit them. The export must stay the same from one run
  to the next: no ids from counters that outlive a call, no dates, no
  `Math.random`.

## csv/ — tabular export

`exporter.ts` writes one row per individual with relationships and tags.
`onset` (#93) lists ages of onset as
`Affected: 40s;Breast cancer: 45y` (tag labels, from `onsetsOf`). Tests
should not anchor on the line end, so a new column can go last.
`pedigree_number` (#8) follows it: the "II-3" the figure shows (whether or not
the figure shows numbers), blank for people hidden under a collapsed branch.
It is how the numbers link back to the ids. PED stays six columns (#31).
New columns go on the end so earlier positions never move: `consultand`
(#99, 1/0), `family_history_unknown` (#100, 1/0), `presymptomatic` (#101,
1/0), `evaluations` (#101, #114: as under the symbol in the pedigree's notation,
"BRCA1 c.5266dupC + *; echo -" or in 2008 "E1+ (BRCA1 c.5266dupC) *; E2-",
" *" after a documented one).
`gender_identity` (#26, `man` / `woman` / `nonbinary` or blank; blank for a
pregnancy or loss). The `sex` column stays biological sex and decides
father and mother. `dod` (#103), the date of death as stored ("2007",
"2007-03-14"), after the assisted reproduction columns (#45).
`carrier_of` (#115): the conditions the person carries, by
label like `tags`. The `carrier` column is 1 for any carrier,
condition recorded or not. `inbreeding_coefficient` (#86): the autosomal F
from the pedigree as a decimal ("0.0625"), 0 for someone whose parents are
unrelated or not recorded; always written, whatever the figure shows.
