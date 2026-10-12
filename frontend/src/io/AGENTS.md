# frontend/src/io/ — agent notes

Import and export. Everything here is framework-free TypeScript so it can be
unit tested and reused headlessly.

## ped/ — PED file format

`importPed(text)` runs parse -> validate -> convert and never throws; all
problems come back as `issues` with a severity and a `ValidationIssueCode`.
Multiple families in one file become multiple pedigrees. `exportPed` writes
`FID IID PAT MAT SEX PHENO`. Sex codes 1/2/0, phenotype 1/2/0/-9.
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
