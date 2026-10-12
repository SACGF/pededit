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
- `autohint.ts` — spouse and ordering hints. Partial implementation: sequential
  ordering plus spouse hints. Full duplicate-detection reordering is still open
  (Phase 6).
- `alignped1.ts` to `alignped4.ts`, `alignPedigree.ts` — the kinship2 placement
  pipeline. alignped4 runs a quadratic program via the `quadprog` npm package.
  Vite needs `optimizeDeps.include: ["quadprog"]` for that package to load.
- `pedigreeToGeometry.ts` — turns a Pedigree into pixel coordinates using the
  same constants as the frontend (slot 80, row 120, node 40). Useful for tests
  and headless export; the U-shape exporter and SVG exporter build on this.
- `utils.ts` — `buildLayoutInput` (graph to 1-based flat arrays) and
  `buildPedigreeFromFlat`.
- `quadprog.d.ts` — hand-written typings for the untyped quadprog package.

## Conventions

- Internal arrays are 1-based with index 0 unused, matching the R source.
  Public `LayoutResult` levels are 0-based. Do not "fix" this; the frontend
  depends on it.
- Spouse copies appear as `index + 0.5` in `nid`. A person can appear in two
  slots when they have children with two partners.
- Keep the algorithm deterministic. Tests compare exact positions.

## Testing

```
. ~/.nvm/nvm.sh && npm -w layout-engine run test
```

Tests live in `tests/` (not `src/__tests__`). `tests/fixtures/samplePed.ts` is
the kinship2 `sample.ped` reference family, the standard benchmark for layout
correctness. `all_examples_inspection.test.ts` prints layouts for eyeballing.
