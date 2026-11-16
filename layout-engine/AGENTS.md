# layout-engine/ — agent notes

TypeScript port of the kinship2 R pedigree layout algorithm, the npm
workspace package `@pedigree-editor/layout-engine`, set up to be published to
npm (#22, see "Publishing" below). It has no React or DOM dependency and is
consumed by the frontend and by the exporters.

Read `claude/layout_engine_guide.md` before touching anything here or in the
renderer. It explains `LayoutResult` (n, nid, pos, fam, spouse), the 1-based
indexing convention inherited from R, and the three rendering rules.

## Files

- `types.ts` — the canonical `Pedigree` data model (Individual, Partnership,
  parentOf, Tag, CanvasSettings, pinnedPositions). The Django `JSONField`
  serializer and the Zustand store mirror this exactly. Change it here first,
  then `backend/api/serializers.py`, then the store.
- `kindepth.ts` — generation assignment. `alignPedigree` first calls it with
  `align=true` (tries to level spouses) and falls back to `align=false` when
  that fails.
- `autohint.ts` — spouse and ordering hints. Full port of the kinship2
  duplicate fixup (sibling shift plus spouse hints) and of its twin handling
  (#11): `Partnership.twins` plays the part of R's `relation` matrix, a twin
  set gets the mean of its members' ranks plus a per-member offset, and
  `shift` moves a whole set (twice over for monozygotic). PED input has no
  twins, so the oracle comparisons are unaffected. No connected-component
  pass is needed (#39): alignped1 builds one founder's tree at a time and
  alignped3 sets the trees side by side, so unrelated families never
  interleave, and the editor lays each family out alone anyway
  (`families.ts`). `tests/components.test.ts` pins this.
- `alignped1.ts` to `alignped4.ts`, `alignPedigree.ts` — the kinship2 placement
  pipeline. alignped4 runs a quadratic program via the `quadprog` npm package.
  The frontend's Vite needs `optimizeDeps.include: ["quadprog"]` for that
  package to load, because it reads the engine from source (a CommonJS
  dependency of linked source is not pre-bundled otherwise).
- `families.ts` — `alignPedigreeByFamily`, which the canvas, SVG export and
  de-identification call instead of `alignPedigree` (#64). R's `align.pedigree`
  packs disconnected families into shared rows at ordinary spacing, so they
  read as one family; this lays out each family alone and joins them with
  `FAMILY_GAP`, with unconnected people last. With one family it returns
  `alignPedigree` unchanged, so keep `alignPedigree` R-faithful for the oracle.
- Assisted reproduction (#45) needs nothing in kinship: a donor is in the
  child's partnership as its genetic parent. `carriedBy` and
  `socialParents` (lines on the drawing only) touch the layout in two
  places: `splitFamilies` joins those people to the child's family, and
  `alignPedigree`'s `appendIsolated` puts such a person with no partner or
  parents of their own in the row above the child (`assistedLevels`)
  instead of the founder row. Two more, for NSGC Fig. 3 ("the pregnancy
  ... below the woman who is carrying the pregnancy"), in `assisted.ts`:
  `placementParentOf` moves a child carried by the partner of its genetic
  father under that couple for the layout only (`alignPedigree` swaps it
  into `parentOf` before `pedigreeToLayoutInput`, so the donor pair becomes
  a childless couple and the donor stays beside the father), and
  `shiftUnderCarrier` moves an only child with no partner under
  `carrierAbove` after `appendIsolated`, as far as its row neighbours
  allow. PED input never has them.
- Same-sex couples (#105): `pedigreeToLayoutInput` gives every couple a
  father role and a mother role, a male taking the father role. Two women
  who each have a child by a man (or a donor) would then hold the mother
  role in one couple and the father role in their own, and alignped1 sees
  only half of such a person's marriages (a donor pair drawn apart, a
  child with no line). `resolveRoleConflicts` recolours the roles of that
  partnership component (two-colouring, keeping the most people in the role
  of their sex) only when such a conflict exists, so opposite-sex pedigrees
  and the oracle are unchanged. Roles, not sex, are what alignped1 reads.
- `partnerSides.ts` — which side a partner is drawn on (#106).
  `Partnership.leftPartner` reaches kinship2 as its own input, a spouse hint
  row `[left, right, anchor]` (`applyPartnerSides`, run in `alignPedigree`
  on whatever hints it has, including autohint's trial runs, so the
  duplicate fixup works around the choice). A row autohint already wrote
  for the couple keeps its anchor, flipped with the row. A hint alone
  cannot swap two partners who both have parents drawn (each is drawn by
  their own sibship, so the moved one would be drawn twice), so
  `preferPartnerLineages` (called from `autohint`) also gives the left
  partner's ancestors the earlier ranks among the slots the two lines hold
  at each generation; the same for two partners drawn either side of one
  person. Nothing changes when no partnership has `leftPartner`, so the R
  oracle is unaffected. `drawnLeftPartner` reads the side back from a
  layout. Where kinship2 still cannot draw a chosen side without a
  duplicate, the editor refuses the swap (`frontend/src/pedigree/partners.ts`).
- `kinship.ts` — `kinshipCoefficients` (#32): kinship of any two people and
  the inbreeding coefficient, by the same parents-first recursion as
  kinship2's `kinship()`. Not part of the layout. It follows blood rather
  than the drawing: someone `adopted: "in"` is a founder, and a monozygotic
  twin set is one row of the matrix (dizygotic and unknown zygosity are
  ordinary siblings). `{ chromosome: "X" }` gives X-linked kinship (#87),
  which finds the mother by sex, not by side of the couple. Unknown sex is
  worked out both ways and a value is NaN only where the answers differ;
  kinship2 instead gives NA for an unknown-sex child's whole row and 0 on an
  unknown-sex founder's diagonal, and returns `sex / 2` for a one-person
  pedigree (male 1/2, wrong), so the oracle leaves those families out of
  `pairs_x`. Ground truth is
  `tests/oracle/kinship.json`, written by `scripts/kinship-oracle.R` (every
  related pair of 26 PED files, autosomal `pairs` and X-linked `pairs_x`,
  plus twin cases built in the script because PED cannot name twins); the PED comparison runs in the frontend
  (`src/io/__tests__/kinshipOracle.test.ts`) since the importer lives there.
  R refuses families the editor accepts (a father recorded as female), and
  the script skips those.
- `pedigreeToGeometry.ts` — turns a Pedigree into pixel coordinates using the
  same constants as the frontend (slot 80, row 120, node 40). Useful for tests
  and headless export; the U-shape exporter and SVG exporter build on this.
- `utils.ts` — `buildLayoutInput` (graph to 1-based flat arrays) and
  `buildPedigreeFromFlat`.
- `quadprog.d.ts` — hand-written typings for the untyped quadprog package.

## Width slack (#82)

kinship2 caps the drawing at `max(width, widest row)` with `width` 10, so a
pedigree narrower than 10 slots has room to centre sibships under their
parents and a wider one has none: its widest row is packed solid and every
other row must fit inside it. That is where sibships hanging to one side of
their parents come from (and the overlapping sibship bars of #80).

`AlignOptions.widthSlack` (default 0, as in R) adds slots to that cap in
alignped4. `alignPedigreeByFamily` sets it to `RELAXED_WIDTH_SLACK` (2) when
the pedigree's `canvasSettings.layoutWidth` is "relaxed", so the canvas, the
exports and the lint all follow the pedigree's own setting; plain
`alignPedigree` never reads the setting. Only positions move, never slots.
The optimiser limits itself: with no cap at all it took at most about three
extra slots on the examples and corpus, and two gets nearly all of the gain.
The default stays "minimal" because pinned positions are absolute: widening
an existing pedigree moves the auto-placed nodes relative to its pins.

## Faithful core, improvements on top (decided November 2026, #76)

kinship2's layout code is effectively frozen upstream, so fidelity buys a
regression oracle, not improvements. The policy is to diverge where kinship2 is
demonstrably worse, while keeping the port as the tested baseline:

- Slot structure (n, nid, fam, spouse) from `alignPedigree` with default
  options matches R exactly, and the oracle test
  (`frontend/src/io/__tests__/kinship2Oracle.test.ts`) enforces it with an
  empty `STRUCTURE_DIVERGENCES`. Keep it that way: anything that changes who
  sits where, such as the spouse hint and sibship reordering work in #76, goes
  behind an option or into the `families.ts` path, not into the default run.
- Positions already depart from R inside `alignPedigree`: post-QP centering
  and appended isolated individuals. The oracle test lists every fixture that
  differs in `POSITION_DIVERGENCES` with a reason, and fails if a listed
  divergence disappears, so the list stays honest. New position passes follow
  the same rule.
- Each improvement ships with its own fixtures (SVG snapshots, #69; the
  historic examples from #33 are the corpus). A layout cost function
  (crossings, duplicate copies, dashed arc length, pass-through hops) is the
  intended regression guard for passes beyond the core: no worse than kinship2
  on every fixture, better on the ones targeted.
- How that is wired: `AlignOptions.improve` (default false) switches the
  passes on; `alignPedigreeByFamily` sets it unless told otherwise, so the
  canvas, exporters and lint get them while a plain `alignPedigree` call,
  and `__pededit.align()`, stay R-faithful. The first pass is
  `balanceSpouseHints` in `autohint.ts` (#76): when someone drawn once has
  two hinted partners on the same side, the later hint flips to the other
  side, keeping its anchor on that person. `frontend/src/pedigree/layoutCost.ts`
  is the cost function so far (duplicates, hops, arc length, width) and
  `frontend/src/pedigree/__tests__/balancePartners.test.ts` is the guard: no
  worse on every example and oracle fixture, every other fixture's node
  positions identical, Targaryen's hop gone. `layoutToFlow(p, { improveLayout:
  false })` gives the plain port for such comparisons.

## Speed (#42, #189)

- `alignped4`'s quadratic program is the cost of a layout: 99% at 238 and
  513 people (0.45 s and 4.8 s in Node), growing about tenfold for twice the
  people because `quadprog` is a dense solver. Everything before it
  (`kindepth`, `autohint`, `alignped1` to `alignped3`) is tens of
  milliseconds at 513 people.
- The engine keeps nothing between calls. The editor keeps results itself
  (`frontend/src/pedigree/layoutCache.ts`), through `AlignOptions.alignFamily`,
  which `alignPedigreeByFamily` calls in place of `alignPedigree` for each
  family.
- `alignped4` fills `D = P'P` from the non-zero entries of each penalty row
  (a row has a handful). It is the same sums in the same order as the full
  product, so positions are bit for bit the same. R does this with one BLAS
  call and has no such loop to fix.

## Conventions

- Internal arrays are 1-based with index 0 unused, matching the R source.
  Public `LayoutResult` levels are 0-based. Do not "fix" this; the frontend
  depends on it.
- Spouse copies appear as `index + 0.5` in `nid`. A person can appear in two
  slots when they have children with two partners.
- Keep the algorithm deterministic. Tests compare exact positions.
- Childless partnerships are a departure from R: kinship2 only learns about a
  couple from a child's findex/mindex, so `pedigreeToLayoutInput` puts them in
  `LayoutInput.childlessCouples`, and kindepth's spouse alignment, the
  spouselist and `buildPartnerSet` read them from there. PED input never has
  any, so the oracle comparisons are unaffected.
- kinship2 bug: when `autohint()` fails ("autohint bug 3"), `align.pedigree`
  falls back to `order = seq_len(max(1, dim(ped)))`, and `dim()` of a pedigree
  is NULL, so every rank but the first is NA. Our `autohint` falls back to the
  plain order R meant, and `scripts/kinship2-oracle.R` passes that order too
  (flagging `autohint_failed`), so the oracle compares like with like. Calling
  R's `align.pedigree` directly on such a pedigree gives a different, NA-driven
  layout. Example: `tests/partner_chain.test.ts`.
- R for the oracle without sudo: micromamba from micro.mamba.pm, then
  `micromamba create -p <dir> -c conda-forge r-base r-kinship2 r-jsonlite`.

## Publishing (#22)

- **`package.json` describes the published package**, so `main`, `types` and
  `exports` point at `dist/`, which is not committed and which nothing in
  this repository reads. The frontend imports `src/index.ts` through an
  alias, in three places that must stay in step: `frontend/vite.config.ts`,
  `frontend/vitest.config.ts` and `paths` in `frontend/tsconfig.app.json`.
  So the dev server, the tests, the type check and the production build need
  no build of the engine, and a checkout whose `node_modules` link points at
  another checkout's engine still gets its own. Anything new that resolves
  the package by name outside Vite and `tsc` (a Node script, another
  workspace) needs the same alias, or it will look for `dist/`.
- **Build**: `npm -w layout-engine run build` (`scripts/build.mjs`) runs
  `tsc -p tsconfig.build.json` into `dist/` (ES modules and `.d.ts`, one file
  per source file) and copies the root `LICENSE` beside it, since npm only
  packs a licence from the package directory. `prepack` runs it, so
  `npm pack` and `npm publish` cannot ship a stale build. ESM only:
  `require()` of it works from Node 20.19, and a second CommonJS build was
  not worth the dual-package trouble. CI runs
  `npm -w layout-engine pack --dry-run` so the build is exercised on every
  push, since nothing else uses it.
- **The tarball** is `dist/`, `README.md`, `CHANGELOG.md`, `LICENSE` and
  `package.json` (the `files` field). No source, tests or oracle data.
- **Public API**: `src/index.ts` is grouped into layout, kinship, the data
  model, and a last group exported only because the editor and its tests
  call it (`kindepth`, `autohint`, `buildLayoutInput`, the partner side and
  assisted reproduction hooks). The README lists the first three as the API
  and the last as free to change. Put a new export in the right group and,
  when it is public, in the README and `CHANGELOG.md`.
- **README samples are run, not written.** Every code block in `README.md`
  and the output under it came from a scratch project with the packed
  tarball installed (`npm pack`, `npm install <tarball>`, `tsc`, `node`).
  Run them again when the output of `alignPedigree` or the API changes. The
  README ships in the tarball, so it cannot link to `claude/` for anything
  it needs.
- **Licence**: `AGPL-3.0-or-later` (the maintainer's choice, #196), the
  repository's `LICENSE`. kinship2 is
  GPL (>= 2); the port is used under GPL 3, which may be combined with AGPL
  3 work (section 13). A more permissive licence is not possible for the
  ported code.
- **Renaming the package** (the scope is the maintainer's choice): change
  `name` in `package.json`, then the same string in `frontend/package.json`
  (dependency), the three aliases above,
  `frontend/scripts/browser/worktree.mjs`, the imports under `frontend/src`
  (`grep -rl "@pedigree-editor/layout-engine" frontend/src | xargs sed -i
  "s#@pedigree-editor/layout-engine#NEW#g"`), `README.md`, `CHANGELOG.md`,
  this file and the root `AGENTS.md`, and run `npm install` to rewrite
  `package-lock.json`.

### Releasing

Done by the maintainer, by hand. Nothing in CI publishes.

1. Once only: the scope must exist on npm. Sign in at npmjs.com and create
   the organisation `pedigree-editor` (Add Organization, the free plan for
   public packages), or rename the package to a scope you already own.
   `npm login` on the machine you publish from.
2. Set the version in `layout-engine/package.json`
   (`npm -w layout-engine version <patch|minor|major> --no-git-tag-version`,
   which also updates `package-lock.json`) and add its section to
   `CHANGELOG.md`. Commit.
3. Check: `npm -w layout-engine run test`, `npm -w frontend run typecheck`,
   `npm -w frontend run test`.
4. Look at what would be published:
   `npm -w layout-engine publish --dry-run`. Expect 38 files and about
   66 kB, all under `dist/` apart from the README, changelog, licence and
   `package.json`.
5. Publish: `npm -w layout-engine publish`. `publishConfig.access` is
   already `public`, which a scoped package needs. npm asks for the one-time
   password.
6. Tag the commit `layout-engine-v<version>` and push the tag.

Provenance (a signed statement on npmjs.com that the tarball was built from
this repository at that commit) needs the publish to run in GitHub Actions:
a workflow triggered by hand or by the tag, with `permissions: id-token:
write`, running `npm ci` and `npm -w layout-engine publish --provenance`,
authenticated by npm trusted publishing (set on the package's npmjs.com
settings page after the first release, so no token is stored) or an
`NPM_TOKEN` secret. Worth adding after the first manual release; there is no
such workflow yet, on purpose.

## Testing

```
. ~/.nvm/nvm.sh && npm -w layout-engine run test
```

Tests live in `tests/` (not `src/__tests__`). `tests/fixtures/samplePed.ts` is
the kinship2 `sample.ped` reference family, the standard benchmark for layout
correctness. `all_examples_inspection.test.ts` prints layouts for eyeballing.
