# Glossary

One word per concept (#137). Read this before writing UI text, the guides,
an issue or a comment. The app's labels, the docs (`AGENTS.md` files,
`claude/*.md`) and new issues and comments use the "users see" word; code
keeps its own names. Old issues and commit messages stay as written.

| Concept | Users see | Code | Avoid |
|---|---|---|---|
| Everything the Conditions and tags dialog defines | "Conditions and tags" (`CONDITIONS_AND_TAGS`): the dialog, the legend header, the Person tab section, the more menu section while the only condition is listed there | `Tag`, `Pedigree.tags`, `TagsDialog` | "Tags" for the whole list |
| Condition: a section of the symbol meaning affected with it | "condition"; "Affected with X", "Carrier of X", "X carrier" | a `Tag` with `style: "quadrant"` that is not a trait (`isConditionTag`, `conditionTags`), affected in `Individual.tags`, carrier in `Individual.carrierTags` | "quadrant tag", "condition tag" (outside code), "disease" |
| Trait: a coloured section that never means affected | "trait" | `Tag.kind: "trait"` | calling it a condition |
| Tag: anything defined that is not a condition | "tag": a trait, a dot tag or a text tag; the more menu's "Tags" once conditions have their own section | `Tag` | "tag" for a condition |
| Section: the part of the symbol a condition or trait fills | "section", named as drawn: "whole symbol", "left half", "upper left" | `style: "quadrant"`, `sectionInfo`, `Sector` | "quadrant" or "quarter" except for a quarter actually drawn |
| Dot tag, text tag | "dot", "text"; text tags carry a short abbreviation | `style: "dot"`, `style: "text"`, `Tag.abbrev` | |
| Affected or a carrier with no condition recorded | "Affected", "Carrier"; with two or more conditions "Affected (condition not recorded)", "Carrier (condition not recorded)" | the plain flags `Individual.affected`, `Individual.carrier` (`plainAffected`, `plainCarrier`) | "plain" in the UI |
| Affected at all | "affected" | `isAffected` (the flag or any condition) | reading `Individual.affected` for it |
| The chart's key in the app | "legend", on the Pedigree tab | `Legend.tsx`, rows from `keyRows(pedigree, "legend")` | "key" |
| The chart's key in SVG/PNG/PDF exports | "key" (NSGC's word) | `<g class="pedigree-key">`, `pedigree/exportKey.tsx`, rows from `keyRows(pedigree, "export")` | "legend" |
| Drawing conditions and tags in colour or black and white | Settings "Conditions and tags drawn in": Colour / Black and white patterns | `canvasSettings.tagFills`, `"monochrome"` | "Tag fills" |
| A signed-in user's saved conditions and tags | "My library", in the Conditions and tags dialog | `TagPreset`, `/api/tag-presets/` | "tag library" |
| A person on the chart | "person", "people" | `Individual` | "individual" in UI text |
| The side panel's tabs (#135) | "Person tab" (the selected person, their couples, or the batch panel for several), "Pedigree tab" (chart title, clinical details, legend) | `EditPanel.tsx`, `PanelTab` | "edit panel" |
| The menu on a person or couple line (the ⋯ button or right-click) | "More options" | `MoreMenu.tsx`; "the more menu" in docs | |
| Who the family was ascertained through; who seeks counselling | "proband" (arrow with P), "consultand" (arrow without P) | `Individual.proband`, `Individual.consultand`, `pedigree/proband.ts` | "patient" ("index case" only as the legend's gloss) |
| A check the editor flags (#116) | "problem", "N problems" | `Problem`, `RULES` in `pedigree/validation.ts`, severity `"warning"` or `"error"` | "error" for all of them |
