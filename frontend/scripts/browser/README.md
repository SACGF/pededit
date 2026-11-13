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
`status` also says which checkout and commit Vite serves.

## What code is being served

Every tool prints a `served:` line first: the commit, branch and uncommitted
file count of the checkout Vite runs from (read live from a dev-only
`/__pededit/commit` endpoint in `vite.config.ts`), plus `origin/main`. It
warns when that checkout is behind `origin/main` (as of its last fetch) or is
not the checkout the harness runs from. Feature PRs merge on GitHub, so a
local `main` can lag: `git fetch` and check this line before testing a fix.
In the page, `__pededit.commit` holds the same as of server start.

## The tools

All four take a URL (a path like `/p/<id>` is resolved against
`http://localhost:5173`) or `--fixture`, plus ordered interaction steps.
`--help` on any of them lists every option.

### console.mjs: did the JavaScript complain?

```bash
node frontend/scripts/browser/console.mjs --fixture example:2
node frontend/scripts/browser/console.mjs --fixture test-data/ped/consanguineous/first_cousin.ped \
    --click '[data-individual-id="3"]' --press Delete
node frontend/scripts/browser/console.mjs --all-examples --fixture-via-api   # what CI runs
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
with status 400 or more, steps that could not run (see below: a clean report
after a failed click would mean nothing), import warnings from a `.ped` or
`.json` fixture, render and export lint findings on editor pages (export
ones are prefixed `export`), and with
`--fixture-via-api` anything that did not persist. Exit code 0 clean, 1
findings, 2 usage error. `--verbose` prints full stacks, `--json` everything.

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

- `--measure` boxes are screen pixels after React Flow's fitView zoom.
  `--measure-flow SEL` gives centres and sizes in canvas units instead, the
  same units as `__pededit.layout()` positions (120px rows, 80px slots; 84
  and 68 in compact mode), so they compare across viewports.
- `--clip SEL` cuts off menus and dialogs that open outside the clipped box.
  Take a full shot when a popover is open. `--clip .react-flow__viewport`
  frames the whole drawn pedigree: a transformed element is clipped to its
  visible shapes and labels, not its own (pan-and-zoom) box.
- `--tile` with several fixtures also writes `contact-sheet.png`: every shot
  in a labelled grid with its render lint count, so one image read covers a
  batch (`--fixture example:8 --fixture example:9 ... --tile`).
- Paths are printed relative to the repo root (absolute when outside it).
- `shot.mjs FILE.svg` renders a saved SVG export to `FILE.svg.png` in
  chromium, so exports can be read back like the canvas.

### eval.mjs: what is in the stores?

```bash
node frontend/scripts/browser/eval.mjs --fixture example:0 '__pededit.pedigree().individuals.length'
node frontend/scripts/browser/eval.mjs --fixture example:0 --click '[data-individual-id="c1"]' --press Delete \
    '({ ids: __pededit.pedigree().individuals.map(i => i.id), undo: __pededit.usePedigreeStore.getState().past.length })'
node frontend/scripts/browser/eval.mjs --fixture example:0 \
    'return __pededit.layout().nodes.map(n => [n.data.individual.id, n.position])'
```

Evaluates an expression (or a function body, if it does not parse as an
expression) after the steps and prints the result as JSON. Only the result
goes to stdout; the `served:` line and the findings summary go to stderr, so
`2>&1` interleaves them with the JSON (pipe stdout alone into `jq`).
`--one-line` prints the result as single-line JSON.

In the dev build `window.__pededit` holds `usePedigreeStore`, `useAppStore`,
`layoutToFlow`, `lintFlow`, `importPed`, `exportPed`, `importJson`, `exportJson`, `EXAMPLES`, `commit`
and the shortcuts (see `frontend/src/devHooks.ts`; production builds do not
include it):

- `pedigree()`: the pedigree in the editor.
- `layout(pedigree?, options?)`: `{ nodes, coupleEdges, sibshipEdges }` as the canvas
  computes them, compact mode included (read from `localStorage`, the way
  the canvas reads it).
- `align(pedigree?)`: the raw kinship2 `LayoutResult` from `alignPedigree`,
  for comparing with R. The canvas lays out each family separately
  (`alignPedigreeByFamily`, #64), so for a file with several families this
  differs from `layout()` positions.
- `kinship(pedigree?)`: kinship and inbreeding coefficients (#32), as
  `.kinship(idA, idB)` and `.inbreeding(id)`.
- `check(pedigree?, options?)`: the render lint, `[]` when clean.
- `load(pedigree)`: replace the editor's pedigree (clears undo history).

### lint.mjs: does the drawing make sense?

```bash
node frontend/scripts/browser/lint.mjs --all-examples
node frontend/scripts/browser/lint.mjs --all-examples --compact
node frontend/scripts/browser/lint.mjs --all-examples --relationship-labels --compact   # text above every nameable double line (#97, #109)
node frontend/scripts/browser/lint.mjs --all-examples --relationship-labels --u-shape   # the U-shape export's labels instead
node frontend/scripts/browser/lint.mjs --all-examples --monochrome   # every tag drawn as a black and white pattern (#67)
node frontend/scripts/browser/lint.mjs --fixture test-data/ped/historic/habsburg.ped
node frontend/scripts/browser/lint.mjs /p/<id> --click ... # the editor's pedigree after steps
```

Structural checks on what the canvas draws (`layoutToFlow`'s output, in
`frontend/src/pedigree/renderLint.ts`): someone with no symbol, a line to a
node that is not drawn, a couple line between non-partners or through
another symbol, two couple lines overlapping on one row, a slanted couple
line, a child off their siblings' row (the drop line misses), a partnership with
no couple line, a child with no line from their parents or hanging from the
wrong couple, two couples' sibship bars along one line, overlapping symbols,
labels on one row running into each other. The kinship2 oracle tests check slots
against R; this checks what is drawn from them. `console.mjs` and `shot.mjs`
run it on every editor page (`render lint clean` in the summary). The same
checks run in vitest over every example
(`src/pedigree/__tests__/renderLint.test.ts`), which lists the examples known
to draw wrong: fixing one makes that test fail until it is removed from the
list.

The SVG export draws its couple and sibship lines itself, from the kinship2
layout, so `lint.mjs` also lints the exported SVG (`frontend/src/io/svg/exportLint.ts`,
`export` lines in the report, `--no-export` to skip, `--deidentify` for the
de-identified export). It parses what the SVG draws and matches symbols to
people by position against the canvas layout, since the export carries no
ids: someone with no symbol, a symbol where the canvas has none, a line
ending where nothing is drawn, couple lines between non-partners, through a
symbol or overlapping, a missing couple line, a sibship line through a
symbol, a child whose lines lead to no couple or the wrong one, overlapping
labels. PNG and PDF are made from this SVG, so they are covered; the
U-shape export is not. It relies on the group classes `exportSvg` writes
(`couple-lines`, `sibship-lines`, `symbols`, `labels`) and `class="mark"`
on childless and twin marks; keep them when changing the exporter. In vitest
it is `src/io/svg/__tests__/exportLint.test.ts`; in a page,
`__pededit.checkExport()`.

## CI

`.github/workflows/ci.yml` runs on every PR and push to main: layout engine
and frontend vitest, `tsc -b`, the backend tests, and the page checks on
headless chromium: `lint.mjs --all-examples` (normal, then compact and
de-identified) and `console.mjs --all-examples --fixture-via-api` against a
SQLite Django, so each example must load without JS errors, draw and export
cleanly, and survive a save and reload. On failure the job prints the tail
of the Vite and Django logs. Reproduce a failing step locally with the same
command after `servers.mjs up`.

## Fixtures

`--fixture SPEC` routes `/api/pedigrees/fixture/` in the browser and opens
`/p/fixture`, so the editor runs its real load path without Django. Auto-save
PATCHes go to the in-memory copy. SPEC is one of:

- `example:N` or `example:LABEL` from `frontend/src/data/examples.ts`
- a `.ped` file, optionally `FILE.ped#FAMID` (imported with the app's own `importPed`)
- a `.json` file: the app's own Download JSON envelope (`{format, version,
  pedigree}`) or a bare Pedigree, both read with the app's `importJson`, or
  an API payload `{ "title", "data": Pedigree }`

Import warnings (an unrecognised sex value, a founder created for a missing
parent) are reported as findings, so an import that only worked by guessing
does not look clean. Import errors stop the run.

`shot.mjs`, `console.mjs` and `lint.mjs` accept `--fixture` several times and
handle each in turn.

### Fixtures through the real backend

Plain fixtures never reach Django: the route stores whatever the page sends,
so a field the backend serializer drops (this happened with `lifeStatus`)
looks fine. `--fixture-via-api` instead POSTs the fixture to
`/api/pedigrees/` (anonymously, or as the agent with `--as-agent`) and opens
`/p/<id>`. It then checks persistence twice and reports any difference as a
`persist` finding:

1. right after load, the POSTed pedigree against what the editor loaded;
2. after the steps (and after `shot.mjs` has taken its picture), it waits
   for auto-save, reloads, and compares the editor's pedigree before and
   after.

Fields the backend added with an empty default (`deceased: false` where it
was absent) are listed in one `note` line, not as findings. Use it for
anything that must survive a save; `--no-persist-check` skips the reload.

A clean run then deletes the pedigrees it POSTed (and the writes the page
made to them). A run with findings keeps them and prints `/p/<id>` so you can
open one. `--cleanup` deletes even then, `--keep` never deletes. Pedigrees
created with `--as-agent` belong to `claude_agent` and are always kept.

```bash
node frontend/scripts/browser/console.mjs --fixture example:0 --fixture-via-api \
    --click '[data-individual-id="c1"]' --select 'select=>Miscarriage' --mouse-away
#  persist  save then reload: individuals[2].lifeStatus dropped (was "miscarriage")
```

## Steps and selectors

Steps run in the order given, each followed by `--step-wait` ms (default 300):

| Step | Does |
| --- | --- |
| `--click SEL`, `--dblclick SEL`, `--hover SEL` | act on the element |
| `--right-click SEL` | right-click it (`contextmenu`): a node or couple line opens its menu, then `--click` an item, e.g. `--click '[data-context-menu] >> text=Mark affected'` |
| `--wait-for SEL` | wait until one is visible |
| `--press KEY` | a key or chord: `Delete`, `Control+z` |
| `--key-down KEY`, `--key-up KEY` | hold a modifier across the steps between them: `--key-down Shift --click SEL --key-up Shift` is a shift-click, and a `--drag` in between is a Shift+drag (rubber band, #21) |
| `--fill 'SEL=>TEXT'` | replace an input's value |
| `--select 'SEL=>VALUE'` | pick a native `<select>` option by value or label (lists the options when none matches) |
| `--choose 'SEL=>TEXT'` | click a Radix popover or menu trigger, then the item in what opened whose text, first line or `title` is TEXT (case-insensitive; a unique substring also works). Fails, listing the items, when none matches; fails when several match (unless `--first`) or the item is disabled. The app's settings and edit-panel dropdowns are native, so use `--select` for those |
| `--drag 'SEL=>DX,DY'` | press on the element's centre and drag by DX,DY screen pixels |
| `--upload 'SEL=>FILE'` | set a file input, or click SEL and answer the file chooser |
| `--download 'SEL[=>PATH]'` | click SEL and save the download (default `--out-dir`, else `frontend/test-output/browser/downloads/`, with the suggested name); the report prints where. Scope a common label to a dialog: `'role=dialog >> button:text-is("Download")'` |
| `--reload` | wait for auto-save (the store's `isDirty` clears), then reload |
| `--sleep MS` | wait |
| `--mouse-away` | move the mouse to the corner so hover toolbars close |

`--local-storage KEY=VALUE` (repeatable, not a step) seeds `localStorage`
before the first load, for settings kept there such as `compactLayout=true`.
It seeds once per tab, so `--reload` keeps what the app wrote.

Selectors are [playwright selectors](https://playwright.dev/docs/locators):
CSS, `text=Export PED`, `role=button[name="Undo"]`. Prefer
`button:has-text("Add")` over `:text()`, which matches the smallest element
containing the text.

A step acts on exactly one visible element. It fails, with the reason in the
report, when nothing visible appears ("never found ... its JS never ran", or
"found 2 element(s) but none visible"), when the element is disabled ("found
but disabled"), or when several visible elements match: hover toolbars and
menus can linger on another node, and acting on the first match silently
edited the wrong person in the first testing run. Make the selector
specific, or pass `--first` to accept the first match.

Every individual on the canvas carries `data-individual-id`, so
`[data-individual-id="c1"]` selects or measures one person. React Flow's own
node ids are layout slots (`level-slot`), not individual ids.

## Signing in

Anonymous pedigrees need nothing. For signed-in pages pass `--as-agent`: the
harness runs `manage.py agent_token`, which creates a `claude_agent` user
with no usable password (if it does not exist) and mints a simplejwt pair,
and seeds it into `localStorage` the way `useAppStore` keeps tokens. Needs
Django running and `backend/.venv` (or `PEDEDIT_PYTHON`).

## Base URL

Paths resolve against `http://localhost:5173`; set `PEDEDIT_BASE` to use
another local port (for a second checkout's Vite, for example).

## Safety

- URLs must be on localhost; anything else is refused unless
  `--allow-remote` is given. Never point these at pededit.com.
- Without `--fixture`, or with `--fixture-via-api`, the page talks to the
  local backend and nothing is rolled back, except that a clean
  `--fixture-via-api` run deletes the pedigree it created. Any POST/PATCH/PUT/DELETE that reached `/api/` is listed at the
  end of the report ("not rolled back"). Local dev data is disposable.

## Writing your own script

For anything the steps cannot express, import from `harness.mjs`
(`launchBrowser`, `newContext(browser, contextOptions(flags))`, `loadFixture`,
`openPage`, `finishPage`, `runSteps`, `resolveFindings`, `findingLines`) so
fixtures, viewport, login and reporting match the CLI.

## Gotchas

- A running Vite did not pick up a new export added to
  `layout-engine/src/index.ts` (the page failed with "does not provide an
  export named ..." and `touch` did not help); `servers.mjs down` then `up`
  fixed it. Edits under `frontend/src/` hot-reload as usual.
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
