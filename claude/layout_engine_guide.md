# Layout Engine Guide

*Reference for implementers of Phase 3 (renderer) and Phase 6 (layout improvements).*
*Do not restate this in memory — just link here.*

---

## Pipeline

```
Pedigree  →  pedigreeToLayoutInput  →  LayoutInput  (1-based)
                                              │
                                         kindepth()       assigns generation depths
                                              │
                                         autohint()       produces ordering hints
                                              │
                               alignped1/3/4 (internal)
                                              │
                                         LayoutResult     (0-based levels, 1-based individual ids)
```

`alignPedigree(pedigree, options?)` is the single public entry point. Everything else is internal.

---

## LayoutResult field-by-field

```typescript
interface LayoutResult {
  n:      number[];      // n[level]       = count of slots at that generation
  nid:    number[][];    // nid[level][slot]
  pos:    number[][];    // pos[level][slot]
  fam:    number[][];    // fam[level][slot]
  spouse: number[][];    // spouse[level][slot]
}
```

**Indexing convention:** Levels are 0-based (generation 0 = founders). Slots within a level are 0-based. `n.length` is the number of generations.

### `n`

`n[level]` is the number of rendered slots at that generation. Use it as the slot loop bound:

```typescript
for (let slot = 0; slot < result.n[level]; slot++) { /* ... */ }
```

### `nid`

`nid[level][slot]` is the **1-based index** of the individual rendered at this slot, corresponding to `pedigree.individuals[nid - 1]`.

**The same individual can appear in multiple slots.** This happens when someone has children with more than one partner — they are placed adjacent to each partner separately. Both slots contain the same `nid` value. The renderer must handle this (see Rendering Rules §2).

### `pos`

`pos[level][slot]` is the **horizontal position in abstract units** (not pixels). Unit spacing is 1.0 between adjacent individuals in a standard layout. Scale by a constant (e.g. `SLOT_WIDTH = 80px`) to get pixel coordinates:

```typescript
const x = result.pos[level][slot] * SLOT_WIDTH;
const y = level * ROW_HEIGHT;
```

Positions within a level are strictly increasing. They are NOT integers — the QP optimisation (alignped4) shifts positions to align parents over children, so parents sit at fractional positions like `0.5` and `1.5`.

### `fam`

`fam[level][slot]` encodes which couple are the parents of the individual at this slot.

- **0** = no parents (founder or marry-in with no parents in the pedigree)
- **k > 0** = the LEFT parent is at **1-based** slot `k` in level `level - 1`; the RIGHT parent is at **1-based** slot `k + 1` in level `level - 1`

Converting to 0-based output slots:
```typescript
const f = result.fam[level][slot];
if (f > 0) {
  const leftParentSlot  = f - 1;   // 0-based slot in level-1
  const rightParentSlot = f;        // 0-based slot in level-1
}
```

All siblings from the same couple share the same `fam` value at their level. Use this to group siblings for sibship line drawing.

### `spouse`

`spouse[level][slot]` marks the LEFT member of a couple at this slot:

- **0** = no couple to the right
- **1** = individual at slot `s+1` is this individual's partner → draw a single horizontal couple line
- **2** = individual at slot `s+1` is a consanguineous partner → draw a double horizontal couple line

The individual at slot `s+1` always has `spouse[level][s+1] = 0`. The marker is only on the LEFT member.

---

## Worked example: nuclear family

Five individuals:
- 1 (male, founder)
- 2 (female, founder)
- 3, 4, 5 (children of 1 and 2)

```typescript
const result = alignPedigree(pedigree);
// result.n      = [2, 3]
// result.nid    = [[1, 2],    [3, 4, 5]]
// result.pos    = [[0.5, 1.5],[0, 1, 2]]   // parents centred over children
// result.fam    = [[0, 0],    [1, 1, 1]]
// result.spouse = [[1, 0],    [0, 0, 0]]
```

Reading the output:

| Field | Value | Meaning |
|-------|-------|---------|
| `n[0]` | 2 | Two slots at generation 0 (the parents) |
| `n[1]` | 3 | Three slots at generation 1 (the children) |
| `nid[0]` | [1, 2] | Individual 1 at slot 0, individual 2 at slot 1 |
| `pos[0]` | [0.5, 1.5] | Parent positions in abstract units |
| `pos[1]` | [0, 1, 2] | Child positions — evenly spaced under parents |
| `fam[1][0]` | 1 | Child at slot 0: left parent at 1-based slot 1 of level 0 = slot 0 (0-based) = individual 1 |
| `fam[1][1]` | 1 | Same — all three children share the same couple |
| `spouse[0][0]` | 1 | Individual 1 and individual 2 are a couple → draw couple line |
| `spouse[0][1]` | 0 | Right member of the couple; no marker needed here |

**Rendering this family:**

```
pos:     0.5   1.5          (gen 0, scale × SLOT_WIDTH for pixels)
          □ ── ○            couple line from pos[0][0] to pos[0][1]
          │                 vertical drop from midpoint (1.0) to sibship bar
       ───┼───────          sibship bar spanning pos[1][0] to pos[1][2]
       │  │  │
       □  ○  □              children at pos[1][0..2]
```

---

## Rendering rules

### Rule 1: Nodes

Render one node per `(level, slot)` pair where `nid[level][slot] > 0`.

```typescript
for (let level = 0; level < result.n.length; level++) {
  for (let slot = 0; slot < result.n[level]; slot++) {
    const individualIndex = result.nid[level][slot] - 1;  // 0-based
    const individual = pedigree.individuals[individualIndex];
    const x = result.pos[level][slot] * SLOT_WIDTH;
    const y = level * ROW_HEIGHT;
    renderNode(individual, x, y);
  }
}
```

**Handling duplicate slots:** If the same `nid` value appears at two different slots (same or different levels), render both. Add a visual indicator that they are the same person — the standard convention is a small superscript number (e.g. `¹`) on both occurrences. Do NOT deduplicate: the position information is load-bearing for edge drawing.

### Rule 2: Couple lines

Iterate over all slots. Where `spouse[level][slot] > 0`, draw a horizontal line from the node at `slot` to the node at `slot + 1`:

```typescript
for (let level = 0; level < result.n.length; level++) {
  for (let slot = 0; slot < result.n[level] - 1; slot++) {
    const sp = result.spouse[level][slot];
    if (sp === 0) continue;
    const x1 = result.pos[level][slot] * SLOT_WIDTH;
    const x2 = result.pos[level][slot + 1] * SLOT_WIDTH;
    const y  = level * ROW_HEIGHT;
    if (sp === 1) drawSingleLine(x1, y, x2, y);
    if (sp === 2) drawDoubleLine(x1, y, x2, y);  // consanguinity
  }
}
```

### Rule 3: Sibship connections

For each level > 0, group all slots by their `fam` value (ignoring slots with `fam = 0`). For each group:

1. **Find the couple midpoint** at the level above. The left parent is at 0-based slot `fam - 1`, the right parent at slot `fam`. Couple midpoint x = `(pos[level-1][fam-1] + pos[level-1][fam]) / 2 * SLOT_WIDTH`.

2. **Sibship bar**: draw a horizontal line from the leftmost to the rightmost child in the group, at y = `(level - 0.5) * ROW_HEIGHT` (halfway between generations).

3. **Vertical drop from couple to bar**: draw a vertical line from the couple midpoint at `(level-1) * ROW_HEIGHT` down to the sibship bar.

4. **Vertical drops from bar to children**: for each slot in the group, draw a vertical line from the sibship bar down to `level * ROW_HEIGHT` at that slot's x position.

```typescript
for (let level = 1; level < result.n.length; level++) {
  const sibBarY = (level - 0.5) * ROW_HEIGHT;

  // Group slots by fam value
  const groups = new Map<number, number[]>();  // fam → [slot, ...]
  for (let slot = 0; slot < result.n[level]; slot++) {
    const f = result.fam[level][slot];
    if (f === 0) continue;
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f)!.push(slot);
  }

  for (const [f, slots] of groups) {
    const leftParentSlot  = f - 1;
    const rightParentSlot = f;
    const coupleX = (result.pos[level-1][leftParentSlot] + result.pos[level-1][rightParentSlot]) / 2 * SLOT_WIDTH;
    const sibLeftX  = result.pos[level][slots[0]] * SLOT_WIDTH;
    const sibRightX = result.pos[level][slots[slots.length - 1]] * SLOT_WIDTH;
    const parentY = (level - 1) * ROW_HEIGHT;

    // Couple-to-bar drop
    drawLine(coupleX, parentY, coupleX, sibBarY);
    // Sibship bar
    drawLine(sibLeftX, sibBarY, sibRightX, sibBarY);
    // Bar-to-child drops
    for (const slot of slots) {
      const childX = result.pos[level][slot] * SLOT_WIDTH;
      drawLine(childX, sibBarY, childX, level * ROW_HEIGHT);
    }
  }
}
```

---

## Known limitations (as of Phase 1)

**autohint is a stub.** The full `autohint` detects when an individual appears in two slots and moves them to the edge of their sibling group nearest to their spouse, minimising crossing lines. The current implementation returns a simple sequential ordering. For simple families this produces correct layouts; for families with cross-generational couples or individuals with multiple partners, the stub layout is structurally valid but may have unnecessary line crossings.

R ground truth for SAMPLE_PED_1: `n = [8, 19, 22, 8]`. The stub produces different counts (still structurally valid). Full `autohint` is targeted for Phase 6.

---

## Coordinate system summary

| Concept | Value |
|---------|-------|
| Generation 0 | Founders (oldest generation) |
| Generation increases downward | Younger generations are higher level numbers |
| `pos` units | Abstract, unit spacing ≈ 1.0 between adjacent individuals |
| `pos` origin | Not fixed — positions can start at 0 or offset |
| `fam` indexing | 1-based column reference into level-1 |
| `nid` indexing | 1-based individual index (subtract 1 for `pedigree.individuals[i]`) |
| Level arrays | 0-based in LayoutResult |

---

## React Flow mapping

In Phase 3, each `(level, slot)` pair becomes a React Flow node:

```typescript
const rfNode: Node = {
  id: `${level}-${slot}`,          // must be unique even for duplicated individuals
  type: "pedigreeSymbol",
  position: {
    x: result.pos[level][slot] * SLOT_WIDTH,
    y: level * ROW_HEIGHT,
  },
  data: {
    individual: pedigree.individuals[result.nid[level][slot] - 1],
    isDuplicate: /* nid appears elsewhere */,
  },
};
```

Couple lines and sibship connections become React Flow edges (or custom SVG overlaid on the canvas — TBD in Phase 3). The `(level, slot)` id scheme lets you draw edges between specific slots even when the same individual occupies two slots.
