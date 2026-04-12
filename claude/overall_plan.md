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

## Phase 2 — Project scaffold ✅ COMPLETE

**Delivered:** Full-stack scaffold with working but empty plumbing.

**What was built:**
- Django 5 + DRF: `Pedigree` model (owner, title, data JSONField, timestamps), CRUD endpoints (`POST/GET/PATCH/DELETE /api/pedigrees/`), simplejwt auth (login/refresh/me), Postgres
- React 18 + TypeScript + Vite: Zustand store (auth + pedigree list + active pedigree), API client (axios), Tailwind + shadcn/ui, `@xyflow/react` installed and rendering an empty canvas
- `CanvasPage`: sidebar with pedigree list, "New pedigree" button, empty ReactFlow canvas

**Defer:** No pedigree-specific rendering, no editor features.

---

## Phase 3 — Visual renderer (read-only) ✅ COMPLETE

**Delivered:** `Pedigree` + `LayoutResult` renders as a correct, interactive (pan/zoom) React Flow pedigree. Read-only.

**What was built:**

*`frontend/src/pedigree/` package:*
- `constants.ts` — `SLOT_WIDTH=80`, `ROW_HEIGHT=120`, `NODE_SIZE=40`, `SIB_BAR_FACTOR=0.5`
- `layoutToFlow.ts` — pure `Pedigree → FlowData` transformer: `buildNodes` (with `nid+0.5` floor stripping, duplicate detection), `buildCoupleEdges`, `buildSibshipEdges` (pre-computes all geometry as edge data)
- `PedigreeCanvas.tsx` — ReactFlow wrapper: all node/edge types registered, `nodeOrigin=[0.5,0.5]`, `useMemo`, global SVG defs for proband arrow, read-only flags
- `nodes/symbols.tsx` — `SymbolShape` (square/circle/diamond), filled/empty/carrier-dot fills, `DeceasedSlash`, `ProbandArrow`, `DuplicateSuperscript`
- `nodes/PedigreeSymbolNode.tsx` — custom node with four invisible handles (`couple-out/in`, `sibship-out/in`)
- `edges/CoupleEdge.tsx` — single horizontal line
- `edges/ConsanguineousEdge.tsx` — double parallel horizontal line
- `edges/SibshipEdge.tsx` — T-shape: vertical drop from couple midpoint → sibship bar → per-child drops

*Fixtures (`frontend/src/fixtures/`):*
- `simpleFamily.ts` — 3-generation nuclear family (8 individuals, deceased father, proband, carrier)
- `consanguineous.ts` — sibling consanguinity family (6 individuals, double couple line)

*Tests (`frontend/src/pedigree/__tests__/layoutToFlow.test.ts`):*
- 32 passing tests covering node count/ids/individuals/positions, couple edge types and handles, sibship edge geometry for both fixtures, edge cases (single individual, empty throws)
- 1 `todo` test for `isDuplicate` detection (blocked on Phase 6 `autohint`)

*`CanvasPage.tsx` updated:* renders `PedigreeCanvas` from Zustand `activePedigree`; placeholder text when none selected or empty.

**Deferred to later phases:**
- Pregnancy triangle, miscarriage/TOPFA symbols (Phase 4/5)
- Label rendering — name, DOB, age below symbol (Phase 4)
- Dashed line for non-biological relationships / adoption (Phase 5)
- Distant consanguinity loop routing for non-adjacent partners (Phase 7)
- Grouped siblings node, half-fill multi-trait display (Phase 7)
- `autohint` duplicate detection → duplicate superscript ordering (Phase 6)

**Known behaviour:** `alignPedigree` throws on empty input; `CanvasPage` guards against this with `individuals.length > 0`.

---

## Phase 4 — Core interaction ✅ COMPLETE

**Delivered:** A working pedigree editor. A user can build a 3-generation clinical pedigree from scratch.

**What was built:**

*Data model additions:*
- `Individual` gains `sibOrder`, `name`, `dob`, `notes`
- `SiblingOrderSettings` (`mode: "insertion" | "manual" | "birthDate"`, `affectedFirst`) added to `Pedigree`
- Layout engine `autohint` updated to sort siblings by effective order (birthDate / sibOrder / affected-first)

*`usePedigreeStore.ts` (new):*
- Owns active pedigree data, undo/redo snapshot stacks (Immer), active tool, selected/hovered IDs
- Full structural mutations: `addIndividual`, `addParent`, `addChild(sex)`, `addSibling`, `addPartner`, `deleteIndividual`, `moveSibLeft/Right`
- Individual property mutations: `updateIndividual`, `setAffected`, `setDeceased`, `setProband`, `setSex`
- Pedigree-level: `updateSiblingOrderSettings`

*UI components (new):*
- `Toolbar.tsx` — add individual buttons (direct action, no click-to-place mode), undo/redo, settings
- `HoverPill.tsx` — NodeToolbar pill: +parents, +son, +daughter, +sibling; debounced hide on mouse-leave
- `MoreMenu.tsx` — Popover with add partner, move sib left/right, mark affected/deceased/proband, set sex, delete
- `EditPanel.tsx` — sidebar: name, DOB, notes text fields; status summary (sex, affected, deceased, proband)
- `SettingsPanel.tsx` — modal dialog: sibling order mode radio buttons, affected-first toggle
- `useKeyboardShortcuts.ts` — Cmd/Ctrl+Z undo, Cmd/Ctrl+Y/Shift+Z redo, Delete/Backspace removes selected, Escape returns to select

*`useAppStore` updates:*
- `openPedigree` auto-saves dirty state before switching pedigrees
- `logout` auto-saves dirty state before clearing tokens
- Both added to prevent data loss on navigation

*`CanvasPage` updates:*
- Toolbar, EditPanel, SettingsPanel wired in
- Pedigree rename via double-click in sidebar
- Relative timestamps ("5m ago") on pedigree list items
- Auto-save on pedigree switch and logout

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
