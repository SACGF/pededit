# Agent page checks

Small scripts that let a coding agent (or you) check a change by actually
running the page in headless chromium: what the JavaScript complained about,
what the page looks like, where things ended up, and what the stores hold.
Adapted from VariantGrid's browser harness (issue #63).

They are plain Node scripts, not a Playwright Test suite. They need Node 20+
and the pinned `playwright` devDependency in `frontend/`.

## Once per machine

```bash
npm install
npx -w frontend playwright install chromium-headless-shell
```

`playwright` is pinned to an exact version on purpose: `playwright install`
prunes browser builds that other playwright versions downloaded, so every
install on the machine should agree on the version.

## Per session

```bash
node frontend/scripts/browser/servers.mjs up --frontend-only   # Vite only, enough for --fixture
node frontend/scripts/browser/servers.mjs up                   # Vite + Django runserver
node frontend/scripts/browser/servers.mjs status
node frontend/scripts/browser/servers.mjs down                 # stops only what `up` started
```

Servers already running are reused. Logs go to `node_modules/.cache/pededit-browser/`.

## The tools

All three take a URL (a path like `/p/<id>` is resolved against
`http://localhost:5173`) or `--fixture`, plus ordered interaction steps.
`--help` on any of them lists every option.

### console.mjs: did the JavaScript complain?

```bash
node frontend/scripts/browser/console.mjs --fixture example:2
node frontend/scripts/browser/console.mjs --fixture test-data/ped/consanguineous/first_cousin.ped \
    --click '[data-individual-id="3"]' --press Delete
```

```
page: http://localhost:5173/p/fixture (fixture example:0)  status 200, 2541 ms
js: 1 uncaught error(s), 8 console error/warning(s), 0 failed request(s), 0 step failure(s) [1 known warning(s) ignored]
  uncaught  frontend/src/pedigree/nodes/PedigreeSymbolNode.tsx:56  probe click (x2)
  console.error  frontend/src/pedigree/nodes/PedigreeSymbolNode.tsx:40  probe render p1 (x8)
```

One summary line, then one line per finding with a `path:line` mapped
through Vite's source maps to the original `.tsx`. Reported: uncaught
exceptions, `console.error`/`console.warn`, failed requests and responses
with status 400 or more, and steps whose element never appeared ("its JS
never ran": a clean report after a failed click would mean nothing). Exit
code 0 clean, 1 findings, 2 usage error. `--verbose` prints full stacks,
`--json` everything.

### shot.mjs: what does it look like?

```bash
node frontend/scripts/browser/shot.mjs --fixture example:1 --measure '[data-individual-id]'
node frontend/scripts/browser/shot.mjs --fixture example:0 --clip '[data-individual-id="c1"]' --pad 60 --scale 2
node frontend/scripts/browser/shot.mjs --fixture a.ped --fixture b.ped --out-dir /tmp/shots
```

Writes PNGs (default `frontend/test-output/browser/<name>.png`, gitignored)
and prints the same JS summary plus the bounding box of every `--measure`
match. Read the PNG back; a lot of layout questions are answered by looking.
Screenshot first, measure second.

### eval.mjs: what is in the stores?

```bash
node frontend/scripts/browser/eval.mjs --fixture example:0 '__pededit.pedigree().individuals.length'
node frontend/scripts/browser/eval.mjs --fixture example:0 --click '[data-individual-id="c1"]' --press Delete \
    '({ ids: __pededit.pedigree().individuals.map(i => i.id), undo: __pededit.usePedigreeStore.getState().past.length })'
node frontend/scripts/browser/eval.mjs --fixture example:0 \
    'return __pededit.layout().nodes.map(n => [n.data.individual.id, n.position])'
```

Evaluates an expression (or a function body, if it does not parse as an
expression) after the steps and prints the result as JSON. In the dev build
`window.__pededit` holds `usePedigreeStore`, `useAppStore`, `layoutToFlow`,
`importPed`, `EXAMPLES` and the shortcuts `pedigree()`, `layout()` and
`load(pedigree)` (see `frontend/src/devHooks.ts`; production builds do not
include it).

## Fixtures

`--fixture SPEC` routes `/api/pedigrees/fixture/` in the browser and opens
`/p/fixture`, so the editor runs its real load path without Django. Auto-save
PATCHes go to the in-memory copy. SPEC is one of:

- `example:N` or `example:LABEL` from `frontend/src/data/examples.ts`
- a `.ped` file, optionally `FILE.ped#FAMID` (imported with the app's own `importPed`)
- a `.json` Pedigree, or a `{ "title", "data": Pedigree }` payload

`shot.mjs` and `console.mjs` accept `--fixture` several times and handle each in turn.

Fixtures never reach Django: the route stores whatever the page sends. A
field the backend serializer drops (this happened with `lifeStatus`) looks
fine in fixture mode. Anything that must survive a save needs a run against
`/p/<id>` on the real backend, with a reload.

## Steps and selectors

`--click`, `--dblclick`, `--hover`, `--wait-for` take a
[playwright selector](https://playwright.dev/docs/locators) (CSS,
`text=Export PED`, `role=button[name="Undo"]`); `--press` takes a key
(`Delete`, `Control+z`); `--fill 'SELECTOR=>TEXT'` types into an input. They
run in the order given, each followed by `--step-wait` ms (default 300).

Every individual on the canvas carries `data-individual-id`, so
`[data-individual-id="c1"]` selects or measures one person. React Flow's own
node ids are layout slots (`level-slot`), not individual ids.

## Signing in

Anonymous pedigrees need nothing. For signed-in pages pass `--as-agent`: the
harness runs `manage.py agent_token`, which creates a `claude_agent` user
with no usable password (if it does not exist) and mints a simplejwt pair,
and seeds it into `localStorage` the way `useAppStore` keeps tokens. Needs
Django running and `backend/.venv` (or `PEDEDIT_PYTHON`).

## Safety

- URLs must be on localhost; anything else is refused unless
  `--allow-remote` is given. Never point these at pededit.com.
- Without `--fixture`, the page talks to the local backend and nothing is
  rolled back. Any POST/PATCH/PUT/DELETE that reached `/api/` is listed at the
  end of the report ("not rolled back"). Local dev data is disposable.

## Gotchas

- `networkidle` is not "rendered": React Flow lays out on animation frames,
  so the tools wait `--wait` ms (default 1500) after idle.
- React 18 dev reports an event-handler error twice and StrictMode renders
  twice, so repeated messages are collapsed with a count.
- Console messages that appear on every page (React Flow's attribution
  warning) are listed in `KNOWN_NOISE` in `harness.mjs` and counted in the
  summary, not hidden.
- `favicon.ico` 404s and Chromium's duplicate "Failed to load resource"
  console lines are filtered; the failed request itself is still reported.

## Agent hook

`.claude/settings.json` registers `.claude/hooks/post_edit_page_check.py`,
which reminds Claude Code once per file per session, after an edit under
`frontend/src/`, to run one of these checks.
