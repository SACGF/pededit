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
PHENO` by default or the R dialect with `dialect: "r"`. Sex codes 1/2/0,
phenotype 1/2/0/-9.

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

- `svgExporter.ts` — standard layout as an SVG string, including the key
  (`renderExportKeySvg` in `pedigree/tags.ts`: Affected, Carrier, Deceased
  rows when present, then tags in use), in a `<g class="pedigree-key">`.
  Tests find symbols by `<g transform="translate(..)">` followed by a shape,
  so the key group needs that class to stay out of their way. Shares geometry with the canvas via `pedigree/tags.ts` and the layout
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
