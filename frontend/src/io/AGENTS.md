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
- One ID as father and as mother, in one row or across rows, is a blocking
  `PARENT_BOTH_SEXES`; it would otherwise become a self-partnership.
- kinship2 codes `affected` 0/1 (1 = affected), unlike PED 1/2. It is recoded
  only when the header uses kinship2's `dadid`/`momid` and no value is 2;
  pedtools-style headers keep PED coding.
- The famid-or-aff guess for headerless 5-column files needs at least two
  rows; one row is always `id fid mid sex aff`.
- IDs in the file are not internal IDs (#66). `exportIds` in `exporter.ts`
  writes each person's canvas name (unique, never `0`/`NA`, spaces to `_`
  in PLINK), falls back to a non-UUID internal ID, then `ind1, ind2...`.
  Import sets `name` to the file's ID so the round trip keeps the labels.
- The converter invents `__phantom_*` IDs for the missing partner of a single
  parent (`isPhantomId`). They are never shown, not even as the dev-mode ID
  label.

## json/ — native lossless format

`exportJson` / `importJson` wrap the `Pedigree` in a versioned envelope
(`JSON_FORMAT`, `JSON_VERSION`). Unknown fields are preserved, never dropped,
so newer files survive a round trip through an older editor. The format is
documented in `docs/pedigree-json-format.md` and `docs/pedigree-json-schema.json`;
update both when adding a field to `Individual`, `Partnership` or `Pedigree`.
Test corpus: `test-data/ped/` (simple, edge_cases, malformed, consanguineous,
large). `large/kinship2_sample.ped` is the kinship2 reference family. Tests are
in `io/__tests__/` (parser, validator, converter, exporter, roundtrip).

## svg/ — figure export

- `svgExporter.ts` — standard layout as an SVG string, including legend for
  tags. Shares geometry with the canvas via `pedigree/tags.ts` and the layout
  constants.
- `uShapeExporter.ts` — `layoutUShape` and `exportUShapeSvg`: horseshoe layout
  for large families (partners, consanguinity, flat bottom, fan for small
  families). Plan in `claude/export_u_plan.md`.
- `pngExporter.ts` — rasterises the SVG via canvas.
- `pdfExporter.ts` — jsPDF + svg2pdf.js.
- `deidentify.ts` — strips names, DOB and notes for de-identified export.
- `types.ts` — `SvgExportOptions`.

`__tests__/_uShapePeds.dev.ts` and `_uShapeRender.dev.ts` are manual render
helpers, not tests.

## csv/ — tabular export

`exporter.ts` writes one row per individual with relationships and tags.
