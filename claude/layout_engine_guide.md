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

**Handling duplicate slots:** If the same `nid` value appears at two different slots (same or different levels), render both. Add a visual indicator that they are the same person — the standard convention is a small superscript number (e.g. `¹`) on both occurrences. Do NOT deduplicate: the position information is load-bearing for edge drawing. Join the copies with a dashed arc, as R's `plot.pedigree` does (`arcconnect`). A copy with no line at all (no `fam`, no spouse marker on either side) may be left out once another copy is drawn; kinship2 leaves these at the end of a founder row when someone has partners on both sides of a chain. `layoutToFlow` and the SVG exporter do both, and apply a pin only to the copy nearest it.

### Rule 2: Couple lines

Iterate over all slots. Where `spouse[level][slot] > 0`, draw a horizontal line from the node at `slot` to the node at `slot + 1`:

**Three or more partners (pass-through markers).** Someone with several partners is laid out as one run of marriage-linked slots, e.g. a man with three wives becomes `wife2 ~ man ~ wife1 ~ wife3` with a marker on every slot but the last. The marker between `wife1` and `wife3` does not mean they are a couple: it is the man's marriage line continuing through `wife1` to reach `wife3` (kinship2 draws it straight through the symbol). Use `resolveCouple(result, partners, level, slot)` from the layout engine to get the real partner slots; when `hop` is true, draw the line from the far partner raised above the row so it clears the slot(s) in between, and start that family's sibship drop (Rule 3) from the raised line. `pedigreeToGeometry` reports this as `hopHeight` on both `CoupleGeometry` and `SibshipGeometry`; the React canvas and the SVG exporter share the path helper in `frontend/src/pedigree/couplePath.ts`.

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

2. **Sibship bar**: draw a horizontal line from the leftmost to the rightmost child in the group, at y = `(level - 0.5) * ROW_HEIGHT` (halfway between generations). When two couples' bars would run along the same stretch of that line, the renderer lowers one of them (`sibshipBarOffsets` in `frontend/src/pedigree/sibshipPath.ts`, #80).

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

## autohint

`autohint` is a full port of the kinship2 routine. It runs the alignment once with no spouse hints, finds anyone drawn in more than one slot (someone with children by several partners), moves each such person to the edge of their sibship nearest their other copy, records a spouse hint saying which partner is drawn on the left and which family the marriage is anchored to, and re-runs the alignment level by level. The chain `F-M-F-M` (woman with two husbands, one of whom has another wife) therefore comes out as four slots with nobody duplicated, matching R. Twin handling is not ported because the data model has no twin relation yet.

Four deliberate departures from R:

- Spouse hint rows and the parent-pair rows are oriented by the father/mother *role* each person holds in `findex`/`mindex`, not by sex, so couples where neither partner is male (both unknown, or same sex) are still drawn once.
- `kindepth`'s alignment pass marks only the couple it just handled as done. R marks every couple involving the shifted person, so the second partner of someone who married into a lower generation stayed in the founder row and their children floated free.
- Childless partnerships are laid out as couples. R only learns about a couple from a shared child, so a partner with no children landed in the founder row with no couple line. `LayoutInput.childlessCouples` carries them into kindepth's spouse alignment and the spouselist.
- Isolated individuals (no partner, no children) are appended to the right of their generation *after* the QP pass. R drops them entirely; appending them before the QP would make the top row the widest and leave no room to centre parents over children.

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
