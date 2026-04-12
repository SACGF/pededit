# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Phases 1–4 complete.** See `claude/overall_plan.md` for the full phase plan.

- **Phase 1:** `layout-engine/` — TypeScript package, 16 tests, kinship2 layout algorithm
- **Phase 2:** Django + React scaffold — auth, CRUD, empty canvas
- **Phase 3:** Visual renderer — NSGC symbols, couple/sibship/consanguinity edges, read-only pan/zoom canvas. 32 tests in `frontend/src/pedigree/__tests__/`.
- **Phase 4:** Core interaction — toolbar (add male/female/unknown), hover pill (add parents/children/siblings), more menu (mark affected/deceased/proband, set sex, delete, move sib), edit panel (name/DOB/notes), settings panel (sibling order), undo/redo, keyboard shortcuts, auto-save on pedigree switch. Next: Phase 5 (format I/O + SVG export).

The research phase is complete: `claude/search_report.md` contains a comprehensive survey of 60+ existing pedigree tools (open-source, commercial, and academic), including a feature gap analysis organized into three tiers.

## Key Reference Documents

- `claude/overall_plan.md` — phase-by-phase build plan
- `claude/layout_engine_guide.md` — **read this before working on the renderer or layout algorithm**: explains `LayoutResult` field semantics, a worked example, and the three rendering rules (nodes, couple lines, sibship connections)
- `claude/search_report.md` — domain research and feature gap analysis

## What This Project Is

A new open-source pedigree editor — a web-based tool for drawing, editing, and managing genetic family trees used in clinical genetics, genetic counseling, and medical research.

**Target users:** Genetic counselors, clinical genetics teams, research geneticists.

**North star:** Every open-source pedigree tool trades correct layout for simplicity, and none have drag-and-drop repositioning. The layout problem is solved in the [kinship2](https://cran.r-project.org/package=kinship2) R package — we ported it to TypeScript, giving us publication-quality automatic layout as a native npm package for the first time. Everything else is built on top of that foundation.

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
Pedigree symbols (square/circle/diamond) represent **biological sex**, not gender, because sex determines inheritance patterns, X-linkage, and sex-specific risk models. The NSGC 2022 "gender inclusivity" update conflates clinical communication with genetic notation. A trans man who is 46,XX still needs a circle on the pedigree. Gender is patient-facing clinical metadata, not a pedigree data requirement.

## Tooling Preferences

**Python:** Use `uv` for all Python environment and package operations (`uv venv`, `uv pip install`, `uv run`). Do not use `pip` or `python -m venv` directly.

## Visual Design Direction

**Black and white minimalist.** The UI should look like a clinical pedigree chart — not a generic SaaS app. The pedigree symbols (squares, circles, filled/unfilled, slashes, connecting lines) are the visual language; the chrome around them should get out of the way.

- Pedigree canvas: white background, black symbols and lines, no colour except where clinically meaningful (e.g. multi-trait shading in Phase 7)
- App UI: minimal, low-contrast chrome — the pedigree is the focus, not the toolbar
- No gradients, drop shadows, rounded-corner cards, or decorative colour on pedigree elements
- Typography: clean sans-serif, small, functional

This is the established aesthetic for clinical and publication pedigrees. Maintain it across all phases.

---

## Architectural Decisions (settled)

**Stack:** Django 5 + DRF + PostgreSQL + simplejwt on the backend; React 18 + TypeScript + Vite + React Flow (`@xyflow/react`) + Zustand + Tailwind + shadcn/ui on the frontend. Layout engine is a local npm workspace package (`@pedigree-editor/layout-engine`) imported by the frontend.

**Data model:** Graph-based — `Individual` nodes, `Partnership` edges, `parentOf` map. JSON serialization is the native format; PED/BOADICEA/GA4GH FHIR are import targets. The `Pedigree` interface in `layout-engine/src/types.ts` is canonical — the Django `JSONField` and the Zustand store both mirror it exactly.

**Layout algorithm:** Ported from kinship2 (R). The hard parts are done: `kindepth` assigns generations, `alignped1–4` place individuals and optimise positions. `autohint` is currently a stub (sequential ordering); full duplicate-detection reordering is Phase 6. See `claude/layout_engine_guide.md` for how to consume `LayoutResult` in the renderer.
