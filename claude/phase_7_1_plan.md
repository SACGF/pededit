# Phase 7.1 Plan — URL-encoded pedigree sharing

*Share a pedigree without requiring the recipient to have an account. Data never leaves the browser except as part of the URL.*

---

## Mechanism

`Pedigree` JSON → gzip (`CompressionStream`) → base64url → URL fragment `#data=...`

The recipient opens the URL, the browser decompresses the fragment, and the pedigree renders in a read-only canvas. No server involvement. Meaningful privacy property: the server never sees the pedigree data.

**Browser support:** `CompressionStream("gzip")` — Chrome 80+, Firefox 113+, Safari 16.4+. No polyfill needed for the target user base.

**URL size:** ~400–800 chars for a small family; ~2–4KB for 50 individuals. Well within browser limits.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/src/io/share/encode.ts` | New — gzip + base64url encode/decode |
| `frontend/src/io/share/index.ts` | New — barrel export |
| `frontend/src/pages/SharedPedigreePage.tsx` | New — read-only shared view |
| `frontend/src/App.tsx` | Add `/shared` route |
| `frontend/src/components/Toolbar.tsx` | "Share" button with clipboard copy |
| `frontend/src/pedigree/PedigreeCanvas.tsx` | Add `readOnly` prop (suppresses drag + interaction) |

---

## Step 1: Encode/decode — `frontend/src/io/share/encode.ts`

```typescript
import type { Pedigree } from "@pedigree-editor/layout-engine";

export async function encodePedigree(pedigree: Pedigree): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(pedigree));
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buffer = await new Response(cs.readable).arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function decodePedigree(encoded: string): Promise<Pedigree> {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buffer = await new Response(ds.readable).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(buffer)) as Pedigree;
}
```

---

## Step 2: Shared page — `frontend/src/pages/SharedPedigreePage.tsx`

Decodes the URL fragment on mount, loads the pedigree into Zustand via `initialize()`, renders a read-only canvas.

```tsx
export default function SharedPedigreePage() {
  const { initialize } = usePedigreeStore();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#data=")) {
      setErrorMsg("No pedigree data in URL.");
      setStatus("error");
      return;
    }
    decodePedigree(hash.slice("#data=".length))
      .then(p => { initialize(p); setStatus("ready"); })
      .catch(() => { setErrorMsg("Invalid or corrupted pedigree link."); setStatus("error"); });
  }, [initialize]);

  if (status === "loading") return <LoadingScreen />;
  if (status === "error")   return <ErrorScreen message={errorMsg} />;

  return (
    <div className="flex h-screen flex-col">
      <div className="px-3 py-1 border-b bg-white flex items-center">
        <span className="text-xs text-gray-400">Shared pedigree — read only</span>
      </div>
      <div className="flex-1">
        <PedigreeCanvas readOnly />
      </div>
    </div>
  );
}
```

---

## Step 3: `readOnly` prop — `frontend/src/pedigree/PedigreeCanvas.tsx`

```typescript
interface PedigreeCanvasProps {
  showMinimap?: boolean;
  readOnly?: boolean;         // NEW — suppresses drag and hover interactions
}
```

In `<ReactFlow ...>`:
```tsx
nodesDraggable={!readOnly}
onNodeDragStop={readOnly ? undefined : handleNodeDragStop}
```

Also gate the `HoverPill` in `PedigreeSymbolNode` on `readOnly` if we pass it through node data.

---

## Step 4: Route — `frontend/src/App.tsx`

```tsx
<Route path="/shared" element={<SharedPedigreePage />} />
```

---

## Step 5: Share button — `frontend/src/components/Toolbar.tsx`

Simple clipboard copy with a transient label change to confirm:

```tsx
const [shareLabel, setShareLabel] = useState("Share");

async function handleShare() {
  const encoded = await encodePedigree(pedigree);
  const url = `${window.location.origin}/shared#data=${encoded}`;
  await navigator.clipboard.writeText(url);
  setShareLabel("Copied!");
  setTimeout(() => setShareLabel("Share"), 2000);
}

<Button
  variant="ghost" size="sm"
  className="h-7 px-2 gap-1 text-xs"
  disabled={!hasPedigree || pedigree.individuals.length === 0}
  onClick={handleShare}
>
  <Link size={12} />
  {shareLabel}
</Button>
```

No external toast library — a label toggle is sufficient.
