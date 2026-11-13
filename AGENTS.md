# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Pending work is tracked in GitHub issues (https://github.com/SACGF/pededit/issues), not in plan files. Check there before starting anything.

**Pull before starting new work.** Run `git pull --rebase` on `main` before each new task, not only at the start of a session: other agents and the maintainer push to `main` while you work, and a stale checkout means reviewing or building on old code and a rejected push at the end. If the tree has uncommitted changes, stop and ask rather than stash or discard them. Fetch again before pushing.

### Issue and release workflow

- **Why issues exist.** They are for humans: so a bug reported twice can be found as already captured, and so changes that need manual testing get tested. Decide whether work needs one on that basis:
  - **Major work** (a feature, a behaviour change, anything needing manual testing) gets an issue. Raise one if none exists.
  - **A super quick fix that needs no manual testing** (a small bug found along the way, fully covered by unit tests or the browser page checks) can go in without an issue. Do not raise an issue just to have a number to cite.
- **No other GitHub writes without being asked.** Beyond raising issues for major work and closing tested issues as described below, do not edit, comment on, label or reopen issues, PRs or milestones, and do not push, unless the user asked for that in this conversation.
- When a commit works on an issue, name it as `(#N)` in the subject. The release process finds fixes by searching commit messages, so a fix without a number is invisible.
- **Never use a closing keyword** (`closes`, `fixes`, `resolves` and their variants) in a commit message or PR description. GitHub would close the issue on merge with no testing decision made. Write `(#N)` and nothing more.
- **Issues stay open by default.** Finishing the code is not the end of an issue. An agent may close one only as a deliberate decision, once it is sure the change works and the whole issue is covered: by unit tests, by agent testing with the browser page checks (`frontend/scripts/browser/`), or both. Coverage means every behaviour the issue asks for, including a save and reload where the data model changed. Close with a comment saying what was run. Anything that depends on interaction the harness cannot drive (drag, dialogs, menus, export files, signed-in flows) stays open with the `Needs Testing` label for the maintainer to test by hand. When in doubt, label rather than close.
- An issue is **fixed** when code that solves it is on `main`. Its GitHub state says nothing about that, since fixed issues normally stay open until tested. When asked which issues are fixed, read the commits, not the open/closed flag.
- Every fixed issue goes on the current release milestone (`gh api repos/SACGF/pededit/milestones`) as soon as its code lands, tested or not. Reopening an issue keeps its milestone. When sweeping for fixed issues, searching commits for `#N` is not enough: also read issue comments for "fixed in <sha>". A fix can land under another issue's number, most often when the issue is a duplicate report raised after the fixing commit (#65 was fixed by e938281, which cites only #5).
- **"Extract", "pull out", "split off" and "move" mean move, not copy.** When asked to take future work or any other content out of an issue into its own issue, raise the new issue, then edit the original (body or comment) so only a one-line pointer remains, such as "Future work raised in #72". The original must not still contain the list. Check first whether an existing issue already tracks part of it and point at that instead of duplicating.

What exists:
- `layout-engine/`: TypeScript port of the kinship2 layout algorithm (`kindepth`, `alignped1-4`, `autohint` with the duplicate fixup and twin handling).
- Django 5 + DRF backend: `Pedigree` model with JSON data, CRUD API, social login via Google and GitHub. Legacy password endpoints are still present (#51).
- React editor: NSGC symbols, couple/sibship/consanguinity edges, pan/zoom canvas, toolbar, hover pill, more menu (also on right-click of a node or couple line, #95), proband arrow with "P" and consultand arrow (#99, `pedigree/proband.ts`), "?" above the symbol for family history not known (#100), evaluation results under the symbol ("BRCA1 +", NSGC 2022; the 2008 "E+ (BRCA1)" with the Notation setting, #114), documented "*" and the presymptomatic carrier line (#101, `pedigree/evaluation.ts`, `pedigree/notation.ts`), edit panel (name/DOB/notes, and sex, affected, proband and consultand as the menu sets them, #120), settings panel (sibling order, snap to grid, minimise width #82), undo/redo, keyboard shortcuts, auto-save, manual repositioning with pin/unpin and reset layout.
- Swap sides (#106): "Swap sides" on a couple line's right-click menu and in the person menu sets `Partnership.leftPartner`, fed to kinship2 as a spouse hint (`layout-engine/src/partnerSides.ts`), so partner order is a free choice (NSGC 2022) without pinning; partners who both have parents swap families. Swaps kinship2 can only draw with a duplicate are refused with a notice.
- Multi-select (#21): Shift/Ctrl/Cmd+click, Shift+drag rubber band and "Select with descendants" in the more menu; dragging any selected node moves and pins the group as one undo step; batch lock/unlock in the more menu and edit panel. With several selected, the more menu acts on all of them as one undo step each ("Mark 3 affected", carrier status, tags, sex, delete; A and D toggle affected and deceased, #35, `frontend/src/pedigree/batch.ts`). The store keeps `selectedIds` plus the primary `selectedId`.
- Carriers per condition (#115, `frontend/src/pedigree/conditions.ts`): a condition (quadrant) tag is affected (`Individual.tags`) or carrier (`Individual.carrierTags`) per person, the carrier drawn as the condition's section hatched and keyed "<condition> carrier"; in NSGC 2022 the sections follow the number of conditions in use on the drawn chart (one: the whole symbol, solid black in black and white; two: halves; three or four: quarters), 2008 keeps a quarter per defined condition; a carrier with no condition is half the symbol dotted in NSGC 2022 and the dot in 2008. With two or more conditions the edit panel and batch menu ask per condition and plain flags get a warning with one-click fixes. `Individual.affected` is only affected with something not recorded: recording a condition does not set it, and "affected" overall is `isAffected` (#118); marking someone with a condition affected draws black under their sections (NSGC 2022) with that warning. A quadrant tag can be a trait instead of a condition (`Tag.kind`, #118, opt-in, listed as a deliberate difference in `claude/nsgc_nomenclature.md`): a coloured section that never means affected. A pedigree with no `canvasSettings.notation` is drawn as NSGC 2008; new pedigrees, PED imports and examples are written as 2022.
- Tags and colouring (#3): `Pedigree.tags` definitions with quadrant, dot and text display styles, `Individual.tags` references, `frontend/src/pedigree/tags.ts` geometry shared by canvas and exporters, `TagsDialog`, auto legend in the app and in SVG/PNG/PDF export, per-user tag library (`/api/tag-presets/`). Pattern fills (#67): each quadrant tag can be solid, hatched, lined, cross-hatched, dotted or lightly shaded (`Tag.fill`), and the "Tag fills: black and white patterns" setting (`canvasSettings.tagFills`) draws all tags in black with patterns, canvas and exports (`frontend/src/pedigree/tagFills.ts`). See `claude/phase_7_2_plan.md`.
- Relatedness (#32): kinship and inbreeding coefficients from the drawn structure (`layout-engine/src/kinship.ts`, checked against kinship2's `kinship()`), shown read-only in the edit panel for an inbred person and for a couple who are related, autosomal with the X-linked value beside it (#87), and for any two selected people with a named relationship where the tree gives one certain name (#90, `frontend/src/pedigree/relationship.ts`). The numbers are not drawn on the canvas or in exports (#86). The double couple line is drawn from kinship above 0, with `Partnership.consanguineous` as a manual override set in the edit panel or the more menu (#85, #92). Text above the double line (#97, `Partnership.consanguinityLabel`, or the named relationship with `canvasSettings.relationshipLabels`), kept clear of nearby text and lines (#109, left out in compact rows where there is no room) and written along the line in the U-shape export. Ended relationships draw two strokes across the couple line (#98, `Partnership.ended`).
- Chart title and approximate age (#20): `Pedigree.chartTitle` (falls back to the pedigree's name) drawn above the canvas and in SVG/PNG/PDF exports, `Individual.age` free text shown under the symbol in place of the year of birth ("b. 1978"; the full DOB is never drawn, NSGC privacy). Long names wrap or truncate to the slot width (#68).
- Age of onset (#93): `Individual.onset` (affected status) and `Individual.tagOnset` (per quadrant tag), free text, edited in the edit panel, drawn under the symbol ("BC 45y") on the canvas and in exports, and in the CSV `onset` column. `frontend/src/pedigree/onset.ts`.
- Hide descendants (#94): `Individual.descendantsHidden`, set from the more menu, collapses everything below a person without deleting it; the canvas, legend and SVG/PNG/PDF/U-shape exports draw `drawnPedigree()` (`frontend/src/pedigree/collapse.ts`), and each collapsed couple's unaffected children are drawn as one NSGC group symbol with their number inside (diamond, or square/circle when they share a sex), with affected children drawn as themselves beside it (#1), on the canvas, minimap and in exports; the group symbol expands the branch on click. Several selected people can be collapsed at once from the "N selected" menu section.
- View filters (#4): `Pedigree.filters`, toggled from the toolbar's Filter menu, with a chip over the canvas while one is on. "Affected only" (the first; `frontend/src/pedigree/viewFilters.ts`) draws affected, carrier, condition-tagged, proband and consultand people with their ancestors, and each drawn couple's other children as the #1 group symbol. It goes through the same `drawnPedigree()` as hidden descendants, so exports, legend and numbers follow; CSV, PED and JSON keep everyone.
- Clinical key fields (#102): `Pedigree.clinicalDetails` (reason for referral, maternal and paternal ancestry, historian, recorded by, date), edited in a folded "Clinical details" section under the chart title, listed in the in-app legend and the export key when filled, dropped by de-identified export (`frontend/src/pedigree/clinicalDetails.ts`).
- Same-sex couples (#105, NSGC 2022 Fig. 5): "Add existing partner" and the Sex menus allow partners of one sex; their children are one partner's and a donor's (#45 donor pair) with the other partner a social parent, added from that partner or from "Add child..." in the couple line's menu, which asks for the genetic parent (`frontend/src/pedigree/sameSex.ts`). A child's two genetic parents still cannot share a sex.
- Editor warnings (#116): `frontend/src/pedigree/validation.ts` turns a pedigree into problems (dates that do not parse, are in the future or contradict each other, parents too young or old or dead at the birth, twins born apart, siblings drawn out of birth order, an unaffected proband, a deceased consultand, conflicting statuses, empty evaluations, donors and surrogates linked to nothing, people connected to nobody, ids pointing at nothing), shown as a field outline with the message in the edit panel, a "N problems" list in the toolbar (people named by pedigree number, hovering outlines them on the canvas, the one-click fixes with "Fix all like this" as one undo step, F8 / Shift+F8 for next / previous), and a small "!" marker on the canvas node only (never the minimap or exports). Warnings never block saving or editing. Partial dates are compared by `pedigree/dateRanges.ts`.
- Assisted reproduction (#45, NSGC 2008 Fig. 3): "D" donor and "S" surrogate letters, a donor as the child's genetic parent in a `donorConception` partnership drawn without a couple line, `carriedBy` (solid line) and `socialParents` (dashed line) on the child. Kinship and PED follow the genetic parents; the drawing follows Fig. 3 (the pregnancy below the woman carrying it, an egg donor's child hanging from the couple carrying it, `placementParentOf`). See `frontend/src/pedigree/assisted.ts`.
- Import/export: PED (6-column PLINK layout only, see #31), SVG/PNG/PDF with de-identification (per-field choices for evaluation detail, onset, consanguinity text and text tags, #111), PNG at 96/150/300/600 dpi with a pHYs chunk (#18), U-shape SVG export, CSV. Pedigree numbers (I-1, II-3, #8): a "Show pedigree numbers" setting draws them on their own line under each symbol, last in the NSGC label order, on the canvas and in figure exports, and the CSV always has a `pedigree_number` column; computed from the layout, never stored. `hpoTerms` exists on the data model with no UI (#46).
- Agent page checks: `frontend/scripts/browser/` runs a page in headless chromium and reports JS errors with `frontend/src/...:line`, screenshots and measures, evaluates against the dev-only `window.__pededit` stores, lints what the canvas and the SVG export draw (`lint.mjs`), and with `--fixture-via-api` checks what survives a save and reload. Every report starts with the commit Vite serves. See its `README.md`.
- CI: `.github/workflows/ci.yml` runs the unit tests, type check, backend tests and the page checks over every example on each PR and push to main (#72).
- Deploy: Gunicorn + Nginx + systemd on a VPS at pededit.com, `deploy/` scripts and `INSTALL.md`. Hardening, backups, error reporting and a health check are open (#47 to #50).

The research phase is complete: `claude/search_report.md` contains a comprehensive survey of 60+ existing pedigree tools (open-source, commercial, and academic), including a feature gap analysis organized into three tiers.

## Product Facts Every Agent Must Know

- **NSGC nomenclature is the spec.** Every symbol, line, fill and piece of text on the chart follows the NSGC pedigree nomenclature (Bennett et al. 2008 and the 2022 focused revision), summarised in our own words in `claude/nsgc_nomenclature.md`. When a drawing choice is open, do what NSGC does; when NSGC is silent, follow common practice in published pedigrees. Deliberate differences (biological sex drives genetics, gender is a display choice) are listed in that file, and new ones need the maintainer's agreement.
- **Default to the latest edition, keep the older style as an option.** Where the 2022 revision changed the drawing, 2022 is the default for new pedigrees and the 2008 form stays available through Settings > Notation (`canvasSettings.notation`, `frontend/src/pedigree/notation.ts`). A pedigree saved with no notation setting predates this and is drawn as 2008, so existing work keeps its look.
- **No account is required.** Anonymous mode is the default: creating a pedigree while signed out stores it with `owner=None` and the UUID in the URL (`/p/<uuid>`) is the only key. Users bookmark or copy the link. Google/GitHub sign-in only adds the "Your pedigrees" list and the per-user tag library. Never describe PedEdit as requiring login.
- The site is live at https://pededit.com and the code is public at https://github.com/SACGF/pededit.
- `sex` is biological sex and drives all genetics; symbols can show a recorded gender identity instead, with AMAB/AFAB/UAAB below (see below, #26).

## Directory Guides

Each major directory has its own `AGENTS.md` with the non-obvious facts about that code. Read the one for any directory you work in:

- `layout-engine/AGENTS.md` — kinship2 port, 1-based indexing, where tests live
- `frontend/AGENTS.md` — app structure, stores, auth tokens, running and testing
- `frontend/src/pedigree/AGENTS.md` — canvas renderer and symbol drawing
- `frontend/src/io/AGENTS.md` — PED import, SVG/PNG/PDF/CSV export, U-shape
- `backend/AGENTS.md` — Django config file, data model, anonymous access rules, auth
- `deploy/AGENTS.md` — VPS deploy script and services
- `claude/AGENTS.md` — index of plans and research
- Strategy, user research and outreach notes are in the private repo `SACGF/pededit_private`, not here
- `test-data/ped/README.md` — PED test corpus

**Keep them current.** When you learn something about a directory that is not obvious from reading its code (a gotcha, a convention, why something is the way it is, a product fact), add it to that directory's `AGENTS.md` in the same change. Do not duplicate what the code or git history already says.

## Key Reference Documents

- `claude/layout_engine_guide.md` — **read this before working on the renderer or layout algorithm**: explains `LayoutResult` field semantics, a worked example, and the three rendering rules (nodes, couple lines, sibship connections)
- `claude/nsgc_nomenclature.md`: the NSGC pedigree nomenclature (Bennett et al. 2008, 2022 revision) that the drawing follows, where we conform, where we differ on purpose (sex, not gender) and the open gaps. Read it before adding or changing any symbol, line or text under a symbol.
- `claude/search_report.md` — domain research and feature gap analysis
- `claude/export_u_plan.md`: how the U-shape export works (open items on #2). `claude/phase_7_2_plan.md`: how tags and colouring work (#3). Design notes for other open issues are linked from the issues themselves.

## What This Project Is

A new open-source pedigree editor — a web-based tool for drawing, editing, and managing genetic family trees used in clinical genetics, genetic counseling, and medical research.

**Target users:** Genetic counselors, clinical genetics teams, research geneticists.

**North star:** Every open-source pedigree tool trades correct layout for simplicity, and almost none have drag-and-drop repositioning (pedigreejs added SHIFT+drag in December 2024, without persistent pinning; see `user_research/github_issues.md` in the private repo `SACGF/pededit_private`). The layout problem is solved in the [kinship2](https://cran.r-project.org/package=kinship2) R package — we ported it to TypeScript, giving us publication-quality automatic layout as a native npm package for the first time. Everything else is built on top of that foundation.

## Key Research Findings (from `claude/search_report.md`)

### Best open-source reference implementations
- **pedigreejs** (GPL-3.0, active): D3.js-based, standard NSGC nomenclature, undo/redo, JSON/BOADICEA/PED import, SVG/PNG export. Best candidate to build upon or study.
- **Open Pedigree** (LGPL-2.1, abandoned 2019): Feature-rich but uses legacy Prototype.js. Most comprehensive feature set among open-source tools.
- **DrawPed** (active, 2024 NAR paper): Lightweight, no JS framework dependencies, publication-ready SVG.
- **family-chart** (MIT, 712 stars): TypeScript + D3.js, framework-agnostic, most popular JS family tree library. Not genetics-specific but highly adaptable.

### Commercial tools defining the feature ceiling
- **FamGenix**: Most feature-complete for pedigree drawing itself — manual node repositioning, toggle display filters, all cancer risk models simultaneously.
- **Progeny**: Industry leader (800+ institutions), but users complain about inability to manually reposition nodes.
- **TrakGene**: Pedigree is one module of a broader genomic health record platform.

### Feature tiers

**Tier 1 — Open source table stakes (must match):** Basic drawing, NSGC symbols, interactive editing, SVG/PNG export, undo/redo, consanguinity, twins, multiple spouses, PED/JSON import/export, web-based, offline support (24 features total — see report §9 Tier 1).

**Tier 2 — Commercial only:** Patient intake questionnaires, integrated risk assessment, EHR integration, HIPAA compliance, manual node repositioning (FamGenix only), HPO phenotyping, VUS alerts, letter templates, role-based access (19 features — see report §9 Tier 2).

**Tier 3 — Nobody does this (differentiation opportunity):**
- Drag-and-drop node repositioning in open-source (FamGenix is the only tool with this, at $500+/year)
- Non-linear layout (U-shape, horseshoe, radial) for large families
- Arbitrary branch collapsing with expand/collapse interaction
- Round-trip SVG editing (export → hand-edit → re-import as structured data)
- Interactive editing at scale (hundreds of individuals)
- Nested consanguinity loops without overlapping lines
- Cross-generational matings with correct alignment
- Multiple traits/conditions with distinct shading in one pedigree
(22 features total — see report §9 Tier 3)

### Biological sex notation
`Individual.sex` is **biological sex** (sex assigned at birth) and is the only thing genetics uses: layout, kinship and X-linked kinship, twins, PED export and every other calculation, because sex determines inheritance patterns, X-linkage and sex-specific risk. Never make any of these read gender identity.

Gender identity is optional (`Individual.genderIdentity`: man, woman, non-binary, #26) and only changes the drawing. The pedigree setting "Symbols show" (`canvasSettings.symbolsShow`) defaults to "gender identity where recorded": a person with a recorded gender identity is drawn with the NSGC 2022 symbol for that gender, and their sex assigned at birth is written under it as AMAB, AFAB or UAAB (unless gender and sex match). People with no gender identity recorded, pregnancies and losses draw by sex as before. "Biological sex" draws everyone by sex. So a trans man who is 46,XX keeps `sex: "female"` (and is treated as such by every calculation) and is drawn as a square with AFAB below by default, or as a circle in sex mode. All shape decisions go through `frontend/src/pedigree/gender.ts`.

## Tooling Preferences

**Python:** Use `uv` for all Python environment and package operations (`uv venv`, `uv pip install`, `uv run`). Do not use `pip` or `python -m venv` directly.

## Checking frontend changes

A change under `frontend/src/` is not done until it has been run in the browser on a page whose data reaches the changed code:

```bash
node frontend/scripts/browser/servers.mjs up --frontend-only      # once per session (plain `up` adds Django)
node frontend/scripts/browser/console.mjs --fixture example:2 [--click SEL ...]   # JS errors, mapped to source lines
node frontend/scripts/browser/shot.mjs --fixture example:2                        # then read the PNG
```

`--fixture` takes `example:N`, a `.ped` file or a Pedigree `.json` and needs no backend, so it cannot catch serializer bugs; check anything that must survive a save against `/p/<id>` with Django running. Use `--as-agent` for signed-in pages. These tools only drive localhost. Details in `frontend/scripts/browser/README.md`. Node 20+ is required.

## Writing Style

No em-dashes. Use commas, periods, or rewrite the sentence instead.

## Visual Design Direction

**Black and white minimalist.** The UI should look like a clinical pedigree chart — not a generic SaaS app. The pedigree symbols (squares, circles, filled/unfilled, slashes, connecting lines) are the visual language; the chrome around them should get out of the way.

- Pedigree canvas: white background, black symbols and lines, no colour except where clinically meaningful (e.g. multi-trait shading, #3)
- App UI: minimal, low-contrast chrome — the pedigree is the focus, not the toolbar
- No gradients, drop shadows, rounded-corner cards, or decorative colour on pedigree elements
- Typography: clean sans-serif, small, functional

This is the established aesthetic for clinical and publication pedigrees. Maintain it across all phases.

---

## Architectural Decisions (settled)

**Stack:** Django 5 + DRF + PostgreSQL + simplejwt on the backend; React 18 + TypeScript + Vite + React Flow (`@xyflow/react`) + Zustand + Tailwind + shadcn/ui on the frontend. Layout engine is a local npm workspace package (`@pedigree-editor/layout-engine`) imported by the frontend.

**Data model:** Graph-based — `Individual` nodes, `Partnership` edges, `parentOf` map. JSON serialization is the native format; PED/BOADICEA/GA4GH FHIR are import targets. The `Pedigree` interface in `layout-engine/src/types.ts` is canonical — the Django `JSONField` and the Zustand store both mirror it exactly.

**Layout algorithm:** Ported from kinship2 (R). The hard parts are done: `kindepth` assigns generations, `alignped1–4` place individuals and optimise positions. `autohint` is a full port of the kinship2 duplicate fixup (sibling shift plus spouse hints). See `claude/layout_engine_guide.md` for how to consume `LayoutResult` in the renderer, including pass-through spouse markers for people with three or more partners.
