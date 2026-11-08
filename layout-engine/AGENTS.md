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
  duplicate fixup (sibling shift plus spouse hints). Connected-component
  ordering is still open (#39).
- `alignped1.ts` to `alignped4.ts`, `alignPedigree.ts` — the kinship2 placement
  pipeline. alignped4 runs a quadratic program via the `quadprog` npm package.
  Vite needs `optimizeDeps.include: ["quadprog"]` for that package to load.
- `families.ts` — `alignPedigreeByFamily`, which the canvas, SVG export and
  de-identification call instead of `alignPedigree` (#64). R's `align.pedigree`
  packs disconnected families into shared rows at ordinary spacing, so they
  read as one family; this lays out each family alone and joins them with
  `FAMILY_GAP`, with unconnected people last. With one family it returns
  `alignPedigree` unchanged, so keep `alignPedigree` R-faithful for the oracle.
- `pedigreeToGeometry.ts` — turns a Pedigree into pixel coordinates using the
  same constants as the frontend (slot 80, row 120, node 40). Useful for tests
  and headless export; the U-shape exporter and SVG exporter build on this.
- `utils.ts` — `buildLayoutInput` (graph to 1-based flat arrays) and
  `buildPedigreeFromFlat`.
- `quadprog.d.ts` — hand-written typings for the untyped quadprog package.

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
