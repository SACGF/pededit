# Installation

## Development Setup

### Prerequisites

- Node.js 20+
- Python 3.10+
- PostgreSQL 14+
- [uv](https://docs.astral.sh/uv/)

### 1. Install Node dependencies

```bash
npm install
```

### 2. Create the database

```bash
sudo -u postgres psql -c "CREATE USER pededit WITH PASSWORD 'pededit';"
sudo -u postgres psql -c "CREATE DATABASE pededit OWNER pededit;"
```

### 3. Create the application config

The backend reads its configuration from `/etc/pededit/pededit.json`:

```bash
sudo mkdir -p /etc/pededit
sudo tee /etc/pededit/pededit.json > /dev/null <<'EOF'
{
  "database_url": "postgres://pededit:pededit@localhost:5432/pededit",
  "allowed_hosts": ["localhost", "127.0.0.1"],
  "cors_allowed_origins": ["http://localhost:5173"],
  "debug": true
}
EOF
```

### 4. Set up the backend

```bash
cd backend/
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
python manage.py migrate
```

### 5. (Optional) Create a superuser for the Django admin

```bash
cd backend/
source .venv/bin/activate
python manage.py createsuperuser
```

### Running

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

Then open `http://localhost:5173`.

**Sign-in options:**

- **Google / GitHub:** Add the client IDs to `/etc/pededit/pededit.json` (see the example config), then create a `frontend/.env.local` with your client IDs:
  ```
  VITE_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
  VITE_GITHUB_CLIENT_ID=your-github-client-id
  ```
  For Google, add `http://localhost:5173` to "Authorized JavaScript origins" in the Google Cloud Console.
  For GitHub, set the callback URL to `http://localhost:5173/auth/github/callback`.

- **Username/password:** Register an account via the API or Django admin:
  ```bash
  curl -s -X POST http://localhost:8000/api/auth/register/ \
    -H "Content-Type: application/json" \
    -d '{"username":"you","email":"you@example.com","password":"yourpassword"}'
  ```

---

# Production Deployment on Ubuntu 24.04

This guide deploys PedEdit on a single Ubuntu 24.04 server with:

- **Nginx** — reverse proxy, serves the frontend SPA and Django static files
- **Gunicorn** — WSGI server for the Django API
- **PostgreSQL** — database
- **systemd** — process management
- **Let's Encrypt** — TLS (optional but recommended)

All config files referenced below live in the `deploy/` directory:

```
deploy/
├── pededit.json.example   # App config → /etc/pededit/pededit.json
├── pededit.service         # systemd unit → /etc/systemd/system/pededit.service
└── pededit-nginx.conf      # Nginx vhost → /etc/nginx/sites-available/pededit
```

Architecture:

```
Internet → Nginx (443/80)
  ├── /           → Vite build output (static SPA)
  ├── /api/       → proxy to Gunicorn (127.0.0.1:8000)
  ├── /admin/     → proxy to Gunicorn (127.0.0.1:8000)
  └── /djstatic/  → Django admin static files
```

No Node.js process runs in production. Node is only needed at build time to produce the frontend bundle. The only long-running process is Gunicorn serving the Django API.

## 1. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx postgresql postgresql-contrib \
  python3 python3-dev libpq-dev git build-essential curl
```

### Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify: `node -v` should print `v20.x.x`.

### Install uv (Python package manager)

```bash
sudo snap install astral-uv --classic
```

## 2. Create a system user

Run the application as a dedicated unprivileged user:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin pededit
```

## 3. PostgreSQL

```bash
sudo -u postgres createuser pededit
sudo -u postgres createdb -O pededit pededit
sudo -u postgres psql -c "ALTER USER pededit WITH PASSWORD 'pededit';"
```

Use a real password in production. The example config in `deploy/pededit.json.example` uses `pededit:pededit` to match the above.

## 4. Clone and build

```bash
sudo git clone https://github.com/SACGF/pededit.git /opt/pededit
sudo chown -R pededit:pededit /opt/pededit
cd /opt/pededit
```

### Install Node dependencies and build the frontend

If you've configured Google or GitHub sign-in (see step 5), pass the client IDs as environment variables at build time:

```bash
cd /opt/pededit
sudo -u pededit npm ci
sudo -u pededit \
  VITE_GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com" \
  VITE_GITHUB_CLIENT_ID="your-github-client-id" \
  npm -w @pedigree-editor/frontend run build
```

If you don't set these, the social sign-in buttons simply won't appear — username/password login still works.

This produces the SPA bundle in `frontend/dist/`.

### Set up the Python environment

```bash
cd /opt/pededit/backend
sudo -u pededit uv venv
sudo -u pededit uv pip install --python .venv/bin/python -r requirements.txt
sudo -u pededit uv pip install --python .venv/bin/python gunicorn
```

## 5. Application config

Copy the example config and edit it:

```bash
sudo mkdir -p /etc/pededit
sudo cp /opt/pededit/deploy/pededit.json.example /etc/pededit/pededit.json
sudo chown root:pededit /etc/pededit/pededit.json
sudo chmod 640 /etc/pededit/pededit.json
sudo nano /etc/pededit/pededit.json
```

At minimum, change `allowed_hosts` and `cors_allowed_origins` to your actual domain. If you used a different database password in step 3, update `database_url` too.

The `secret_key` field is optional — if omitted, one is auto-generated and saved to `backend/secret_key.txt` on first run. You can also set the `DJANGO_SECRET_KEY` environment variable.

### Run migrations and collect static files

```bash
cd /opt/pededit/backend
sudo -u pededit .venv/bin/python manage.py migrate
sudo -u pededit .venv/bin/python manage.py collectstatic --noinput
```

The Django static files (admin CSS/JS) will be collected to `backend/staticfiles/`.

### (Optional) Create a superuser for Django admin

Only needed if you want access to the Django admin panel at `/admin/`. Not required for normal use — users register through the app.

```bash
sudo -u pededit .venv/bin/python manage.py createsuperuser
```

## 6. Gunicorn systemd service

Install the service file:

```bash
sudo cp /opt/pededit/deploy/pededit.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pededit
```

Verify it started:

```bash
sudo systemctl status pededit
curl -s http://127.0.0.1:8000/api/health/
```

The health check answers `{"status": "ok", "database": "ok", "disk": "ok", "version": "<git commit>"}` with 200. It answers 503 when the database round trip fails (`"database": "unavailable"`) or a disk is nearly full (`"disk": "low"`). It needs no token and is not rate limited, and Nginx and Gunicorn keep it out of their access logs (`deploy/pededit-nginx.conf`, `deploy/gunicorn.conf.py`). See step 11 for pointing a monitor at it.

`version` is only in the answer when you ask on the box as above. Through Nginx it is left out: the code is public, so a commit would tell anyone which fixes a server is missing.

The disk check fails when `/` or `/var/lib/postgresql` has less than 1024 MB free. A full disk does not stop Postgres answering reads, so without it the check would stay green while every save fails. To change the floor or the filesystems, add `"health_disk_min_free_mb"` or `"health_disk_paths"` (a list) to `/etc/pededit/pededit.json`. Do that if Postgres keeps its data on another volume.

If something is wrong, check the logs:

```bash
sudo journalctl -u pededit -f
```

### How many workers?

The default in the service file is 3 workers, which is good for a 1-2 core VPS. The rule of thumb is `(2 x CPU cores) + 1`. To change it, edit the service file:

```bash
sudo systemctl edit pededit
```

This opens an override file. Add:

```ini
[Service]
ExecStart=
ExecStart=/opt/pededit/backend/.venv/bin/gunicorn \
  peded.wsgi:application \
  -c /opt/pededit/deploy/gunicorn.conf.py \
  --bind 127.0.0.1:8000 \
  --workers 9 \
  --timeout 30 \
  --access-logfile - \
  --error-logfile -
```

Then `sudo systemctl daemon-reload && sudo systemctl restart pededit`.

## 7. Nginx

Install the vhost config:

```bash
sudo cp /opt/pededit/deploy/pededit-nginx.conf /etc/nginx/sites-available/pededit
sudo nano /etc/nginx/sites-available/pededit
```

Change `server_name your-domain.example.com` to your actual domain (or your server's IP if you don't have a domain yet).

Enable the site and remove the default:

```bash
sudo ln -sf /etc/nginx/sites-available/pededit /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

At this point you should be able to visit `http://your-domain.example.com` and see the app.

## 8. HTTPS with Let's Encrypt (recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com
```

Certbot will modify the Nginx config to add TLS and set up auto-renewal. After this, update your config to use `https://` in `cors_allowed_origins`:

```bash
sudo nano /etc/pededit/pededit.json
# change: "cors_allowed_origins": ["https://your-domain.example.com"]
sudo systemctl restart pededit
```

## 9. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 10. Updating

Use the deploy script, which pulls social login client IDs from `/etc/pededit/pededit.json` automatically:

```bash
sudo bash /opt/pededit/deploy/deploy.sh
```

This pulls the latest code, rebuilds the frontend (with social login env vars), updates backend dependencies, runs migrations, collects static files, and restarts Gunicorn, then polls `/api/health/` on `127.0.0.1:8000` until it answers 200 with the commit that was just pulled. The script exits non-zero if that takes more than 30 seconds or a different commit is being served, and prints the last answer it got.

The script does not install the service file or the Nginx config. If `deploy/pededit.service` changed, copy it into place again as in step 6. If `deploy/pededit-nginx.conf` changed, make the same edit by hand in `/etc/nginx/sites-available/pededit`, then `sudo nginx -t && sudo systemctl reload nginx`. Do not copy the file over the installed one: that loses your `server_name` and the TLS lines Certbot added.

## 11. Uptime monitoring

Any monitor that reads the HTTP status works (UptimeRobot's free HTTP monitor does). Set up two:

- `https://your-domain/api/health/`: Gunicorn, the database and free disk space. 200 is up, 503 or no answer is down. `HEAD` and `GET` both work.
- `https://your-domain/`: Nginx and the frontend build. The health check cannot see these, because Nginx serves the frontend as static files without touching Gunicorn.

Neither can tell that the app loads but then breaks in the browser. That needs error reporting (#49).

## Troubleshooting

**`deploy.sh` says the health check did not return 200.** With no "last answer" line, Gunicorn failed to start. With one, the answer names the failing check: `"database": "unavailable"` or `"disk": "low"` (free some space, `df -h`). `sudo journalctl -u pededit -e` has the detail; `curl -s http://127.0.0.1:8000/api/health/` repeats the check.

**`deploy.sh` says the health check is serving `''`.** The answer had no `version`, so the app did not see the request as local. The script must ask Gunicorn directly on `127.0.0.1:8000`, not through Nginx or another proxy.

**502 Bad Gateway** — Gunicorn isn't running. Check `sudo systemctl status pededit` and `sudo journalctl -u pededit -e`.

**Static files 404** — Make sure `collectstatic` ran and the Nginx `alias` path matches. Check permissions: `ls -la /opt/pededit/backend/staticfiles/`.

**CORS errors in the browser** — Make sure `cors_allowed_origins` in `/etc/pededit/pededit.json` matches your actual domain including the scheme (`https://`).

**"Missing config file" on startup** — The `/etc/pededit/pededit.json` file is missing or unreadable by the `pededit` user. Check ownership and permissions.

**Database connection refused** — Verify PostgreSQL is running (`sudo systemctl status postgresql`) and the credentials in `pededit.json` match what you created in step 3.
