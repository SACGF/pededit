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
| `filters` | `ViewFilters` | no | View filters that simplify the drawing (canvas and SVG, PNG, PDF exports). JSON, PED and CSV still include everyone. Absent means no filter. |

Any other property on the pedigree object is preserved as-is through import and export.

### `Tag`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique among the pedigree's tags. |
| `label` | string | yes | Full name shown in the legend and tag manager. |
| `color` | string | yes | CSS colour, normally `#rrggbb`. |
| `style` | `"quadrant"`, `"dot"` or `"text"` | yes | `quadrant` fills a sector of the symbol (NSGC multi-condition shading, sector taken from the tag's position among quadrant tags). `dot` draws a small coloured dot below the symbol. `text` draws short coloured text below the symbol. |
| `abbrev` | string | no | Short canvas text for `text` tags. Defaults to `label`. |
| `fill` | `"solid"`, `"horizontal"`, `"vertical"`, `"diagonal"`, `"crosshatch"`, `"dots"` or `"shade"` | no | How a `quadrant` tag fills its sector: solid in its colour, or a pattern in its colour on white (horizontal or vertical lines, diagonal hatching, cross-hatching, dots), or `shade`, a light tint of the colour (light grey for black). Absent means `"solid"`. Ignored for `dot` and `text` tags. |

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

### `ViewFilters`

Global switches that simplify the drawing without changing the data. The canvas, legend, pedigree numbers and SVG, PNG and PDF exports draw the filtered pedigree; JSON, PED and CSV keep everyone. Each filter is off when absent.

| Field | Type | Meaning |
| --- | --- | --- |
| `affectedOnly` | boolean | Draw only affected people, carriers, people with a condition (quadrant) tag and the proband (and consultand), with every ancestor on their line of descent. Each drawn couple's other children are drawn as one symbol with their number inside (NSGC: a number inside a symbol means that many siblings); their partners and descendants are not drawn. Has no effect when nobody qualifies. |

### `CanvasSettings`

| Field | Type | Meaning |
| --- | --- | --- |
| `nodesMoveable` | boolean | When `true` every node is draggable without an individual unlock. |
| `snapToGrid` | boolean | Snap dragged nodes to a grid. |
| `snapGridSize` | number | Grid spacing in canvas pixels. |
| `nameLabels` | `"wrap"` or `"truncate"` | Optional. How a name too long for its slot is shown on the canvas: wrapped onto two lines, or cut to one line. Absent means `"wrap"`. Exports always wrap. |
| `layoutWidth` | `"minimal"` or `"relaxed"` | Optional. How wide the automatic layout may be: no wider than the widest generation, or up to two slots wider so children sit more directly under their parents. Absent means `"minimal"`. Applies to the canvas and to exports. |
| `showNumbers` | boolean | Optional. Draw each person's pedigree number (generation in Roman numerals, then place in the row, e.g. `"II-3"`) before their name, on the canvas and in figure exports. The numbers are computed from the layout, not stored. Absent means `false`. |
| `relationshipLabels` | boolean | Optional. Write the relationship (for example `"first cousins"`) above every consanguineous couple's double line that can be named and has no `consanguinityLabel` of its own, on the canvas and in figure exports. Absent means `false`. |
| `symbolsShow` | `"gender"` or `"sex"` | Optional. What symbol shapes show. `"gender"`: someone with a recorded `genderIdentity` is drawn with that gender's symbol (square for a man, circle for a woman, diamond for non-binary) and their sex assigned at birth is written below it as AMAB, AFAB or UAAB (NSGC 2022). `"sex"`: everyone is drawn by biological sex. Absent means `"gender"`. Layout and genetics always use `sex`. |
| `notation` | `"nsgc2022"` or `"nsgc2008"` | Optional. Edition of the NSGC nomenclature drawn. `"nsgc2022"`: evaluation results are written as the detail then the result (`"BRCA1 c.5266dupC +"`). `"nsgc2008"`: the E notation (`"E+ (BRCA1 c.5266dupC)"`, numbered E1, E2 when there are several). Absent means `"nsgc2022"`. |
| `tagFills` | `"color"` or `"monochrome"` | Optional. `"monochrome"` draws every tag in black, on the canvas and in figure exports, for print: each quadrant tag with a pattern, its own `fill` or, when that is solid, the first of diagonal, horizontal, dots, crosshatch, shade, vertical that no other quadrant tag has (cycling once all are taken). Absent means `"color"`. |

## `Individual`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique within the pedigree. Any non-empty string; the editor generates UUIDs. |
| `sex` | `"male"`, `"female"` or `"unknown"` | yes | Biological sex (sex assigned at birth), drawn as square, circle or diamond unless a gender identity is drawn instead. Layout, kinship and PED export always use it. |
| `genderIdentity` | `"man"`, `"woman"` or `"nonbinary"` | no | Gender identity (NSGC 2022); `"nonbinary"` covers non-binary and gender diverse. Changes only the symbol drawn, when `CanvasSettings.symbolsShow` is `"gender"` (the default). Ignored for pregnancies and losses. |
| `affected` | boolean | yes | Filled symbol when `true`. |
| `sibOrder` | number | yes | 0-indexed position within the sibling group (or among founders). |
| `deceased` | boolean | no | Diagonal slash through the symbol. Alone it means deceased, date of death unknown. |
| `carrier` | boolean | no | Carrier dot in the symbol. |
| `presymptomatic` | boolean | no | Asymptomatic or presymptomatic carrier (NSGC 2008 Fig. 4): clinically unaffected now but may develop the condition, a vertical line through the symbol. The editor offers it as one carrier status with `carrier`, so it never sets both. Not drawn on an affected symbol. |
| `evaluations` | array of objects | no | Evaluations and test results (NSGC 2008 Fig. 4), one line each under the symbol: the detail then `+`, `-` or `u` for the result, e.g. "BRCA1 c.5266dupC +" (NSGC 2022). With `canvasSettings.notation` `"nsgc2008"`: `E`, the result, then the detail in parentheses, "E+ (BRCA1 c.5266dupC)", numbered E1, E2 when there are several. Each object has `result` (`"positive"`, `"negative"` or `"uninformative"`, absent for no result yet), `detail` (string) and `documented` (boolean: a "*" at the symbol's lower right). |
| `proband` | boolean | no | Proband arrow, with a "P" at its tail (NSGC). Normally exactly one individual. |
| `consultand` | boolean | no | Consultand arrow, without the "P" (NSGC): the person seeking counselling, who may be unaffected. Someone who is also the proband is drawn as the proband. |
| `familyHistoryUnknown` | boolean | no | Family history not known (NSGC): a "?" above the symbol. |
| `lifeStatus` | `"pregnancy"`, `"miscarriage"`, `"termination"`, `"stillbirth"` or `"ectopic"` | no | Pregnancy or pregnancy loss, drawn with the NSGC symbols (P inside the symbol, a small triangle for miscarriage, termination and ectopic, SB for stillbirth). Absent means born. Such an individual cannot have partners or children. |
| `adopted` | `"in"` or `"out"` | no | Adoption brackets round the symbol (NSGC). `in` is adopted into the family shown, drawn with a dashed line to the adoptive parents in `parentOf`; `out` is a biological child placed for adoption, drawn with a solid line to the biological parents. PED has no field for this, so Export PED drops it and warns. |
| `reproductiveRole` | `"donor"` or `"surrogate"` | no | Assisted reproduction (NSGC 2008 Fig. 3): `donor` draws a D inside the symbol (sperm or egg donor), `surrogate` an S (a woman who carried a pregnancy she is not the genetic mother of). A woman who is both egg donor and carrier is a donor. |
| `carriedBy` | string | no | Id of the woman who carried this pregnancy when she is not its genetic mother: a surrogate, or the mother of a child conceived with a donor egg. Drawn as a solid line from her to the child (a pregnancy is a biological relationship). Not a parent: kinship and PED use the genetic parents in `parentOf`. |
| `socialParents` | string[] | no | Ids of parents who are not the child's genetic parents, such as the intended father when donor sperm is used. Drawn as a dashed line of descent. Not parents for kinship or PED. PED has no field for these three, so Export PED drops them and warns. |
| `name` | string | no | Display name shown under the symbol. |
| `dob` | string | no | Date of birth as an ISO date, `YYYY-MM-DD`. A bare year (`"1935"`) is drawn as the year too. |
| `dod` | string | no | Date of death: `YYYY-MM-DD`, or `YYYY-MM` or `YYYY` when only part is known. Only drawn when `deceased` is `true` (the editor sets both together). Under the symbol it is the age at death, `"d. 72y"`, when both dates are full, otherwise the year, `"d. 2007"` (under `"b. 1935"` when the year of birth is known). The free-text `age` wins over both. De-identified exports leave it out. |
| `age` | string | no | The individual's age as free text, such as `"50s"`, `"d. 72"` or `"34 y"`, for an approximate age or one known without a date. Shown under the symbol in place of the date of birth, cut to one line. Not an age of onset. De-identified exports leave it out. |
| `notes` | string | no | Free-text clinical notes. |
| `hpoTerms` | string[] | no | HPO term codes, e.g. `["HP:0001250"]`. |
| `tags` | string[] | no | Ids of tags from `Pedigree.tags` applied to this individual. |
| `onset` | string | no | Age of onset of the affected status, free text such as `"45y"`, `"40s"` or `"childhood"`. Ignored unless `affected` is `true`. |
| `tagOnset` | object | no | Age of onset per condition: keys are ids of `quadrant` tags in this individual's `tags`, values are free text as for `onset`. Entries for other tags are ignored. |
| `descendantsHidden` | boolean | no | Everyone below this individual is left out of the drawing and the exports, as are partners who married into that branch only. Nothing is removed from the data; clearing the flag shows them again. |
| `placeholder` | boolean | no | Made automatically as the second parent of a child given only one. While nothing else is recorded about them, PedEdit removes them with their couple line when the couple's last child is moved, detached or deleted. Setting their sex clears the flag. |

Optional fields may be omitted or set to `null`; both are treated as absent. Any other property on an individual is preserved as-is, so a newer PedEdit (or another tool) can add fields without older versions discarding them.

## `Partnership`

Children attach to a partnership, not to a parent. A single parent is modelled by partnering them with an `unknown`-sex individual.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique within the pedigree. |
| `individual1` | string | yes | Id of one partner. Must exist in `individuals`. |
| `individual2` | string | yes | Id of the other partner. Must exist and differ from `individual1`. |
| `consanguineous` | boolean | no | Draw a double line between the partners. |
| `consanguinityLabel` | string | no | Text written above the double line, for example `"third cousins"`: the degree of relationship when the drawing does not show it (NSGC). Drawn only when the line is double. |
| `childless` | `"infertility"` or `"byChoice"` | no | Childless couple mark under the couple line (NSGC): a short vertical ending in two bars for infertility, one bar for no children by choice. Only meaningful when the partnership has no children in `parentOf`; the editor clears it when a child is added. |
| `childlessReason` | string | no | Optional reason drawn under the mark, for example `"vasectomy"`. |
| `twins` | `TwinSet[]` | no | Twin sets (twins, triplets, ...) among this partnership's children. PED has no field for this, so Export PED drops it and warns. |
| `ended` | boolean | no | The relationship no longer exists (separated, divorced). Drawn as two short diagonal strokes across the couple line (NSGC). Absent means `false`. |
| `leftPartner` | string | no | The id of the partner drawn on the left of this couple, `individual1` or `individual2`. Partner order is a free choice under NSGC 2022. Absent means the layout chooses (kinship2: the man on the left, unless placing someone with several partners needs otherwise). Set by "Swap sides"; never pins anyone. |
| `donorConception` | boolean | no | The children were conceived with a donated sperm or egg (NSGC 2008 Fig. 3). The partners are the children's genetic parents, and kinship and PED treat them as such, but they are not a couple: no couple line is drawn, and a line runs from each of them to the children instead. Absent means `false`. |

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
