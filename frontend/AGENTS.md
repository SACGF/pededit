# frontend/ — agent notes

React 18 + TypeScript + Vite app. React Flow (`@xyflow/react`) draws the canvas,
Zustand holds state, Tailwind + shadcn/ui for chrome. Workspace package
`@pedigree-editor/frontend`.

## Running

```
npm -w frontend run dev    # Vite on 5173, proxies /api to Django on 8000 (Node 20+)
npm -w frontend run test   # vitest
npm -w frontend run typecheck   # tsc -b, the same check the production build runs
```

`typecheck` must stay `tsc -b`: the root `tsconfig.json` only has project
references, so a plain `tsc --noEmit` checks no files at all (it hid a build
break until deploy). It checks the app (`tsconfig.app.json`) and the tests
(`tsconfig.test.json`), both in `strict` mode: vitest strips types without
checking them, so a test calling an action with a value its type does not
allow would otherwise pass.

Tests. A new test builds its pedigree with `person`, `M`, `F`, `U`, `couple`
and `build` from `src/fixtures/features.ts` where it can, not a builder of its
own. Assert what is drawn or stored, not how: look a person up by id, not by
layout slot; compare `keyRows` or `parseExportSvg` output, not markup strings
or path data; and when a number is checked, make it a relation (above, inside,
centred) unless the number is the specification. A test that needs today's
date fixes it (`vi.useFakeTimers`, as `svgSnapshots.test.ts` does).

Check a change in the real page before calling it done: `node
frontend/scripts/browser/console.mjs --fixture example:2` reports JS errors as
`frontend/src/...:line`, `shot.mjs` writes a PNG to read back, `eval.mjs` reads
the stores via the dev-only `window.__pededit` (`src/devHooks.ts`). Every canvas
symbol carries `data-individual-id` for selectors. See
`scripts/browser/README.md`.

The layout engine is imported as `@pedigree-editor/layout-engine` but read
from `../layout-engine/src/index.ts`, never from a build: an alias in
`vite.config.ts`, `vitest.config.ts` and `tsconfig.app.json` (`paths`), all
three needed. Its `package.json` points at `dist/`, which exists only in the
package published to npm (#22, `layout-engine/AGENTS.md` "Publishing").

`src/config.ts` reads `VITE_GOOGLE_CLIENT_ID` and `VITE_GITHUB_CLIENT_ID`. If
`@react-oauth/google` is not installed, `vite.config.ts` aliases it to a no-op
stub so the app still builds without Google login.

`config.ts` also reads `VITE_ROLLBAR_ACCESS_TOKEN` and
`VITE_ROLLBAR_ENVIRONMENT` (`deploy.sh` sets them from the site config). Empty, the default, means error
reporting is off, and the dev server never reports.

## Error reporting (`src/errorReporting/`, #49)

- Reports go to Rollbar. `index.ts` is the only part in the main bundle:
  with no token it adds no
  listener and never imports `reporter.ts`, and the build emits no reporter
  chunk at all (about 4 kB, 2 kB gzipped, when it does). The
  `error-reporting-off` flow checks that an error on a pedigree page sends no
  request off the site.
- It is hand-written, not `rollbar.js`: the SDK collects console output,
  the DOM text of clicks, network URLs (which hold the pedigree id), the page
  URL and the sender's IP by default, and every default would need switching
  off and re-checking on each upgrade. `reporter.ts` posts one item to
  `api.rollbar.com/api/1/item/` with no cookies and no Referer. The
  post_client_item token is in the public JavaScript, which is how Rollbar
  browser tokens work: it can only add items.
- **The scrubbing rule: a report is built from an allowlist in `scrub.ts`.**
  `buildReport` sets every field: error type, message through `scrubText`,
  stack frames of our own scripts, the route pattern (`/p/[id]`, never the
  path, query or hash), code version and environment. No `person` and no
  `request.user_ip`: Rollbar stores an address only when a report asks. It reads only `name`,
  `message` and `stack` of what was thrown, and nothing from the DOM, the
  stores, the console or the network. Anything new on a report (a tag, a
  breadcrumb, the pedigree's size) is added there with a test in
  `__tests__/scrub.test.ts` showing it cannot carry pedigree content or the
  pedigree id. `backend/peded/error_reporting.py` is the server's copy of
  the rules.
- `scrubText` drops everything between the first and last quote of a
  message, since engines quote what they interpolate (a JSON parse error
  quotes a piece of the JSON). It cannot catch a name interpolated without
  quotes, so no `throw new Error(...)` may interpolate pedigree content
  (none does today; a new route also needs adding to `ROUTES`).
- The code version is the build date (`pededit-frontend@<date>`), never the
  commit, for the reason in `utils/buildInfo.ts`.
- `components/ErrorBoundary.tsx` wraps the app in `main.tsx`: a render error
  shows a plain page with Reload instead of a blank one, and is reported.
- `domGuard.ts`, called in `main.tsx` before the first render, patches
  `Node.prototype.removeChild` and `insertBefore`. Browser page translation
  and some extensions replace text nodes React still holds, and React's next
  removal of one, or insert before one, throws `NotFoundError` ("not a child
  of this node") into the error boundary. A report with that message from a
  browser the guard does not cover means something else edits the page; it is
  not a bug in a component. The `translated-page` flow imitates translation.
- `vite.config.ts` sets `build.sourcemap: true` so Rollbar can download the
  maps from the site; each report sets `client.javascript.source_map_enabled`
  and the code version (INSTALL.md step 12). The code is public; the maps are not a
  leak.

## Product facts an agent must know

- **Anonymous mode is the default.** Nobody needs an account. Creating a
  pedigree while signed out POSTs to `/api/pedigrees/` with no token; the
  backend stores it with `owner=None` and the UUID in the URL (`/p/<uuid>`) is
  the only key. The landing page and the canvas sidebar both tell the user to
  bookmark or copy the link, and the landing page lists "Recent on this
  device" (#16): `utils/recentPedigrees.ts` keeps the last 20 opened in
  localStorage `recentPedigrees`, recorded by `openPedigree`, renamed by
  `renamePedigree`, dropped by `deletePedigree` and by a 404 on open. It is
  per browser and never sent to the server. Signing in (Google or GitHub)
  only adds the "Your pedigrees" list and "My library" of conditions and
  tags.
- `Individual.sex` is biological sex and drives every genetic calculation;
  an optional `genderIdentity` can change only the symbol drawn (#26,
  `pedigree/gender.ts`, see `claude/nsgc_nomenclature.md`, "Where we differ on purpose").
- Structures that competitors refuse but we handle: partnerships with no
  children (`addPartner`; the layout engine feeds them to kinship2 as
  `childlessCouples`, which R has no way to express; `Partnership.childless`
  adds the NSGC infertility / no-children-by-choice mark under the couple
  line, #15, set from the Person tab or more menu and cleared when a child is
  added), a single known parent (`addParent` inserts an
  unknown-sex placeholder partner because kinship2 needs 0 or 2 parents;
  every auto partner is made with `placeholder: true`, and while nothing is
  recorded about it, it is removed with its couple line when Replace
  parents, Detach from parents, a delete or Remove partnership leaves it
  childless or alone, #107, `pedigree/placeholders.ts`; `setSex` clears
  the flag, and older saves without it are never cleaned up),
  disconnected individuals, cross-generation and consanguineous matings.
  "Set parents..." / "Replace parents..." and "Add existing child..." in the
  more menu link existing people (#36), which is how consanguinity loops
  and "the two families turn out to be related" are drawn. Their undo:
  "Detach from parents" (`detachFromParents`) makes a child a founder again,
  and "Remove partnership" (`removePartnership`, in the couple's items, #104)
  drops a couple line while keeping both people; it refuses a couple with
  children, who would silently lose a parent, and the menus show it
  disabled with that reason.
  "Swap sides" (#106, `swapPartnerSides`, in the couple's items) sets `Partnership.leftPartner` from the side
  the canvas currently draws, so it is a toggle and never pins anyone. When
  one partner has exactly two partners drawn either side of them, the other
  couple's side is set too, so the two trade places. `swapSidesPlan` lays the
  result out first and refuses (notice, no undo step) a swap kinship2 can
  only draw by adding a duplicate, ignoring, or moving another chosen side:
  about 1 couple in 9 across the examples, mostly inbred or partner-chain
  families. A pinned partner keeps its pin and the notice says so.
  "Draw this couple beside" (#205, `setCoupleDrawnBeside`, a section of the
  couple line menu and of each partner's own menu, `DrawBesideSection`) sets
  `Partnership.drawnBeside`: which partner's place
  the couple is drawn at, so who is drawn twice in a family with a loop.
  The section shows only when both partners have a place of their own
  (`drawBesideOptions`), which no couple in an ordinary family has.
  A couple's items are reached three ways, since a line is a small target
  and nothing says it can be right-clicked: the couple line's menu
  (`CoupleMenuItems`), the menu of both partners selected together, which
  shows the same items above the batch ones (`coupleOfPair`), and one
  partner's own menu, which shows them once per couple under "With <the
  other partner>" (`CoupleMenuItems` with `fromId`). All three render
  `CoupleMenuItems`, so a new couple item goes there only. A donor pair
  is not a couple: no menu or form about relationships lists it
  (`personCouples(...).donorPair`).
  `drawBesidePlan` stores a side with the choice (the one swapped to if any,
  else whichever of the two draws fewer people twice), stores nothing when
  the drawing would not change, and refuses a choice the layout cannot draw
  together with the others (`drawnBesideConflict`); "Automatic" clears the
  choice and the side. It is meant to draw people twice, so unlike a swap it
  is never refused for that: the notice gives the count before and after.
  The "Quadruple half first cousins" example is set with it (`withCouples`
  in `data/examples.ts`).
  "Add existing partner..." (#84, `linkPartner`) joins two people already
  on the tree, relatives included, and of any sex; "Add partner" always
  makes a new person, of the opposite sex (unknown for an unknown-sex
  person, #119), father role first in the `Partnership`. Same-sex couples (#105, `pedigree/sameSex.ts`) are
  ordinary partnerships, but sex is biological sex, so they never have
  genetic children together: "Add child" from one partner (hover pill or
  "Add children...") makes the child that partner's and a donor's, and the
  couple line's menu shows "Add child..." (only for a same-sex couple)
  asking which partner is the genetic parent. The Sex menus refuse only a
  change that would give a child two genetic parents of one sex
  (`geneticParentsSexProblem`), not same-sex partners.
  Pregnancy and loss symbols exist (`pedigree/lifeStatus.ts`) and adoption
  brackets (`Individual.adopted`, `pedigree/adoption.ts`, #12: "in" also
  dashes the line from the adoptive parents); PED cannot carry either, so
  Export PED warns first. Assisted reproduction (#45, `pedigree/assisted.ts`):
  "Add sperm donor" / "Add egg donor" / "Add surrogate" in the more menu;
  the donor becomes the child's genetic parent (so kinship is right) and
  the parent replaced stays linked as carrier or social parent. "Existing
  sperm donor..." / "Existing egg donor..." / "Existing surrogate..." (#104,
  `picking.kind` "donor" / "surrogate") make someone already on the tree the
  donor or carrier, e.g. the wife's sister (NSGC Fig. 3); a second child of
  the same donor and parent joins the same donor pair, so they are full
  siblings, and an egg donor who also carried the child stays drawn as the
  donor only, the previous carrier becoming a social parent. Twins (#11) live on the partnership as
  `Partnership.twins` sets with a zygosity (`pedigree/twins.ts`): the layout
  keeps a set side by side (autohint, as kinship2 does), the sibship edge
  draws the shared fork, and `setSex` on a monozygotic twin changes the whole
  set.
- Visual style is black and white, minimal chrome. No colour except tags.
  No gradients, drop shadows, rounded-corner cards or decorative colour on
  pedigree elements; type is a small, plain sans-serif.
- Small screens (#169): viewing is the bar on a phone (display, pan, zoom,
  tap to select), editing is a nice to have. Below Tailwind's `lg` (1024px,
  so a phone on its side counts) `CanvasPage` hides the left sidebar behind
  the toolbar's menu button (it opens over the canvas), turns the side panel
  into a sheet under the canvas with its tabs as a 48px bar along the bottom
  of the screen (`EditPanel`'s `size` / `onSizeChange`: "closed" is the bar
  alone, "half" is 50dvh, "full" leaves the chart a strip of 112px, or a fifth of a short screen). A tab or a
  tap on a person opens it at half (`PedigreeCanvas`'s `onPersonTap`; a
  drag, a tap on the hover pill and a tap while picking do not), the tab of
  the open sheet, the handle's close button and a tap on the empty canvas
  shut it, a swipe or tap on the handle (`SheetHandle`) changes its height
  when the finger lifts, and focusing a text field makes it tall because the
  keyboard covers the lower half. Person can be tapped with nobody selected
  and says to tap someone. For one person the sheet starts with the hover
  pill's buttons (`components/PersonActions.tsx`, #214), and a tap shows no
  pill there: it sat over the name of the person tapped. When the canvas shrinks,
  `KeepSelectedInView` in `PedigreeCanvas.tsx` pans the selected person back
  onto the smaller canvas), folds the toolbar's exports into one "Export"
  menu, moves the U-shape view's switch (#220) into the Filter menu and
  drops its dividers so it fits 360px (it scrolls sideways once
  "Reset layout" or the problems list is added), words the sidebar's "Using
  the canvas" for touch under `pointer-coarse:` (multi-select has no touch
  gesture and the help says so; long press opens the more menu only where
  the browser fires `contextmenu` on it, Android Chrome but not iOS Safari),
  leaves out the minimap and shows a dismissible line saying how to move
  around and that editing
  is easier on a computer (localStorage
  `smallScreenNoticeDismissed`). It is all `lg:` / `max-lg:` classes plus
  `hooks/useSmallScreen.ts` for what CSS cannot do, and nothing changes from
  `lg` up: check desktop screenshots are identical after touching it. The
  canvas has `touch-action: none` and takes every touch for the chart; a
  pinch anywhere else zooms the page, so small text can be magnified (#193).
  A page zoomed until the canvas fills the screen could not be zoomed back
  out from the canvas, so while `visualViewport.scale` is above 1
  `PageZoomNotice` draws a strip at the top of what is on screen saying how,
  and the strip takes a pinch itself. It follows the visual viewport by
  transform because fixed elements stay with the unzoomed page. Fields are 16px
  on touch screens (`index.css`) because iOS Safari zooms into smaller ones
  on focus. The height is `h-app` (100dvh), not `h-screen`: 100vh is taller
  than a phone shows while its address bar is out. Check with
  `scripts/browser/phone.mjs`, which emulates touch; it is not a phone.
- Toolbar popovers (Radix) close on a canvas click only because
  `PedigreeCanvas` registers its wrapper with `useDismissableLayerSurface`:
  React Flow's pan/zoom stops `mousedown` from reaching the document, and
  Radix (dismissable-layer 1.2) treats a stopped outside click as handled
  and keeps the popover open. A new surface that stops mouse events needs
  the same. Keep `@radix-ui/react-dismissable-layer` at the version the
  popover uses, so there is one copy of its context.
- Browsers send no mouse events to a disabled control, only pointer events,
  and React Flow's drag and pan end on a window `mouseup`. A drag let go
  over a raw disabled `<button>` (the hover pill's) never ended (#185), so
  `PedigreeCanvas` installs `utils/mouseupOverDisabled.ts`, which sends the
  missing `mouseup`. shadcn's `Button` is `disabled:pointer-events-none`
  and never had the problem.
- **`/your-data` tells users what is stored, where, who can read it and how
  to delete it** (#178, #203, `pages/YourDataPage.tsx`, "What happens to
  your pedigrees", linked from the landing page and its footer). Each
  sentence states what the code, the deploy config or the maintainer says,
  and the comment above it lists where. Change the sentence in the same commit as a change
  to: the access rules, deleting, what de-identified export drops, anything
  kept in `localStorage`, a script, font or request to another site, or what
  the server logs. It is not a privacy policy and must not be called one. Where
  the server is, who runs it, Cloudflare in front of it and the 14 days the
  request logs are kept come from the maintainer, not the repository.
- **Google's sign-in script loads on the sign-in page only**, when the
  build has a Google client ID: `GoogleAuthProvider` wraps `LoginPage` in
  `App.tsx` and `@react-oauth/google` adds the script tag on mount. It is
  the only script from another site, and the landing page says so (the
  sentence follows `GOOGLE_CLIENT_ID`). Do not move the provider up the
  tree. The landing page also says errors are reported to Rollbar when the
  build has a token (`ERROR_REPORTS`), and that signing out takes the
  account's pedigrees off "Recent on this device" (`logout`).

## Layout of src/

- `pages/` — `LandingPage` (create blank, import PED, "Recent on this
  device", examples, "Your pedigrees" when signed in), `CanvasPage` (sidebar + toolbar + canvas +
  panels, also for `/example/<slug>`), `LoginPage`, `GitHubCallbackPage`,
  `ChangelogPage` (#79), `GuidePage` (#202), `YourDataPage` (#203).
- Example links (#150, #151): `/example/<slug>` renders `CanvasPage`, which
  draws the example from the bundle (`openExample`) with
  `useAppStore.example` set and no `activePedigreeId`: nothing is sent to
  the server. The first edit (anything that dirties the store) saves the
  copy at once (`saveActivePedigree` creates it, one request in flight
  shared by every save while it runs) and `CanvasPage` replaces the URL
  with `/p/<id>`. Both routes use the same element, so React keeps the
  editor mounted and the undo history survives; the `/p/:id` effect skips
  the fetch when that id is already open. A failed create keeps the edits,
  stays on the example URL, shows a notice and retries every 10 s. A tab
  closed in the first moment after an edit gets the "Leave site?" prompt,
  since the copy's id comes from the answer and cannot be a keepalive.
  `public/robots.txt` still disallows `/example/`. The landing page's
  examples are `<Link>`s to the same URLs. An unknown slug goes to the
  landing page.
- Prerendered pages (#25, #202): after `vite build`, `prerenderPlugin`
  (vite.config.ts) loads `src/prerender.tsx` through a Vite SSR server
  with a memory `localStorage` and writes each of its `PRERENDERED_PAGES`,
  as a signed-out first visit sees it, from the built `index.html` at the
  `<!--prerendered-landing-->` marker: the landing page into
  `dist/index.html`, the guides into `dist/guides.html` and
  `dist/guides/<slug>.html` with their own title, description and canonical
  link (`pageHtml`). Nginx tries `$uri.html`, so `/guides/consanguinity`
  gets its file. They are not hydrated: `main.tsx`'s `createRoot` replaces
  them. Nginx serves `index.html` for every other route, so an inline
  script hides `[data-prerendered]` on any path but the page's own.
  Anything these pages read while rendering must work without a browser
  (`window` is undefined there; `YourData` says "this site" for the host);
  `src/__tests__/prerender.test.ts` checks it without a build, and CI's
  unit job runs `npm -w frontend run build`. The
  SSR server has its own `cacheDir`, or a build would invalidate a running
  dev server's dependencies.
- Guides (#202): `/guides` and `/guides/<slug>` (`pages/GuidePage.tsx`,
  the text in `src/guides/`, slugs in `guides/guides.ts`). Every figure is
  a hand-written pedigree drawn by `exportSvg` with `key: false` and shown
  as an `<img>` data URL (`GuideFigure`): inline SVGs would share ids for
  patterns and clip paths. The consanguinity table is computed by
  `kinshipCoefficients`, so it cannot drift from what the editor shows. The
  practice families (`data/practiceFamilies.ts`) are also examples, in the
  "Practice" group. A new guide goes in `GUIDES`, `GuidePage`'s `BODIES`,
  `public/sitemap.xml` and `public/llms.txt`. The text had a clinical read
  only where the issue says so; change symbol descriptions together with
  `claude/nsgc_nomenclature.md`.
- `public/llms.txt` and `/docs/` (#200): the JSON format reference and
  schema are copied from the repository's `docs/` into the build by
  `publishedDocsPlugin` (and served by the dev server), so `docs/` stays the
  one source. The schema's `$id` is its public URL. Keep `llms.txt`'s
  feature list and example links true when those change.
- Changelog: `/changelog` fetches `public/changelog.json`, which
  `scripts/changelog.mjs` writes from the GitHub milestones (one release per
  milestone, its finished issues as bullets: closed as completed, or open
  with "Human work required" and cited as (#N) by a commit in the checkout,
  so work planned onto the next milestone does not show). The file is gitignored and generated by
  `deploy.sh`; run the script once locally to see real data, otherwise the
  page shows its "see GitHub" fallback. The footer link shows the build date
  (`utils/buildInfo.ts`, a Vite define), never the commit, for the reason in
  `backend/AGENTS.md` (health check).
  A release is dated by its milestone's due date, so every milestone needs
  one; "Initial deployment" and "U-shape export" hold work from before issues
  were used, recorded in the retrospective issues #152 to #166. The GitHub API
  shifts a `due_on` back a day for this account's timezone: send noon UTC
  (`2026-04-14T12:00:00Z`) to store that date.
- `store/useAppStore.ts` — auth tokens (localStorage `access_token` /
  `refresh_token`), pedigree list, open/create/save/rename/delete. Saving
  reads the pedigree from `usePedigreeStore`. `CanvasPage` calls
  `closePedigree` on unmount: it saves unsaved edits and empties
  `usePedigreeStore`, so the next pedigree opened never flashes the last one,
  and an open whose fetch returns after a close or a later open is dropped.
  Unsaved edits are also flushed when the tab is hidden or unloads (#123,
  `flushActivePedigree`): `fetch` keepalive when the JSON is under 60 KB
  (browsers cap keepalive bodies at 64 KB; every example fits), an ordinary
  request otherwise. The browser's "Leave site?" prompt shows only when the
  last save failed or an over-limit save is still running. A save clears
  `isDirty` only if the pedigree was not edited while it ran.
- `store/usePedigreeStore.ts` — the editing model: the `Pedigree` object,
  the undo and redo stacks, and the one way an edit is made. The actions
  are in `store/pedigree/`, one file per kind of edit, each action's type
  beside its code: `structure.ts` (add and remove people, couples, parents,
  children, donors), `person.ts` (what is recorded about a person, and the
  batch setters), `couple.ts` (a couple's fields, twins, swap sides, draw
  beside), `chart.ts` (title, settings, conditions and tags, filters, pins,
  locks) and `view.ts` (selection, picking, notices, the U-shape view:
  nothing saved or undoable). Add new edits there, not in components.
  - Every edit goes through `mutate` (or `editIndividual`,
    `editPartnership`, `mutateEach`, which call it), handed to each file as
    `EditTools` (`store/pedigree/tools.ts`). It applies an Immer recipe as
    one undo step, and a recipe that changes nothing is not an edit: no
    undo step, the redo stack is kept and `isDirty` stays as it was. So an
    action does not check first whether it would change anything; its
    recipe only has to assign what differs (an equal value, or deleting a
    missing key, is no change to Immer; building a new array is one).
  - What is not set is absent from the saved pedigree, never `false` or
    `""`: `setOptional` in `store/pedigree/draft.ts` writes a field that
    way. That file holds the edits to a pedigree in place that actions
    share (a new couple, a child leaving its parents, dropping pins).
  - Pedigrees in the store are never changed in place, so the undo stack
    holds the objects themselves and an undo puts the same object back.
  Components read it with `usePedigreeStore(s => s.field)` or
  `usePedigreeFields("a", "b")` (a shallow pick), never the bare
  `usePedigreeStore()`: that re-renders on any change to the store, which
  redrew every symbol on the canvas on each hover (#197, 160
  ms a hover at 513 people). A canvas node or hover pill selects its own
  person's answer (`s.problemHighlightId === id`, its problems as a string),
  never a list or object that is new on every edit. Code that only acts on
  an event reads `usePedigreeStore.getState()` in the handler and
  subscribes to nothing (`hooks/useKeyboardShortcuts.ts`).
  Selection (#21) is `selectedIds` (every selected person) plus `selectedId`,
  the primary (last clicked) one that the Person tab and single-person menu
  items read. Change it only through `setSelectedId` / `toggleSelected` /
  `setSelection` / `selectDescendants`, which keep the two in step; every
  edit, undo and redo drops ids that no longer exist. `selectedPair(state)`
  gives exactly two selected people, for pairwise views: the panel then shows
  their kinship and named relationship (#90), and the more menu's
  "Relatedness to..." is a pick mode (`picking.kind === "relatedness"`) that
  only selects the pair, with no edit. Batch edits
  (`pinIndividuals`, `lockIndividuals`, `unlockIndividuals`,
  `deleteIndividuals`, and the #35 status setters `setAffectedMany`,
  `setDeceasedMany`, `setCarrierStatusMany`, `setSexMany`,
  `setIndividualTagMany`) are one undo step each. The #35 setters go
  through `mutateEach`, which skips people already in the target state,
  makes no undo step when nobody changes, and posts an undoable notice
  ("Marked 3 affected."). Their rules and menu counts are in
  `pedigree/batch.ts`.
- `pedigree/` — rendering. See `src/pedigree/AGENTS.md`.
- `io/` — import and export. See `src/io/AGENTS.md`.
- `components/` — Toolbar, EditPanel (Person and Pedigree tabs, #135: any
  change of selection switches tab, to Person when someone is selected, to
  Pedigree when it is cleared, but choosing a tab never changes the
  selection. Pedigree holds the chart title field, #20, and under it the
  folded "Clinical details" section, #102, whose fields, order and labels
  come from `pedigree/clinicalDetails.ts`. Whole-pedigree fields go on the
  Pedigree tab, not in Settings, which is only how the chart is drawn, and
  the figure `Legend` (#75) is shown there only. Person is one
  list, most used first (#138): name, sex and the status checkboxes, dates
  and free-text age, "Conditions and tags" (`ConditionsAndTags.tsx`, #136:
  every defined tag with its key swatch, conditions first with No /
  Affected / Carrier, the rest as checkboxes, and the "Add / edit"
  button), Evaluations, notes, then the rarely set fields (pregnancy or
  loss, adoption, gender identity, donor or surrogate, twin), folded to one
  line while none is set for the person or warned about, then Relatedness
  (#32, with the double-line checkbox of #85) and Partners (ended and
  childless marks per couple). A section gets a heading only when it is a
  list or read-only; single-line fields use `Field inline`, the label in a
  72px column beside the control, as the panel is 240px wide).
  "Conditions and tags" (`CONDITIONS_AND_TAGS`) is the user-facing name for
  what the tags dialog defines; "tag" stays the code's word. Every other
  user-facing word follows `claude/glossary.md` (#137).
  The status controls edit sex, affected, proband and consultand with the
  more menu's store actions and rules (#120: refused sexes disabled with
  `batchSexProblem`'s reason written out); keep the two in step when a rule
  changes. A toolbar add selects the new person and sets `revealRequest`,
  which `RevealOnRequest` in `PedigreeCanvas.tsx` turns into a pan (never a
  zoom or a pin) when their node is off-screen (#121),
  SettingsPanel, TagsDialog,
  ExportDialog, ImportPedDialog, plus shadcn primitives in `components/ui/`.
- `hooks/useKeyboardShortcuts.ts` — Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Shift+Z
  redo, Delete/Backspace removes every selected person (Shift: with
  descendants, Alt: with ancestors, #34), A and D toggle affected and
  deceased on every selected person (#35: a mixed selection is all marked,
  an all-marked one all cleared; not while typing in a field), F8 and
  Shift+F8 go to the next and previous editor warning (#116; F8 because it
  works while typing in the field the last one focused and clashes with
  nothing; VS Code uses it the same way), Escape cancels picking, else
  clears the selection. There is no select tool or mode (#122): plain drag
  on the background pans, Shift+drag draws the rubber band, and the edit
  panel says so when nothing is selected.
- Editor warnings (#116): data that looks wrong is reported by
  `pedigree/validation.ts`, never refused; see `src/pedigree/AGENTS.md`.
  Use a rule for "this data is probably
  a mistake" and a notice for "this edit did X / could not be done".
- Notices: the pedigree store's `notice` / `setNotice` (not undoable) is how
  an edit reports what it did or why it was refused; `CanvasPage` shows it
  under the canvas with an Undo button when `undoable` and clears it after a
  few seconds. There is no toast library; use this instead of `alert`.
- `api/client.ts` — axios instance with bearer token and a single shared
  refresh promise on 401 (refresh tokens rotate, so concurrent refreshes would
  consume each other). When the refresh fails too, the tokens are dropped,
  `useAppStore` is signed out through `setSignedOutHandler`, and the request
  is sent again without a token, so a pedigree's link still opens (#191).
  It never navigates: going to the landing page lost the pedigree the link
  opened.
- `api/errors.ts` — what to tell the user when a request failed (#184). A
  429 from the rate limits (sign-in, token refresh, creating without an
  account, `backend/api/throttling.py`) reads "Too many requests from your
  network. Try again in 40 seconds." from `Retry-After`;
  `requestErrorMessage(err, otherwise)` gives that or the caller's own
  message. A rate-limited refresh keeps the tokens. The server never limits
  a caller on the box, so the `rate-limited` flow sends `X-Forwarded-For`.
- `data/examples.ts` — the example pedigrees on the landing page. Each has
  a `slug`, its name in `/example/<slug>` (#150). Those links are published,
  so a slug is never changed or reused; `data/__tests__/examples.test.ts`
  pins the list. Tests and the page checks still address examples by index
  or label (`example:N`).
- `fixtures/` — pedigrees used by tests.
  `fixtures/features.ts` holds the feature fixtures (#140): small artificial
  pedigrees that between them draw every symbol, line and label, each also
  in NSGC 2008 and black and white where that changes the drawing. The
  examples are real families for users and draw only part of it, so drawing
  changes are checked on these (`--fixture fixture:SLUG`, `--all-fixtures`).
  `fixtures/__tests__/featureFixtures.test.ts` reads the field list from
  `docs/pedigree-json-schema.json` and fails when a field or enum value is
  set by no fixture: a new drawn field needs a fixture person, a field that
  draws nothing goes in that test's `DRAWS_NOTHING`. A new setting that
  changes the drawing gets a variant in `VARIANTS`.
  `fixtures/dataset.ts` is the source of the whole test data set (#167):
  its test writes each case to `test-data/pedigrees/` with a
  `manifest.json` of what the code does with it (importer issues, problems,
  lint codes, what the server does), and the backend tests and page checks
  read those files. Add awkward cases there, not inline in one test:
  `test-data/pedigrees/README.md` says how. A new rule in `RULES` or a new
  importer issue code fails its coverage test until a file triggers it.

## Dead code

`npm run deadcode` (part of `npm run check`) runs knip (`knip.json`, at the repo root) over the frontend, its scripts and the layout engine. It lists files nothing imports, exports nothing uses and dependencies nothing needs, and exits 1 when it finds any. Run it before finishing a change and leave it clean. If it says knip is not installed, run `npm install`: an install made before knip was added does not have it.

- **Delete what it reports**, then run it again: removing one thing can leave another unused.
- **It can be wrong** about code reached in a way it cannot follow: a file run by a shell script, the target of a Vite alias, a `/src/...` import inside a page check. That is why CI only warns. When the code is used, say how in `knip.json`: an `entry` for a file run or aliased from outside, `ignore` for vendored code (`src/components/ui/`).
- **A test counts as a use.** `npx knip --production` leaves the tests out, so it also lists what only tests call. Read that list now and then: a wrapper only tests call is deleted and its tests pointed at what the app calls; deliberate test support stays (`resetProblemStep`, `readPngDpi`, `layoutCost.ts`, `uShapeLint.ts`, the fixtures).
- **What it does not report:** an export used only in its own file, a field of an object that nothing reads, and anything that is not TypeScript or JavaScript.

## Conventions

- Tests sit in `__tests__/` next to the code they cover.
- Use `@/` for `src/` imports in components; relative paths elsewhere are fine.
- Draw once: the canvas and the SVG exporters render the same components in
  `pedigree/chart/`, so a drawing change goes there, and shared geometry goes
  in framework-free modules (`pedigree/tags.ts` is the model).
