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

With neither set up the app still works in full: nobody needs an account, each pedigree is reached by its own link, and the sign-in page says that sign-in is not set up. There is no username and password sign-in.

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
├── pededit-nginx.conf      # Nginx vhost → /etc/nginx/sites-available/pededit
└── pededit-nginx-catchall.conf  # drops other Host names → /etc/nginx/sites-available/catchall
```

Database backups (step 13) add `backup.sh`, `restore-test.sh`, `pededit-backup.service`, `pededit-backup.timer` and `backup.env.example` from the same directory.

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

If you don't set these, the social sign-in buttons do not appear and the sign-in page says that sign-in is not set up. The app works in full without accounts.

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
sudo -u pededit .venv/bin/python manage.py createcachetable
sudo -u pededit .venv/bin/python manage.py collectstatic --noinput
```

`createcachetable` makes the table the rate limit counters are kept in (step 8). The Django static files (admin CSS/JS) will be collected to `backend/staticfiles/`.

### (Optional) Create a superuser for Django admin

Only needed if you want access to the Django admin panel at `/admin/`. Not required for normal use. An admin account gives access to the admin panel only: it cannot sign in to the app, where sign-in is by Google or GitHub.

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

Once `server_name` is your domain, add the catch-all, which closes the connection for any other Host (scanners trying the server's IP address), so they never reach Django and never show up in error reporting as `DisallowedHost`:

```bash
sudo cp /opt/pededit/deploy/pededit-nginx-catchall.conf /etc/nginx/sites-available/catchall
sudo ln -sf /etc/nginx/sites-available/catchall /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Every name the site answers to (`pededit.com` and `www.pededit.com`, say) must then be in the pededit vhost's `server_name`: any other is dropped. Skip this step while `server_name` is an IP address. It needs Nginx 1.19.4 or later (`ssl_reject_handshake`).

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

### Turn on the HTTPS settings

Once `https://your-domain.example.com` loads, add `"https": true` to `/etc/pededit/pededit.json` and restart (`sudo systemctl restart pededit`). That one key turns on Django's redirect to https, secure cookies for the admin, and HSTS. `deploy.sh` runs `manage.py check --deploy --fail-level WARNING` before it changes anything and refuses to deploy until this is set.

Check it straight away, because a proxy that does not tell Django the request was https makes every API call redirect for ever:

```bash
curl -sI https://your-domain.example.com/api/pedigrees/   # 401 is right; 301 back to the same URL is the loop
curl -sI https://your-domain.example.com/api/health/ | grep -i strict-transport   # max-age=3600; includeSubDomains
curl -sI https://your-domain.example.com/ | grep -i strict-transport              # the same, sent by Nginx
```

If the first answers 301, set `"https": false`, restart, and look at what reaches Gunicorn: each proxied `location` must have `proxy_set_header X-Forwarded-Proto $scheme;`, and the request must arrive at Nginx on 443. Behind a CDN that fetches from your server over plain HTTP (Cloudflare's "Flexible" mode), `$scheme` is `http` however the visitor connected, so switch the CDN to fetch over https ("Full (strict)") before turning this on.

HSTS tells a browser to refuse plain HTTP for the site for `max-age` seconds, and there is no taking it back for a browser that has seen it. It starts at one hour. Once the site has run clean for a few days, raise it to a day and then a year, in both places:

- `"hsts_seconds": 86400` (later `31536000`) in `/etc/pededit/pededit.json`, for `/api/` and `/admin/`.
- `max-age=` in the five `add_header Strict-Transport-Security` lines of `/etc/nginx/sites-available/pededit`, for the frontend and `/djstatic/`.

The header includes subdomains. If a subdomain of yours is still served over plain HTTP, set `"hsts_include_subdomains": false` and drop `; includeSubDomains` from the Nginx lines. Preload is not set and should stay a decision you make by hand: it takes months to undo.

### Rate limits

Sign-in, token refresh and creating a pedigree without an account are limited per client address (`backend/api/throttling.py`). Opening and saving a pedigree are never limited. The defaults suit a clinic or a class behind one address:

| `throttle_rates` key | Default | Counts |
|---|---|---|
| `auth_login` | `20/min` | Google and GitHub sign-in |
| `auth_refresh` | `60/min` | renewing a token |
| `anon_create_burst` | `20/min` | new pedigrees with no account |
| `anon_create_sustained` | `500/day` | the same, over a day |

To change one, add for example `"throttle_rates": {"anon_create_sustained": "2000/day"}` to the config; `null` turns a limit off. A limited request gets HTTP 429.

The client address comes from `X-Forwarded-For`, and `"num_proxies"` says how many proxies added to it: `1` for Nginx alone (the default), `2` when a CDN such as Cloudflare sits in front of Nginx. Get this wrong behind a CDN and everybody shares a handful of buckets, one per CDN address. To check, watch a request arrive:

```bash
sudo tcpdump -A -i lo -c 40 'tcp port 8000' | grep -i x-forwarded-for
```

The last address is whoever connected to Nginx. If that is your CDN and not you, use `2`. With `2`, also make the firewall accept ports 80 and 443 only from the CDN's addresses: anyone who can reach Nginx directly can otherwise put any address they like in the header.

The counters are kept in a database table so the Gunicorn workers share them. `deploy.sh` creates it; by hand it is `manage.py createcachetable`.

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

It first runs `manage.py check --deploy --fail-level WARNING` and stops, with the running site untouched, if Django has anything to say about the production settings (step 8). It dumps the database just before the migrations (step 13). In between it pulls the latest code, rebuilds the frontend (with social login env vars), updates backend dependencies, runs migrations, collects static files, and restarts Gunicorn, then polls `/api/health/` on `127.0.0.1:8000` until it answers 200 with the commit that was just pulled. The script exits non-zero if that takes more than 30 seconds or a different commit is being served, and prints the last answer it got.

Each restart is recorded in `/var/lib/pededit/deploys.log` (time, the commit that was running, the commit started).

To go back to an earlier release, give its tag (`git -C /opt/pededit tag -n1` lists them) or a commit, or nothing for the commit the last deploy replaced:

```bash
sudo bash /opt/pededit/deploy/deploy.sh --back-to 2026-11-16-family-business
```

It does everything a deploy does except take a dump and migrate. If the database has migrations the release does not have, it stops before changing anything and prints the `manage.py migrate` command that undoes them (which drops what they added) or points at the pre-deploy dump (step 13). The next plain `deploy.sh` goes back to `main`; if the release is older than `--back-to` itself, run `sudo -u pededit git -C /opt/pededit checkout main` first, as the script reminds you.

The script does not install the service file or the Nginx config. If `deploy/pededit.service` changed, copy it into place again as in step 6. If `deploy/pededit-nginx.conf` changed, make the same edit by hand in `/etc/nginx/sites-available/pededit`, then `sudo nginx -t && sudo systemctl reload nginx`. Do not copy the file over the installed one: that loses your `server_name` and the TLS lines Certbot added.

## 11. Uptime monitoring

Any monitor that reads the HTTP status works (UptimeRobot's free HTTP monitor does). Set up two:

- `https://your-domain/api/health/`: Gunicorn, the database and free disk space. 200 is up, 503 or no answer is down. `HEAD` and `GET` both work.
- `https://your-domain/`: Nginx and the frontend build. The health check cannot see these, because Nginx serves the frontend as static files without touching Gunicorn.

Neither can tell that the app loads but then breaks in the browser. That needs error reporting (step 12).

## 12. Error reporting (optional)

Off by default. With no Rollbar token in the site config nothing is loaded and nothing is sent: the backend never imports `rollbar` and the frontend build contains no reporter. Turning it on sends error reports to a third party (Rollbar), so say so in your privacy statement.

To turn it on:

1. Create a Rollbar project (one project takes both the Django and the browser reports). When it asks you to select SDKs, pick Django (or skip) and ignore the install instructions that follow: PedEdit has its own reporting code, and Rollbar's browser snippet (`rollbar.js`) must not be added, since by default it collects page URLs, console output and page text. Then under Project Settings > Project Access Tokens create two tokens, each with one scope and no `read` or `write`:
   - `post_server_item`, for Django;
   - `post_client_item`, for the browser. It ends up in the public JavaScript, so anyone can copy it: give it a rate limit (a few hundred items an hour) so it cannot use up the project's quota.
2. Add them to `/etc/pededit/pededit.json`:

   ```json
   "rollbar_access_token": "<post_server_item token>",
   "rollbar_client_access_token": "<post_client_item token>",
   "rollbar_environment": "production"
   ```

   | Key | Used by | Default |
   |---|---|---|
   | `rollbar_access_token` | Django. Ignored while `debug` is true. Keep it secret: it can post anything to the project. | empty: off |
   | `rollbar_client_access_token` | `deploy.sh`, which passes it to the frontend build as `VITE_ROLLBAR_ACCESS_TOKEN`. It ends up in the public JavaScript, which is normal for a `post_client_item` token: it can only submit reports. | empty: off |
   | `rollbar_environment` | Both, as the report's environment. | `production` |

3. Run `sudo bash /opt/pededit/deploy/deploy.sh`. The frontend only changes when it is rebuilt; the build prints `Error reporting is on. Code version: ...` when it has a token.
4. If Nginx sends a `Content-Security-Policy` header, add `https://api.rollbar.com` to `connect-src`, or the browser blocks the reports.
5. Notifications (Slack, email) are set up in Rollbar itself, under Project Settings > Notifications.

**What a report contains.** Pedigrees are family health data, and the `/p/<id>` link is the key to an anonymous pedigree, so both sides build each report from a short list of fields and drop everything else (`backend/peded/error_reporting.py`, `frontend/src/errorReporting/scrub.ts`):

- the class of the error and its message, with quoted text, ids, dates, long numbers, emails, URLs and tokens removed (for a logged error, the log call's format string, never its values);
- the stack trace: file, function and line (the backend also sends the line of source code of each frame, which is public code);
- the kind of page or API route it happened on, as a pattern (`/p/[id]`, `/api/pedigrees/{pk}/`), and the HTTP method;
- the code version (the commit for the backend, the build date for the frontend), the environment, and the Python version.

**What is never sent:** names, dates of birth, notes or any other pedigree content; pedigree ids and links; request and response bodies; query strings; headers, cookies and sign-in tokens; who the user is (no Rollbar "person"); the user's IP address; local variables; console output; text from the page; clicks and keystrokes; telemetry; the server's host name. Rollbar sees the connection a browser report arrives on (IP address and browser version), as any web server does; it stores an IP address on an item only when the report includes one, and these never do.

The message of an error is the one free-text field. An error written as `raise ValueError(f"bad name {name!r}")` is safe because the quoted part is removed, but text interpolated without quotes is only caught if it looks like an id, date, number, email or URL. Do not put pedigree content in exception or log messages.

**Source maps (readable frontend stack traces).** The build publishes a source map beside each script (`dist/assets/*.js.map`). The code is public, so this gives nothing away, and each report tells Rollbar to download the map from your site (`source_map_enabled`, filed under the code version), which needs no upload step. It only works if Rollbar can reach the site: for a site behind a login or firewall, upload each map after the build instead, with the `post_server_item` token and the code version the build prints:

```bash
curl https://api.rollbar.com/api/1/sourcemap \
  -F access_token=<post_server_item token> \
  -F version="pededit-frontend@<build date>" \
  -F minified_url=https://your-domain/assets/index-<hash>.js \
  -F source_map=@/opt/pededit/frontend/dist/assets/index-<hash>.js.map
```

That is not part of `deploy.sh`. Backend stack traces need nothing: Python sends source lines itself.

**Checking it works.** After the deploy, from `/opt/pededit/backend` run `sudo -u pededit .venv/bin/python manage.py shell -c "import rollbar; rollbar.report_message('PedEdit backend test'); rollbar.wait()"`; it should show up in the project as a `python` item. For the frontend, open the site, run `setTimeout(() => { throw new Error("PedEdit frontend test") })` in the browser console and look for a `javascript` item.

## 13. Database backups

Pedigrees are family health data on one server. `deploy/backup.sh` dumps the database every night, keeps a week of dumps, and copies them off the server.

### Install

```bash
sudo install -d -o pededit -g pededit -m 700 /var/backups/pededit
sudo cp /opt/pededit/deploy/pededit-backup.service /opt/pededit/deploy/pededit-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pededit-backup.timer

sudo systemctl start pededit-backup      # take one now
sudo systemctl status pededit-backup     # "status=0/SUCCESS", and the script's own lines
systemctl list-timers pededit-backup     # when the next one runs (02:30 server time)
```

Each run writes `/var/backups/pededit/pededit-db-<UTC time>.dump` (`pg_dump` custom format, compressed) under a temporary name, checks it is a readable archive of a believable size that contains the pedigree table, and only then gives it its final name. Any failure exits non-zero with a line starting `BACKUP FAILED`, so the unit shows as failed in `systemctl status pededit-backup` and `systemctl --failed`, with the reason in `journalctl -u pededit-backup`.

`deploy.sh` also takes a dump just before it runs migrations (`pededit-predeploy-<time>.dump`), and refuses to migrate if it cannot.

### Copy it off the server

Until you do this, every run ends with a `LOCAL ONLY` warning, and it means it: a backup on the same disk as the database is lost with the server.

```bash
sudo cp /opt/pededit/deploy/backup.env.example /etc/pededit/backup.env
sudo chown root:pededit /etc/pededit/backup.env
sudo chmod 640 /etc/pededit/backup.env
sudo nano /etc/pededit/backup.env
```

Set one or both of:

- `BACKUP_RCLONE_DEST` for object storage (S3, Backblaze B2 and others): `sudo apt install rclone`, create a bucket and a key that can only write to it, run `sudo RCLONE_CONFIG=/etc/pededit/rclone.conf rclone config`, then `sudo chown root:pededit /etc/pededit/rclone.conf && sudo chmod 640 /etc/pededit/rclone.conf` and set `RCLONE_CONFIG` in `backup.env` as the example shows.
- `BACKUP_RSYNC_DEST` for a second host over ssh. Make a key for it (`sudo ssh-keygen -t ed25519 -N '' -f /etc/pededit/backup_ssh_key`, then `sudo chown pededit /etc/pededit/backup_ssh_key`), add the `.pub` to the backup account on the other host, and record that host's key: `sudo -u pededit mkdir -p -m 700 ~pededit/.ssh && ssh-keyscan backup.example.org | sudo -u pededit tee -a ~pededit/.ssh/known_hosts`.

Both mirror the kept dumps, so the copies follow the same retention as the server. Only files named `pededit-*.dump*` are touched at the destination, and a mirror that would delete more than 10 of them there stops instead (a sign the local set has gone missing). For protection against a compromised server deleting its own backups, turn on versioning or object lock on the bucket; then the bucket's own expiry rule decides how long a deleted pedigree stays in it, and it must be no longer than `BACKUP_MAX_AGE_DAYS`, since the site tells users that number.

**Encrypt what leaves the server.** The copies are family health data in someone else's storage. Make a GnuPG key pair on your own machine, not on the server, and put only the public key on the server:

```bash
# on your own machine
gpg --quick-generate-key "PedEdit backups <you@example.org>" default default never
gpg --armor --export "PedEdit backups" > backup-public-key.asc
# copy backup-public-key.asc to the server as /etc/pededit/backup-public-key.asc (root:pededit, 640)
```

Set `BACKUP_GPG_PUBLIC_KEY=/etc/pededit/backup-public-key.asc`. From then on only `.dump.gpg` files leave the server. The dumps on the server itself stay unencrypted: the live database sits beside them, and the restore test reads them. Without the private key the copies cannot be read by anyone, you included, so keep it (and its passphrase) somewhere that survives losing both the server and your laptop.

Then run it and look: `sudo systemctl start pededit-backup; sudo journalctl -u pededit-backup -n 20` should end with an `off-box: mirrored to ...` line and no `LOCAL ONLY` warning. Check the files really are at the destination.

**Being told when backups stop.** Nobody reads `systemctl status` on a server that is working. Set `BACKUP_PING_URL` to a dead man's switch (healthchecks.io or similar) with a period of one day: the script fetches it after each successful nightly run, and the service emails you when the ping is late, whether the backup failed or the timer never fired.

### What is kept, and for how long

- The newest dump of each day, for at most `BACKUP_MAX_AGE_DAYS` (default 7).
- The newest 5 pre-deploy dumps (`BACKUP_KEEP_PREDEPLOY`), under the same limit.

**This is also how long deleted data lives on, and the site says so.** A pedigree or account that a user deletes is removed from the database at once, but it stays in every dump taken while it existed, on the server and in the off-box copies, until those dumps are deleted. Nothing removes one pedigree from a dump. The landing page and the Delete account dialog tell users that backups are deleted within `BACKUP_MAX_AGE_DAYS` days and are never used to bring back a deleted pedigree or account: `deploy.sh` builds that number into the page while `pededit-backup.timer` is enabled, so after enabling the timer or changing the number, deploy again. Each run deletes dumps past the limit before it takes a new one, so even a run whose dump fails keeps the promise; after a week of failures there is no backup left, which is what `BACKUP_PING_URL` above is for.

If you are moving from the older settings (`BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, no longer read), the first run deletes the weekly dumps off the box too, which can be more than the 10-file safety limit. Run it once by hand with a higher limit: `sudo -u pededit env BACKUP_MAX_REMOTE_DELETE=30 bash /opt/pededit/deploy/backup.sh`.

### Test the restore

A backup nobody has restored is a hope. This restores the newest dump into a scratch database, checks the tables, the row counts and that every pedigree's data came back, compares the count with the live database, and drops the scratch database. It does not touch the live one:

```bash
sudo bash /opt/pededit/deploy/restore-test.sh
```

It ends with `RESTORE TEST PASSED` or `RESTORE TEST FAILED` and the reason, including when the newest dump is more than two days old. Run it when you set backups up and every few months after. To test an off-box copy, which is the one that matters when the server is gone, fetch it, decrypt it on the machine that holds the private key (`gpg --output x.dump --decrypt pededit-db-....dump.gpg`), and give the script the file: `sudo bash deploy/restore-test.sh /path/to/x.dump`.

### Restore for real

On the same server, back to a chosen dump. The damaged database is renamed, not dropped, until the restored one is seen to work.

```bash
DUMP=/var/backups/pededit/pededit-db-20261116T023000Z.dump   # the one you chose

sudo systemctl stop pededit
sudo -u postgres psql -c "ALTER DATABASE pededit RENAME TO pededit_before_restore"
sudo -u postgres createdb -O pededit pededit
sudo cat "$DUMP" | sudo -u postgres pg_restore --no-owner --role=pededit --exit-on-error -d pededit

cd /opt/pededit/backend
sudo -u pededit .venv/bin/python manage.py migrate    # only does anything if the code is newer than the dump
sudo systemctl start pededit
curl -s http://127.0.0.1:8000/api/health/
sudo -u pededit .venv/bin/python manage.py usage_stats
```

Open a pedigree you know. When you are satisfied: `sudo -u postgres dropdb pededit_before_restore`. Everything saved after the dump was taken is gone from the restored database; it is still in `pededit_before_restore` if that database is readable.

To undo a bad migration, restore the `pededit-predeploy-...` dump the same way but leave out the `migrate` line (it would run the bad migration again), then `sudo bash /opt/pededit/deploy/deploy.sh --back-to` to run the code from before it. Restore first: until then the database has the migration and `--back-to` refuses.

On a new server, after losing the old one: follow this guide from step 1 to step 5 but stop before "Run migrations", fetch the newest off-box copy, decrypt it with the private key, then run the `pg_restore` line above into the empty database from step 3, and carry on from the migrations. `/etc/pededit/pededit.json` and `backend/secret_key.txt` are not in the database dump: without the old secret key everyone signed in has to sign in again, and nothing else is lost.

## Troubleshooting

**`pededit-backup` failed.** `sudo journalctl -u pededit-backup -n 30` has a `BACKUP FAILED` line with the reason. A `pg_dump` "permission denied for table" means a table in the database belongs to another role (made by hand as `postgres`, say): give it to the app's role with `ALTER TABLE ... OWNER TO pededit`, or drop it. A failed off-box copy leaves the local dump in place and fails the run. `status=226/NAMESPACE` means `/var/backups/pededit` does not exist.

**`deploy.sh` says the health check did not return 200.** With no "last answer" line, Gunicorn failed to start. With one, the answer names the failing check: `"database": "unavailable"` or `"disk": "low"` (free some space, `df -h`). `sudo journalctl -u pededit -e` has the detail; `curl -s http://127.0.0.1:8000/api/health/` repeats the check.

**`deploy.sh` says the health check is serving `''`.** The answer had no `version`, so the app did not see the request as local. The script must ask Gunicorn directly on `127.0.0.1:8000`, not through Nginx or another proxy.

**`deploy.sh` says `check --deploy` reported problems.** `security.W004`, `W008`, `W012` and `W016` together mean `"https": true` is missing from `/etc/pededit/pededit.json` (step 8). `security.W018` means `"debug"` is true. Nothing was deployed; fix the config and run it again.

**The browser says "too many redirects" on anything under `/api/`.** `"https": true` is set but Django is not being told the request was https. See "Turn on the HTTPS settings" in step 8.

**502 Bad Gateway** — Gunicorn isn't running. Check `sudo systemctl status pededit` and `sudo journalctl -u pededit -e`.

**Static files 404** — Make sure `collectstatic` ran and the Nginx `alias` path matches. Check permissions: `ls -la /opt/pededit/backend/staticfiles/`.

**CORS errors in the browser** — Make sure `cors_allowed_origins` in `/etc/pededit/pededit.json` matches your actual domain including the scheme (`https://`).

**"Missing config file" on startup** — The `/etc/pededit/pededit.json` file is missing or unreadable by the `pededit` user. Check ownership and permissions.

**Database connection refused** — Verify PostgreSQL is running (`sudo systemctl status postgresql`) and the credentials in `pededit.json` match what you created in step 3.
