# Features

An index of what PedEdit does: one row per feature, with its issues, the
file to start reading at and the guide that explains it. Read it before
building or changing a feature, then read the guide.

A row is a pointer, never a description. Anything an agent needs to know
about a feature goes in the directory guide the row names, and a new
feature gets a row here in the same change. Every path in this file is
checked by `npm run check` (`scripts/check-doc-paths.mjs`).

## Foundations

| Feature | Issues | Start at | Guide |
|---|---|---|---|
| Layout engine, the kinship2 port (`kindepth`, `alignped1-4`, `autohint`), npm packaging | #22 | `layout-engine/src/` | `layout-engine/AGENTS.md`, `claude/layout_engine_guide.md` |
| Backend: `Pedigree` model, CRUD API, anonymous access, social login, delete account | #183 | `backend/api/views.py` | `backend/AGENTS.md` |
| Editor: canvas, toolbar, hover pill, more menu, Person tab, settings, undo/redo, shortcuts, auto-save | #95, #120 | `frontend/src/pages/CanvasPage.tsx` | `frontend/AGENTS.md`, `frontend/src/pedigree/AGENTS.md` |
| Pedigree store and its undo rule | #223 | `frontend/src/store/pedigree/` | `frontend/AGENTS.md` |
| Drawing: symbols, lines, text under symbols, one renderer for canvas and exports | #139 | `frontend/src/pedigree/chart/` | `frontend/src/pedigree/AGENTS.md`, `claude/nsgc_nomenclature.md` |
| NSGC 2022 and 2008 notation setting | | `frontend/src/pedigree/notation.ts` | `claude/nsgc_nomenclature.md` |
| Gender identity and biological sex | #26 | `frontend/src/pedigree/gender.ts` | `frontend/src/pedigree/AGENTS.md` |

## On the chart

| Feature | Issues | Start at | Guide |
|---|---|---|---|
| Proband and consultand arrows | #99 | `frontend/src/pedigree/proband.ts` | `frontend/src/pedigree/AGENTS.md` |
| Family history not known ("?") | #100 | `frontend/src/pedigree/familyHistory.ts` | `frontend/src/pedigree/AGENTS.md` |
| Evaluations, documented "*", presymptomatic carrier line | #101, #114 | `frontend/src/pedigree/evaluation.ts` | `frontend/src/pedigree/AGENTS.md` |
| Conditions, tags, colouring, pattern fills, legend and key, My library | #3, #67 | `frontend/src/pedigree/tags.ts`, `frontend/src/pedigree/tagFills.ts` | `claude/phase_7_2_plan.md`, `frontend/src/pedigree/AGENTS.md` |
| Carriers per condition, carrier fills, traits, sections | #115, #118, #129, #136 | `frontend/src/pedigree/conditions.ts` | `frontend/src/pedigree/AGENTS.md` |
| Relatedness: kinship, inbreeding, named relationships, coefficients on the chart | #32, #85, #86, #87, #90, #134 | `layout-engine/src/kinship.ts`, `frontend/src/pedigree/relationship.ts` | `layout-engine/AGENTS.md`, `frontend/src/pedigree/AGENTS.md` |
| Consanguinity text above the double line, ended relationships | #97, #98, #109 | `frontend/src/pedigree/consanguinityLabel.ts` | `frontend/src/pedigree/AGENTS.md` |
| Chart title, approximate age, long names | #20, #68 | `frontend/src/pedigree/labels.ts` | `frontend/src/pedigree/AGENTS.md` |
| Age of onset | #93 | `frontend/src/pedigree/onset.ts` | `frontend/src/pedigree/AGENTS.md` |
| Notes on the chart | #219 | `frontend/src/pedigree/labels.ts` (`noteLines`), `frontend/src/pedigree/scene.ts` (`rowYs`) | `frontend/src/pedigree/AGENTS.md` |
| Pedigree numbers (I-1, II-3) | #8 | `frontend/src/pedigree/numbering.ts` | `frontend/src/pedigree/AGENTS.md` |
| Clinical details | #102, #135 | `frontend/src/pedigree/clinicalDetails.ts` | `frontend/AGENTS.md` |
| Assisted reproduction: donor, surrogate, social parents | #45 | `frontend/src/pedigree/assisted.ts` | `frontend/src/pedigree/AGENTS.md` |
| Same-sex couples | #105 | `frontend/src/pedigree/sameSex.ts` | `frontend/src/pedigree/AGENTS.md` |

## Editing

| Feature | Issues | Start at | Guide |
|---|---|---|---|
| Drag, pin, unpin, reset layout | | `frontend/src/pedigree/PedigreeCanvas.tsx` | `frontend/src/pedigree/AGENTS.md` |
| Rename a pedigree (Pedigree tab, signed in or not) | #247 | `frontend/src/components/panel/PedigreeTab.tsx` | `frontend/AGENTS.md` |
| The inventory of editor actions and its completeness tests | #243 | `frontend/src/pedigree/actionInventory.ts` | `frontend/src/pedigree/AGENTS.md` |
| Multi-select and batch edits | #21, #35, #243 | `frontend/src/pedigree/batch.ts` | `frontend/AGENTS.md` |
| Swap sides | #106 | `layout-engine/src/partnerSides.ts` | `layout-engine/AGENTS.md`, `frontend/AGENTS.md` |
| Draw this couple beside | #205 | `frontend/src/pedigree/partners.ts` | `layout-engine/AGENTS.md`, `frontend/AGENTS.md` |
| Editor warnings ("N problems") | #116 | `frontend/src/pedigree/validation.ts` | `frontend/src/pedigree/AGENTS.md` |

## Viewing

| Feature | Issues | Start at | Guide |
|---|---|---|---|
| Hide descendants and group symbols | #94, #1 | `frontend/src/pedigree/collapse.ts` | `frontend/src/pedigree/AGENTS.md` |
| View filters | #4 | `frontend/src/pedigree/viewFilters.ts` | `frontend/src/pedigree/AGENTS.md` |
| U-shape view | #220 | `frontend/src/pedigree/UShapeView.tsx` | `frontend/src/pedigree/AGENTS.md` |
| Small screens | #169 | `frontend/src/pages/CanvasPage.tsx` | `frontend/AGENTS.md` |

## Import and export

| Feature | Issues | Start at | Guide |
|---|---|---|---|
| PED import and export | #31 | `frontend/src/io/ped/` | `frontend/src/io/AGENTS.md`, `test-data/ped/README.md` |
| PED text box with a live drawing, View PED as text | #218 | `frontend/src/components/PedTextBox.tsx` | `frontend/src/io/AGENTS.md` |
| Phenopackets family import and export | #23 | `frontend/src/io/phenopackets/` | `frontend/src/io/AGENTS.md`, `test-data/phenopackets/README.md` |
| What a PED or Phenopackets export leaves out, the warning | #23 | `frontend/src/io/losses.ts` | `frontend/src/io/AGENTS.md` |
| JSON import and export | | `frontend/src/io/json/` | `frontend/src/io/AGENTS.md` |
| SVG, PNG and PDF export, the key | #18, #139 | `frontend/src/io/svg/svgExporter.tsx` | `frontend/src/io/AGENTS.md` |
| The key's corner in exports | #241 | `frontend/src/io/svg/keyPlacement.ts` | `frontend/src/io/AGENTS.md` |
| U-shape export | #213 | `frontend/src/io/svg/uShapeExporter.ts` | `claude/export_u_plan.md`, `frontend/src/io/AGENTS.md` |
| De-identified export | #111, #225 | `frontend/src/io/svg/deidentify.ts` | `frontend/src/io/AGENTS.md` |
| Export only the selected people | #215 | `frontend/src/pedigree/selectionSubset.ts` | `frontend/src/io/AGENTS.md` |
| CSV export | | `frontend/src/io/csv/` | `frontend/src/io/AGENTS.md` |

## Site

| Feature | Issues | Start at | Guide |
|---|---|---|---|
| Example links | #150, #151 | `frontend/src/data/examples.ts` | `frontend/AGENTS.md` |
| Guides (symbols, how to draw, consanguinity, practice families) | #202 | `frontend/src/guides/` | `frontend/AGENTS.md` |
| Prerendered pages, `llms.txt`, published JSON docs | #25, #200 | `frontend/src/prerender.tsx` | `frontend/AGENTS.md` |
| Your data page | #203 | `frontend/src/pages/YourDataPage.tsx` | `frontend/AGENTS.md`, `backend/AGENTS.md` |
| Error reporting (Rollbar, allowlisted) | #49 | `frontend/src/errorReporting/scrub.ts`, `backend/peded/error_reporting.py` | `frontend/AGENTS.md`, `backend/AGENTS.md` |
| Deploy, backups, rate limits, releases and rollback | #47, #48 | `deploy/` | `deploy/AGENTS.md`, `INSTALL.md` |

## Testing

| Feature | Issues | Start at | Guide |
|---|---|---|---|
| Page checks, end-to-end flows, phone check, pixel compare, timing | #63, #142, #167, #169, #180 | `frontend/scripts/browser/` | `frontend/scripts/browser/README.md` |
| Feature fixtures, SVG snapshots, the test data set | #69, #140, #167 | `frontend/src/fixtures/features.ts`, `frontend/src/fixtures/dataset.ts` | `frontend/AGENTS.md` |
| CI | #72 | `.github/workflows/ci.yml` | `frontend/scripts/browser/README.md` |
| Dead code check | | `knip.json` | `frontend/AGENTS.md` |
| Guide paths exist | #234 | `scripts/check-doc-paths.mjs` | |
