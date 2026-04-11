# Phase 1 — Data Model & Layout Algorithm

## Goal

Produce a self-contained TypeScript library (`layout-engine/`) that takes a pedigree description and returns
x/y positions for every individual, suitable for rendering.  No React, no Django, no
browser APIs.  Pure TypeScript with Vitest tests.

The layout algorithm is a direct port of **kinship2's `align.pedigree()`** (and its four
sub-routines), which is in `claude/vendor/kinship2/R/`.  Every function below has a
corresponding R source file to cross-check against line-by-line.

---

## Project layout

```
layout-engine/
├── src/
│   ├── types.ts          # all TypeScript types
│   ├── kindepth.ts       # R/kindepth.R
│   ├── autohint.ts       # R/autohint.R
│   ├── alignped1.ts      # R/alignped1.R
│   ├── alignped2.ts      # R/alignped2.R
│   ├── alignped3.ts      # R/alignped3.R
│   ├── alignped4.ts      # R/alignped4.R
│   ├── alignPedigree.ts  # R/align.pedigree.R (orchestrator)
│   └── index.ts          # public exports
├── tests/
│   ├── fixtures/
│   │   └── samplePed.ts  # sample.ped.tab hard-coded as TypeScript
│   ├── kindepth.test.ts
│   ├── alignped3.test.ts
│   └── alignPedigree.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Setup

```jsonc
// package.json
{
  "name": "@pedigree-editor/layout-engine",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "vitest": "^1.5"
  },
  "dependencies": {
    "quadprog": "^1.6"
  }
}
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,   // forces null-checks on array access
    "outDir": "dist"
  },
  "include": ["src", "tests"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true } });
```

---

## Types (`src/types.ts`)

### Indexing convention — read this first

The R code is **1-based** throughout (array index 1 = first element, 0 = "absent").
The internal algorithm functions (`alignped1`–`alignped4`, `kindepth`, `autohint`) are
ported with **1-based indexing preserved**, stored in regular `Float64Array` / `Int32Array`
with a dummy element at index 0.  This lets you read the TypeScript and the R side by
side without an offset-by-one mental tax.

The **public API** (`alignPedigree()` input and output) uses **0-based indexing**.
The orchestrator converts at entry and exit.

```ts
// ---- Public (application-facing) model ----

export type Sex = "male" | "female" | "unknown";

export interface Individual {
  id: string;               // stable external ID, e.g. "101" or "alice"
  sex: Sex;
  affected: boolean;
  deceased?: boolean;
  carrier?: boolean;        // heterozygous carrier (dot in symbol)
  proband?: boolean;
}

/** A partnership (union) between two individuals. Children attach here, not to parents. */
export interface Partnership {
  id: string;
  individual1: string;      // references Individual.id
  individual2: string;
  consanguineous?: boolean; // double line; algorithm detects this automatically
}

export interface Pedigree {
  individuals: Individual[];
  partnerships: Partnership[];
  /** parentOf[partnershipId] = string[] of Individual.id children */
  parentOf: Record<string, string[]>;
}

// ---- Internal layout representation (1-based, mirrors kinship2 internals) ----

/** Flat representation used by the layout algorithm. Indices are 1-based (R convention). */
export interface LayoutInput {
  n: number;                // number of individuals
  /** 1-based parent indices; 0 = no parent */
  findex: Int32Array;       // father index
  mindex: Int32Array;       // mother index
  sex: Uint8Array;          // 1=male, 2=female, 3=unknown
}

/** Hints produced by autohint and consumed by alignPedigree. */
export interface Hints {
  /** 1-based; relative left-to-right order within each generation */
  order: Float64Array;
  /** Rows: [husbandIdx(1-based), wifeIdx(1-based), anchor(0|1|2)] */
  spouse: Int32Array | null; // null if no explicit hints; shape (nHints × 3)
}

// ---- Internal working matrices (1-based rows and columns) ----

/** State passed between alignped1–alignped3. All matrices 1-based; [0,*] and [*,0] unused. */
export interface AlignState {
  n: Int32Array;            // n[lev]  = number of individuals at level lev
  nid: Float64Array[];      // nid[lev][col] = individual index + optional 0.5 for spouse copies
  pos: Float64Array[];      // pos[lev][col] = horizontal position
  fam: Int32Array[];        // fam[lev][col] = left-parent column in level above (0 = no parent)
}

// ---- The spouselist (Nx4 working matrix, 1-based) ----
// Column layout: [husbandIdx, wifeIdx, anchorSex(1|2|0), anchorHint(same|0)]
// Processed marriages are removed as they are consumed.
export type SpouseList = Int32Array; // flat row-major; length = nRows * 4

// ---- Public output ----

export interface LayoutResult {
  /** Number of individuals rendered at each generation level (0-based levels). */
  n: number[];
  /** nid[level][slot] = 0-based individual index, or -0.5 offset for spouse copies. */
  nid: number[][];
  /** pos[level][slot] = horizontal position (floating point, unit = one individual spacing). */
  pos: number[][];
  /**
   * fam[level][slot] = 0-based column of LEFT parent in level-1, or -1 for no parent.
   * Parents are at fam[level][slot] and fam[level][slot]+1 in the row above.
   */
  fam: number[][];
  /**
   * spouse[level][slot]:
   *   0 = not a spouse pair marker
   *   1 = individual to immediate right is a spouse
   *   2 = individual to immediate right is a consanguineous spouse (double line)
   */
  spouse: number[][];
}
```

---

## Fixture (`tests/fixtures/samplePed.ts`)

Hard-code `data/sample.ped.tab` as TypeScript so tests have no file I/O.  Only family 1
(ped=1) is needed for the primary test; include both for completeness.

```ts
// Fields: id, father, mother, sex  (sex: 1=male, 2=female)
// Source: claude/vendor/kinship2/data/sample.ped.tab, family 1 only
export const SAMPLE_PED_1 = [
  { id: 101, father: 0,   mother: 0,   sex: 1 },
  { id: 102, father: 0,   mother: 0,   sex: 2 },
  { id: 103, father: 135, mother: 136, sex: 1 },
  { id: 104, father: 0,   mother: 0,   sex: 2 },
  { id: 105, father: 0,   mother: 0,   sex: 1 },
  { id: 106, father: 0,   mother: 0,   sex: 2 },
  { id: 107, father: 0,   mother: 0,   sex: 1 },
  { id: 108, father: 0,   mother: 0,   sex: 2 },
  { id: 109, father: 101, mother: 102, sex: 2 },
  { id: 110, father: 103, mother: 104, sex: 1 },
  { id: 111, father: 103, mother: 104, sex: 2 },
  { id: 112, father: 103, mother: 104, sex: 1 },
  { id: 113, father: 0,   mother: 0,   sex: 2 },
  { id: 114, father: 103, mother: 104, sex: 1 },
  { id: 115, father: 105, mother: 106, sex: 2 },
  { id: 116, father: 105, mother: 106, sex: 2 },
  { id: 117, father: 0,   mother: 0,   sex: 1 },
  { id: 118, father: 105, mother: 106, sex: 2 },
  { id: 119, father: 105, mother: 106, sex: 1 },
  { id: 120, father: 107, mother: 108, sex: 2 },
  { id: 121, father: 110, mother: 109, sex: 1 },
  { id: 122, father: 110, mother: 109, sex: 2 },
  { id: 123, father: 110, mother: 109, sex: 2 },
  { id: 124, father: 110, mother: 109, sex: 1 },
  { id: 125, father: 112, mother: 118, sex: 2 },
  { id: 126, father: 112, mother: 118, sex: 2 },
  { id: 127, father: 114, mother: 115, sex: 1 },
  { id: 128, father: 114, mother: 115, sex: 1 },
  { id: 129, father: 117, mother: 116, sex: 1 },
  { id: 130, father: 119, mother: 120, sex: 1 },
  { id: 131, father: 119, mother: 120, sex: 1 },
  { id: 132, father: 119, mother: 120, sex: 1 },
  { id: 133, father: 119, mother: 120, sex: 2 },
  { id: 134, father: 119, mother: 120, sex: 2 },
  { id: 135, father: 0,   mother: 0,   sex: 1 },
  { id: 136, father: 0,   mother: 0,   sex: 2 },
  { id: 137, father: 0,   mother: 0,   sex: 1 },
  { id: 138, father: 135, mother: 136, sex: 2 },
  { id: 139, father: 137, mother: 138, sex: 1 },
  { id: 140, father: 137, mother: 138, sex: 2 },
  { id: 141, father: 137, mother: 138, sex: 2 },
];
```

---

## Step 1 — `kindepth` (`src/kindepth.ts`)

**R source:** `claude/vendor/kinship2/R/kindepth.R`

Assigns a generation depth to every individual (founders get depth 0).
With `align=true` it also adjusts depths so that both parents in a couple
are at the same generation (required before `align.pedigree`).

```ts
/**
 * Port of R kindepth().
 * Input: 1-based LayoutInput.
 * Returns: 1-based Int32Array, depth[i] for i in 1..n. depth[0] unused.
 */
export function kindepth(input: LayoutInput, align = false): Int32Array {
  const { n, findex, mindex } = input;
  const depth = new Int32Array(n + 1); // 1-based, depth[0] unused

  // Pass 1: iterative BFS from founders outward
  // parents[] = current set of "already placed" individuals (1-based)
  let parents = new Set<number>();
  for (let i = 1; i <= n; i++) {
    if (findex[i] === 0 && mindex[i] === 0) parents.add(i);
  }

  for (let iter = 0; iter < n; iter++) {
    const nextParents = new Set<number>();
    for (let i = 1; i <= n; i++) {
      if (parents.has(findex[i]) || parents.has(mindex[i])) {
        if (depth[i] === 0 && !parents.has(i)) {
          depth[i] = iter + 1;
          nextParents.add(i);
        }
      }
    }
    if (nextParents.size === 0) break;
    nextParents.forEach(p => parents.add(p));
  }

  if (!align) return depth;

  // Pass 2 (align=true): shift mismatched-depth couples so both parents are
  // at the same level. See R source for the chaseup() helper logic.
  // ... (direct port of the while(TRUE) loop in R kindepth)

  return depth;
}
```

**Tests (`tests/kindepth.test.ts`):**

```ts
import { describe, it, expect } from "vitest";
import { kindepth } from "../src/kindepth";
import { buildLayoutInput } from "../src/utils";
import { SAMPLE_PED_1 } from "./fixtures/samplePed";

describe("kindepth", () => {
  it("single founder has depth 0", () => {
    const input = buildLayoutInput([{ id: 1, father: 0, mother: 0, sex: 1 }]);
    const d = kindepth(input);
    expect(d[1]).toBe(0);
  });

  it("child of two founders has depth 1", () => {
    const input = buildLayoutInput([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
    ]);
    const d = kindepth(input);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(1);
  });

  it("three generations has depths 0, 1, 2", () => {
    // grandfather(1) + grandmother(2) → father(3) + mother(4) → child(5)
    const input = buildLayoutInput([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 0, mother: 0, sex: 2 },
      { id: 5, father: 3, mother: 4, sex: 1 },
    ]);
    const d = kindepth(input);
    expect(d[1]).toBe(0); expect(d[2]).toBe(0);
    expect(d[3]).toBe(1); expect(d[4]).toBe(0);
    expect(d[5]).toBe(2);
  });

  it("align=true equalises cross-generational couple depths", () => {
    // 103 has parents (depth 1), marries 104 (founder, depth 0).
    // With align=true, one of them should be raised to match.
    // This exercises the chaseup() logic in R kindepth.
    const input = buildLayoutInput(SAMPLE_PED_1);
    const d = kindepth(input, true);
    // For any couple (fi, mi) both parents of some child, depths must be equal.
    for (let i = 1; i <= input.n; i++) {
      const fi = input.findex[i], mi = input.mindex[i];
      if (fi > 0 && mi > 0) {
        expect(d[fi]).toBe(d[mi]);
      }
    }
  });
});
```

---

## Step 2 — `autohint` (`src/autohint.ts`)

**R source:** `claude/vendor/kinship2/R/autohint.R`

Produces ordering hints that minimise visual crossings.  The core idea:
for every individual who appears twice in the layout (once under their own parents,
and once as a spouse), move them to the edge of their sibling group closest to their
spouse.

The function calls `alignPedigree` internally (with `align=false`) to examine a
preliminary layout before adjusting.  This mutual recursion terminates because
`autohint` calls `alignPedigree` with an explicit `hints` argument and `align=false`,
so `alignPedigree` does not call `autohint` back.

```ts
/**
 * Port of R autohint().
 * Returns 1-based hint arrays.
 */
export function autohint(input: LayoutInput, depth: Int32Array): Hints {
  const n = input.n;
  const horder = new Float64Array(n + 1); // 1-based

  // Initialise: within each depth level, assign sequential order 1,2,3,...
  for (let i = 1; i <= n; i++) {
    horder[i] = i; // placeholder; will be overwritten by depth-group ordering
  }

  // ... port the full fixup loop from R autohint.R
  // Key inner helpers to port: findspouse(), findsibs(), duporder(), shift()

  return { order: horder, spouse: null };
}
```

`autohint` is the most complex function in the module.  Port it last — it's not
needed for a first working layout (you can pass trivial `hints = { order: [1,2,...,n], spouse: null }` initially).

---

## Step 3 — `alignped1` (`src/alignped1.ts`)

**R source:** `claude/vendor/kinship2/R/alignped1.R`

The workhorse of the layout.  Called for one individual `x`; returns the subtree
rooted at `x` as if it were the entire pedigree.  Handles spouses, positions them left
or right of `x`, then recursively calls `alignped2` for each spouse's children.

**The `.5` encoding:**  `nid[lev][col]` stores a float.  When the integer part is the
individual's 1-based index, the `0.5` fractional component means "this slot is a
*spouse copy* — the individual appears here as a partner but their subtree (children)
is anchored elsewhere."  After the whole layout is complete, `floor(nid)` extracts the
true index and `nid % 1 === 0.5` detects spouse copies.  **Never round the value;
always use `Math.floor` to get the index.**

**The `fam` matrix:**  `fam[lev][col]` is the 1-based column index of the LEFT parent
in level `lev-1`.  So the right parent is at `fam[lev][col] + 1`.  Value 0 means
"no parent connection drawn at this position" (individual has no parents, or parents
are on a different branch).

```ts
/** Return type shared by alignped1, alignped2, alignped3. */
interface AlignStateWithSpouseList extends AlignState {
  spouselist: SpouseList;
  spouselistRows: number;   // how many rows are currently active
}

/**
 * Port of R alignped1().
 * x: 1-based individual index.
 */
export function alignped1(
  x: number,
  input: LayoutInput,
  level: Int32Array,       // 1-based levels (= depth + 1)
  horder: Float64Array,    // 1-based ordering hints
  packed: boolean,
  spouselist: SpouseList,
  spouselistRows: number,
): AlignStateWithSpouseList {
  const maxlev = Math.max(...Array.from(level).slice(1));
  const lev = level[x];
  // ... direct port of R alignped1 body
}
```

The R code uses R's 1-based matrix indexing everywhere.  Each `matrix(0L, maxlev, ncols)` in R
becomes a `Float64Array` or `Int32Array` of length `(maxlev + 1) * (ncols + 1)` indexed
as `arr[(lev * maxCols) + col]`, treating row and column indices as 1-based.

Alternatively: use `number[][]` (array of arrays) for clarity during porting, then
optimise to typed arrays once tests pass.  Start with `number[][]`.

---

## Step 4 — `alignped2` (`src/alignped2.ts`)

**R source:** `claude/vendor/kinship2/R/alignped2.R`

Short.  Takes a **list** of siblings `xs`, sorts them by `horder`, then calls
`alignped1` on each and merges with `alignped3`.

Special case: if a sibling was already processed (it appears in the current `rval`
at its level), skip it rather than adding a duplicate.

```ts
export function alignped2(
  xs: number[],              // 1-based sibling indices
  input: LayoutInput,
  level: Int32Array,
  horder: Float64Array,
  packed: boolean,
  spouselist: SpouseList,
  spouselistRows: number,
): AlignStateWithSpouseList {
  const sorted = [...xs].sort((a, b) => horder[a] - horder[b]);
  // ... port the loop + special-case check
}
```

---

## Step 5 — `alignped3` (`src/alignped3.ts`)

**R source:** `claude/vendor/kinship2/R/alignped3.R`

Merges two side-by-side sub-trees.  The key case is when the rightmost
individual on the left tree is the same as the leftmost individual on the right tree
(consanguinity: one person appears under two sets of parents).  When that happens,
the two appearances are collapsed into one slot.

For the `!packed` case, the right tree is slid rightward until it doesn't overlap
the left tree.

```ts
export function alignped3(
  x1: AlignState,
  x2: AlignState,
  packed: boolean,
  space = 1,
): AlignState {
  // ...
}
```

This function has no recursion and no spouselist, making it the easiest to test in
isolation.

**Tests (`tests/alignped3.test.ts`):**

```ts
describe("alignped3 - merge two trees", () => {
  it("merges two single-individual trees side by side", () => {
    const t1 = makeSingleNodeTree(1, level=1, maxlev=1);
    const t2 = makeSingleNodeTree(2, level=1, maxlev=1);
    const result = alignped3(t1, t2, /*packed=*/true);
    expect(result.n[1]).toBe(2);
    expect(result.pos[1][1]).toBe(0);
    expect(result.pos[1][2]).toBe(1);
  });

  it("overlapping rightmost/leftmost individual is collapsed to one slot", () => {
    // Individual 3 is rightmost in t1 and leftmost in t2 (consanguinity)
    // After merge, individual 3 appears once, not twice.
    const t1 = makeTreeWithRightmost(3, level=1, maxlev=1);
    const t2 = makeTreeWithLeftmost(3, level=1, maxlev=1);
    const result = alignped3(t1, t2, /*packed=*/true);
    const ids = result.nid[1].slice(1, result.n[1] + 1).map(Math.floor);
    expect(ids.filter(id => id === 3).length).toBe(1);
  });
});
```

---

## Step 6 — `alignped4` (`src/alignped4.ts`)

**R source:** `claude/vendor/kinship2/R/alignped4.R`

The final optimisation pass.  Sets up a quadratic program:
- **Objective**: minimise sum of (child_pos − mean(parent_pos))² and (spouse1_pos − spouse2_pos)²
- **Constraints**: positions within each generation must be ≥ 0, strictly increasing (spacing ≥ 1), and ≤ width

Uses `quadprog::solve.QP`.  The npm `quadprog` package is a direct port of the same
Fortran code; the interface is identical:

```ts
import { solve_QP } from "quadprog";

// R: solve.QP(Dmat, dvec, t(Amat), bvec)
// JS: solve_QP(Dmat, dvec, Amat, bvec)
// Note: JS quadprog takes Amat directly (not transposed), unlike R.
// Verify this against the quadprog npm docs before porting.
```

`alignped4` is the only function that changes *positions* without changing the *structure*
(nid/fam are untouched).  It returns a new `pos` matrix.

**Fallback**: if `quadprog` is unavailable or the QP fails, return the raw positions
from `alignped1-3` unchanged.  This produces valid but less aesthetically aligned
output.  Implement the fallback first, add QP as a progressive enhancement.

---

## Step 7 — `alignPedigree` orchestrator (`src/alignPedigree.ts`)

**R source:** `claude/vendor/kinship2/R/align.pedigree.R`

Public entry point.  Converts from the application's `Pedigree` model to the internal
`LayoutInput`, runs the algorithm, and converts the output back to 0-based.

```ts
export interface AlignOptions {
  packed?: boolean;   // default true
  width?: number;     // default 10
  align?: boolean;    // default true — use QP optimisation
  hints?: Hints;      // if omitted, autohint() is called
}

export function alignPedigree(
  pedigree: Pedigree,
  options: AlignOptions = {},
): LayoutResult {
  const { packed = true, width = 10, align = true } = options;

  // 1. Convert to LayoutInput (1-based)
  const input = pedigreeToLayoutInput(pedigree);

  // 2. Assign generations
  const depth = kindepth(input, /*align=*/true);
  const level = new Int32Array(input.n + 1);
  for (let i = 1; i <= input.n; i++) level[i] = depth[i] + 1;

  // 3. Get ordering hints
  const hints = options.hints ?? autohint(input, depth);

  // 4. Build spouselist from hints + parent pairs (port of Setup-align block)
  const spouselist = buildSpouseList(input, hints);

  // 5. Find founders, run alignped1 for each, merge with alignped3
  const founders = findFounders(input, spouselist, hints);
  let rval = alignped1(founders[0], input, level, hints.order, packed, spouselist);
  for (let i = 1; i < founders.length; i++) {
    const rval2 = alignped1(founders[i], ...);
    rval = alignped3(rval, rval2, packed);
  }

  // 6. Detect consanguinity (shared ancestors → spouse type 2)
  const spouseMatrix = buildSpouseMatrix(rval, input);

  // 7. QP optimisation
  const pos = (align && maxLevel > 1)
    ? alignped4(rval, spouseMatrix, level, width, align)
    : rval.pos;

  // 8. Convert to 0-based output
  return toLayoutResult(rval, pos, spouseMatrix);
}
```

`pedigreeToLayoutInput()` translates the rich `Pedigree` model (with `Partnership`
entities and string IDs) to flat integer arrays:
- Assign each `Individual` a 1-based integer index
- For each `Partnership`, the `parentOf` map resolves to `findex`/`mindex` entries for each child

---

## Step 8 — Integration tests

**R ground truth from `tests/testthat/test-align.R`:**

```r
ped <- with(sample.ped, pedigree(id, father, mother, sex))
align <- align.pedigree(ped)
expect_equal(align$n, c(8, 19, 22, 8))
```

**TypeScript equivalent:**

```ts
// tests/alignPedigree.test.ts
import { SAMPLE_PED_1 } from "./fixtures/samplePed";
import { alignPedigree } from "../src/alignPedigree";
import { buildPedigreeFromFlat } from "../src/utils";

describe("alignPedigree — sample.ped family 1", () => {
  it("produces correct generation counts", () => {
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    // R ground truth: n = c(8, 19, 22, 8)
    expect(result.n).toEqual([8, 19, 22, 8]);
  });

  it("all individuals appear at least once", () => {
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    const allIds = new Set(result.nid.flat().map(Math.floor).filter(id => id >= 0));
    expect(allIds.size).toBe(SAMPLE_PED_1.length);
  });

  it("each generation has monotonically increasing positions", () => {
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    for (let lev = 0; lev < result.n.length; lev++) {
      const positions = result.pos[lev]!.slice(0, result.n[lev]);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
      }
    }
  });

  it("fam pointers are valid indices into the level above", () => {
    const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
    const result = alignPedigree(ped);
    for (let lev = 1; lev < result.n.length; lev++) {
      for (let col = 0; col < result.n[lev]!; col++) {
        const f = result.fam[lev]![col]!;
        if (f >= 0) {
          // left parent at f, right parent at f+1
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f + 1).toBeLessThan(result.n[lev - 1]!);
        }
      }
    }
  });
});

describe("alignPedigree — simple cases", () => {
  it("single individual: one generation of one", () => {
    const ped = buildPedigreeFromFlat([{ id: 1, father: 0, mother: 0, sex: 1 }]);
    const result = alignPedigree(ped);
    expect(result.n).toEqual([1]);
    expect(result.pos[0]![0]).toBe(0);
  });

  it("nuclear family: parents + 3 children", () => {
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 1, mother: 2, sex: 2 },
      { id: 5, father: 1, mother: 2, sex: 1 },
    ]);
    const result = alignPedigree(ped);
    expect(result.n).toEqual([2, 3]);
    // Children should be centred under parents
    const childMean = (result.pos[1]![0]! + result.pos[1]![1]! + result.pos[1]![2]!) / 3;
    const parentMean = (result.pos[0]![0]! + result.pos[0]![1]!) / 2;
    expect(childMean).toBeCloseTo(parentMean, 1);
  });

  it("consanguineous couple marked with spouse=2", () => {
    // Cousins who marry: individuals 5 and 6 are cousins (share grandparents 1 and 2)
    const ped = buildPedigreeFromFlat([
      { id: 1, father: 0, mother: 0, sex: 1 },
      { id: 2, father: 0, mother: 0, sex: 2 },
      { id: 3, father: 1, mother: 2, sex: 1 },
      { id: 4, father: 1, mother: 2, sex: 2 },
      { id: 5, father: 3, mother: 0, sex: 1, /* mother marry-in */},
      { id: 6, father: 0, mother: 4, sex: 2, /* father marry-in */},
      { id: 7, father: 5, mother: 6, sex: 1 },
    ]);
    const result = alignPedigree(ped);
    // Find the spouse marker between 5 and 6
    const spouseVal = result.spouse.flat().find(v => v === 2);
    expect(spouseVal).toBe(2); // consanguineous double-line
  });
});
```

---

## Build order within Phase 1

Implement and get tests green in this order:

1. **`types.ts`** — no logic, just interfaces
2. **`kindepth.ts`** — standalone, no dependencies on other layout functions
3. **`alignped3.ts`** — no recursion, easiest to test in isolation
4. **`alignped1.ts`** + **`alignped2.ts`** — mutually recursive, implement together
5. **`alignped4.ts`** — with quadprog fallback first, QP second
6. **`alignPedigree.ts`** (without `autohint`) — wire everything together, use trivial hints
7. **Integration test** against `n = [8, 19, 22, 8]`
8. **`autohint.ts`** — implement last, verify the test still passes (autohint improves layout quality but `n` counts should not change for sample.ped)

---

## Key gotchas

**Indexing:** All internal arrays are 1-based.  `level[0]`, `findex[0]`, `horder[0]` are
never used.  Allocate typed arrays as `new Int32Array(n + 1)` and always loop `i = 1; i <= n`.

**The `.5` rule:** `nid` values with a fractional part of `0.5` are spouse copies.  Always
use `Math.floor(nid[lev][col])` to get the actual individual index.  Never write `nid[lev][col]|0`
(bitwise truncation breaks the `.5` detection).

**`fam` value 0 means "no parent":** not "column 0".  When iterating `fam`, always check
`fam[lev][col] > 0` before treating it as a column pointer.

**`spouselist` is mutated as it is consumed:** Each marriage is removed from `spouselist`
once it has been processed by `alignped1`.  Passing `spouselist` by reference and
tracking the active row count explicitly (rather than using `splice`) will be more
efficient.

**`alignped4` matrix orientation:** R's `quadprog::solve.QP` takes `t(Amat)` (transposed).
The npm `quadprog` package's `solve_QP` takes the constraint matrix in the
**already-transposed form** that R's function expects as input, so you should pass
`Amat` directly without transposing.  Read the npm package README carefully and cross-check
with a trivial 2-variable QP to verify orientation.

**Cross-check strategy:** At each step, run the equivalent R code in kinship2 and
`cat(json(result))` the intermediate matrices.  Compare against the TypeScript output.
The R function can be called directly in RStudio or via `Rscript` at the terminal.
