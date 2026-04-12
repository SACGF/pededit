# Phase 6.1 Plan — Manual drag-and-drop repositioning

*This is the primary differentiator. No open-source pedigree tool has this; FamGenix charges $500+/year for it.*

---

## Design decisions

**What gets stored:** Pinned positions live in `Pedigree.pinnedPositions`, keyed by `individual.id` (stable UUID). NOT by slot ID (`${level}-${slot}`) — slot IDs are transient and change whenever family structure changes.

**Duplicate slots:** An individual who appears in two slots (parent with two partners) uses the same pinned position for both occurrences. Both move together. Acceptable — pinning them independently would cause confusing divergence for the same person.

**Auto-layout interaction:** After a drag, `pinIndividual` mutates `pedigree` → `useMemo([pedigree])` refires → `layoutToFlow` reruns with the algorithm positions as normal → `buildNodes` overrides pinned individuals with their stored position. Other nodes stay at algorithm-computed positions. They do NOT reflow around the pinned node. This is intentionally simpler than constraint-aware layout (modifying the QP objective in `alignped4`). Future improvement: treat pinned positions as fixed-point constraints in the QP.

**Edge geometry must follow pinned nodes:** `SibshipEdgeData` stores `coupleX`, `coupleY`, `childXs`, `childY` as pre-computed pixel values. If those come from `result.pos` (algorithm), they won't update when a node is dragged. Fix: after `buildNodes`, build a slot-position map from the actual node positions (which include pin overrides) and pass it into `buildSibshipEdges`. Couple edges are fine — React Flow's edge router reads from handle positions automatically.

---

## Files changed

| File | Change |
|------|--------|
| `layout-engine/src/types.ts` | Add `pinnedPositions?` to `Pedigree` |
| `frontend/src/store/usePedigreeStore.ts` | Add `pinIndividual`, `unpinIndividual`, `resetLayout` |
| `frontend/src/pedigree/layoutToFlow.ts` | `RFNodeData` gets `isPinned`; `buildNodes` applies pins; `layoutToFlow` builds slotPos map; `buildSibshipEdges` uses slotPos |
| `frontend/src/pedigree/PedigreeCanvas.tsx` | `nodesDraggable={true}`, `onNodeDragStop` handler |
| `frontend/src/pedigree/nodes/PedigreeSymbolNode.tsx` | Pin indicator dot |
| `frontend/src/pedigree/nodes/MoreMenu.tsx` | "Unpin position" item |
| `frontend/src/components/Toolbar.tsx` | "Reset layout" button (only visible when pins exist) |

---

## Step 1: Data model — `layout-engine/src/types.ts`

```typescript
export interface Pedigree {
  individuals: Individual[];
  partnerships: Partnership[];
  parentOf: Record<string, string[]>;
  siblingOrder: SiblingOrderSettings;
  pinnedPositions?: Record<string, { x: number; y: number }>; // individualId → canvas px
}
```

---

## Step 2: Store — `frontend/src/store/usePedigreeStore.ts`

Add to `PedigreeState` interface:

```typescript
pinIndividual: (individualId: string, pos: { x: number; y: number }) => void;
unpinIndividual: (individualId: string) => void;
resetLayout: () => void;
```

Implementations (inside the `create` call):

```typescript
pinIndividual: (individualId, pos) => {
  mutate(draft => {
    if (!draft.pinnedPositions) draft.pinnedPositions = {};
    draft.pinnedPositions[individualId] = pos;
  });
},

unpinIndividual: (individualId) => {
  mutate(draft => {
    if (draft.pinnedPositions) {
      delete draft.pinnedPositions[individualId];
      if (Object.keys(draft.pinnedPositions).length === 0) {
        delete draft.pinnedPositions;
      }
    }
  });
},

resetLayout: () => {
  mutate(draft => {
    delete draft.pinnedPositions;
  });
},
```

Each wraps `mutate()` → `snapshot()` first, so undo/redo for drag operations comes for free.

---

## Step 3: Layout → Flow — `frontend/src/pedigree/layoutToFlow.ts`

**Update `RFNodeData`:**

```typescript
export interface RFNodeData extends Record<string, unknown> {
  individual: Individual;
  isDuplicate: boolean;
  duplicateIndex?: 1 | 2;
  hasParents: boolean;
  isPinned: boolean;   // NEW
}
```

**Update `layoutToFlow`** to build a slot-position map after nodes are computed:

```typescript
export function layoutToFlow(pedigree: Pedigree): FlowData {
  if (pedigree.individuals.length === 0) {
    return { nodes: [], coupleEdges: [], sibshipEdges: [] };
  }
  const result: LayoutResult = alignPedigree(pedigree);
  const nodes = buildNodes(pedigree, result);

  // Map from slot id ("level-slot") → final pixel position (reflects pin overrides).
  const slotPos = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    slotPos.set(node.id, node.position);
  }

  return {
    nodes,
    coupleEdges:  buildCoupleEdges(result),
    sibshipEdges: buildSibshipEdges(result, slotPos),
  };
}
```

**Update `buildNodes`** to apply pinned positions:

```typescript
// Inside the level/slot loop, replace the position computation:
const pinnedPos = pedigree.pinnedPositions?.[individual.id];

nodes.push({
  id:       `${level}-${slot}`,
  type:     "pedigreeSymbol",
  position: pinnedPos ?? {
    x: result.pos[level][slot] * SLOT_WIDTH,
    y: level * ROW_HEIGHT,
  },
  width:  NODE_SIZE,
  height: NODE_SIZE,
  data: {
    individual,
    isDuplicate,
    duplicateIndex: isDuplicate ? (occurrence as 1 | 2) : undefined,
    hasParents,
    isPinned: !!pinnedPos,
  },
});
```

**Update `buildSibshipEdges`** signature and geometry to use actual (possibly pinned) positions:

```typescript
function buildSibshipEdges(
  result: LayoutResult,
  slotPos: Map<string, { x: number; y: number }>,
): Edge<SibshipEdgeData>[] {
  // ...
  for (const [f, slots] of groups) {
    const leftPos  = slotPos.get(`${level - 1}-${f - 1}`)!;
    const rightPos = slotPos.get(`${level - 1}-${f}`)!;
    const coupleX  = (leftPos.x + rightPos.x) / 2;
    const coupleY  = (leftPos.y + rightPos.y) / 2;
    const childXs  = slots.map(s => slotPos.get(`${level}-${s}`)!.x);
    const childY   = slotPos.get(`${level}-${slots[0]}`)!.y;
    const sibBarY  = (coupleY + childY) / 2;
    // ...
  }
}
```

This means the sibship geometry is correct whether nodes are at their algorithm positions or at user-dragged positions.

**Test impact:** The existing sibship geometry tests assert `coupleY === py(level - 1)` and `sibBarY === (level - SIB_BAR_FACTOR) * ROW_HEIGHT`. With the slot-position map, these values are now derived from actual node positions. For unpinned pedigrees the values are identical (algorithm positions = `level * ROW_HEIGHT`). The assertions will still pass. Add one new test for the pinned-position case.

---

## Step 4: Canvas — `frontend/src/pedigree/PedigreeCanvas.tsx`

```typescript
const { pedigree, setSelectedId, pinIndividual } = usePedigreeStore();

const handleNodeDragStop = useCallback(
  (_event: React.MouseEvent, node: Node<RFNodeData>) => {
    pinIndividual(node.data.individual.id, node.position);
  },
  [pinIndividual],
);
```

In `<ReactFlow ...>`:

```tsx
nodesDraggable={true}         // was false
onNodeDragStop={handleNodeDragStop}
```

**Re-render loop check:** `onNodeDragStop` → `pinIndividual` → Zustand → `useMemo` fires → new nodes array where the dragged node has position = the pinned position (same pixel as where user dropped it) → React Flow re-renders with position matching the drag endpoint. No loop, no snap-back.

---

## Step 5: Pin indicator — `frontend/src/pedigree/nodes/PedigreeSymbolNode.tsx`

Add a small dot in the top-right corner when `isPinned`. Keep it subtle — style can be refined later.

```tsx
{data.isPinned && (
  <div
    style={{
      position: "absolute",
      top: -3,
      right: -3,
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: "#9ca3af",  // gray-400 — subtle, style later if needed
      border: "1.5px solid white",
      pointerEvents: "none",
    }}
  />
)}
```

---

## Step 6: Unpin via MoreMenu — `frontend/src/pedigree/nodes/MoreMenu.tsx`

Add `unpinIndividual` to the store destructure. Add an item below the Delete section, visible only when the individual is pinned:

```tsx
const isPinned = !!pedigree.pinnedPositions?.[individualId];

// After the delete section:
{isPinned && (
  <div className="border-t mt-1 pt-1">
    <MenuItem onClick={() => action(() => unpinIndividual(individualId))}>
      Unpin position
    </MenuItem>
  </div>
)}
```

---

## Step 7: Reset layout button — `frontend/src/components/Toolbar.tsx`

Add `resetLayout` to the store destructure. Show the button only when pins exist, in the right-hand group alongside the export buttons:

```tsx
const hasPins = Object.keys(pedigree.pinnedPositions ?? {}).length > 0;

{hasPins && (
  <Button
    variant="ghost" size="sm"
    className="h-7 px-2 gap-1 text-xs text-gray-500"
    title="Clear all manual node positions and restore auto-layout"
    onClick={resetLayout}
  >
    Reset layout
  </Button>
)}
```

Only renders when there are pinned nodes — zero clutter otherwise.

---

## Undo/redo behaviour

Each drag = one undo step (one `snapshot()` call inside `mutate()`). Three drags = three undo steps. This matches what users expect from most editors. No batching needed.

---

## Known limitation

After dragging a parent node, its children stay at their algorithm-computed positions — they do not reflow to stay centred under the moved parent. This is intentional for Phase 6.1. True constraint-aware reflowing (modifying the QP objective in `alignped4`) is a future improvement.
