# PedEd - the Pedigree Editor

A web-based pedigree editor for clinical genetics, genetic counseling, and medical research.

## Prerequisites

- Node.js 20+
- Python 3.10+
- PostgreSQL 14+

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
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
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

## Project structure

```
peded/
├── layout-engine/   # TypeScript layout algorithm (npm workspace)
├── backend/         # Django + DRF API
└── frontend/        # Vite + React + TypeScript
```
