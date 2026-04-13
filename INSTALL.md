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
sudo useradd --system --shell /usr/sbin/nologin pededit
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

```bash
cd /opt/pededit
sudo -u pededit npm ci --cache /opt/pededit/.npm-cache
sudo -u pededit npm -w @pedigree-editor/frontend run build
```

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
```

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

To deploy a new version:

```bash
cd /opt/pededit
sudo -u pededit git pull

# Rebuild frontend
sudo -u pededit npm ci --cache /opt/pededit/.npm-cache
sudo -u pededit npm -w @pedigree-editor/frontend run build

# Update backend
cd backend
sudo -u pededit uv pip install --python .venv/bin/python -r requirements.txt
sudo -u pededit .venv/bin/python manage.py migrate
sudo -u pededit .venv/bin/python manage.py collectstatic --noinput

sudo systemctl restart pededit
# Nginx does not need a restart — it serves the new static files immediately
```

## Troubleshooting

**502 Bad Gateway** — Gunicorn isn't running. Check `sudo systemctl status pededit` and `sudo journalctl -u pededit -e`.

**Static files 404** — Make sure `collectstatic` ran and the Nginx `alias` path matches. Check permissions: `ls -la /opt/pededit/backend/staticfiles/`.

**CORS errors in the browser** — Make sure `cors_allowed_origins` in `/etc/pededit/pededit.json` matches your actual domain including the scheme (`https://`).

**"Missing config file" on startup** — The `/etc/pededit/pededit.json` file is missing or unreadable by the `pededit` user. Check ownership and permissions.

**Database connection refused** — Verify PostgreSQL is running (`sudo systemctl status postgresql`) and the credentials in `pededit.json` match what you created in step 3.
