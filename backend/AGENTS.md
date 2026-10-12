# backend/ — agent notes

Django 5 + Django REST Framework + simplejwt. Project package is `peded/`,
the single app is `api/`.

## Running

```
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver 8000
.venv/bin/python manage.py test api
```

Use `uv` for environment work (`uv venv`, `uv pip install -r requirements.txt`),
never pip directly. Config is read from `/etc/pededit/pededit.json` by
`site_config.py` (database_url, cors_allowed_origins, allowed_hosts, debug,
google_client_id, github_client_id, github_client_secret). The file must exist
or Django will not start. A SQLite `database_url` is fine for local dev. The
secret key is generated into `backend/secret_key.txt` on first run if not
supplied.

## Data model (`api/models.py`)

- `Pedigree` — UUID primary key, nullable `owner`, `title`, `data` JSONField
  that mirrors `layout-engine/src/types.ts` exactly. `PedigreeDataSerializer`
  validates the shape; keep it in sync with `types.ts` or saves will drop
  fields (this has bitten us before, see commit d7c71b5).
- `TagPreset` — a signed-in user's reusable tag library. Pedigrees always
  carry their own copy of tags, so presets are a convenience only.

## Access rules (`api/views.py`)

- `owner=None` pedigrees are **anonymous**. Anyone who knows the UUID can
  read, update or delete them. This is deliberate: it is how the no-account
  mode works. The UUID is the capability.
- `GET /api/pedigrees/` (list) requires auth and returns only owned ones.
- Create without a token makes an anonymous pedigree; with a token it is
  owned.
- `/api/tag-presets/` is auth only and scoped to the owner.

## Auth

- JWT access tokens live 15 minutes, refresh tokens 7 days and rotate.
- `api/social_auth.py` — Google (ID token verified server-side) and GitHub
  (code exchange) both find-or-create a Django user by email and return a
  token pair.
- `auth/register/` and `auth/token/` (username + password) are legacy and
  slated for removal (Phase 9).

## URLs

`peded/urls.py` mounts admin, the simplejwt token views, and `api/urls.py`
(pedigrees, tag-presets, auth/me, auth/google, auth/github, auth/register).
Static files are served under `djstatic/` so they do not collide with the
Vite build.
