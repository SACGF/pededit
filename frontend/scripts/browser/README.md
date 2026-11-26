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

Run `npm install` again after a pull that changes `package-lock.json`: a new
devDependency (knip, for `npm run deadcode`) is missing from an install made
before it was added, and `servers.mjs up` says when the lock file is newer
than the install.

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
Starting Django also runs `manage.py createcachetable`, the table the rate
limit counters are kept in (#47); without it every request is let through.
`status` also says which checkout and commit Vite serves.

## Working in a git worktree

An agent working in a git worktree (Claude Code puts them under
`.claude/worktrees/`) should serve that worktree, not the servers of the main
checkout on 5173 and 8000, which serve the main checkout's code:

```bash
node frontend/scripts/browser/servers.mjs up --here      # from inside the worktree
PEDEDIT_BASE=http://localhost:5180 node frontend/scripts/browser/flows.mjs signed-in
node frontend/scripts/browser/servers.mjs down           # from the worktree: stops only its servers
```

`up --here` starts a Vite from 5180 and a Django from 8001, each on the
first free port, serving the worktree's own frontend and backend as it is
edited (Vite proxies `/api` to that Django through `PEDEDIT_API_TARGET`), and
prints the `PEDEDIT_BASE` to use. `--frontend-only` starts only the Vite,
proxying to the Django on 8000. What a worktree borrows from the main
checkout (`checkout.mjs`, used by `servers.mjs` and the harness):

- **node_modules.** A worktree inside the main checkout finds its
  `node_modules` by walking up, so nothing is installed. A worktree
  elsewhere has none and needs its own `npm ci`. The worktree's Vite runs
  from `frontend/vite.worktree.config.ts` (in `.gitignore`), which lets it
  serve files from the main checkout's `node_modules` and reads the
  worktree's own layout engine.
- **Python.** `manage.py` runs with `PEDEDIT_PYTHON`, else the worktree's
  `backend/.venv`, else the main checkout's, else `uv run`.
- **The secret key.** Django would make the worktree its own
  `backend/secret_key.txt`, and a token minted with one key is rejected by
  a Django signing with another (#191). From a worktree every `manage.py`
  the scripts run, `agent_token` included, gets the main checkout's key as
  `DJANGO_SECRET_KEY`, so tokens work against either checkout's Django.
- **The site config and database** are `/etc/pededit/pededit.json`, the same
  for every checkout, so a pedigree saved through one Django is there in the
  other.

`up --worktree REF` (below, with `compare.mjs`) is for a commit that should
not change under the check; `--here` is for the worktree being edited.

## What code is being served

Every tool prints a `served:` line first: the commit, branch and uncommitted
file count of the checkout Vite runs from (read live from a dev-only
`/__pededit/commit` endpoint in `vite.config.ts`), plus `origin/main`. It
warns when that checkout is behind `origin/main` (as of its last fetch) or is
not the checkout the harness runs from. Feature PRs merge on GitHub, so a
local `main` can lag: `git fetch` and check this line before testing a fix.
In the page, `__pededit.commit` holds the same as of server start.

## The tools

`console.mjs`, `shot.mjs`, `eval.mjs` and `lint.mjs` take a URL (a path like `/p/<id>` is resolved against
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
served: c07d02f main, origin/main c07d02f
page: http://localhost:5173/p/fixture (fixture example:0)  status 200, 2541 ms
js: 1 uncaught error, 8 console errors/warnings, 0 failed requests, 0 step failures, render lint clean [1 known warning ignored]
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
    'return __pededit.layout().people.map(n => [n.individual.id, n.position])'
```

Evaluates an expression (or a function body, if it does not parse as an
expression) after the steps and prints the result as JSON. Only the result
goes to stdout; the `served:` line and the findings summary go to stderr, so
`2>&1` interleaves them with the JSON (pipe stdout alone into `jq`).
`--one-line` prints the result as single-line JSON.

In the dev build `window.__pededit` holds `usePedigreeStore`, `useAppStore`,
`buildScene`, `lintScene`, `importPed`, `exportPed`, `importJson`, `exportJson`, `EXAMPLES`, `commit`
and the shortcuts (see `frontend/src/devHooks.ts`; production builds do not
include it):

- `pedigree()`: the pedigree in the editor.
- `layout(pedigree?, options?)`: the scene (`pedigree/scene.ts`, #146) as the
  canvas draws it, compact mode included (read from `localStorage`, the way
  the canvas reads it): `people` (each with `id`, `position` at the symbol's
  centre, `individual`, `glyph`, `isPinned`), `couples` (with `double`),
  `sibships`, `duplicates`, `assisted`, `bounds`.
- `align(pedigree?)`: the raw kinship2 `LayoutResult` from `alignPedigree`,
  for comparing with R. The canvas lays out each family separately
  (`alignPedigreeByFamily`, #64), so for a file with several families this
  differs from `layout()` positions.
- `kinship(pedigree?)`: kinship and inbreeding coefficients (#32), as
  `.kinship(idA, idB)` and `.inbreeding(id)`.
- `check(pedigree?, options?)`: the render lint, `[]` when clean.
- `checkExport(pedigree?, options?)`: the same for the SVG export.
- `exportSvg(options?)`: the editor's pedigree as an SVG string (`{ uShape: true }`
  for the U-shape), to save and render with `shot.mjs FILE.svg`.
- `problems(pedigree?)`: the editor warnings (#116), with each fix as its
  label. The toolbar list is `[data-testid="problems-menu"]`, its items
  `[data-problem-id="rule:id"]`, panel fields `[data-problem-field]` and
  canvas markers `[data-problem-marker]`. In the list, `[data-problem-item="rule:id"]`
  holds the item, `[data-problem-subject]` the "II-2, unnamed female" text,
  `[data-problem-fix="Label"]` a fix and `[data-problem-fix-all="Label"]` its
  "Fix all like this"; the hovered person's node gets `[data-problem-highlight]`.
  `--press F8` / `--press Shift+F8` step through the problems.
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

Structural checks on what the canvas draws (`buildScene`'s output, in
`frontend/src/pedigree/renderLint.ts`): someone with no symbol, a line to a
node that is not drawn or ending where nothing is, a couple line between
non-partners or through another symbol, a sibship or assisted line through a
symbol, two couple lines overlapping on one row, a slanted couple line, a
partnership with no couple line, a child with no line from their parents or
hanging from the wrong couple, two couples' sibship bars along one line,
overlapping symbols, text on one row running together (measured as a file
writes it), a dashed arc through someone else's symbol or text, the text
over a double line running into anything, the chart title. Every check on
the drawing is here, for the canvas and the exports alike. The kinship2
oracle tests check slots against R; this checks what is drawn from them.
`console.mjs` and `shot.mjs` run it on every editor page (`render lint clean`
in the summary). The same checks run in vitest over every example
(`src/pedigree/__tests__/renderLint.test.ts`), which lists the examples known
to draw wrong: fixing one makes that test fail until it is removed from the
list.

The SVG export draws the scene with the canvas's components but lays out its
own figure (title, key, bounds), so `lint.mjs` also lints the exported file
(`frontend/src/io/svg/exportLint.ts`, `export` lines in the report,
`--no-export` to skip, `--deidentify` for the de-identified export, whose
scene gets the render lint as well since its text differs). It parses the
SVG and checks that every symbol, line, dashed arc and line of text of the
scene is in it at its place, matching symbols by position since the export
carries no ids, and how the figure is composed: the title clear of the
drawing, the key below it, nothing outside the figure. PNG and PDF are made
from this SVG, so they are covered; the U-shape export has its own lint
(`--u-shape`). It relies on the group classes `Chart` writes
(`couple-lines`, `sibship-lines`, `symbols`, `labels`, ...) and
`data-childless`, `data-ended` and `data-twin-mark` on marks; keep them when
changing the chart. In vitest it is `src/io/svg/__tests__/exportLint.test.ts`;
in a page, `__pededit.checkExport()`.

### compare.mjs: did the drawing change between two commits?

```bash
node frontend/scripts/browser/compare.mjs --all-examples --all-fixtures            # working tree against HEAD
node frontend/scripts/browser/compare.mjs --base origin/main --all-fixtures        # against another commit
node frontend/scripts/browser/compare.mjs --all-fixtures --compact --deidentify --nsgc2008 --monochrome
```

```
before: 2a30eba  (http://localhost:5180)
after:  2a30eba +1 uncommitted  (working tree)
drawings: canvas, legend, export, u-shape
DIFF  fixture:status
        canvas  23 px changed in 443x243 at 265,105  frontend/test-output/browser/compare/fixture-status.canvas.png
same  fixture:couples
compare: 1 of 2 pedigree(s) differ
```

For a change that is meant to move nothing (#142). It checks `--base` (default
`HEAD`) out under `.worktrees/` with its own Vite, draws each pedigree on both
sides and compares pixel for pixel, with no tolerance: the canvas at zoom 1
with editor-only marks hidden (minimap, controls, dev ids, problem markers),
the legend on the Pedigree tab, the standard SVG export and the U-shape
export. Both sides draw the working
tree's pedigree data, so it compares drawing code, not fixtures. Each
difference gets an image (before, after, and the after drawing greyed with
the changed pixels in red, boxed) and, for exports, the two SVG files. An
export whose text changed but draws the same is noted and does not fail. Exit
0 when nothing differs. About 3 seconds a pedigree.

Before each picture it waits for the web fonts, turns transitions,
animations and scrollbars off, clears focus, moves the mouse to a corner and
takes the picture again until two in a row agree. With all that, comparing a
commit with itself (`--base-url` of `servers.mjs up --worktree HEAD`) over
every example and fixture reports nothing (#195); a difference of a few
pixels is a real one. Some edits to the served checkout make Vite reload
its pages (`index.html`, a module that cannot be hot-updated), which undoes
all of that; a reload is reported as an error on that pedigree, and a run
during edits should be repeated.

It is not in CI: screenshots depend on the machine's fonts and chromium, so
it compares two commits on one machine and commits no images. Paste its report
on the issue of a refactoring change. The base runs with this checkout's
`node_modules`, so it cannot judge a dependency upgrade.

`servers.mjs up --worktree REF` serves a commit the same way and leaves it
running (#70): a frozen copy for a testing run while the working tree is
being edited. Pass the URL it prints as `PEDEDIT_BASE`, or to `compare.mjs
--base-url`. `servers.mjs down` stops it and removes the worktree.

### flows.mjs: does using it still work?

```bash
node frontend/scripts/browser/flows.mjs                 # every flow, about two minutes
node frontend/scripts/browser/flows.mjs drag-and-pin exports
node frontend/scripts/browser/flows.mjs --list
```

```
ok    build-undo-redo  (19 checks, 14.1 s)
FAIL  drag-and-pin  (3 checks, 3.6 s)
        after a drag the person is pinned: not so
          (after: the hover pill unlocks the person)
          screenshot: frontend/test-output/browser/flows/drag-and-pin.failed.png
flows: 1 of 12 failed
```

End-to-end flows (#167): scripted journeys through the real editor against
Vite and Django (`servers.mjs up`, not `--frontend-only`), each in a fresh
browser profile, with checks on the stores, the page, the server and any file
downloaded. The sweeps above look at a pedigree as loaded; these click, type,
drag, save and export. An uncaught JavaScript error or `console.error` fails
the flow. They run in CI.

| Flow | Covers |
|---|---|
| `build-undo-redo` | blank pedigree, toolbar add, hover pill, More options, undo to empty, redo, save |
| `anonymous-link` | create signed out, the `/p/<id>` link, "Recent on this device" |
| `set-parents-by-picking` | "Set parents..." by clicking two cousins; the couple line turns double |
| `multi-select-batch` | Shift+click, rubber band, the "N selected" menu as one undo step, the D key |
| `drag-and-pin` | unlock, drag, pin survives a reload, Reset layout |
| `conditions` | Conditions and tags dialog, affected and carrier per condition, legend |
| `exports` | SVG, PNG, PDF, U-shape, de-identified, CSV, JSON, PED: each file read back |
| `imports` | PED and JSON by upload; a refused file |
| `hide-and-filter` | hide descendants, the group symbol, each view filter, nobody deleted |
| `problems-list` | the problems list, a fix, "Fix all like this", F8 |
| `person-tab-saves` | typing on the Person tab, auto-save, reload |
| `signed-in` | as the agent user: Your pedigrees, rename, delete, an example link gives an owned copy |
| `example-link` | `/example/<slug>` (#150, #151): the landing page's links, nothing saved on open, the first edit saves one copy at `/p/<id>` with undo kept, a failed create keeps the edits, unknown slug |
| `error-reporting-off` | with no Rollbar token, an uncaught error sends no request off the site and loads no reporter (#49) |
| `rejected-token` | a sign-in token the server rejects: one refresh, then signed out on the same page, and a pedigree's link still opens (#191) |
| `rate-limited` | spends a test address's anonymous-create allowance, then the landing page, an example link and GitHub sign-in say how long to wait (#184) |
| `delete-account` | as `claude_agent_throwaway`: Delete account counts what goes, Cancel, then the account, its pedigrees, My library and its tokens are gone, an anonymous pedigree stays (#183) |
| `drop-on-disabled-button` | a drag let go over a disabled hover pill button still drops and pins the person (#185) |
| `api-created` | the `curl` example of `docs/pedigree-json-format.md` posted with no account: its link draws, an edit saves, a broken reference is refused with its path (#201) |
| `draw-couple-beside` | "Draw this couple beside" on a couple line in a family with a loop: who is drawn twice changes, the notice, undo, saved and reloaded; not offered for a couple with a partner who married in (#205). The same choice on a partner's own menu, and the couple's items on the menu of both partners selected (#207) |
| `export-selected` | two siblings selected: the export dialog's "Only the 2 selected people (+2 to connect them)", off by default; the SVG and U-shape have them and their parents only, the key only their condition; pedigree, canvas and CSV unchanged (#215) |
| `translated-page` | every text node replaced the way browser page translation does it (not Chrome's translator): opening and closing Clinical details and marking a person affected do not reach the error boundary (`src/domGuard.ts`) |
| `u-shape-view` | the toolbar's U-shape button (#220): the U replaces the chart and counts who it draws, a click selects, the Person tab edits and adds a son and the U redraws, drag, right-click, Shift+drag and Add male give their notices and change nothing, Back to standard chart, not saved over a reload |
| `text-under-symbols` | names and details under the symbols are SVG text at the export's baselines (#145); hovering a cut name shows it in full without the pill's buttons, clicking it selects, an uncut name lets the mouse through (#68) |
| `tag-library` | signed in: a hatched trait saved to My library from the Conditions and tags dialog is added to another pedigree still hatched and still a trait (#131) |
| `ped-text` | the import dialog's PED text box (#218): mixed spaces and tabs drawn in the preview, a half-typed row shows its error and keeps the drawing, Open in editor; "View as text" shows what Export PED writes, and Copy |

**Adding a flow.** A file in `flows/`, numbered for order:

```js
export default {
  name: "swap-sides",
  about: "One line for --list: what journey, what it proves",
  // asAgent: true,   // signed in as claude_agent
  // asAgent: "throwaway",   // as claude_agent_throwaway, which the flow may delete
  async run(t) {
    const id = await t.openFixture("test-data/pedigrees/structure/three-partners.json");
    await t.menu("[data-partnership-id=\"p1\"]", "Swap sides");
    t.equal((await t.pedigree()).partnerships[0].leftPartner, "w1", "Swap sides records who is on the left");
    await t.reload();
    t.equal((await t.stored(id)).data.partnerships[0].leftPartner, "w1", "and it is saved");
  },
};
```

`t` drives the page with the same steps as the command line: every step of
the `STEPS` table in `harness.mjs` is a method named by its flag in
camelCase (`t.click(sel)`, `t.rightClick`, `t.waitFor`, `t.press(key)`,
`t.fill(sel, text)`, `t.choose(sel, item)`, `t.drag(sel, dx, dy)`,
`t.reload()`, `t.mouseAway()`), plus `t.download(sel)`, which returns the
file's path, and `t.holding("Shift", fn)`. A step still acts on exactly one
visible element and fails otherwise.
`t.person(id)` is the selector of a person's symbol. `t.pill(id, "Add son")`
and `t.menu(id, "Add partner")` are the hover pill and the right-click menu.
`t.createBlank()` makes a blank pedigree from the landing page and returns
its id, `t.openFixture(spec)` saves a fixture through the API and opens it,
`t.open(path)` goes anywhere, `t.newTab()` is a second tab in the same
profile. Read with `t.pedigree()`, `t.individual(id)` (of the editor's
pedigree, or of one passed in), `t.drawn()`, `t.stored(id)`, `t.eval(fn)`,
`t.text(sel)`, `t.count(sel)`; `t.api(path, { token, json, method })`
calls the API. Check with `t.equal(actual, expected, what)`, `t.ok`,
`t.match`, `t.notMatch`, and `await t.status(response, 404, what)`, which
prints the response body when the status is wrong: `what` is a sentence
saying what should be true, and is what a failure prints. The list is in
`makeT` in `flows.mjs`.

Every pedigree a flow saves (`t.openFixture`, `t.createBlank`,
`t.currentId()`, or an id pushed on `t.created`) is deleted afterwards
without a token, so an anonymous one goes and one the agent owns stays.
The flows take only their own options (`--help`) and refuse a
`PEDEDIT_BASE` that is not on this machine.

Rules that keep them worth having:

- A flow is for a journey that crosses modules (edit, save, reload, export).
  A rule or an edge case belongs in a unit test or a file of the test data
  set, which are faster and do not break when a label changes.
- Start from a file of the test data set or an example, not from clicks,
  unless building it is what the flow is about.
- Select by `data-*` attribute, `title` or `aria-label`; a button's text only
  where the text is the thing users look for.
- Check the store or the server, then the page: "the pedigree has the pin"
  and "the node is drawn there".
- **Break it once.** Before committing a flow, break the feature it covers
  (make the store action return early) and see the flow fail on the check
  you expect. A flow that cannot fail tests nothing. The flows here were
  each checked that way.

### phone.mjs: does it work by touch on a small screen?

```bash
node frontend/scripts/browser/phone.mjs                       # landing page and two pedigrees at three sizes, about 3.5 minutes
node frontend/scripts/browser/phone.mjs --viewport 390x844 --fixture example:3 --no-landing --verbose
```

```
phone: emulated in chromium (touch, mobile viewport, pixel ratio 3). Not a phone: iOS Safari, finger size, the keyboard and speed need a real one.
ok    390x844  landing page  (4 of 4 checks, 2.6 s)
FAIL  390x844  editor, example:House Targaryen  (42 of 43 checks, 34.7 s)
        FAIL  a one-finger drag pans the canvas: dragged 70,50 and the canvas moved 0,0
        note  fitted at zoom 0.27: a symbol is 11 px across
screenshots: frontend/test-output/browser/phone
phone: 1 of 9 page(s) failed
```

What a phone must be able to do with a pedigree link (#169), in a context
with `hasTouch`, `isMobile`, device pixel ratio 3 and a phone user agent: at
390x844, 360x640 and 844x390 (a phone on its side) by default, on the landing
page, a 4 person example and House Targaryen (96 people). Per editor page:
the viewport meta tag, no sideways page scroll, the canvas keeps at least half
the screen, everyone is in view on open; a tap selects a person and shows no
hover pill; the Person and Pedigree tabs are a bar along the bottom that
opens and shuts the sheet, whose handle swipes it taller, back to half and
shut; the Person tab starts with the pill's buttons, big enough for a finger,
and More options; the selected person stays in view; the toolbar fits and
its Export menu lists every export; the menu button opens the sidebar and
its help is worded for touch (#182); a one-finger drag pans and a pinch
zooms, from bare canvas and from a person; the page never scrolls or zooms
by itself, a pinch on the toolbar zooms the page and a notice says how to
zoom back out; the U-shape view pans, zooms and selects by touch; and no
JavaScript errors or warnings. `--verbose` lists the passed checks and the
notes (canvas size, the size of a symbol at fit).
Screenshots of each page as loaded, with the Person tab, the menu and the
sidebar open, go to `frontend/test-output/browser/phone/`. It runs in CI.

Taps are playwright's `touchscreen.tap`; drags and pinches are
`Input.dispatchTouchEvent` through the DevTools protocol, since playwright
has no multi-touch. Gestures are spaced 700 ms apart: d3-zoom, under React
Flow, reads a touch within 500 ms of the last one as a double tap.

**Emulation is not a phone.** It is desktop chromium with touch events. It
cannot show iOS Safari (a different engine, with its own rules for hover,
zoom on focus and the address bar), a finger's size against a 28 px button,
the on-screen keyboard covering the Person tab, long-press, or real speed.
One thing it does that no phone does: after a tap it moves its pretend mouse
back to the top left corner, so anything that depends on the mouse events a
browser makes up after a tap behaves differently here. A clean run means
nothing is broken that emulation can show; #169 still needs a person with a
phone.

### perf.mjs: how fast is it on a big pedigree?

```bash
node frontend/scripts/browser/perf.mjs                       # 96, 101, 238 and 513 people at 1x, 4x and 6x: about an hour, most of it the 513 people throttled
node frontend/scripts/browser/perf.mjs --profile --throttle 1 --reps 3
node frontend/scripts/browser/perf.mjs --fixture test-data/pedigrees/size/family-200.json --throttle 1,4 --reps 3
node frontend/scripts/browser/perf.mjs --app http://localhost:5215/ --profile   # a production build, see below
```

```
| pedigree | people | CPU | layout engine | buildScene | problems | open | select | edit | hover | zoom | drag update | drop |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| House Targaryen | 96 | 1x | 27 (26 to 29) | 29 (28 to 31) | 0.8 (0.8 to 0.9) | 281 (270 to 301) | ... |
```

Measures the editor's speed (#180, for #42) and prints markdown tables to
paste: milliseconds as the median of `--reps` page loads (default 5) with the
lowest and highest run, per pedigree and per CPU throttling rate (`--throttle`,
default `1,4,6`, set through CDP `Emulation.setCPUThrottlingRate` like the
"4x slowdown" of Chrome's Performance panel). The default pedigrees are House
Targaryen and the generated families in `test-data/pedigrees/size/`. It
measures only and is not in CI: timings on a shared machine vary too much to
pass or fail on. Each row goes to stderr as a table row as soon as its runs
are done, and `--out FILE` is rewritten after each row (`"complete": false`
until the end), so a run that is stopped keeps what it measured. The header gives the commit, the machine and its load
average; run it on a quiet machine and say so with the numbers.

What the columns are:

- `layout engine`, `buildScene`, `problems`: the computation alone, called
  three times in the page after it has loaded (dev build only, through
  `__pededit`): `alignPedigreeByFamily` as the canvas calls it, `buildScene`
  (the engine plus turning its result into nodes and edges), and the editor's
  problems. No rendering is in these, so `edit` minus `buildScene` is
  roughly what React and the browser cost.
- `open`: from the pedigree's data arriving to every symbol being on the
  page and visible. Loading the app's own code is left out (in the dev build
  that is Vite serving hundreds of modules).
- `select` (a click on the person nearest the middle), `edit` (the A key,
  which redraws everyone and reuses the layout, #189: neither it nor the
  drop times a change of structure, which still lays out again), `hover` (the mouse moving
  onto another person), `zoom` (one wheel notch), `drop` (releasing a dragged
  person, which pins them): from the input event,
  before the app's handlers, until the page is quiet again, which is the end
  of the last frame that took longer than 25 ms, or of the first frame when
  none did. So nothing reads below about 10 ms, and work of under 25 ms that
  starts after the first frame is not seen. A second table gives the time
  to the first frame alone.
- `drag update`: the person is dragged through 60 mouse moves, sent as fast
  as the page takes them, and the frames that draw them somewhere new are
  counted: the time per redraw. 17 ms is the full 60 frames a second; 100 ms is 10. (Counting
  frames alone would not do: the page keeps drawing frames in which the
  person has not caught up with the mouse.)

A frame ends after its style, layout and paint on the main thread; raster and
compositing on other threads are not measured. Each pedigree is drawn fitted
to the window with every node unlocked (`canvasSettings.nodesMoveable`), so a
drag needs no hover pill, with the minimap on as it is by default.

`--profile` adds, for each pedigree and for open, edit, hover, zoom, drag and
drop (unthrottled, one run): main thread time by kind of work (script, style,
layout, paint, garbage collection) from a chromium trace, and from the CPU
profiler the JavaScript time by npm package or source file, the top
functions by their own time, and this repository's functions by time
including what they call. That is where to look before deciding what to
optimise. The profiler slows the page, so read shares from it, not totals.

**Dev build or production.** The dev server runs unminified development
React in StrictMode, which renders everything twice and checks props, so
rendering is several times slower than what users get; the layout engine is
about the same in both. For numbers that mean something to a user, build and
measure that:

```bash
cd frontend && npx vite build --sourcemap --outDir /tmp/pededit-dist --emptyOutDir
npx vite preview --outDir /tmp/pededit-dist --port 5215 --strictPort &
node scripts/browser/perf.mjs --app http://localhost:5215/ --profile
```

`--app` is the page measured; fixtures are still read through the dev server
(`PEDEDIT_BASE`), which must be running. A production build has no
`__pededit`, so the three computation columns are left out, and its function
names are minified: with `--sourcemap` the profile names packages and source
files, and this repository's functions by source line
(`scene.ts`, "line 280").

## CI

`.github/workflows/ci.yml` runs on every PR and push to main: layout engine
and frontend vitest, the type check, the layout engine's package build, the
dead code report, the backend tests, and the page checks on headless
chromium, which are `npm run check:pages` (the list is in the root
`package.json`): `lint.mjs --all-examples` (normal, then compact and
de-identified) and `console.mjs --all-examples --fixture-via-api` against a
SQLite Django, then the lints with `--all-fixtures` and the console sweep
with `--all-test-data` (every valid file of the test data set in
`test-data/pedigrees/`, which includes the feature fixtures), so each of them
must load without JS errors, draw and export cleanly, and survive a save and
reload; then `flows.mjs`, the end-to-end flows, and `phone.mjs`, the emulated phone. On failure the job prints the tail
of the Vite and Django logs, then every traceback and 5xx response in the
Django log with the lines round it, however early it came. The unit job
also runs `npm -w frontend run build`, as `deploy.sh` does. Reproduce a failing step locally with the same
command after `servers.mjs up`. The flows compare pedigrees whatever order
their keys are in, since PostgreSQL (jsonb) reorders the keys of what it
stores and CI's SQLite does not.

## Fixtures

`--fixture SPEC` routes `/api/pedigrees/fixture/` in the browser and opens
`/p/fixture`, so the editor runs its real load path without Django. Auto-save
PATCHes go to the in-memory copy. SPEC is one of:

- `example:N` or `example:LABEL` from `frontend/src/data/examples.ts`
- `fixture:SLUG` from `frontend/src/fixtures/features.ts`: the feature
  fixtures (#140), small artificial pedigrees that between them draw every
  symbol, line and label (`fixture:status`, `fixture:couples`,
  `fixture:text-2008`...). An unknown slug lists them.
- a `.ped` file, optionally `FILE.ped#FAMID` (imported with the app's own `importPed`)
- a `.json` file: the app's own Download JSON envelope (`{format, version,
  pedigree}`) or a bare Pedigree, both read with the app's `importJson`, or
  an API payload `{ "title", "data": Pedigree }`

Import warnings (an unrecognised sex value, a founder created for a missing
parent) are reported as findings, so an import that only worked by guessing
does not look clean. Import errors stop the run.

`shot.mjs`, `console.mjs` and `lint.mjs` accept `--fixture` several times and
handle each in turn.

`--all-examples`, `--all-fixtures` and `--all-test-data` (all three tools)
stand for every example, every feature fixture and every valid file of the
test data set (`test-data/pedigrees/`, #167: the feature fixtures plus
structures, awkward text, old saves and data with problems). The examples are real families and draw
only part of what the renderers can; a change to drawing code should be
checked on the fixtures too:

```bash
node frontend/scripts/browser/lint.mjs --all-fixtures
node frontend/scripts/browser/shot.mjs --all-fixtures --tile --out-dir /tmp/fx
```

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

A flow that deletes its account (`delete-account`, #183) runs as a second
account, `claude_agent_throwaway` (`agent_token --throwaway`, flow
`asAgent: "throwaway"`), so it never deletes the pedigrees of a check signed
in as `claude_agent`. The next run creates it again.

The tokens are signed with the main checkout's `backend/secret_key.txt`, also
from a git worktree (see "Working in a git worktree"), so the running Django
must use the same key. The harness checks the tokens against `/api/auth/me/`
first and stops with a message saying so when they are rejected, rather than
running the page signed out (#191).

## Base URL

Paths resolve against `http://localhost:5173`; set `PEDEDIT_BASE` to use
another local port (for a second checkout's Vite, for example).

## Safety

- URLs must be on localhost; anything else is refused unless
  `--allow-remote` is given. Never point these at pededit.com. The flows
  and the phone check have no `--allow-remote`.
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
