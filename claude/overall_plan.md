# Overall Build Plan

*Pedigree Editor — high-level phase plan*

---

## Sequencing rationale

The project has one genuinely hard algorithmic problem (pedigree layout), one genuinely hard rendering problem (relationship line routing), and the rest is solid but tractable React + Django work. The plan front-loads the hard problems so failures are cheap to fix, and defers polish and ecosystem work until the core editor is proven.

Each phase produces something testable and, from Phase 4 onward, something demonstrable.

---

## Phase 1 — Data model + layout algorithm (pure TypeScript, no UI) ✅ COMPLETE

**Delivered:** `layout-engine/` — self-contained TypeScript package, 16 tests passing.

**What was built:**
- Full domain type hierarchy: `Individual`, `Partnership`, `Pedigree`, `LayoutInput`, `LayoutResult`, `AlignState`, `Hints`
- `kindepth` — generation depth assignment with couple-alignment pass
- `alignped1` / `alignped2` / `alignped3` / `alignped4` — all four kinship2 sub-routines ported
- `alignPedigree` — orchestrator: converts `Pedigree` → layout, runs algorithm, returns `LayoutResult`
- `autohint` — stub (sequential ordering); produces valid layouts but not visually optimised for large families with cross-generational couples
- `utils` — `buildLayoutInput` / `buildPedigreeFromFlat` for tests

**Known limitation:** Full `autohint` (duplicate detection → sibling reordering → spouse hints) is not yet implemented. This affects visual quality for complex pedigrees (e.g. kinship2's SAMPLE_PED_1 produces `n = [8,19,22,8]` in R; the stub produces different but structurally valid counts). Layout correctness — monotonically increasing positions, valid fam pointers, all individuals placed — is verified. Autohint can be completed as part of Phase 6 layout improvements if needed, or earlier if visual quality becomes a blocker.

**Defer:** No UI, no Django, no React. Just types and algorithms.

---

## Phase 2 — Project scaffold

**What:** Wire up the full stack with working but empty plumbing.

**Backend (Django + DRF):**
- Django project with DRF
- `Pedigree` model: owner, title, data (JSONField), created/updated timestamps
- CRUD endpoints: `POST /api/pedigrees/`, `GET /api/pedigrees/{id}/`, `PATCH`, `DELETE`
- Simple JWT auth (register/login/refresh)
- Postgres

**Frontend (React + TypeScript + Vite):**
- Vite project with React 18 + TypeScript
- React Flow (xyflow) installed and rendering an empty canvas
- Zustand store wired up (empty pedigree state)
- Tailwind + shadcn/ui
- API client pointing at Django

**Why here:** Get the full-stack wiring done before there is real UI to complicate it. Auth and storage are plumbing — easier to add to an empty app than retrofit onto a working one. Django model design is informed by the Phase 1 data model.

**Milestone:** Register `peded.io` on Cloudflare — Phase 1 proving out means the project is real.

**Defer:** No pedigree-specific rendering yet, no actual editor features.

---

## Phase 3 — Visual renderer (read-only)

**What:** Given a `Pedigree` + `Layout`, render it correctly as interactive React Flow components. No editing yet — just display.

**Node components (React Flow custom nodes) for all NSGC symbols:**
- Square/circle/diamond (male/female/unknown sex)
- Filled/unfilled/half-filled/dot (affected/unaffected/carrier/obligate carrier)
- Diagonal slash overlay (deceased)
- Proband arrow
- Pregnancy triangle, miscarriage/termination symbols
- Grouped siblings node (n inside symbol)

**Edge components (React Flow custom edges) for all relationship line types:**
- Horizontal couple line with vertical drop to sibship line
- Sibship horizontal line with drops to each child
- Consanguinity double-line
- Loop routing for distant consanguinity (line goes below the diagram)
- Dashed line for non-biological relationships

**Why here:** Separating rendering from interaction means you can verify "does this pedigree look visually correct" before adding any edit operations. Easier to catch rendering bugs when the state is static. The consanguinity loop routing is the trickiest rendering problem — solve it here in isolation.

**Deliverable:** Hard-coded example pedigrees render correctly. Someone reviewing the repo can see it looks like a real pedigree tool.

**Defer:** No editing, no drag-and-drop, no format I/O.

---

## Phase 4 — Core interaction

**What:** The first interactive version. Users can build a pedigree from scratch.

**Editing operations:**
- Click empty canvas → add individual (sex selector)
- Click individual + drag to another → connect as partner or parent-child (context-sensitive)
- Context menu on individual: add partner, add child, add sibling, set sex, set affected, mark deceased, mark proband
- Click to select, delete key to remove
- Edit panel (sidebar): name, DOB, notes, condition labels
- Auto-layout reruns after every structural edit

**State:**
- Zustand store holds canonical `Pedigree` data model
- Every mutation goes through an action that snapshots state → full undo/redo via snapshot stack (Immer makes this cheap)

**Why here:** By Phase 4 the renderer is proven and the data model is solid, so interaction can be built on a known-good foundation. Undo/redo via snapshots is trivial to add here and nearly impossible to retrofit later.

**Deliverable:** A working pedigree editor. Can build a 3-generation clinical pedigree from scratch. This is the first thing worth showing to genetic counsellors for feedback.

---

## Phase 5 — Format I/O + SVG export

**What:** Make the tool interoperable with existing clinical workflows and useful for publication.

**Import:**
- PED file (standard linkage format) — trivial parse, maps directly to data model
- BOADICEA format — enables migration from pedigreejs
- JSON (native format) — round-trip of internal data model

**Export:**
- JSON (native) — save to Django backend with shareable URL
- PED file
- SVG (publication quality) — **this is a separate rendering pass**, not a DOM screenshot. Takes layout output and writes clean, minimal SVG suitable for Inkscape / journal submission (Nature max 18×24cm, Cell max 6.5×8in). No React, no inline styles, just geometry.
- PNG (rasterise the SVG)

**De-identification mode (export option):**
- One-click toggle before export: replaces all names with standard generation/individual notation (I-1, I-2, II-1, etc.) per NSGC convention
- Also strips DOB/death dates and any free-text notes fields
- Ages optionally bucketed into ranges (infant / child / 20s / 30s / etc.) rather than hidden entirely, since age ranges preserve clinically relevant information
- Numbering is derived from the layout pass (generation already known, left-to-right order already known) — no separate algorithm needed
- Display-layer only: the data model retains real names; the export renderer substitutes notation

**Why here:** Format I/O is what makes the tool useful to people with existing data. SVG export quality is a key signal of "this is a serious tool" to the academic/clinical audience. Doing it after the renderer is proven means the export geometry is consistent with what the user sees on screen.

---

## Phase 6 — Drag-and-drop repositioning + layout improvements

**This is the primary differentiator.** No open-source tool has this. FamGenix charges $500+/year for it.

**Manual repositioning:**
- React Flow node dragging already works; wire it to persist overridden positions in the data model
- When a node has a manually-set position, auto-layout preserves it and fits other nodes around it
- Visual indicator that a node is manually positioned; "reset layout" button restores full auto-layout

**Layout improvements:**
- Compact mode: tighten inter-generation spacing for presentation
- Fit-to-page: reorganise layout to fit a target aspect ratio (not just scale — actually reorganise)
- Large family handling: pagination / viewport clipping for pedigrees > ~80 individuals

**Why here:** This builds on the solid interaction model from Phase 4. Manual repositioning requires the state management to already be right (undo/redo must include position overrides). Layout improvements are iterative on the Phase 1 algorithm.

---

## Phase 7 — Advanced features (the "nobody does this" tier)

These are the features that exist nowhere in open-source and partially in commercial tools. Build them after the core is stable and you have real user feedback.

**Branch collapsing:**
- Right-click any subtree → "collapse to n individuals" node
- Collapsed node shows sex breakdown and affected count
- Click to expand
- De-identification mode: collapse leaf branches, strip names/dates, preserve genetic structure for publication

**Multi-trait display:**
- Multiple conditions shown with distinct quadrant shading within a single symbol (e.g. top-left = breast cancer, bottom-right = colon cancer)
- Legend auto-updates to show only conditions present in current pedigree

**Complex structure improvements:**
- Cross-generational matings with correct alignment
- Half-sibling layout without tangled lines
- Age-based sibling ordering

**Why last:** These are iterative improvements on a working editor. They require real user feedback to prioritise correctly — a genetic counsellor will tell you which matters most. Building them before Phase 4 is speculation.

---

## Phase 8 — Ecosystem + embeddability

**What:** Make the project adoptable by others.

- Publish core editor as an npm package (`@pedigree-editor/react`) — React component that takes a `Pedigree` and callbacks, no Django dependency
- Documentation site (separate from the app)
- Curated example pedigrees (standard teaching cases: autosomal dominant, X-linked, consanguineous)
- BOADICEA v6 / GA4GH FHIR format support (for risk model ecosystem)
- rpy2 bridge in Django for risk model calls (BOADICEA etc.) — this is where the R integration lands, as an optional module

**Why last:** The npm package is only worth publishing when the API is stable. Documentation written after real users have used it is dramatically better than documentation written upfront.

---

## What this plan is optimising for

| Priority | Rationale |
|---|---|
| Hard problems first (Phases 1, 3, 6) | Layout algorithm and line routing are the only things that could require architectural rethinking. Fail fast. |
| Vertical slices over horizontal layers | Each phase produces something runnable. No phase is purely "backend" or purely "UI". |
| Deferred polish | Embeddability, docs, FHIR format — these matter for adoption but not for correctness. |
| Data model immovable after Phase 1 | Every other decision can be changed. The Individual/Partnership/Pedigree model cannot be refactored cheaply once the Django models, React store, and format parsers all depend on it. |

---

## What is explicitly out of scope

- Patient record management, EHR integration, clinical notes
- HIPAA/GDPR compliance infrastructure
- Risk model UI (the R bridge is plumbing for someone else to build on)
- Collaborative real-time editing (Phase 8 lays groundwork; WebSocket sync is a separate project)
- Mobile / tablet optimisation
