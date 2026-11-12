# PedEdit pedigree JSON format

PedEdit can download any pedigree as a JSON file and import it again without loss. Unlike PED export (which drops names, notes, HPO terms and node positions by design), the JSON file contains every field of the data model, so it is the format to use when you want to keep a complete copy of a pedigree yourself or move it between PedEdit instances.

A machine-readable JSON Schema (draft 2020-12) for this format is in [`pedigree-json-schema.json`](pedigree-json-schema.json). The canonical TypeScript definition is the `Pedigree` interface in `layout-engine/src/types.ts`; the Django `JSONField` and the editor's in-memory store mirror it exactly.

## Envelope

A downloaded file is a single JSON object with five top-level keys.

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `format` | `"pededit-pedigree"` | yes | Identifies the file type. Any other value is rejected. |
| `version` | integer | yes | Envelope version. Currently `1`. Files with a newer version are imported with a warning; unknown fields are kept but not interpreted. |
| `exportedAt` | string | no | ISO 8601 timestamp of the export, e.g. `"2026-11-06T09:30:00.000Z"`. Informational only. |
| `title` | string | no | The pedigree's title at export time. Used as the default title on import. |
| `pedigree` | `Pedigree` | yes | The pedigree data, described below. |

For convenience the importer also accepts a bare `Pedigree` object (no envelope). It reports an informational issue in that case, and the title defaults to the file name.

## `Pedigree`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `individuals` | `Individual[]` | yes | All people in the pedigree, in any order. Ids must be unique. |
| `partnerships` | `Partnership[]` | yes | All unions. Ids must be unique among partnerships. |
| `parentOf` | `{ [partnershipId]: string[] }` | yes | Children of each partnership. Every key must be a partnership id and every value an array of individual ids. An individual may be a child of at most one partnership. Use `{}` when there are no children. |
| `siblingOrder` | `SiblingOrderSettings` | yes (defaulted) | How siblings are ordered on the canvas. If absent the importer applies `{ "mode": "insertion", "affectedFirst": false }` and reports a warning. |
| `pinnedPositions` | `{ [individualId]: { x: number, y: number } }` | no | Manual drag overrides in canvas pixels. Individuals not listed here use the automatic layout. |
| `canvasSettings` | `CanvasSettings` | no | Drag and snap settings. Absent means all defaults (nodes locked, no snapping). |
| `unlockedIndividuals` | `string[]` | no | Ids of individuals unlocked for dragging when `canvasSettings.nodesMoveable` is `false`. |
| `tags` | `Tag[]` | no | Tag definitions (conditions, sample status, genotypes) in display order. Individuals reference them by id. |
| `chartTitle` | string | no | Title drawn above the chart on the canvas and in SVG, PNG and PDF exports. Absent means the pedigree's name (the envelope `title`), unless that is still the default "Untitled pedigree"; an empty string means no title. De-identified exports never draw it. |
| `clinicalDetails` | `ClinicalDetails` | no | Clinical key fields: reason for referral, recorder, date, historian, ancestry. |

Any other property on the pedigree object is preserved as-is through import and export.

### `Tag`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique among the pedigree's tags. |
| `label` | string | yes | Full name shown in the legend and tag manager. |
| `color` | string | yes | CSS colour, normally `#rrggbb`. |
| `style` | `"quadrant"`, `"dot"` or `"text"` | yes | `quadrant` fills a sector of the symbol (NSGC multi-condition shading, sector taken from the tag's position among quadrant tags). `dot` draws a small coloured dot below the symbol. `text` draws short coloured text below the symbol. |
| `abbrev` | string | no | Short canvas text for `text` tags. Defaults to `label`. |

### `SiblingOrderSettings`

| Field | Type | Meaning |
| --- | --- | --- |
| `mode` | `"insertion"`, `"manual"` or `"birthDate"` | Which ordering rule applies within each sibship. |
| `affectedFirst` | boolean | When `true`, affected siblings are drawn before unaffected ones. |

### `ClinicalDetails`

What the NSGC nomenclature (2008, Fig. 1 instructions) asks a clinical pedigree's key to record besides the symbols. Every field is an optional string; absent or empty means not recorded. Filled fields are listed in the in-app legend and under the key in SVG, PNG and PDF exports. De-identified exports drop all of them.

| Field | Type | Meaning |
| --- | --- | --- |
| `referralReason` | string | Reason for taking the pedigree. |
| `recordedBy` | string | Who drew the pedigree. |
| `recordedOn` | string | Date of intake or last update. The editor writes ISO `YYYY-MM-DD`; other text is kept and shown as is. |
| `historian` | string | Who gave the family history. |
| `maternalAncestry` | string | Ancestry of the maternal side, relative to the proband. |
| `paternalAncestry` | string | Ancestry of the paternal side, relative to the proband. |

### `CanvasSettings`

| Field | Type | Meaning |
| --- | --- | --- |
| `nodesMoveable` | boolean | When `true` every node is draggable without an individual unlock. |
| `snapToGrid` | boolean | Snap dragged nodes to a grid. |
| `snapGridSize` | number | Grid spacing in canvas pixels. |
| `nameLabels` | `"wrap"` or `"truncate"` | Optional. How a name too long for its slot is shown on the canvas: wrapped onto two lines, or cut to one line. Absent means `"wrap"`. Exports always wrap. |
| `layoutWidth` | `"minimal"` or `"relaxed"` | Optional. How wide the automatic layout may be: no wider than the widest generation, or up to two slots wider so children sit more directly under their parents. Absent means `"minimal"`. Applies to the canvas and to exports. |
| `showNumbers` | boolean | Optional. Draw each person's pedigree number (generation in Roman numerals, then place in the row, e.g. `"II-3"`) before their name, on the canvas and in figure exports. The numbers are computed from the layout, not stored. Absent means `false`. |

## `Individual`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique within the pedigree. Any non-empty string; the editor generates UUIDs. |
| `sex` | `"male"`, `"female"` or `"unknown"` | yes | Biological sex, drawn as square, circle or diamond. |
| `affected` | boolean | yes | Filled symbol when `true`. |
| `sibOrder` | number | yes | 0-indexed position within the sibling group (or among founders). |
| `deceased` | boolean | no | Diagonal slash through the symbol. |
| `carrier` | boolean | no | Carrier dot in the symbol. |
| `proband` | boolean | no | Proband arrow, with a "P" at its tail (NSGC). Normally exactly one individual. |
| `consultand` | boolean | no | Consultand arrow, without the "P" (NSGC): the person seeking counselling, who may be unaffected. Someone who is also the proband is drawn as the proband. |
| `familyHistoryUnknown` | boolean | no | Family history not known (NSGC): a "?" above the symbol. |
| `lifeStatus` | `"pregnancy"`, `"miscarriage"`, `"termination"`, `"stillbirth"` or `"ectopic"` | no | Pregnancy or pregnancy loss, drawn with the NSGC symbols (P inside the symbol, a small triangle for miscarriage, termination and ectopic, SB for stillbirth). Absent means born. Such an individual cannot have partners or children. |
| `adopted` | `"in"` or `"out"` | no | Adoption brackets round the symbol (NSGC). `in` is adopted into the family shown, drawn with a dashed line to the adoptive parents in `parentOf`; `out` is a biological child placed for adoption, drawn with a solid line to the biological parents. PED has no field for this, so Export PED drops it and warns. |
| `name` | string | no | Display name shown under the symbol. |
| `dob` | string | no | Date of birth as an ISO date, `YYYY-MM-DD`. |
| `age` | string | no | The individual's age as free text, such as `"50s"`, `"d. 72"` or `"34 y"`, for an approximate age or one known without a date. Shown under the symbol in place of the date of birth, cut to one line. Not an age of onset. De-identified exports leave it out. |
| `notes` | string | no | Free-text clinical notes. |
| `hpoTerms` | string[] | no | HPO term codes, e.g. `["HP:0001250"]`. |
| `tags` | string[] | no | Ids of tags from `Pedigree.tags` applied to this individual. |
| `onset` | string | no | Age of onset of the affected status, free text such as `"45y"`, `"40s"` or `"childhood"`. Ignored unless `affected` is `true`. |
| `tagOnset` | object | no | Age of onset per condition: keys are ids of `quadrant` tags in this individual's `tags`, values are free text as for `onset`. Entries for other tags are ignored. |
| `descendantsHidden` | boolean | no | Everyone below this individual is left out of the drawing and the exports, as are partners who married into that branch only. Nothing is removed from the data; clearing the flag shows them again. |

Optional fields may be omitted or set to `null`; both are treated as absent. Any other property on an individual is preserved as-is, so a newer PedEdit (or another tool) can add fields without older versions discarding them.

## `Partnership`

Children attach to a partnership, not to a parent. A single parent is modelled by partnering them with an `unknown`-sex individual.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique within the pedigree. |
| `individual1` | string | yes | Id of one partner. Must exist in `individuals`. |
| `individual2` | string | yes | Id of the other partner. Must exist and differ from `individual1`. |
| `consanguineous` | boolean | no | Draw a double line between the partners. |
| `childless` | `"infertility"` or `"byChoice"` | no | Childless couple mark under the couple line (NSGC): a short vertical ending in two bars for infertility, one bar for no children by choice. Only meaningful when the partnership has no children in `parentOf`; the editor clears it when a child is added. |
| `childlessReason` | string | no | Optional reason drawn under the mark, for example `"vasectomy"`. |
| `twins` | `TwinSet[]` | no | Twin sets (twins, triplets, ...) among this partnership's children. PED has no field for this, so Export PED drops it and warns. |
| `ended` | boolean | no | The relationship no longer exists (separated, divorced). Drawn as two short diagonal strokes across the couple line (NSGC). Absent means `false`. |

Any other property on a partnership is preserved as-is.

### `TwinSet`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `members` | string[] | yes | At least two ids, all children of the partnership in `parentOf`, each in at most one set. The layout keeps them side by side in this order. |
| `zygosity` | `"monozygotic"`, `"dizygotic"` or `"unknown"` | yes | Drawn as a shared fork from the sibship bar, with a bar across the fork for monozygotic and a `?` for unknown. Monozygotic members must have the same sex; the editor changes the sex of all of them together. |

## Validation on import

The importer never throws. It returns the pedigree together with a list of issues, each with a severity, a code, a message and a dotted path into the document (for example `pedigree.individuals[2].sex`).

Errors block the import:

- the text is not valid JSON, or the root is not an object
- `format` is present but not `"pededit-pedigree"`
- a required field is missing or has the wrong type (including `sibOrder` not being a number)
- duplicate individual, partnership or tag ids
- a partnership refers to an individual that does not exist, or pairs an individual with itself
- a `parentOf` key is not a partnership id, or a listed child does not exist
- an individual is a child of two partnerships, is listed twice under one partnership, or is a child of their own partnership
- circular ancestry (an individual is their own ancestor)

Warnings allow the import and are shown to the user:

- `siblingOrder` was missing and the default was applied
- the document `version` is newer than the editor's
- `pinnedPositions` or `unlockedIndividuals` name an individual that does not exist
- an individual's `tags` names a tag that is not in `Pedigree.tags`
- a twin set has fewer than two members, a member who is not a child of that partnership, or a member listed in two sets (the set is dropped)

## Worked example

A three-generation family: grandparents `i1` and `i2`, their affected daughter `i3` (the proband, with one HPO term and a pinned position) and their son `i4`, who died in infancy.

```json
{
  "format": "pededit-pedigree",
  "version": 1,
  "exportedAt": "2026-11-06T09:30:00.000Z",
  "title": "Example family",
  "pedigree": {
    "individuals": [
      { "id": "i1", "sex": "male", "affected": false, "sibOrder": 0, "name": "John" },
      { "id": "i2", "sex": "female", "affected": false, "sibOrder": 0, "name": "Mary", "dob": "1952-03-14" },
      { "id": "i3", "sex": "female", "affected": true, "proband": true, "sibOrder": 0, "hpoTerms": ["HP:0001250"] },
      { "id": "i4", "sex": "male", "affected": false, "deceased": true, "sibOrder": 1, "notes": "Died in infancy" }
    ],
    "partnerships": [
      { "id": "p1", "individual1": "i1", "individual2": "i2" }
    ],
    "parentOf": {
      "p1": ["i3", "i4"]
    },
    "siblingOrder": { "mode": "insertion", "affectedFirst": false },
    "pinnedPositions": { "i3": { "x": 180, "y": 240 } },
    "canvasSettings": { "nodesMoveable": false, "snapToGrid": true, "snapGridSize": 20 },
    "unlockedIndividuals": ["i3"]
  }
}
```

The same family as a bare pedigree is just the value of `"pedigree"` on its own.

## Where the code lives

- Exporter: `frontend/src/io/json/exporter.ts` (`exportJson`)
- Importer and validator: `frontend/src/io/json/importer.ts` (`importJson`)
- Issue codes and envelope type: `frontend/src/io/json/types.ts`
- Tests: `frontend/src/io/json/__tests__/json.test.ts`
