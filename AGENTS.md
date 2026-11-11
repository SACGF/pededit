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
- React editor: NSGC symbols, couple/sibship/consanguinity edges, pan/zoom canvas, toolbar, hover pill, more menu, edit panel (name/DOB/notes), settings panel (sibling order, snap to grid), undo/redo, keyboard shortcuts, auto-save, manual repositioning with pin/unpin and reset layout.
- Tags and colouring (#3): `Pedigree.tags` definitions with quadrant, dot and text display styles, `Individual.tags` references, `frontend/src/pedigree/tags.ts` geometry shared by canvas and exporters, `TagsDialog`, auto legend in the app and in SVG/PNG/PDF export, per-user tag library (`/api/tag-presets/`). See `claude/phase_7_2_plan.md`.
- Import/export: PED (6-column PLINK layout only, see #31), SVG/PNG/PDF with de-identification, U-shape SVG export, CSV. `hpoTerms` exists on the data model with no UI (#46).
- Agent page checks: `frontend/scripts/browser/` runs a page in headless chromium and reports JS errors with `frontend/src/...:line`, screenshots and measures, evaluates against the dev-only `window.__pededit` stores, lints what the canvas draws (`lint.mjs`), and with `--fixture-via-api` checks what survives a save and reload. Every report starts with the commit Vite serves. See its `README.md`.
- Deploy: Gunicorn + Nginx + systemd on a VPS at pededit.com, `deploy/` scripts and `INSTALL.md`. Hardening, backups, error reporting and a health check are open (#47 to #50).

The research phase is complete: `claude/search_report.md` contains a comprehensive survey of 60+ existing pedigree tools (open-source, commercial, and academic), including a feature gap analysis organized into three tiers.

## Product Facts Every Agent Must Know

- **No account is required.** Anonymous mode is the default: creating a pedigree while signed out stores it with `owner=None` and the UUID in the URL (`/p/<uuid>`) is the only key. Users bookmark or copy the link. Google/GitHub sign-in only adds the "Your pedigrees" list and the per-user tag library. Never describe PedEdit as requiring login.
- The site is live at https://pededit.com and the code is public at https://github.com/SACGF/pededit.
- Pedigree symbols encode biological sex, not gender (see below).

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
Pedigree symbols (square/circle/diamond) represent **biological sex**, not gender, because sex determines inheritance patterns, X-linkage, and sex-specific risk models. The NSGC 2022 "gender inclusivity" update conflates clinical communication with genetic notation. A trans man who is 46,XX still needs a circle on the pedigree. Gender is patient-facing clinical metadata, not a pedigree data requirement.

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
