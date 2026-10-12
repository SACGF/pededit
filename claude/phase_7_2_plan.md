# Phase 7.2 Plan — Tags and colouring (issue #3)

*Define tags per pedigree, apply them to individuals, and choose how each tag is drawn: a coloured quarter of the symbol, a coloured dot, or short coloured text under the symbol. A legend is generated automatically. Signed-in users can keep a personal tag library to reuse across pedigrees.*

---

## What the issue asks for

> Define tags (per pedigree, also bring in ones the user has defined globally), tag the nodes, set the colours and how they are displayed (e.g. colour quarters). Useful for showing e.g. "we have sequencing for these samples".

The two screenshots on the issue show the two things clinicians actually do:

1. **Conditions as quarter fills.** Four conditions, each with a fixed quarter of the symbol and a colour, plus a key. Also single letters under symbols (O, F, U) for sub-types.
2. **Genotype text under the symbol** in colour (`exp/+`, `+/+`) with a single-colour full fill for the phenotype.

"We have sequencing for this sample" is neither a condition nor a genotype. It is workflow status, and the usual convention is a small marker beside the symbol rather than a fill.

## How other tools do it (summary of research)

| Tool | Definition scope | Rendering | Legend | Limit |
|------|-----------------|-----------|--------|-------|
| kinship2 `plot.pedigree` | per plot call (`affected` matrix) | fixed slot per column: symbol sliced into n sectors, column 1 solid, 2–4 hatched | `pedigree.legend()` | 4 by default |
| Madeline 2.0 | per data table (`Affected*` columns) | fixed slot per column, upper-left first then clockwise, auto colour ramp, `--bw` for print | yes | none |
| Progeny (commercial) | per pedigree mapping over database fields | fill colour/pattern in a symbol region | auto-updating, labels renamable | 10 |
| pedigreejs | app config (`opts.diseases`) | pie of *present* diseases, equal sectors from 12 o'clock, clipped to shape | none (host app draws it) | none |
| Open Pedigree | per pedigree, auto-discovered from OMIM/HGNC terms | pie of present disorders, curated greyscale-safe palette, carrier dot drawn separately | floating legend with counts and hover-highlight | none |
| DrawPed | one phenotype only | n/a | n/a | 1 |
| NSGC 2008 standard | n/a | "with >2 conditions the symbol can be partitioned, each segment with a different fill defined in the legend". Key is mandatory. No order, no cap. | mandatory | none |

Two rendering families exist. **Fixed slots** (kinship2, Madeline, Progeny): each condition owns a region in every symbol, so position alone identifies it, quarters stay put as tags are added, and hatching works in print. **Pie of present conditions** (pedigreejs, Open Pedigree): only present conditions get a slice, so colour is the only identifier.

## Decisions

- **Fixed slots.** Quadrant tags take their quarter from their order in the pedigree's tag list. Upper left first, then clockwise (Madeline's order and the order in the issue's screenshot). More than four quadrant tags falls back to equal pie slices from 12 o'clock. A figure that is being built up over a study does not reshuffle.
- **Three display styles**, chosen per tag:
  - `quadrant`: coloured quarter of the symbol, for conditions and phenotypes.
  - `dot`: small coloured dot in an annotation row under the symbol, for sample and workflow status ("DNA available", "sequenced").
  - `text`: short coloured bold text in the same row (`abbrev`, falling back to label), for genotypes and sub-types.
- **Composes with existing flags.** `affected` still draws the solid black fill underneath; `carrier` dot and deceased slash draw on top. Clinicians who want a single-condition black fill keep using `affected`; multi-condition pedigrees use quadrant tags.
- **Tag definitions live in the pedigree JSON** (`Pedigree.tags`), so exports, sharing and PED/CSV round trips stay self-contained. Individuals reference tags by id (`Individual.tags: string[]`).
- **User library is a separate, optional layer.** A `TagPreset` row per saved tag, owned by the user. "Save to library" copies a pedigree tag up; "Add from library" copies it down with a fresh id. The pedigree never depends on the library.
- **Legend is generated**, lists only tags actually applied to someone, and is included in SVG/PNG/PDF export (NSGC requires a key) as well as the in-app legend dialog.
- **Palette** is colour-blind aware (black, red, blue, yellow, green, orange, purple, cyan, brown, grey) with a free colour picker for anything else. Pattern fills for black-and-white print are a follow-up.

## Data model (`layout-engine/src/types.ts`)

```ts
export type TagStyle = "quadrant" | "dot" | "text";
export interface Tag { id: string; label: string; color: string; style: TagStyle; abbrev?: string }
Individual.tags?: string[]   // Tag ids
Pedigree.tags?: Tag[]        // definitions in display order
```

## Files

| File | Change |
|------|--------|
| `layout-engine/src/types.ts`, `index.ts` | `Tag`, `TagStyle`, `Individual.tags`, `Pedigree.tags` |
| `frontend/src/pedigree/tags.ts` | New. Palette, lookups, sector geometry, annotation row layout, string-SVG renderers for sectors / row / legend rows |
| `frontend/src/pedigree/nodes/symbols.tsx` | Sector fills clipped to the symbol outline; annotation row |
| `frontend/src/pedigree/nodes/PedigreeSymbolNode.tsx` | Pass pedigree tags in; shift name label down when the row is present |
| `frontend/src/store/usePedigreeStore.ts` | `addTag`, `updateTag`, `deleteTag`, `moveTag`, `setIndividualTag` (all undoable) |
| `frontend/src/components/TagsDialog.tsx` | New. Manage pedigree tags: add, label, colour, style, abbrev, reorder, delete, library save/add |
| `frontend/src/components/EditPanel.tsx` | Tag checkboxes for the selected individual, "Manage tags" link |
| `frontend/src/pedigree/nodes/MoreMenu.tsx` | "Tags" section with toggles |
| `frontend/src/components/Toolbar.tsx`, `pages/CanvasPage.tsx` | "Tags" button and dialog wiring |
| `frontend/src/components/LegendDialog.tsx` | Tags section |
| `frontend/src/io/svg/svgExporter.ts`, `uShapeExporter.ts` | Sectors, annotation row, legend block, bounds |
| `frontend/src/io/csv/exporter.ts` | `tags` column (labels, `;`-joined) |
| `frontend/src/api/client.ts` | `tagPresetApi` |
| `backend/api/serializers.py` | `TagSerializer`, `tags` on individual and pedigree data, `TagPresetSerializer` |
| `backend/api/models.py`, migration `0003` | `TagPreset` |
| `backend/api/views.py`, `urls.py` | `/api/tag-presets/` (auth required, owner-scoped) |
| tests | `tags.test.ts`, svg exporter tag tests, csv test, Django round-trip and preset tests |

## Rendering details

- Sector: pie slice centred on the symbol with radius = symbol size (beyond the half-diagonal), clipped by a `<clipPath>` that is the symbol's own outline. The outline is stroked again on top so the border stays crisp. One primitive covers square, circle and diamond.
- Annotation row sits 7 px below the symbol's bottom edge, items centred, dots r = 3.5, text 9 px bold. The name/DOB labels drop by 12 px when the row is present.
- Export legend: one row per tag in use, swatch (small square with the quarter filled, a dot, or the coloured text) and label, bottom-left under the pedigree. Canvas height and width grow to fit.

## Out of scope / follow-ups

- Pattern (hatch) fills for monochrome printing.
- Hover-to-highlight from the legend (Open Pedigree).
- Show/hide a tag as a display filter (FamGenix).
- Ontology-backed tags (link a tag to an HPO/MONDO term). The `hpoTerms` slot remains for Phase 7's phenotype work.
- PED export of tags (PED has no slot for them; CSV carries them).
