# Phase 6.3 Plan — Compact mode

*Reduce inter-generation spacing so larger pedigrees fit on screen without panning.*

---

## Design

Compact mode scales `ROW_HEIGHT` to 70% and `SLOT_WIDTH` to 85%. It is a **display option only** — it does not persist in the `Pedigree` JSON data model. `localStorage` is sufficient.

This is a quick win: `layoutToFlow` already owns all the geometry constants; passing an options object is a small change.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/src/pedigree/layoutToFlow.ts` | Accept `LayoutToFlowOptions`; thread `rowHeight`/`slotWidth` through `buildNodes` and `buildSibshipEdges` |
| `frontend/src/pedigree/PedigreeCanvas.tsx` | `compact` state; pass to `layoutToFlow` |
| `frontend/src/pages/CanvasPage.tsx` | Lift `compact` state; pass to `PedigreeCanvas` and `SettingsPanel` |
| `frontend/src/components/SettingsPanel.tsx` | Compact toggle checkbox |

---

## Step 1: `layoutToFlow` options — `frontend/src/pedigree/layoutToFlow.ts`

```typescript
export interface LayoutToFlowOptions {
  compact?: boolean;
}

export function layoutToFlow(
  pedigree: Pedigree,
  opts: LayoutToFlowOptions = {},
): FlowData {
  if (pedigree.individuals.length === 0) {
    return { nodes: [], coupleEdges: [], sibshipEdges: [] };
  }
  const rowHeight = opts.compact ? ROW_HEIGHT * 0.70 : ROW_HEIGHT;
  const slotWidth = opts.compact ? SLOT_WIDTH * 0.85 : SLOT_WIDTH;

  const result = alignPedigree(pedigree);
  const nodes  = buildNodes(pedigree, result, { rowHeight, slotWidth });

  const slotPos = new Map<string, { x: number; y: number }>();
  for (const node of nodes) slotPos.set(node.id, node.position);

  return {
    nodes,
    coupleEdges:  buildCoupleEdges(result),
    sibshipEdges: buildSibshipEdges(result, slotPos, rowHeight),
  };
}
```

Thread `rowHeight`/`slotWidth` into `buildNodes` and `buildSibshipEdges` instead of importing the constants directly. The `sibBarY` calculation (`(coupleY + childY) / 2`) already derives from actual positions, so compact just works once node positions use the scaled constants.

---

## Step 2: Canvas — `frontend/src/pedigree/PedigreeCanvas.tsx`

Lift `compact` to `CanvasPage` (so `SettingsPanel` can also toggle it). `PedigreeCanvas` accepts it as a prop:

```tsx
interface PedigreeCanvasProps {
  showMinimap?: boolean;
  readOnly?: boolean;
  compact?: boolean;
}

const { nodes, coupleEdges, sibshipEdges } = useMemo(
  () => pedigree.individuals.length > 0
    ? layoutToFlow(pedigree, { compact })
    : { nodes: [], coupleEdges: [], sibshipEdges: [] },
  [pedigree, compact],
);
```

---

## Step 3: Settings panel — `frontend/src/components/SettingsPanel.tsx`

Add alongside the existing minimap toggle:

```tsx
<div className="flex items-center justify-between py-1">
  <label className="text-xs text-gray-600">Compact layout</label>
  <input
    type="checkbox"
    checked={compact}
    onChange={e => onToggleCompact(e.target.checked)}
  />
</div>
```

Persist in `localStorage` alongside `showMinimap` in `CanvasPage`.
