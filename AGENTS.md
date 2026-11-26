# AGENTS.md

Guidance for agents working in this repository. This file is loaded into
every session, so it holds only what every task needs; everything else is
in the files under "Read before".

## What this is

PedEdit is an open-source web editor for pedigrees (genetic family trees),
for genetic counsellors, clinical genetics teams and researchers. It is
live at https://pededit.com and the code is public at
https://github.com/SACGF/pededit. Its layout is a TypeScript port of the
kinship2 R package (`layout-engine/`), with a Django 5 + DRF + PostgreSQL
backend (`backend/`) and a React 18 + TypeScript + Vite + React Flow +
Zustand editor (`frontend/`). The `Pedigree` interface in
`layout-engine/src/types.ts` is the canonical data model: the backend's
JSON field and the frontend store mirror it.

## Product facts

- **NSGC nomenclature is the spec.** Every symbol, line, fill and piece of text on the chart follows the NSGC pedigree nomenclature (Bennett et al. 2008 and the 2022 focused revision), summarised in `claude/nsgc_nomenclature.md`. When a drawing choice is open, do what NSGC does; when NSGC is silent, follow common practice in published pedigrees. Deliberate differences are listed in that file, and new ones need the maintainer's agreement.
- **Default to the latest edition, keep the older style as an option.** Where the 2022 revision changed the drawing, 2022 is the default for new pedigrees and the 2008 form stays available through Settings > Notation (`frontend/src/pedigree/notation.ts`). A pedigree saved with no notation setting is drawn as 2008, so existing work keeps its look.
- **No account is required.** A pedigree made while signed out is stored with no owner, and the UUID in its URL (`/p/<uuid>`) is the only key. Google or GitHub sign-in only adds the "Your pedigrees" list and "My library". Never describe PedEdit as requiring login.
- **`sex` is biological sex** and drives all genetics (layout, kinship, X-linkage, PED). Gender identity is optional and only changes the drawing (`frontend/src/pedigree/gender.ts`). Never make a calculation read gender identity.
- **The look is black and white and minimal**, like a clinical or published pedigree: a white canvas, black symbols and lines, colour only where it means something (conditions), and chrome that gets out of the way.

## Every task

- **Pull first.** Run `git pull --rebase` on `main` before each new task, not only at the start of a session: other agents and the maintainer push while you work. If the tree has uncommitted changes, stop and ask rather than stash or discard them. Fetch again before pushing.
- **Pending work is in GitHub issues** (https://github.com/SACGF/pededit/issues), not in plan files. Check there before starting anything.
- **Issues and commits**, in brief; read `claude/issue_workflow.md` before any GitHub write:
  - Name the issue as `(#N)` in the commit subject. Never use a closing keyword (`closes`, `fixes`, `resolves`).
  - No GitHub writes beyond raising issues for major work, labelling `Human work required`, putting fixed issues on the current milestone and closing tested issues, unless the user asked.
  - Issues stay open by default. Close one only when tests or the end-to-end flows cover everything it asks; otherwise label it `Human work required` and say what the maintainer must do.
  - Work you leave undone gets its own issue, never a list buried in a comment.
  - Issue comments cite the commit sha and say nothing about git state ("pushed", "on local main").
- **Run the checks.** `npm run check` (engine tests, type check, frontend tests, dead code, guide paths, backend tests: about 20 s). `npm run check:pages` runs CI's page checks (servers up first: several minutes).
- **Run frontend changes in the browser.** A change under `frontend/src/` is not done until it has run on a page whose data reaches the changed code:

  ```bash
  node frontend/scripts/browser/servers.mjs up --frontend-only      # once per session (plain `up` adds Django)
  node frontend/scripts/browser/console.mjs --fixture example:2     # JS errors, mapped to source lines
  node frontend/scripts/browser/shot.mjs --fixture example:2        # then read the PNG
  ```

  Anything that must survive a save is checked against `/p/<id>` with Django running. Worktrees, signed-in pages and the flows: `frontend/scripts/browser/README.md`.
- **Python:** use `uv` (`uv venv`, `uv pip install`, `uv run`), never `pip` or `python -m venv`.
- **Writing:** no em-dashes. A code comment or an `AGENTS.md` says what the code does now and why, where that is not obvious; history belongs in the commit message and the issue. Data saved by an older version is a present fact and can be described ("pedigrees saved before #85 may carry the flag"). Cite an issue number only where the issue explains a decision the reader would otherwise question. Use the glossary's words (`claude/glossary.md`).
- **Keep the guides current.** A non-obvious fact about a directory goes in its `AGENTS.md` in the same change. A new feature gets a row in `claude/features.md`: a pointer, never a description.

## Read before

| Before | Read |
|---|---|
| building or changing a feature | `claude/features.md`, then the guide its row names |
| writing UI text, docs, an issue or a comment | `claude/glossary.md` |
| any GitHub write: an issue, label, milestone or release | `claude/issue_workflow.md` |
| adding or changing a symbol, line or text on the chart | `claude/nsgc_nomenclature.md` |
| the renderer or the layout algorithm | `claude/layout_engine_guide.md` |
| working in a directory | its `AGENTS.md`: `layout-engine/`, `frontend/`, `frontend/src/pedigree/`, `frontend/src/io/`, `backend/`, `deploy/`, `claude/` |
| page checks, flows, the phone check, CI | `frontend/scripts/browser/README.md` |
| a dead code finding | `frontend/AGENTS.md`, "Dead code" |
| deploying, tagging a release, rolling back | `deploy/AGENTS.md` |
| comparing with other pedigree tools | `claude/search_report.md` |

Strategy, user research and outreach notes are in the private repo `SACGF/pededit_private`, not here.
