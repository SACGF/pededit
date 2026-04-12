# Phase 6.5 Plan — Full autohint graph-based optimisation

*Replaces the current stub ordering with connected-component traversal, preventing unrelated families from interleaving in complex pedigrees.*

---

## Background

The current `autohint` in `layout-engine/src/autohint.ts` sorts individuals within each depth level by sibling order but does not group them by connected component. For a pedigree with two unrelated nuclear families at the same depth, the stub can interleave their members (A–B–A–B) instead of grouping them (A–A–B–B). The R kinship2 implementation avoids this via connected-component traversal.

The second part of full autohint — duplicate individual repositioning (moving a multi-partner individual to the edge of their sibling group nearest their other slot) — is deferred to Phase 7. It's algorithm-complex with smaller visual payoff for typical pedigrees.

---

## What changes

Replace the `depthGroups` block in `autohint` (the final `horder` assignment) with a connected-component traversal that groups individuals by family cluster before assigning order.

---

## Files changed

| File | Change |
|------|--------|
| `layout-engine/src/autohint.ts` | Add `buildAdjacency` + `connectedComponents` helpers; replace depth-group sort |
| `layout-engine/src/tests/` | New tests for multi-family ordering and ordering stability |

---

## Step 1: Adjacency map

```typescript
function buildAdjacency(input: LayoutInput): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>();
  const add = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (let i = 1; i <= input.n; i++) {
    const d = input.findex[i]!;
    const m = input.mindex[i]!;
    if (d > 0) add(i, d);
    if (m > 0) add(i, m);
    if (d > 0 && m > 0) add(d, m);
  }
  return adj;
}
```

---

## Step 2: Connected-component traversal

```typescript
function connectedComponents(
  n: number,
  adj: Map<number, Set<number>>,
  depth: Int32Array,
  horder: Float64Array,
): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];

  for (let start = 1; start <= n; start++) {
    if (visited.has(start)) continue;
    const comp: number[] = [];
    const queue = [start];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      comp.push(node);
      for (const nb of adj.get(node) ?? []) {
        if (!visited.has(nb)) queue.push(nb);
      }
    }
    // Sort within component: depth asc, then existing horder asc
    comp.sort((a, b) => {
      const da = depth[a] ?? 0, db = depth[b] ?? 0;
      if (da !== db) return da - db;
      return (horder[a] ?? a) - (horder[b] ?? b);
    });
    components.push(comp);
  }

  // Sort components: component with the shallowest member first
  components.sort((ca, cb) =>
    Math.min(...ca.map(i => depth[i] ?? 0)) - Math.min(...cb.map(i => depth[i] ?? 0))
  );

  return components;
}
```

---

## Step 3: Replace the depth-group block in `autohint`

Current code (the `depthGroups` block at the bottom of `autohint`):
```typescript
const depthGroups = new Map<number, number[]>();
for (let i = 1; i <= n; i++) {
  const d = depth[i] ?? 0;
  if (!depthGroups.has(d)) depthGroups.set(d, []);
  depthGroups.get(d)!.push(i);
}

for (const [, members] of depthGroups) {
  const sorted = [...members].sort((a, b) => { ... });
  for (let k = 0; k < sorted.length; k++) {
    horder[sorted[k]!] = k + 1;
  }
}
```

Replacement:
```typescript
const adj = buildAdjacency(input);
const components = connectedComponents(n, adj, depth, horder);

let globalOrder = 1;
for (const comp of components) {
  for (const idx of comp) {
    horder[idx] = globalOrder++;
  }
}
```

The sibling-sorting pass (the `assignedOrder` block above it) runs first and populates `horder` with relative sibling ranks. The component traversal then uses those values as a secondary sort key within each component, preserving the sibling ordering intent.

---

## Tests to add

```typescript
// Two unrelated nuclear families: verify all members of each family are contiguous
it("two unrelated families are not interleaved", () => {
  // Build pedigree: fam A (i1+i2 → i3,i4) and fam B (i5+i6 → i7,i8), no links
  // Verify nid[level] groups A members together and B members together
});

// Ordering stability: same input always produces same output
it("component ordering is deterministic", () => {
  const r1 = alignPedigree(multiFamily);
  const r2 = alignPedigree(multiFamily);
  expect(r1.nid).toEqual(r2.nid);
});
```

---

## Deferred to Phase 7

**Duplicate individual repositioning:** When individual X appears in two slots (has children with two partners), the full kinship2 autohint moves X to the edge of their sibling group nearest to their other slot, reducing line crossings. Implementing this requires knowing which individuals will appear in two slots before `alignped1` runs — detectable from the input but requiring careful handling of the boundary conditions. Deferred because: (a) it only affects pedigrees with multiple partnerships for one individual, and (b) the connected-component fix above is the bigger win for most real pedigrees.
