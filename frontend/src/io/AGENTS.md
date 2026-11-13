# frontend/src/io/ — agent notes

Import and export. Everything here is framework-free TypeScript so it can be
unit tested and reused headlessly.

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
parent, which is right). `pedLostLifeStatus`, `pedLostTwins`, `pedLostAdoption`,
`pedLostChildless`, `pedLostEnded` and `pedLostAssisted` in `exporter.ts` list what a file would drop; the toolbar
warns with them before writing.

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
schema. So a new field fails both test suites until types.ts, the schema and
the serializer agree.
Test corpus: `test-data/ped/` (simple, edge_cases, malformed, consanguineous,
large). `large/kinship2_sample.ped` is the kinship2 reference family. Tests are
in `io/__tests__/` (parser, validator, converter, exporter, roundtrip).

## svg/ — figure export

- `svgExporter.ts` — standard layout as an SVG string, including the key
  (`renderExportKeySvg` in `pedigree/tags.ts`: Affected, Carrier, Deceased
  rows when present, then tags in use), in a `<g class="pedigree-key">`.
  Tests find symbols by `<g transform="translate(..)">` followed by a shape,
  so the key group needs that class to stay out of their way. Shares geometry with the canvas via `pedigree/tags.ts` and the layout
  constants.
- `uShapeExporter.ts` — `layoutUShape` and `exportUShapeSvg`: horseshoe layout
  for large families (partners, consanguinity, flat bottom, fan for small
  families). Plan in `claude/export_u_plan.md`. Symbols, labels and slashes
  rotate with the track (that is the design, labels included); only the
  pregnancy "P" is counter-rotated to stay upright (#71), since a sideways P
  reads as another letter. Twins (#11): `sortSibs` averages a set's order
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
- To look at an export without the dialog: bundle a scratch entry that
  imports `exportSvg` / `exportUShapeSvg` with
  `node_modules/.bin/esbuild entry.ts --bundle --platform=node --format=esm`,
  run it to write the SVG, then `node frontend/scripts/browser/shot.mjs
  FILE.svg` renders it to PNG to read back.
- `exportLint.ts` (#72) — render lint for the standard SVG export, run by
  `lint.mjs`, the page checks, CI and `exportLint.test.ts` over every
  example. It parses the SVG, so `svgExporter.ts` must keep writing its
  group classes (`couple-lines`, `sibship-lines`, `duplicate-arcs`,
  `symbols`, `labels`, `consanguinity-labels`, whose white `<rect>` marks a
  label the dashed arcs may pass behind, #109) and `class="mark"` on lines that join nobody
  (childless and twin marks). It never writes ids into the SVG: symbols are
  matched to people by position, because an id can be a name after a PED
  import and must not leak from a de-identified export.
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
  `renderExportKeySvg` as "Label: value" text lines in a
  `<g class="clinical-details">` under the symbol rows, so every exporter
  (standard, U-shape, PNG, PDF) gets them with no code of its own. Text is
  wrapped by character count (`wrapText`), continuation lines take a fixed
  hanging indent because the bold label's real width is unknown.
- `pdfExporter.ts` — jsPDF + svg2pdf.js.
- `deidentify.ts` — strips names, DOB, free-text age and notes for
  de-identified export, blanks `chartTitle` and drops `clinicalDetails`
  entirely (reason and ancestry are free text that can name people); the export dialog also
  passes no title. Age ranges come from the DOB only: free text such as
  "3 mo" cannot be bucketed safely. The date of death (#103) is always
  dropped; with age ranges, someone deceased with both dates gets the range
  at death in `dob` ("d. 70s"), drawn as it is. The names become the pedigree numbers
  (`pedigreeNumbers`, #8), and the copy has `showNumbers` turned off so a
  numbered pedigree does not draw "II-3 II-3".
  Optional free text (#111) follows `options.deidentifyKeep`
  (`DeidentifyKeep` in `types.ts`, defaults `DEIDENTIFY_KEEP_DEFAULTS`, the
  maintainer's call on #111): evaluation detail and age of onset are dropped,
  the result marks with the documented "*", the consanguinity text (own and
  named, by turning `relationshipLabels` off on the copy) and text tags are
  kept. Dropping the marks drops the evaluations entirely. Everything is
  dropped from the data, not the drawing, so the key loses its rows with no
  code of its own (it lists tags in use, evaluation rows from what is left).
  The export dialog shows one checkbox per kind the drawn pedigree has
  (`deidentifiableText`); the choices are dialog state for the page session,
  like the de-identify box itself, and are never saved.
- The chart title (#20) is `options.title`, resolved by the caller with
  `chartTitle()` from `pedigree/labels.ts`. Its width is estimated
  (`titleWidth`); a title wider than the drawing widens the figure and the
  drawing is centred under it, in both exporters. It is a
  `<text class="chart-title">` outside the `labels` group, so the export
  lint ignores it.
- Hidden descendants (#94): `deidentify` works on the drawn pedigree, so the
  generation numbers count only people who are drawn, and returns its copy
  through `asDrawn` so the collapsed-branch group symbols (#1) stay group
  symbols. They take no generation number and no name; the affected children
  drawn beside them are real people and are numbered. `exportSvg` and
  `exportUShapeSvg` start from `drawnPedigree()` the same way; CSV, PED and
  JSON export everyone. View filters (#4, "affected only") ride on the same
  path, so figure exports draw whatever the canvas shows with no export
  option of their own.
- `types.ts` — `SvgExportOptions`.

`__tests__/_uShapePeds.dev.ts` and `_uShapeRender.dev.ts` are manual render
helpers, not tests.

## csv/ — tabular export

`exporter.ts` writes one row per individual with relationships and tags.
The last column, `onset` (#93), lists ages of onset as
`Affected: 40s;Breast cancer: 45y` (tag labels, from `onsetsOf`). Tests
should not anchor on the line end, so a new column can go last.
`pedigree_number` (#8) follows: the "II-3" the figure shows (whether or not
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
