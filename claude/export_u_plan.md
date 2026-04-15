# U-Shape Pedigree Export Plan

## Reference Image

The reference image (`/tmp/u_shape_ref.png`) shows a large pedigree arranged as an inverted U (horseshoe):

- **Root couple** at the bottom centre of the U, connected by a curved path
- **Two vertical arms** extending upward, one for each side of the family
- **Blood descendants** sit ON the arm spine at successive generation heights
- **Children** of each blood ancestor spread **horizontally outward** from the arm (perpendicular to vertical spine direction)
- **Connecting lines** run along the spine between parent and child generations, then branch horizontally to reach children
- The curved bottom portion smoothly transitions between the two arms

---

## Phase 0: Development Harness (build first)

The harness lets us generate an SVG from a fixture pedigree in one command and inspect it visually. This is the single most important thing to build first.

### 0a. Vitest "snapshot-to-disk" test

File: `frontend/src/io/svg/__tests__/uShapeExporter.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { exportUShapeSvg } from "../uShapeExporter";
import { simpleFamily } from "../../../fixtures/simpleFamily";
import { consanguineousFamily } from "../../../fixtures/consanguineous";

const OUT_DIR = join(__dirname, "../../../../test-output");

function writeSvg(name: string, svg: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `${name}.svg`);
  writeFileSync(path, svg, "utf-8");
  console.log(`  -> wrote ${path}`);
}

describe("U-shape SVG visual snapshots", () => {
  it("simpleFamily", () => {
    const svg = exportUShapeSvg(simpleFamily);
    writeSvg("u-simple", svg);
    expect(svg).toContain("<svg");
  });

  it("consanguineousFamily", () => {
    const svg = exportUShapeSvg(consanguineousFamily);
    writeSvg("u-consang", svg);
    expect(svg).toContain("<svg");
  });

  it("largerFamily — 4-generation", () => {
    const svg = exportUShapeSvg(makeLargerFamily());
    writeSvg("u-large", svg);
    expect(svg).toContain("<svg");
  });
});
```

### 0b. Larger test fixture

File: `frontend/src/fixtures/largerFamily.ts`

Build a 4-generation family with asymmetric arms (more children on one side) to stress-test the layout:

```typescript
import type { Pedigree } from "@pedigree-editor/layout-engine";

// Root couple → 2 children (1 per arm)
// Left child has 3 kids, right child has 2 kids
// One grandchild on left has 2 great-grandchildren
export const largerFamily: Pedigree = {
  individuals: [
    // Gen 0: root couple
    { id: "f", sex: "male", affected: false, sibOrder: 0 },
    { id: "m", sex: "female", affected: false, sibOrder: 0 },
    // Gen 1: two children + their spouses
    { id: "s1", sex: "male", affected: true, sibOrder: 0 },
    { id: "s1w", sex: "female", affected: false, sibOrder: 0 },
    { id: "d1", sex: "female", affected: false, sibOrder: 1 },
    { id: "d1h", sex: "male", affected: false, sibOrder: 0 },
    // Gen 2: grandchildren
    { id: "gc1", sex: "male", affected: false, sibOrder: 0 },
    { id: "gc2", sex: "female", affected: true, proband: true, sibOrder: 1 },
    { id: "gc3", sex: "male", affected: false, sibOrder: 2 },
    { id: "gc4", sex: "female", affected: false, sibOrder: 0 },
    { id: "gc5", sex: "male", affected: true, sibOrder: 1 },
    // Gen 2: spouse for gc1
    { id: "gc1w", sex: "female", affected: false, sibOrder: 0 },
    // Gen 3: great-grandchildren
    { id: "ggc1", sex: "male", affected: false, sibOrder: 0 },
    { id: "ggc2", sex: "female", affected: true, sibOrder: 1 },
  ],
  partnerships: [
    { id: "p0", individual1: "f", individual2: "m" },
    { id: "p1", individual1: "s1", individual2: "s1w" },
    { id: "p2", individual1: "d1h", individual2: "d1" },
    { id: "p3", individual1: "gc1", individual2: "gc1w" },
  ],
  parentOf: {
    "p0": ["s1", "d1"],
    "p1": ["gc1", "gc2", "gc3"],
    "p2": ["gc4", "gc5"],
    "p3": ["ggc1", "ggc2"],
  },
  siblingOrder: { mode: "insertion", affectedFirst: false },
};
```

### 0c. One-line workflow

```bash
# Install deps if needed
cd frontend && npm install

# Generate + view in one shot:
npx vitest run src/io/svg/__tests__/uShapeExporter.test.ts && eog test-output/u-simple.svg

# Or for rapid iteration (re-runs on save):
npx vitest --watch src/io/svg/__tests__/uShapeExporter.test.ts
# then in another terminal:
eog test-output/u-simple.svg   # eog auto-reloads on file change
```

### 0d. Claude inspection

During development, Claude can read the generated SVG file at
`frontend/test-output/u-simple.svg` after each test run and describe its visual
structure by parsing the SVG elements (coordinates, paths, transforms).
Additionally, a small "debug overlay" mode can be toggled:

```typescript
// In uShapeExporter.ts
const DEBUG_SPINE = true; // flip to render the invisible spine as a red dashed path

function renderDebugSpine(spine: SpinePoint[]): string {
  if (!DEBUG_SPINE) return "";
  const d = spine.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  ).join(" ");
  return `<path d="${d}" fill="none" stroke="red" stroke-width="1" stroke-dasharray="4 2"/>`;
}
```

This renders the spine visibly so Claude can read the SVG and verify the path
coordinates are correct, and a human can view it in eog/browser to see if the
shape looks right.

---

## Phase 1: File Structure

### New files

| File | Purpose |
|------|---------|
| `frontend/src/io/svg/uShapeExporter.ts` | Main U-shape SVG exporter |
| `frontend/src/io/svg/__tests__/uShapeExporter.test.ts` | Visual snapshot tests |
| `frontend/src/fixtures/largerFamily.ts` | 4-gen test fixture |

### Modified files

| File | Change |
|------|--------|
| `frontend/src/io/svg/types.ts` | Add `uShape?: boolean` to `SvgExportOptions` |
| `frontend/src/io/svg/index.ts` | Re-export `exportUShapeSvg` |
| `frontend/src/components/ExportDialog.tsx` | Add U-shape checkbox |

---

## Phase 2: The Parametric U-Spine Algorithm

### 2a. Blood tree extraction

Before coordinate assignment, we need to identify who sits on the spine (blood
descendants) vs. who sits off-spine (marry-ins, their children through other
partners). This is the "upstream code" that already exists in the planned file.

```typescript
interface BloodNode {
  id: string;
  generation: number;   // 0 = root couple
  arm: "left" | "right" | "root";
  children: string[];   // blood children IDs
  spouse?: string;       // marry-in spouse ID (if any)
  spouseChildren: string[]; // children of this blood node + spouse
}

type BloodTree = Map<string, BloodNode>;

/**
 * BFS from root couple outward.
 * - Root male → left arm, root female → right arm
 * - Each child of a blood individual who is also blood → same arm, gen+1
 * - Marry-in spouses are NOT blood nodes; they get positioned relative
 *   to their blood partner
 */
function buildBloodTree(pedigree: Pedigree): {
  bloodTree: BloodTree;
  rootMale: string;
  rootFemale: string;
}
```

### 2b. Spine geometry

The U-spine is defined parametrically by arc distance from the bottom centre.

```
        leftStemX                    rightStemX
            |                            |
     tip    |  gen 3                     |  gen 3    tip
            |  gen 2                     |  gen 2
            |  gen 1                     |  gen 1
            |                            |
             \_____ gen 0 (founders) ___/
                    curved bottom
```

```typescript
// ── Spine constants ──────────────────────────────────────────────────────

const U_ROW_HEIGHT = 100;     // vertical px between generations on arms
const U_CHILD_SPACING = 50;   // horizontal px between siblings (perpendicular to arm)
const U_ARM_GAP = 300;        // horizontal distance between left and right arm stems
const U_CURVE_RADIUS = 150;   // radius of the semicircular bottom curve (= U_ARM_GAP / 2)
const U_PADDING = 60;

// ── Spine point ──────────────────────────────────────────────────────────

interface SpinePoint {
  x: number;
  y: number;
  tx: number;  // tangent unit vector x (direction of increasing arc)
  ty: number;  // tangent unit vector y
  nx: number;  // normal unit vector x (perpendicular, pointing outward)
  ny: number;  // normal unit vector y
}

/**
 * Compute a point on the U-spine at a given arc distance from the bottom
 * centre, on the specified arm.
 *
 * Arc distance 0 = bottom centre of the curve.
 * The curve is a semicircle of radius R connecting the two arm stems.
 * After the curve ends (arc > pi*R/2 on each side), the spine becomes
 * a straight vertical line going upward.
 */
function spinePoint(
  arcDist: number,
  arm: "left" | "right",
  config: { leftStemX: number; rightStemX: number; foundersY: number; curveRadius: number }
): SpinePoint {
  const { leftStemX, rightStemX, foundersY, curveRadius } = config;
  const centreX = (leftStemX + rightStemX) / 2;
  const curveHalfArc = (Math.PI * curveRadius) / 2; // arc length from bottom to where arm goes straight

  if (arcDist <= curveHalfArc) {
    // On the curved portion
    // Angle from bottom centre: 0 at bottom, pi/2 at arm start
    const theta = (arcDist / curveRadius);
    const sign = arm === "left" ? -1 : 1;

    const x = centreX + sign * curveRadius * Math.sin(theta);
    const y = foundersY + curveRadius * Math.cos(theta); // foundersY is at curve centre level

    // Tangent: derivative of position w.r.t. arc distance (pointing "up")
    const tx = sign * Math.cos(theta);
    const ty = -Math.sin(theta);

    // Normal: perpendicular, pointing outward from the U centre
    const nx = sign * Math.sin(theta);
    const ny = Math.cos(theta);

    // Actually we want the normal to point OUTWARD (away from the center of the U)
    // On the left arm, outward = left (-x direction when vertical)
    // On the right arm, outward = right (+x direction when vertical)
    // On the curve, outward = away from centreX
    // The formula above gives: at theta=0 (bottom), nx=0, ny=1 (downward) -- wrong
    // Let's fix: outward normal should point away from the U center (centreX, curveTopY)

    // Simpler approach: tangent is along the spine going "up" (toward arm tips)
    // Normal is 90 degrees rotated: for left arm, children go left; for right, children go right
    // Rotate tangent 90 degrees counterclockwise for left, clockwise for right
    const normalX = arm === "left" ? ty : -ty;   // -ty or ty
    const normalY = arm === "left" ? -tx : tx;

    return { x, y, tx, ty, nx: normalX, ny: normalY };
  } else {
    // On the straight arm portion (vertical)
    const straightDist = arcDist - curveHalfArc;
    const stemX = arm === "left" ? leftStemX : rightStemX;
    const armStartY = foundersY; // where the curve meets the straight arm

    const x = stemX;
    const y = armStartY - straightDist; // going upward

    // Tangent: straight up
    const tx = 0;
    const ty = -1;

    // Normal: perpendicular outward
    const nx = arm === "left" ? -1 : 1;
    const ny = 0;

    return { x, y, tx, ty, nx, ny };
  }
}
```

### 2c. The `assignCoordinates` function (REPLACES existing)

This is the core of the implementation. Each blood descendant gets placed ON the
spine; their spouse is offset along the normal; their children spread
perpendicular to the tangent at the children's generation arc position.

```typescript
interface NodePosition {
  x: number;
  y: number;
}

interface SpineConfig {
  leftStemX: number;
  rightStemX: number;
  foundersY: number;
  curveRadius: number;
}

function assignCoordinates(
  pedigree: Pedigree,
  bloodTree: BloodTree,
  rootMale: string,
  rootFemale: string,
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();

  // Derive arm gap from family size (or use constant)
  const config: SpineConfig = {
    leftStemX: U_PADDING + 200,      // enough room for children spreading left
    rightStemX: U_PADDING + 200 + U_ARM_GAP,
    foundersY: 0,                     // will be adjusted after layout
    curveRadius: U_ARM_GAP / 2,
  };

  // The bottom of the curve is at foundersY + curveRadius
  // The founders sit at arcDist = 0 (bottom centre of curve)
  // But wait: we want gen 0 at the bottom. The founders should be at the
  // curve midpoint. Let's place them there:

  const curveHalfArc = (Math.PI * config.curveRadius) / 2;

  // -- Place root couple --
  // Root male at a small offset left of bottom centre
  // Root female at a small offset right of bottom centre
  const rootCentre = spinePoint(0, "left", config); // arc=0 = bottom centre
  const coupleGap = 40; // px between root couple symbols
  positions.set(rootMale, {
    x: rootCentre.x - coupleGap / 2,
    y: rootCentre.y,
  });
  positions.set(rootFemale, {
    x: rootCentre.x + coupleGap / 2,
    y: rootCentre.y,
  });

  // -- Place blood descendants generation by generation --
  // For each arm, walk up the spine placing blood ancestors at
  // arcDist = curveHalfArc + gen * U_ROW_HEIGHT

  for (const arm of ["left", "right"] as const) {
    // Collect blood nodes on this arm, sorted by generation
    const armNodes = [...bloodTree.values()]
      .filter(n => n.arm === arm)
      .sort((a, b) => a.generation - b.generation);

    for (const node of armNodes) {
      if (node.generation === 0) continue; // root couple handled above

      const arcDist = curveHalfArc + node.generation * U_ROW_HEIGHT;
      const sp = spinePoint(arcDist, arm, config);

      // Blood ancestor sits ON the spine
      positions.set(node.id, { x: sp.x, y: sp.y });

      // Spouse sits offset along the normal (toward the U interior)
      // i.e., OPPOSITE the outward normal direction
      if (node.spouse) {
        const spouseOffset = 50;
        positions.set(node.spouse, {
          x: sp.x - sp.nx * spouseOffset,
          y: sp.y - sp.ny * spouseOffset,
        });
      }

      // Children spread perpendicular to the tangent at their OWN arc position
      if (node.spouseChildren.length > 0) {
        const childGen = node.generation + 1;
        const childArcDist = curveHalfArc + childGen * U_ROW_HEIGHT;
        const childSpine = spinePoint(childArcDist, arm, config);

        const n = node.spouseChildren.length;
        const totalSpan = (n - 1) * U_CHILD_SPACING;

        for (let i = 0; i < n; i++) {
          const childId = node.spouseChildren[i];
          const offset = -totalSpan / 2 + i * U_CHILD_SPACING;

          // Children spread along the normal at the CHILD's arc position
          // The blood child among them will be repositioned later when
          // we process that child as a blood node (it gets moved to the spine)
          if (!bloodTree.has(childId)) {
            // Non-blood child: stays at perpendicular offset
            positions.set(childId, {
              x: childSpine.x + childSpine.nx * offset,
              y: childSpine.y + childSpine.ny * offset,
            });
          }
          // Blood child: will be placed on spine when we reach their generation
        }
      }
    }
  }

  return positions;
}
```

### 2d. Key insight: children at THEIR arc position, not parent's

The crucial difference from a naive approach:

```
WRONG (children at parent's y):        CORRECT (children at child's y):
                                        
  parent ─┐                              parent
           │ children at parent y              │  (spine segment)
           ├── child1                          │
           ├── child2                     branch point at child y ──┬── child1
           └── child3                                               ├── child2
                                                                    └── child3
```

The "descent line" between gen-G parent and the branch point is the spine
segment between gen-G and gen-(G+1) arc positions. The horizontal connector runs
at the children's y-level, not the parent's.

---

## Phase 3: Rendering

### 3a. `renderUBackbone` (keep/adapt from existing pattern)

Renders the visible backbone path tracing through all blood ancestor spine
positions. This is a polyline connecting all the spine-placed blood nodes
in order.

```typescript
function renderUBackbone(
  positions: Map<string, NodePosition>,
  bloodTree: BloodTree,
  rootMale: string,
  rootFemale: string,
  config: SpineConfig,
): string[] {
  const lines: string[] = [];

  // Render the curved bottom connecting the two arms
  const { leftStemX, rightStemX, foundersY, curveRadius } = config;
  const centreX = (leftStemX + rightStemX) / 2;
  const curveBottomY = foundersY + curveRadius;

  // SVG arc from left arm base to right arm base via the bottom
  // A rx ry x-rotation large-arc-flag sweep-flag x y
  lines.push(
    `<path d="M ${leftStemX} ${foundersY} A ${curveRadius} ${curveRadius} 0 0 1 ${rightStemX} ${foundersY}" ` +
    `fill="none" stroke="black" stroke-width="2"/>`
  );

  // Render straight arm segments connecting blood ancestors vertically
  for (const arm of ["left", "right"] as const) {
    const armNodes = [...bloodTree.values()]
      .filter(n => n.arm === arm && n.generation > 0)
      .sort((a, b) => a.generation - b.generation);

    const stemX = arm === "left" ? leftStemX : rightStemX;
    let prevY = foundersY;

    for (const node of armNodes) {
      const pos = positions.get(node.id)!;
      // Vertical line segment along the arm
      lines.push(seg(stemX, prevY, stemX, pos.y));
      prevY = pos.y;
    }
  }

  return lines;
}
```

### 3b. `renderArmClusterLines` (REPLACE entirely)

The new connector lines attach at the children's arc position, not the parent's.

```typescript
function renderArmClusterLines(
  positions: Map<string, NodePosition>,
  bloodTree: BloodTree,
  config: SpineConfig,
): string[] {
  const lines: string[] = [];

  for (const [id, node] of bloodTree) {
    if (node.spouseChildren.length === 0) continue;

    const parentPos = positions.get(id)!;
    const childGen = node.generation + 1;
    const curveHalfArc = (Math.PI * config.curveRadius) / 2;
    const childArcDist = curveHalfArc + childGen * U_ROW_HEIGHT;
    const childSpine = spinePoint(childArcDist, node.arm as "left" | "right", config);

    // The branch point is on the spine at the child's y-level
    const branchX = childSpine.x;
    const branchY = childSpine.y;

    // 1. The descent line (parent to branch point) is already covered
    //    by the backbone rendering above (spine segment gen to gen+1)

    // 2. Horizontal connector from spine to children
    const childPositions = node.spouseChildren
      .map(cid => positions.get(cid)!)
      .filter(Boolean);

    if (childPositions.length === 0) continue;

    const childXs = childPositions.map(p => p.x);
    const minX = Math.min(...childXs);
    const maxX = Math.max(...childXs);

    // Connector bar at the children's y (perpendicular to spine at branch)
    // On vertical arms: horizontal bar
    // On curved section: tangent-aligned bar (handled by normal vectors)
    if (Math.abs(childSpine.ny) < 0.01) {
      // Vertical arm: horizontal connector bar
      lines.push(seg(branchX, branchY, minX, branchY));
      if (maxX !== minX) {
        lines.push(seg(minX, branchY, maxX, branchY));
      }

      // Vertical drops to each child symbol
      for (const cp of childPositions) {
        if (Math.abs(cp.y - branchY) > 1) {
          lines.push(seg(cp.x, branchY, cp.x, cp.y));
        }
      }
    } else {
      // Curved section: use tangent/normal for connector direction
      // Simplified: just draw lines from branch to each child
      for (const cp of childPositions) {
        lines.push(seg(branchX, branchY, cp.x, cp.y));
      }
    }

    // 3. Couple line between blood ancestor and spouse
    if (node.spouse) {
      const spousePos = positions.get(node.spouse)!;
      lines.push(seg(parentPos.x, parentPos.y, spousePos.x, spousePos.y));
    }
  }

  return lines;
}
```

### 3c. Bounding box (REPLACE entirely)

Derive from spine geometry instead of `Math.min(...allY)`:

```typescript
function computeUBounds(
  positions: Map<string, NodePosition>,
  bloodTree: BloodTree,
  config: SpineConfig,
): CanvasBounds {
  const padding = U_PADDING;

  // The canvas height is determined by:
  // - Top: highest arm tip (smallest y among all nodes on arms)
  // - Bottom: curve bottom (foundersY + curveRadius)
  const maxGen = Math.max(...[...bloodTree.values()].map(n => n.generation));
  const curveHalfArc = (Math.PI * config.curveRadius) / 2;
  const topArcDist = curveHalfArc + (maxGen + 1) * U_ROW_HEIGHT;
  const topSpine = spinePoint(topArcDist, "left", config);

  // Arm tip y is the smallest y (highest point)
  const armTipY = topSpine.y;

  // Curve bottom y
  const curveBottomY = config.foundersY + config.curveRadius;

  // Width determined by outermost children positions + labels
  let minX = Infinity, maxX = -Infinity;
  for (const pos of positions.values()) {
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
  }

  const nodeHalf = 20; // NODE_SIZE / 2
  const labelExtra = 30;

  return {
    offsetX: padding + nodeHalf - minX,
    offsetY: padding + nodeHalf - armTipY,
    width: Math.ceil((maxX - minX) + 2 * (padding + nodeHalf)),
    height: Math.ceil((curveBottomY - armTipY) + 2 * (padding + nodeHalf) + labelExtra),
  };
}
```

### 3d. Reuse from `svgExporter.ts`

These functions are identical and should be extracted or copied:

- `renderShape(ind: Individual): string` -- NSGC symbol rendering
- `renderDeceasedSlash(): string`
- `renderProbandArrow(): string`
- `seg(x1, y1, x2, y2): string` -- line segment helper
- `svgDefs(): string` -- arrowhead marker
- `escapeXml(s: string): string`
- Label rendering (adapted for position map instead of slot map)

---

## Phase 4: Main Export Function

```typescript
import { alignPedigree } from "@pedigree-editor/layout-engine";
import type { Pedigree, Individual } from "@pedigree-editor/layout-engine";
import { deidentify } from "./deidentify";
import type { SvgExportOptions } from "./types";

const NODE_SIZE = 40;
const STROKE = 2;

export function exportUShapeSvg(
  pedigree: Pedigree,
  options: SvgExportOptions = {},
): string {
  if (pedigree.individuals.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="white"/>
</svg>`;
  }

  const working = options.deidentify ? deidentify(pedigree, options) : pedigree;

  // 1. Build blood tree (upstream code, already implemented)
  const { bloodTree, rootMale, rootFemale } = buildBloodTree(working);

  // 2. Compute spine configuration
  const config = computeSpineConfig(working, bloodTree);

  // 3. Assign coordinates (new parametric placement)
  const positions = assignCoordinates(working, bloodTree, rootMale, rootFemale);

  // 4. Compute bounds from spine geometry
  const bounds = computeUBounds(positions, bloodTree, config);
  const { offsetX, offsetY, width, height } = bounds;

  // 5. Assemble SVG
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    `     viewBox="0 0 ${width} ${height}">`,
    svgDefs(),
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];

  if (options.title) {
    lines.push(
      `<text x="${width / 2}" y="${U_PADDING + 16}" text-anchor="middle" ` +
      `font-family="sans-serif" font-size="14" font-weight="bold" ` +
      `fill="black">${escapeXml(options.title)}</text>`
    );
  }

  lines.push(`<g transform="translate(${offsetX} ${offsetY})">`);

  // Debug spine overlay (toggle DEBUG_SPINE constant)
  lines.push(renderDebugSpine(bloodTree, config));

  // Backbone (visible U curve + arm lines)
  lines.push(...renderUBackbone(positions, bloodTree, rootMale, rootFemale, config));

  // Cluster lines (couple lines + child connectors)
  lines.push(...renderArmClusterLines(positions, bloodTree, config));

  // Root couple line
  lines.push(...renderRootCoupleLine(positions, rootMale, rootFemale));

  // Symbols
  lines.push(...renderUSymbols(working, positions));

  // Labels
  lines.push(...renderULabels(working, positions));

  lines.push(`</g>`);
  lines.push(`</svg>`);

  return lines.join("\n");
}
```

---

## Phase 5: UI Integration

### 5a. Add option to `SvgExportOptions`

```typescript
// types.ts
export interface SvgExportOptions {
  deidentify?: boolean;
  ageBuckets?: boolean;
  padding?: number;
  title?: string;
  uShape?: boolean;   // NEW: render as U-shape instead of standard top-down
}
```

### 5b. ExportDialog checkbox

Add after the de-identification section (around line 124 in ExportDialog.tsx):

```tsx
{/* U-shape layout */}
<div className="space-y-1.5">
  <label className="flex items-center gap-2 text-xs cursor-pointer">
    <input
      type="checkbox"
      checked={uShape}
      onChange={e => setUShape(e.target.checked)}
    />
    <span className="font-medium">U-shape layout (horseshoe)</span>
  </label>
</div>
```

### 5c. Wire up in `handleDownload`

```typescript
const svgString = uShape
  ? exportUShapeSvg(pedigree, {
      deidentify: deident,
      ageBuckets: deident && ageBuckets,
      title: deident ? undefined : title,
    })
  : exportSvg(pedigree, {
      deidentify: deident,
      ageBuckets: deident && ageBuckets,
      title: deident ? undefined : title,
    });
```

---

## Phase 6: Testing Strategy

### Structural tests

```typescript
describe("U-shape structural", () => {
  it("root couple at bottom centre of U", () => {
    const svg = exportUShapeSvg(simpleFamily);
    // Parse the root couple positions and verify they are
    // at the lowest y-coordinate in the SVG
    const positions = extractPositions(svg);
    // Root couple y should be the maximum y (bottom of SVG)
  });

  it("left arm children spread leftward", () => {
    // Children on the left arm should have x < spine x
  });

  it("right arm children spread rightward", () => {
    // Children on the right arm should have x > spine x
  });

  it("generations increase upward on arms", () => {
    // Gen 1 y < gen 0 y (higher up on the page)
  });

  it("contains U-curve SVG arc path", () => {
    const svg = exportUShapeSvg(simpleFamily);
    expect(svg).toContain("<path");
    expect(svg).toMatch(/A \d/); // SVG arc command
  });
});
```

### Visual regression

Each test writes an SVG to `test-output/`. During development:
1. Run tests
2. Open SVGs in eog/browser
3. Claude reads the SVG file and verifies coordinates

### Edge cases to test

- Single individual (no U needed, fallback to centred single node)
- Couple with no children (just root couple at bottom)
- Asymmetric arms (3 generations left, 1 generation right)
- Consanguineous marriage within the U
- Individuals with multiple partners

---

## Implementation Order

1. **Phase 0**: Development harness (test file + fixture + workflow)
2. **Phase 2a-b**: Spine geometry (`spinePoint` function + constants)
3. **Phase 2c**: `assignCoordinates` with debug spine overlay
4. **Phase 3d**: Copy/import shared rendering functions
5. **Phase 3a**: Backbone rendering
6. **Phase 3b**: Cluster line rendering
7. **Phase 3c**: Bounding box from spine geometry
8. **Phase 4**: Main export function assembly
9. **Visual verification**: Generate SVGs, inspect with eog, iterate
10. **Phase 5**: UI integration (checkbox in ExportDialog)
11. **Phase 6**: Edge case tests

At each step after Phase 2c, generate the SVG and inspect it before proceeding.
The debug spine overlay (red dashed line) stays on until everything looks right.

---

## Appendix: Coordinate System Orientation

```
         y decreases (upward on screen)
              ^
              |
    left arm  |  right arm
              |
              |
    ──────────+──────────> x increases
              |
         foundersY + R = curve bottom
              |
         y increases (downward on screen)
```

Generation 0 (founders) at the bottom. Higher generations have smaller y values
(they are higher on the screen). This matches SVG coordinate convention where
y=0 is the top of the viewport.
