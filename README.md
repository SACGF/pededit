# PedEdit - the Pedigree Editor

A web-based pedigree editor for clinical genetics, genetic counseling, and medical research.

**Live at [pededit.com](https://pededit.com)**

## Why we built this

Existing browser-based pedigree editors use simple tree layouts that break down with consanguinity, multiple mates, and complex family structures. The correct algorithms exist in R packages like [kinship2](https://cran.r-project.org/package=kinship2), but those aren't interactive web tools.

We ported kinship2's layout engine to TypeScript, giving us publication-quality automatic layout natively in the browser. Then we built an interactive editor on top of it, with drag-and-drop repositioning that even most commercial tools don't offer.

## Prerequisites

- Node.js 20+
- Python 3.10+
- [uv](https://docs.astral.sh/uv/)
- PostgreSQL 14+ (optional for local development, SQLite works too)

## Setup

### 1. Install Node dependencies

Run this from the repo root, not from `frontend/`. The root is an npm workspace that also contains `layout-engine/`.

```bash
npm install
```

Run it again after every `git pull`. If `npm run dev:frontend` fails with `Cannot find module` or `Failed to resolve dependency`, your `node_modules` is out of date.

### 2. Create the application config

The backend reads its configuration from `/etc/pededit/pededit.json` and will not start without it. For local development SQLite is the simplest database (run this from the repo root so `$PWD` is right):

```bash
sudo mkdir -p /etc/pededit
sudo tee /etc/pededit/pededit.json > /dev/null <<EOF
{
  "database_url": "sqlite:///$PWD/backend/db.sqlite3",
  "allowed_hosts": ["localhost", "127.0.0.1"],
  "cors_allowed_origins": ["http://localhost:5173"],
  "debug": true
}
EOF
```

To use PostgreSQL instead, create the database and set `database_url` to `postgres://pededit:pededit@localhost:5432/pededit`:

```bash
sudo -u postgres psql -c "CREATE USER pededit WITH PASSWORD 'pededit';"
sudo -u postgres psql -c "CREATE DATABASE pededit OWNER pededit;"
```

Google and GitHub sign-in are optional: add `google_client_id`, `github_client_id` and `github_client_secret` to the config to enable them. Without them everything works except "Your pedigrees" and "My library" of conditions and tags.

### 3. Set up the backend

```bash
cd backend/
uv venv
uv pip install -r requirements.txt
.venv/bin/python manage.py migrate
```

### 4. (Optional) Create a superuser for the Django admin

```bash
cd backend/
.venv/bin/python manage.py createsuperuser
```

## Running

Start both servers in separate terminals:

**Backend** (from `backend/`):
```bash
.venv/bin/python manage.py runserver
```

**Frontend** (from repo root):
```bash
npm run dev:frontend
```

Then open `http://localhost:5173`. No account is needed: create a pedigree and keep its `/p/<id>` link. Vite proxies `/api` to Django on port 8000.

## Development

```bash
# Layout engine tests
npm run test:layout

# Frontend tests
npm run test:frontend

# Type-check the frontend
npm -w @pedigree-editor/frontend run typecheck

# Backend tests (from backend/)
.venv/bin/python manage.py test api
```

To check a frontend change in a headless browser (JS errors mapped to source lines, screenshots), see [frontend/scripts/browser/README.md](frontend/scripts/browser/README.md).

## File formats

Pedigrees can be downloaded as a lossless JSON document and imported again. The format, including every field of the data model and a worked example, is documented in [docs/pedigree-json-format.md](docs/pedigree-json-format.md), with a JSON Schema in [docs/pedigree-json-schema.json](docs/pedigree-json-schema.json). PED (lossy), CSV, SVG, PNG and PDF export are also available from the toolbar.

## Production deployment

See [INSTALL.md](INSTALL.md) for step-by-step instructions to deploy on Ubuntu 24.04 with Nginx, Gunicorn, and PostgreSQL.

## Project structure

```
pededit/
├── layout-engine/   # TypeScript layout algorithm (npm workspace)
├── backend/         # Django + DRF API
└── frontend/        # Vite + React + TypeScript
```

## Licence

PedEdit is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version (`AGPL-3.0-or-later`). The full text is in [LICENSE](LICENSE). The AGPL is a copyleft licence: if you run a modified version as a service over a network, you must offer its users the source.

The layout engine in `layout-engine/`, published to npm on its own, is licensed under the GNU General Public License, version 3 or (at your option) any later version (`GPL-3.0-or-later`), with the text in [layout-engine/LICENSE](layout-engine/LICENSE).

The layout engine is a translation into TypeScript of the layout algorithm of the [kinship2](https://cran.r-project.org/package=kinship2) R package, copyright its authors and licensed GPL (version 2 or later). The code derived from it is used under version 3 of the GPL, which allows it to be combined with work under the AGPL (section 13 of both licences). If you publish figures laid out with PedEdit, please cite:

> Sinnwell JP, Therneau TM, Schaid DJ. The kinship2 R package for pedigree data. Human Heredity. 2014;78(2):91-93. doi:10.1159/000363105
