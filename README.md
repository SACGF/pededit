# PedEdit - the Pedigree Editor

A web-based pedigree editor for clinical genetics, genetic counseling, and medical research.

## Why we built this

Every open-source pedigree tool makes the same trade-off: simple layout or correct layout, but not both — and none support drag-and-drop repositioning of nodes. Tools like [pedigreejs](https://github.com/nicpottier/pedigreejs) and [DrawPed](https://github.com/aehrc/DrawPed) produce clean diagrams for straightforward families but struggle with complex structures (multiple partnerships, consanguinity loops, cross-generational matings). The only tool with manual repositioning is FamGenix, a $500+/year commercial product.

The root of the layout problem is that good pedigree layout is a solved problem in academic statistics — the [kinship2](https://cran.r-project.org/package=kinship2) R package has been the reference implementation for over a decade, used in published clinical research worldwide. But kinship2 is R-only, so no web tool has ever been able to use it. We ported the full kinship2 layout algorithm into TypeScript (`layout-engine/`), making it available as a native npm package for the first time. This gives us publication-quality automatic layout as the foundation, on top of which we can layer modern React interaction — including the drag-and-drop repositioning that no open-source tool has managed to ship.

## Prerequisites

- Node.js 20+
- Python 3.10+
- PostgreSQL 14+
- [uv](https://docs.astral.sh/uv/)

## Setup

### 1. Install Node dependencies

```bash
npm install
```

### 2. Create the database

```bash
sudo -u postgres psql -c "CREATE USER peded WITH PASSWORD 'peded';"
sudo -u postgres psql -c "CREATE DATABASE peded OWNER peded;"
```

### 3. Set up the backend

```bash
cd backend/
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
python manage.py migrate
```

### 4. (Optional) Create a superuser for the Django admin

```bash
cd backend/
source .venv/bin/activate
python manage.py createsuperuser
```

## Running

Start both servers in separate terminals:

**Backend** (from `backend/`):
```bash
source .venv/bin/activate
python manage.py runserver
```

**Frontend** (from repo root):
```bash
npm run dev:frontend
```

Then open `http://localhost:5173`. You'll be redirected to `/login` — register an account via the API or the Django admin, then sign in.

To register an account from the command line:
```bash
curl -s -X POST http://localhost:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{"username":"you","email":"you@example.com","password":"yourpassword"}'
```

## Development

```bash
# Run layout engine tests
npm run test:layout

# Type-check the frontend
npm -w @pedigree-editor/frontend run typecheck
```

## Production deployment

See [INSTALL.md](INSTALL.md) for step-by-step instructions to deploy on Ubuntu 24.04 with Nginx, Gunicorn, and PostgreSQL.

## Project structure

```
peded/
├── layout-engine/   # TypeScript layout algorithm (npm workspace)
├── backend/         # Django + DRF API
└── frontend/        # Vite + React + TypeScript
```
