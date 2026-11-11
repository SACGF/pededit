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
  only validates the known fields; `PedigreeDataField` then stores the
  submitted JSON untouched, so unknown fields survive and absent optional
  fields stay absent (the JSON format promises this). Never switch back to
  storing `validated_data`: DRF drops undeclared keys and fills defaults,
  which lost `lifeStatus` on every save. Still add new `types.ts` fields to
  the serializer so they get validated.
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
  slated for removal (#51).

## URLs

`peded/urls.py` mounts admin, the simplejwt token views, and `api/urls.py`
(health, pedigrees, tag-presets, auth/me, auth/google, auth/github,
auth/register).

`GET /api/health/` (`api/health.py`, #50) has `authentication_classes = []`
on purpose: with the default JWT authentication a stale token in the request
would turn a healthy app into a 401. It is the URL uptime monitoring polls,
so anything added to it must be cheap and must mean "users are affected" when
it fails.

- It fails on low disk space (`HEALTH_DISK_PATHS`, `HEALTH_DISK_MIN_FREE_MB`,
  from the site config) because `SELECT 1` keeps passing on a full disk while
  every save fails.
- The version is the git commit (`peded/version.py`, cached at import,
  `PEDEDIT_VERSION` overrides). It is returned only when `REMOTE_ADDR` is
  loopback and the request carries no proxy headers, which is `deploy.sh`
  asking Gunicorn directly. Do not put it back in the public answer: the repo
  is public, so a commit tells a scanner which fixes a server is missing. The
  Django test client counts as local; pass `HTTP_X_FORWARDED_PROTO` to test
  the public answer.
- It has its own `head()`. Monitors send `HEAD`, and without it Django runs
  `get()` and Gunicorn logs a warning about the dropped body on every poll.
- Errors and free-space figures are logged, never returned.
  `settings.LOGGING` filters the check out of runserver's request log;
  production does the same in `deploy/gunicorn.conf.py` and the Nginx vhost.

`manage.py usage_stats [--days N] [--json]` (#78) prints signed-in users and
signed-in vs anonymous pedigrees created and edited in the window; `deploy.sh`
runs it at the end. Social login never sets `User.last_login`, so "active
users" means owners of a pedigree touched in the window, and anonymous users
can only be counted as pedigrees. `claude_agent` is excluded.

Static files are served under `djstatic/` so they do not collide with the
Vite build.
