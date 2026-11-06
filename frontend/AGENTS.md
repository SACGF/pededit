# frontend/ — agent notes

React 18 + TypeScript + Vite app. React Flow (`@xyflow/react`) draws the canvas,
Zustand holds state, Tailwind + shadcn/ui for chrome. Workspace package
`@pedigree-editor/frontend`.

## Running

```
. ~/.nvm/nvm.sh            # node is not on PATH otherwise
npm -w frontend run dev    # Vite on 5173, proxies /api to Django on 8000
npm -w frontend run test   # vitest
npm -w frontend run typecheck
```

`src/config.ts` reads `VITE_GOOGLE_CLIENT_ID` and `VITE_GITHUB_CLIENT_ID`. If
`@react-oauth/google` is not installed, `vite.config.ts` aliases it to a no-op
stub so the app still builds without Google login.

## Product facts an agent must know

- **Anonymous mode is the default.** Nobody needs an account. Creating a
  pedigree while signed out POSTs to `/api/pedigrees/` with no token; the
  backend stores it with `owner=None` and the UUID in the URL (`/p/<uuid>`) is
  the only key. The landing page and the canvas sidebar both tell the user to
  bookmark or copy the link. Signing in (Google or GitHub) only adds the
  "Your pedigrees" list and the per-user tag library.
- Pedigree symbols encode biological sex, not gender (see root AGENTS.md).
- Structures that competitors refuse but we handle: partnerships with no
  children (`addPartner`), a single known parent (`addParent` inserts an
  unknown-sex placeholder partner because kinship2 needs 0 or 2 parents),
  disconnected individuals, cross-generation and consanguineous matings.
  Not yet: twins, adoption, pregnancy loss, assisted reproduction symbols.
- Visual style is black and white, minimal chrome. No colour except tags.

## Layout of src/

- `pages/` — `LandingPage` (create blank, import PED, examples, "Your
  pedigrees" when signed in), `CanvasPage` (sidebar + toolbar + canvas +
  panels), `LoginPage`, `GitHubCallbackPage`.
- `store/useAppStore.ts` — auth tokens (localStorage `access_token` /
  `refresh_token`), pedigree list, open/create/save/rename/delete. Saving
  reads the pedigree from `usePedigreeStore`.
- `store/usePedigreeStore.ts` — the editing model: the `Pedigree` object,
  undo/redo stacks, active tool, selection, every structural edit
  (addParent/addChild/addSibling/addPartner/delete/moveSib), flags, pinning,
  canvas settings, tags. All edits go through immer `produce` and push an undo
  snapshot. Add new edits here, not in components.
- `pedigree/` — rendering. See `src/pedigree/AGENTS.md`.
- `io/` — import and export. See `src/io/AGENTS.md`.
- `components/` — Toolbar, EditPanel, SettingsPanel, TagsDialog, LegendDialog,
  ExportDialog, ImportPedDialog, plus shadcn primitives in `components/ui/`.
- `hooks/useKeyboardShortcuts.ts` — Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Shift+Z
  redo, Delete/Backspace removes selection, Escape returns to select tool.
- `api/client.ts` — axios instance with bearer token and a single shared
  refresh promise on 401 (refresh tokens rotate, so concurrent refreshes would
  consume each other).
- `data/examples.ts` — the example pedigrees on the landing page.
- `fixtures/` — pedigrees used by tests and dev-only render scripts.
- `utils/pedigreeRelationship.ts` — `shareAncestor` for auto-detecting
  consanguinity when a partnership is created or edited.

## Conventions

- Tests sit in `__tests__/` next to the code they cover. Files prefixed `_` and
  suffixed `.dev.ts` are manual render helpers, not tests.
- Use `@/` for `src/` imports in components; relative paths elsewhere are fine.
- Keep geometry shared: anything drawn on the canvas must also be drawable by
  the string-based SVG exporter, so put geometry in framework-free modules
  (`pedigree/tags.ts` is the model).
