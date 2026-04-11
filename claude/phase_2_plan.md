# Phase 2 — Project Scaffold

**Goal:** Wire up the full stack with working but empty plumbing. End state: a user can register, log in, create/list/delete pedigrees, and see an empty React Flow canvas. No pedigree-specific rendering yet.

**Starting point:** `layout-engine/` exists and all 16 tests pass. Everything else (backend/, frontend/, root workspace) is new.

---

## 1. Repository layout after this phase

```
peded/                              ← git root
├── layout-engine/                  ← existing (Phase 1)
│   ├── src/
│   ├── tests/
│   ├── package.json                ← name: "@pedigree-editor/layout-engine"
│   └── tsconfig.json
├── backend/                        ← NEW: Django project root
│   ├── manage.py
│   ├── .env                        ← gitignored
│   ├── .env.example
│   ├── requirements.txt
│   ├── peded/                      ← Django project package
│   │   ├── __init__.py
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   └── api/                        ← DRF app
│       ├── __init__.py
│       ├── models.py
│       ├── serializers.py
│       ├── views.py
│       └── urls.py
├── frontend/                       ← NEW: Vite + React project
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── store/
│   │   │   └── useAppStore.ts
│   │   └── pages/
│   │       ├── LoginPage.tsx
│   │       └── CanvasPage.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── package.json                    ← NEW: npm workspace root
```

---

## 2. Monorepo wiring (npm workspaces)

### `/package.json` (workspace root — create this)

```json
{
  "name": "peded",
  "private": true,
  "workspaces": [
    "layout-engine",
    "frontend"
  ],
  "scripts": {
    "test:layout": "npm -w layout-engine run test",
    "dev:frontend": "npm -w frontend run dev"
  }
}
```

After this, running `npm install` from the repo root symlinks `layout-engine` into `frontend/node_modules/@pedigree-editor/layout-engine`. The frontend can then import from it like any npm package.

### How `frontend` imports `layout-engine`

In `frontend/package.json`, declare the dependency:

```json
{
  "dependencies": {
    "@pedigree-editor/layout-engine": "*"
  }
}
```

The `"*"` version resolves to the local workspace package. After `npm install` from root, this works:

```typescript
// In any frontend file:
import { alignPedigree } from "@pedigree-editor/layout-engine";
import type { Pedigree, LayoutResult } from "@pedigree-editor/layout-engine";
```

**Gotcha:** `layout-engine` uses `"type": "module"` and has no `"exports"` field. Add one so TypeScript and Vite can both resolve it:

Edit `layout-engine/package.json` to add:

```json
{
  "name": "@pedigree-editor/layout-engine",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  ...
}
```

Vite handles raw TypeScript imports from workspaces because it transpiles everything. No build step needed for layout-engine during development.

---

## 3. Backend: Django setup

### 3a. Python environment

```bash
cd backend/
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### `backend/requirements.txt`

```
django>=5.0,<6.0
djangorestframework>=3.15
djangorestframework-simplejwt>=5.3
django-cors-headers>=4.3
psycopg[binary]>=3.1
django-environ>=0.11
```

### 3b. Create Django project

```bash
django-admin startproject peded .   # run inside backend/
python manage.py startapp api
```

### 3c. `backend/.env`

```
SECRET_KEY=change-me-in-production-use-django-get-random-secret-key
DEBUG=True
DATABASE_URL=postgres://peded:peded@localhost:5432/peded
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

### `backend/.env.example`

```
SECRET_KEY=
DEBUG=True
DATABASE_URL=postgres://peded:peded@localhost:5432/peded
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

### 3d. `backend/peded/settings.py`

Replace the generated settings with:

```python
from datetime import timedelta
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    # Local
    "api",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",   # MUST be before CommonMiddleware
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "peded.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": env.db()   # reads DATABASE_URL
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── DRF ──────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,       # new refresh token on every refresh
    "BLACKLIST_AFTER_ROTATION": False,   # skip blacklist app for now
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
# Allow Authorization header (needed for JWT)
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "x-csrftoken",
]
```

### 3e. `backend/peded/urls.py`

```python
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    # App
    path("api/", include("api.urls")),
]
```

---

## 4. Pedigree model

### `backend/api/models.py`

The `data` JSONField stores the `Pedigree` interface from `layout-engine/src/types.ts` verbatim. An empty pedigree is `{"individuals": [], "partnerships": [], "parentOf": {}}`.

```python
import uuid
from django.db import models
from django.contrib.auth.models import User


class Pedigree(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="pedigrees")
    title = models.CharField(max_length=255, default="Untitled Pedigree")
    data = models.JSONField(
        default=dict,
        help_text=(
            "Serialised Pedigree: {individuals: Individual[], "
            "partnerships: Partnership[], parentOf: Record<string, string[]>}. "
            "Schema mirrors layout-engine/src/types.ts Pedigree interface."
        ),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated"]

    def __str__(self):
        return f"{self.title} ({self.owner.username})"
```

Run migrations:

```bash
python manage.py makemigrations api
python manage.py migrate
```

---

## 5. Serializers

### `backend/api/serializers.py`

The nested serializers validate that `data` matches the TypeScript `Pedigree` interface structure.

```python
from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Pedigree


# ── Auth ─────────────────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]


# ── Pedigree data shape (mirrors types.ts) ────────────────────────────────────

class IndividualSerializer(serializers.Serializer):
    id = serializers.CharField()
    sex = serializers.ChoiceField(choices=["male", "female", "unknown"])
    affected = serializers.BooleanField()
    deceased = serializers.BooleanField(required=False, default=False)
    carrier = serializers.BooleanField(required=False, default=False)
    proband = serializers.BooleanField(required=False, default=False)


class PartnershipSerializer(serializers.Serializer):
    id = serializers.CharField()
    individual1 = serializers.CharField()
    individual2 = serializers.CharField()
    consanguineous = serializers.BooleanField(required=False, default=False)


class PedigreeDataSerializer(serializers.Serializer):
    individuals = IndividualSerializer(many=True)
    partnerships = PartnershipSerializer(many=True)
    parentOf = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField())
    )


# ── Pedigree model serializer ─────────────────────────────────────────────────

class PedigreeSerializer(serializers.ModelSerializer):
    data = PedigreeDataSerializer()

    class Meta:
        model = Pedigree
        fields = ["id", "title", "data", "created", "updated"]
        read_only_fields = ["id", "created", "updated"]

    def create(self, validated_data):
        validated_data["owner"] = self.context["request"].user
        return super().create(validated_data)


class PedigreeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list endpoint — omits data payload."""

    class Meta:
        model = Pedigree
        fields = ["id", "title", "created", "updated"]
```

---

## 6. Views and URL routing

### `backend/api/views.py`

```python
from django.contrib.auth.models import User
from rest_framework import generics, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Pedigree
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    PedigreeSerializer,
    PedigreeListSerializer,
)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class PedigreeViewSet(viewsets.ModelViewSet):
    """
    list:   GET  /api/pedigrees/          → PedigreeListSerializer (no data field)
    create: POST /api/pedigrees/          → PedigreeSerializer
    retrieve: GET /api/pedigrees/{id}/   → PedigreeSerializer
    partial_update: PATCH /api/pedigrees/{id}/
    destroy: DELETE /api/pedigrees/{id}/
    """
    serializer_class = PedigreeSerializer

    def get_queryset(self):
        return Pedigree.objects.filter(owner=self.request.user)

    def get_serializer_class(self):
        if self.action == "list":
            return PedigreeListSerializer
        return PedigreeSerializer
```

### `backend/api/urls.py`

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RegisterView, MeView, PedigreeViewSet

router = DefaultRouter()
router.register(r"pedigrees", PedigreeViewSet, basename="pedigree")

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("", include(router.urls)),
]
```

### API endpoint contract (summary for frontend)

| Method | URL | Auth | Body | Response |
|--------|-----|------|------|----------|
| POST | `/api/auth/register/` | none | `{username, email, password}` | `{id, username, email}` |
| POST | `/api/auth/token/` | none | `{username, password}` | `{access, refresh}` |
| POST | `/api/auth/token/refresh/` | none | `{refresh}` | `{access, refresh}` |
| GET | `/api/auth/me/` | Bearer | — | `{id, username, email}` |
| GET | `/api/pedigrees/` | Bearer | — | `[{id, title, created, updated}]` |
| POST | `/api/pedigrees/` | Bearer | `{title, data}` | full Pedigree object |
| GET | `/api/pedigrees/{uuid}/` | Bearer | — | full Pedigree object |
| PATCH | `/api/pedigrees/{uuid}/` | Bearer | partial `{title?, data?}` | full Pedigree object |
| DELETE | `/api/pedigrees/{uuid}/` | Bearer | — | 204 No Content |

All responses use `application/json`. All authenticated endpoints return 401 if the Bearer token is missing or expired.

---

## 7. Dev database setup

```bash
# Create postgres user and DB (run once)
psql -U postgres -c "CREATE USER peded WITH PASSWORD 'peded';"
psql -U postgres -c "CREATE DATABASE peded OWNER peded;"
```

Then:

```bash
cd backend/
python manage.py migrate
python manage.py createsuperuser   # optional, for admin
```

---

## 8. Backend smoke test (manual curl)

```bash
# Register
curl -s -X POST http://localhost:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"testpass1"}' | python -m json.tool

# Get tokens
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"testpass1"}' | python -c "import sys,json; print(json.load(sys.stdin)['access'])")

# Create pedigree
curl -s -X POST http://localhost:8000/api/pedigrees/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Family","data":{"individuals":[],"partnerships":[],"parentOf":{}}}' | python -m json.tool

# List pedigrees
curl -s http://localhost:8000/api/pedigrees/ \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

---

## 9. Frontend: Vite project setup

### Create project

```bash
# From repo root:
npm create vite@latest frontend -- --template react-ts
cd frontend/
```

### `frontend/package.json`

Replace the Vite-generated one with:

```json
{
  "name": "@pedigree-editor/frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pedigree-editor/layout-engine": "*",
    "@xyflow/react": "^12.0.0",
    "axios": "^1.7.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.5.3",
    "vite": "^5.3.4"
  }
}
```

From the repo root, run `npm install` to install everything and link the workspace packages.

### Tailwind + PostCSS

```bash
cd frontend/
npx tailwindcss init -p   # creates tailwind.config.js + postcss.config.js
```

`frontend/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Add to `frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### shadcn/ui

```bash
cd frontend/
npx shadcn@latest init
```

When prompted: style = Default, base color = Slate, CSS variables = yes.

Then add the initial components needed for auth UI:

```bash
npx shadcn@latest add button input label card
```

### `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Gotcha — strict mode:** `"strict": true` means `null` / `undefined` must be handled explicitly. This will surface in the Zustand store and API response types. Use `T | null` not `T | undefined` for optional store fields and initialise them to `null` explicitly.

### `frontend/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /api calls to Django during development
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

**Gotcha — CORS vs proxy:** With the Vite proxy in place, browser requests go to `localhost:5173/api/...` and Vite forwards them to `localhost:8000/api/...` without CORS headers being involved. This means in development you do NOT need `CORS_ALLOWED_ORIGINS` to be set at all. Set it anyway so the backend config is correct for production. The proxy also means the API client can use relative URLs (`/api/...`) in development.

---

## 10. API client

### `frontend/src/api/client.ts`

```typescript
import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, try to refresh the token once
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) {
        // No refresh token — force logout
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        return Promise.reject(error);
      }
      try {
        const { data } = await axios.post("/api/auth/token/refresh/", { refresh });
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);
        original.headers.Authorization = `Bearer ${data.access}`;
        return apiClient(original);
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth endpoints ────────────────────────────────────────────────────────────

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
}

export interface PedigreeMeta {
  id: string;
  title: string;
  created: string;
  updated: string;
}

export interface PedigreePayload {
  id: string;
  title: string;
  data: {
    individuals: unknown[];
    partnerships: unknown[];
    parentOf: Record<string, string[]>;
  };
  created: string;
  updated: string;
}

export const authApi = {
  register: (username: string, email: string, password: string) =>
    apiClient.post<UserInfo>("/auth/register/", { username, email, password }),

  login: (username: string, password: string) =>
    apiClient.post<TokenPair>("/auth/token/", { username, password }),

  me: () => apiClient.get<UserInfo>("/auth/me/"),
};

export const pedigreeApi = {
  list: () => apiClient.get<PedigreeMeta[]>("/pedigrees/"),

  get: (id: string) => apiClient.get<PedigreePayload>(`/pedigrees/${id}/`),

  create: (title: string) =>
    apiClient.post<PedigreePayload>("/pedigrees/", {
      title,
      data: { individuals: [], partnerships: [], parentOf: {} },
    }),

  update: (id: string, patch: { title?: string; data?: unknown }) =>
    apiClient.patch<PedigreePayload>(`/pedigrees/${id}/`, patch),

  delete: (id: string) => apiClient.delete(`/pedigrees/${id}/`),
};
```

**Gotcha — token storage:** `localStorage` is used here because it is the simplest approach for a dev scaffold. It is vulnerable to XSS. Phase 2's goal is plumbing correctness, not production security hardening. When hardening for production: switch to `httpOnly` cookies (requires Django `SESSION_COOKIE_HTTPONLY = True`, SameSite settings, and backend changes to set cookies on token endpoints), remove the `localStorage` calls, and remove the Authorization header interceptor (cookie is sent automatically).

---

## 11. Zustand store

### `frontend/src/store/useAppStore.ts`

```typescript
import { create } from "zustand";
import { authApi, pedigreeApi, PedigreeMeta, UserInfo } from "../api/client";
import type { Pedigree } from "@pedigree-editor/layout-engine";

interface AppState {
  // ── Auth ───────────────────────────────────────────────────────────────────
  user: UserInfo | null;
  isAuthenticated: boolean;

  // ── Pedigree list ──────────────────────────────────────────────────────────
  pedigrees: PedigreeMeta[];

  // ── Active pedigree ────────────────────────────────────────────────────────
  activePedigreeId: string | null;
  activePedigree: Pedigree | null;
  isDirty: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  loadPedigrees: () => Promise<void>;
  openPedigree: (id: string) => Promise<void>;
  createPedigree: (title: string) => Promise<string>; // returns new id
  deletePedigree: (id: string) => Promise<void>;
  markDirty: () => void;
  saveActivePedigree: () => Promise<void>;
}

export const useAppStore = create<AppState>()((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem("access_token"),
  pedigrees: [],
  activePedigreeId: null,
  activePedigree: null,
  isDirty: false,

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    set({ isAuthenticated: true });
    await get().fetchMe();
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, isAuthenticated: false, pedigrees: [], activePedigree: null, activePedigreeId: null });
  },

  fetchMe: async () => {
    const { data } = await authApi.me();
    set({ user: data });
  },

  loadPedigrees: async () => {
    const { data } = await pedigreeApi.list();
    set({ pedigrees: data });
  },

  openPedigree: async (id) => {
    const { data } = await pedigreeApi.get(id);
    set({
      activePedigreeId: id,
      activePedigree: data.data as Pedigree,
      isDirty: false,
    });
  },

  createPedigree: async (title) => {
    const { data } = await pedigreeApi.create(title);
    set((state) => ({ pedigrees: [data, ...state.pedigrees] }));
    return data.id;
  },

  deletePedigree: async (id) => {
    await pedigreeApi.delete(id);
    set((state) => ({
      pedigrees: state.pedigrees.filter((p) => p.id !== id),
      activePedigreeId: state.activePedigreeId === id ? null : state.activePedigreeId,
      activePedigree: state.activePedigreeId === id ? null : state.activePedigree,
    }));
  },

  markDirty: () => set({ isDirty: true }),

  saveActivePedigree: async () => {
    const { activePedigreeId, activePedigree } = get();
    if (!activePedigreeId || !activePedigree) return;
    await pedigreeApi.update(activePedigreeId, { data: activePedigree });
    set({ isDirty: false });
  },
}));
```

---

## 12. React Router + pages

### `frontend/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

### `frontend/src/App.tsx`

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { useAppStore } from "./store/useAppStore";
import LoginPage from "./pages/LoginPage";
import CanvasPage from "./pages/CanvasPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <CanvasPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

### `frontend/src/pages/LoginPage.tsx`

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const login = useAppStore((s) => s.login);
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### `frontend/src/pages/CanvasPage.tsx`

```tsx
import { useEffect } from "react";
import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";

export default function CanvasPage() {
  const { user, pedigrees, loadPedigrees, createPedigree, openPedigree, logout } = useAppStore();

  useEffect(() => {
    loadPedigrees();
  }, [loadPedigrees]);

  const handleNew = async () => {
    const id = await createPedigree("Untitled Pedigree");
    await openPedigree(id);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 border-r bg-white flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">{user?.username}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <Button size="sm" className="w-full mb-3" onClick={handleNew}>
            New pedigree
          </Button>
          <ul className="space-y-1">
            {pedigrees.map((p) => (
              <li key={p.id}>
                <button
                  className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 truncate"
                  onClick={() => openPedigree(p.id)}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
```

**Gotcha — React Flow CSS:** The `@xyflow/react/dist/style.css` import is required. Without it the controls and minimap render unstyled and the canvas background is broken.

**Gotcha — React Flow v12:** `@xyflow/react` (v12+) requires React 18 and uses the new `ReactFlow` export from `@xyflow/react`, not the older `reactflow` package. Do not install the `reactflow` package — it is the old v11 name. The import is `import { ReactFlow } from "@xyflow/react"`.

---

## 13. Build order (implement in this sequence)

Each step is independently testable before moving on.

### Step 1 — npm workspace root

Create `/package.json` with workspaces. Run `npm install` from repo root. Verify `node_modules/@pedigree-editor/layout-engine` is a symlink to `layout-engine/`.

**Test:** `npm -w layout-engine run test` passes (16 tests, same as Phase 1).

### Step 2 — layout-engine exports field

Add `"main"` and `"exports"` to `layout-engine/package.json` as shown in §2.

**Test:** In a scratch `frontend/src/test-import.ts` (delete after), confirm `import type { Pedigree } from "@pedigree-editor/layout-engine"` does not produce a TS error.

### Step 3 — Django project skeleton

Create `backend/`, install requirements, configure `settings.py` and `urls.py`. Do not create the `api` app yet.

**Test:** `python manage.py check` passes with no errors.

### Step 4 — Database + Pedigree model

Create the `api` app, add `models.py`, run `makemigrations` and `migrate`.

**Test:** `python manage.py shell -c "from api.models import Pedigree; print(Pedigree._meta.db_table)"` prints `api_pedigree`.

### Step 5 — Auth endpoints

Add `serializers.py` (RegisterSerializer only), `views.py` (RegisterView only), wire `api/urls.py` and `peded/urls.py`.

**Test:** `curl -X POST http://localhost:8000/api/auth/register/ -H "Content-Type: application/json" -d '{"username":"u","email":"u@x.com","password":"testpass1"}'` returns `{"id":1,"username":"u","email":"u@x.com"}`.

### Step 6 — JWT token endpoints

simplejwt's `TokenObtainPairView` and `TokenRefreshView` are already wired in `peded/urls.py`.

**Test:** POST to `/api/auth/token/` with the registered credentials returns `{access, refresh}`.

### Step 7 — Pedigree CRUD

Add `PedigreeSerializer`, `PedigreeViewSet`, and wire the router.

**Test:** Use the curl smoke test sequence from §8 — create a pedigree, list it, PATCH the title, DELETE it, confirm the list is empty.

### Step 8 — Vite frontend project

Create `frontend/` with the package.json from §9. Run `npm install` from repo root. Confirm Tailwind and shadcn/ui init complete without errors.

**Test:** `npm -w frontend run dev` starts with no compilation errors. `http://localhost:5173` loads a blank page.

### Step 9 — API client

Add `frontend/src/api/client.ts`.

**Test:** TypeScript compiles (`npm -w frontend run typecheck`). No errors.

### Step 10 — Zustand store

Add `frontend/src/store/useAppStore.ts`.

**Test:** TypeScript compiles. No errors.

### Step 11 — Auth pages and routing

Add `main.tsx`, `App.tsx`, `LoginPage.tsx`. Run dev server.

**Test:** Navigating to `http://localhost:5173` redirects to `/login`. Entering the credentials registered in Step 5 logs in successfully and redirects to `/`. Network tab shows a POST to `/api/auth/token/` returning 200.

### Step 12 — Canvas page

Add `CanvasPage.tsx`.

**Test (golden path):** Log in → click "New pedigree" → pedigree appears in the sidebar list → React Flow canvas renders (grey grid background, controls bottom-left, minimap bottom-right) → no console errors.

**Test (persistence):** Refresh the page while logged in → `isAuthenticated` is true (from localStorage) → `loadPedigrees` fires → the pedigree created in the previous test is listed.

---

## 14. Key gotchas consolidated

| Gotcha | Details |
|--------|---------|
| CORS middleware order | `CorsMiddleware` must be the **first** entry in `MIDDLEWARE`. If it's below `SecurityMiddleware` or `CommonMiddleware`, preflight OPTIONS requests get rejected before the CORS headers are added. |
| Vite proxy vs CORS | The Vite dev proxy makes CORS irrelevant in development — browser only sees `localhost:5173`. Still configure `CORS_ALLOWED_ORIGINS` in Django for when the frontend is served separately (production, staging). |
| JWT header format | simplejwt expects `Authorization: Bearer <token>`. The `AUTH_HEADER_TYPES = ("Bearer",)` setting must match exactly what the frontend sends. |
| React Flow package name | v12+ is `@xyflow/react`, not `reactflow`. The CSS import is mandatory. `<ReactFlow>` must receive `nodes` and `edges` props (can be empty arrays). |
| TypeScript strict + Zustand | With `strict: true`, Zustand's `create<AppState>()` requires the generic. The state type must have no implicit `any`. Use `unknown` for untyped JSON payloads from the API, then cast when needed. |
| layout-engine imports in frontend | Vite resolves workspace symlinks and transpiles `.ts` files directly — no build step for layout-engine during development. The `"exports"` field in layout-engine's package.json is required for TypeScript to resolve the types. |
| UUID primary keys | The Pedigree model uses `UUIDField` as primary key. DRF's router generates URLs like `/api/pedigrees/3fa85f64-5717-4562-b3fc-2c963f66afa6/`. The frontend must treat IDs as strings, not numbers. |
| Token refresh race condition | The axios interceptor in §10 handles one concurrent 401 retry, but if multiple requests fire simultaneously and all get 401, they each try to refresh. For Phase 2 this is acceptable. A proper fix (queue concurrent refreshes behind a single promise) can be deferred to Phase 4 when the app has real concurrency. |
