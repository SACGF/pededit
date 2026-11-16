# Changelog

Changes to `@pedigree-editor/layout-engine` that a user of the package can
see. Versions follow semantic versioning; before 1.0 a minor version may
change the API.

## 0.1.0

First release on npm.

- `alignPedigree`: the layout of kinship2's `align.pedigree` (`kindepth`,
  `autohint` with the duplicate fixup and twins, `alignped1` to `alignped4`),
  with childless couples, people with no relatives, and couples of the same
  or unknown sex laid out as well.
- `alignPedigreeByFamily` and `splitFamilies`: unrelated families side by
  side.
- `pedigreeToGeometry`: pixel coordinates of symbols, couple lines and
  sibship lines.
- `resolveCouple`: the real partners behind a spouse mark when someone has
  three or more.
- `kinshipCoefficients`: kinship and inbreeding coefficients, autosomal and
  X-linked.
- `buildPedigreeFromFlat`: PED-style rows to a `Pedigree`.
- ES modules and TypeScript declarations, Node 20 or later and browsers.
- `AlignOptions.alignFamily`: called by `alignPedigreeByFamily` for each
  family, so a caller can keep the layouts of families that have not
  changed. The engine itself keeps nothing between calls.
