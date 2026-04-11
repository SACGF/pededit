# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This project is in the **research and planning phase**. No source code exists yet. The tech stack and build system are yet to be chosen.

The research phase is complete: `claude/search_report.md` contains a comprehensive survey of 60+ existing pedigree tools (open-source, commercial, and academic), including a feature gap analysis organized into three tiers.

## What This Project Is

A new open-source pedigree editor — a web-based tool for drawing, editing, and managing genetic family trees used in clinical genetics, genetic counseling, and medical research.

**Target users:** Genetic counselors, clinical genetics teams, research geneticists.

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

## Architectural Considerations

When implementation begins, the suggested stack from research is **React/TypeScript + D3.js** — the same foundation as pedigreejs and family-chart, enabling potential code reuse and aligning with the most actively maintained open-source work in this space.

Core data model should be graph-based (individuals as nodes, relationships as edges) with a JSON serialization format, importable from PED/BOADICEA/GA4GH FHIR formats.

Layout is the hardest problem: existing tools use D3 hierarchical layout which breaks down for consanguinity loops, cross-generational matings, and large pedigrees. Madeline 2.0 (C++) uses a hybrid cyclic/acyclic algorithm worth studying for the layout engine.
