# layout-engine/ — agent notes

TypeScript port of the kinship2 R pedigree layout algorithm, published as the npm
workspace package `@pedigree-editor/layout-engine`. It has no React or DOM
dependency and is consumed by the frontend and by the exporters.

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
  Vite needs `optimizeDeps.include: ["quadprog"]` for that package to load.
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
  instead of the founder row. PED input never has them.
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

## Testing

```
. ~/.nvm/nvm.sh && npm -w layout-engine run test
```

Tests live in `tests/` (not `src/__tests__`). `tests/fixtures/samplePed.ts` is
the kinship2 `sample.ped` reference family, the standard benchmark for layout
correctness. `all_examples_inspection.test.ts` prints layouts for eyeballing.
