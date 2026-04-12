# Phase 6.4 Plan — Batch SVG Django API

*Four endpoints for research pipeline and embedding use cases. DrawPed has the stateless SVG endpoint; no other open-source tool does any of these.*

*Can slip to Phase 7 if time runs short — backend plumbing with no visible user-facing change.*

---

## Endpoints

| Endpoint | Use case | Cacheable |
|----------|----------|-----------|
| `POST /api/pedigrees/render-svg/` | Stateless: PED in → SVG out. Pipeline batch use. | No (POST) |
| `GET /api/pedigrees/render-svg/?data=<encoded>` | Stateless: caller encodes Pedigree JSON in URL → SVG out. No storage needed. | Yes (`public`) |
| `POST /api/pedigrees/from-ped/` | Convert PED to internal JSON and persist. Returns `[{id, title}]`. | No (POST) |
| `GET /api/pedigrees/{id}/svg/` | Render SVG for a stored pedigree. Stable URL for embedding. | Yes (`private`) |

**Embedding workflows:**

- *No server storage:* caller converts PED→JSON (e.g. using the npm package), gzip+base64url encodes it, `GET /render-svg/?data=<encoded>`. URL is stable and CDN-cacheable. Works for anyone who can run JS.
- *Server storage:* `POST /from-ped/` once to get an ID, then `GET /{id}/svg/`. Short stable URL. Requires auth.

---

## Approach

The SVG exporter is TypeScript. Running it from Django requires bridging to Node.js. Three Node.js CLI scripts, each reading from stdin and writing to stdout. Django shells out as subprocesses.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/src/io/renderPedSvgScript.ts` | New — Node.js CLI: stdin PED → stdout SVG |
| `frontend/src/io/renderJsonSvgScript.ts` | New — Node.js CLI: stdin Pedigree JSON → stdout SVG |
| `frontend/src/io/renderPedJsonScript.ts` | New — Node.js CLI: stdin PED → stdout Pedigree JSON array |
| `frontend/vite.config.ts` | Add three CLI build targets |
| `backend/api/views/render_svg.py` | New — all four SVG endpoints |
| `backend/api/views/from_ped.py` | New — PED → JSON, persist, return ids |
| `backend/api/urls.py` | Register all four endpoints |

---

## Step 1: CLI entrypoints

### `frontend/src/io/renderPedSvgScript.ts` — PED → SVG

```typescript
import { importPed } from "./ped/index.js";
import { renderSvg } from "./svg/svgExporter.js";

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const pedText = Buffer.concat(chunks).toString("utf-8");

  const result = importPed(pedText);
  const errors = result.issues.filter(i => i.severity === "error");
  if (errors.length > 0) {
    process.stderr.write(JSON.stringify(errors) + "\n");
    process.exit(1);
  }
  if (result.pedigrees.length === 0) {
    process.stderr.write("No pedigrees parsed\n");
    process.exit(1);
  }
  process.stdout.write(renderSvg(result.pedigrees[0]!));
}

main().catch(e => { process.stderr.write(String(e)); process.exit(1); });
```

### `frontend/src/io/renderJsonSvgScript.ts` — Pedigree JSON → SVG

```typescript
import { renderSvg } from "./svg/svgExporter.js";
import type { Pedigree } from "@pedigree-editor/layout-engine";

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const pedigree: Pedigree = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  process.stdout.write(renderSvg(pedigree));
}

main().catch(e => { process.stderr.write(String(e)); process.exit(1); });
```

Used by both `GET /render-svg/?data=` (caller-encoded JSON) and `GET /{id}/svg/` (stored pedigree JSON). No PED round-trip — preserves names, DOB, affected status, etc.

### `frontend/src/io/renderPedJsonScript.ts` — PED → Pedigree JSON array

```typescript
import { importPed } from "./ped/index.js";

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const pedText = Buffer.concat(chunks).toString("utf-8");

  const result = importPed(pedText);
  const errors = result.issues.filter(i => i.severity === "error");
  if (errors.length > 0) {
    process.stderr.write(JSON.stringify(errors) + "\n");
    process.exit(1);
  }
  if (result.pedigrees.length === 0) {
    process.stderr.write("No pedigrees parsed\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(result.pedigrees));
}

main().catch(e => { process.stderr.write(String(e)); process.exit(1); });
```

---

## Step 2: Vite build targets — `frontend/vite.config.ts`

```typescript
const scriptTargets: Record<string, string> = {
  "render-ped-svg":  "src/io/renderPedSvgScript.ts",
  "render-json-svg": "src/io/renderJsonSvgScript.ts",
  "render-ped-json": "src/io/renderPedJsonScript.ts",
};

const target = scriptTargets[process.env.BUILD_TARGET ?? ""];
if (target) {
  const fileName = process.env.BUILD_TARGET!.replace(/-/g, "_");
  return {
    build: {
      lib: { entry: target, formats: ["es"], fileName },
      outDir: "../backend/scripts",
      rollupOptions: { external: ["node:process"] },
    },
  };
}
```

Build all three:
```
BUILD_TARGET=render-ped-svg npx vite build
BUILD_TARGET=render-json-svg npx vite build
BUILD_TARGET=render-ped-json npx vite build
```

---

## Step 3: Django views

### `backend/api/views/render_svg.py`

```python
import base64, gzip, json, subprocess, os
from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..models import Pedigree

SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "../../../backend/scripts")
RENDER_PED_SVG  = os.path.join(SCRIPTS_DIR, "render_ped_svg.mjs")
RENDER_JSON_SVG = os.path.join(SCRIPTS_DIR, "render_json_svg.mjs")

def _run_script(script_path: str, stdin: bytes, timeout: int = 15) -> tuple[int, bytes, bytes]:
    try:
        r = subprocess.run(["node", script_path], input=stdin, capture_output=True, timeout=timeout)
        return r.returncode, r.stdout, r.stderr
    except subprocess.TimeoutExpired:
        return -1, b"", b"Render timed out"
    except FileNotFoundError:
        return -2, b"", b"Render script not available"

def _svg_error(returncode: int, stderr: bytes) -> Response | None:
    if returncode == -1: return Response({"error": "Render timed out"}, status=504)
    if returncode == -2: return Response({"error": "Render script not available"}, status=503)
    if returncode != 0:  return Response({"error": stderr.decode("utf-8", errors="replace")}, status=400)
    return None


@api_view(["POST"])
def render_svg_from_ped(request):
    """
    POST /api/pedigrees/render-svg/
    Body: PED file text (UTF-8). No auth required.
    Multi-family PED: only the first family is rendered.
    """
    if len(request.body) > 1_000_000:
        return Response({"error": "PED file too large"}, status=413)
    rc, stdout, stderr = _run_script(RENDER_PED_SVG, request.body)
    if err := _svg_error(rc, stderr): return err
    return HttpResponse(stdout, content_type="image/svg+xml")


@api_view(["GET"])
def render_svg_from_data(request):
    """
    GET /api/pedigrees/render-svg/?data=<gzip+base64url Pedigree JSON>
    No auth required. Fully cacheable — URL is deterministic for a given pedigree.
    Caller is responsible for encoding: gzip compress the JSON, then base64url encode.
    """
    encoded = request.GET.get("data", "")
    if not encoded:
        return Response({"error": "Missing ?data= parameter"}, status=400)
    try:
        json_bytes = gzip.decompress(base64.urlsafe_b64decode(encoded + "=="))
    except Exception:
        return Response({"error": "Invalid ?data= encoding (expected gzip + base64url)"}, status=400)
    if len(json_bytes) > 1_000_000:
        return Response({"error": "Decoded pedigree too large"}, status=413)

    rc, stdout, stderr = _run_script(RENDER_JSON_SVG, json_bytes)
    if err := _svg_error(rc, stderr): return err
    response = HttpResponse(stdout, content_type="image/svg+xml")
    response["Cache-Control"] = "public, max-age=86400, immutable"
    return response


@api_view(["GET"])
def render_svg_stored(request, pk):
    """
    GET /api/pedigrees/{id}/svg/
    Returns SVG for a stored pedigree. Auth: owner or public.
    """
    try:
        pedigree = Pedigree.objects.get(pk=pk)
    except Pedigree.DoesNotExist:
        return Response({"error": "Not found"}, status=404)
    if pedigree.owner != request.user and not getattr(pedigree, "is_public", False):
        return Response({"error": "Forbidden"}, status=403)

    json_bytes = json.dumps(pedigree.data).encode("utf-8")
    rc, stdout, stderr = _run_script(RENDER_JSON_SVG, json_bytes)
    if err := _svg_error(rc, stderr): return err
    response = HttpResponse(stdout, content_type="image/svg+xml")
    response["Cache-Control"] = "private, max-age=3600"
    return response
```

### `backend/api/views/from_ped.py`

```python
import subprocess, os, json
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..models import Pedigree

RENDER_PED_JSON = os.path.join(os.path.dirname(__file__), "../../../backend/scripts/render_ped_json.mjs")

@api_view(["POST"])
def from_ped(request):
    """
    POST /api/pedigrees/from-ped/
    Body: PED file text (UTF-8). Auth required.
    Converts PED → internal JSON, persists each family, returns [{id, title}].
    """
    if len(request.body) > 1_000_000:
        return Response({"error": "PED file too large"}, status=413)
    try:
        result = subprocess.run(
            ["node", RENDER_PED_JSON],
            input=request.body, capture_output=True, timeout=15,
        )
    except subprocess.TimeoutExpired:
        return Response({"error": "Parse timed out"}, status=504)
    except FileNotFoundError:
        return Response({"error": "Parse script not available"}, status=503)

    if result.returncode != 0:
        return Response({"error": result.stderr.decode("utf-8", errors="replace")}, status=400)

    pedigrees_data = json.loads(result.stdout)
    created = []
    for ped in pedigrees_data:
        title = ped.get("id") or "Imported pedigree"
        obj = Pedigree.objects.create(owner=request.user, title=title, data=ped)
        created.append({"id": obj.pk, "title": obj.title})
    return Response(created, status=201)
```

---

## Step 4: URL registration — `backend/api/urls.py`

```python
from .views.render_svg import render_svg_from_ped, render_svg_from_data, render_svg_stored
from .views.from_ped import from_ped

urlpatterns += [
    path("pedigrees/render-svg/",   render_svg_from_ped),   # POST
    path("pedigrees/render-svg/",   render_svg_from_data),  # GET  (Django routes by method)
    path("pedigrees/<int:pk>/svg/", render_svg_stored),
    path("pedigrees/from-ped/",     from_ped),
]
```

---

## API contract

```
POST /api/pedigrees/render-svg/
Content-Type: text/plain
<PED file content>
→ 200  Content-Type: image/svg+xml
→ 400  { "error": "..." }
→ 413  { "error": "PED file too large" }
→ 504  { "error": "Render timed out" }

GET /api/pedigrees/render-svg/?data=<gzip+base64url Pedigree JSON>
→ 200  Content-Type: image/svg+xml   Cache-Control: public, max-age=86400, immutable
→ 400  { "error": "Missing ?data= ..." | "Invalid ?data= encoding ..." }
→ 413  { "error": "Decoded pedigree too large" }
→ 504  { "error": "Render timed out" }

POST /api/pedigrees/from-ped/
Content-Type: text/plain
Authorization: Bearer <token>
<PED file content>
→ 201  [{ "id": 42, "title": "FAM001" }, ...]
→ 400  { "error": "..." }
→ 413  { "error": "PED file too large" }

GET /api/pedigrees/{id}/svg/
Authorization: Bearer <token>   (or public if pedigree.is_public)
→ 200  Content-Type: image/svg+xml   Cache-Control: private, max-age=3600
→ 403  Forbidden
→ 404  Not found
→ 504  { "error": "Render timed out" }
```

**Encoding for `?data=`:** `base64url(gzip(JSON.stringify(pedigree)))`. Pad stripping is safe — the Django view adds `==` before decoding. Typical clinical pedigree (20–30 individuals): ~300–600 bytes encoded, well within URL limits.

---

## Notes

- Rate limit `POST /render-svg/` and `POST /from-ped/` (10 req/min per IP) via `django-ratelimit`. The GET endpoints are cheap once cached and don't need rate limiting.
- `GET /render-svg/?data=` uses `immutable` because the URL is content-addressed — the same data always produces the same SVG.
- `GET /{id}/svg/` uses `private` because pedigrees are user-owned. Upgrade to `public` if a `is_public` flag is added later.
- Both GET endpoints use `renderJsonSvgScript` directly — no PED round-trip, so names/DOB/affected status are preserved in the SVG.

## TODO: API documentation

These endpoints need to be documented for external callers (researchers, pipeline authors). Options:

- **Swagger / OpenAPI** via `drf-spectacular` — auto-generates from DRF views, serves interactive docs at `/api/docs/`. Low effort, good for developer exploration. Link it from the main app nav.
- **Static API docs page** — hand-written HTML or Markdown rendered at `/api-docs/` or as a page in the app. More control over prose, encoding examples, and the `?data=` encoding walkthrough (which Swagger won't explain well automatically).
- **Both** — Swagger for the contract, a short prose page for the "how do I embed a pedigree on my page" walkthrough with copy-paste JS examples.

The `?data=` encoding is non-obvious enough that it needs a worked example: here's a pedigree JSON, here's the JS to encode it, here's the resulting URL. That can't live in Swagger alone.

Recommendation: add `drf-spectacular` (2-line setup) for the machine-readable contract, plus a lightweight `/docs/embedding` page with the worked encoding example. Link both from the app's main nav or footer. Defer to Phase 8 (deploy) so the docs reference the real production URL.
