# deploy/ — agent notes

Production runs on a single Ubuntu VPS at pededit.com: Gunicorn behind Nginx,
managed by systemd. Full walkthrough is in `INSTALL.md` (the "Production
Deployment" half).

- `deploy.sh` — the update script. Pulls `main` into `/opt/pededit`, runs
  `npm ci`, builds the frontend with the OAuth client IDs pulled from
  `/etc/pededit/pededit.json`, installs Python deps with uv, migrates,
  collects static, restarts the `pededit` service. Run it as root on the box.
- `pededit.service` — systemd unit for Gunicorn as user `pededit`, loading
  `gunicorn.conf.py`, which filters `GET /api/health/` out of the access log
  in `post_fork` (filters on a logger are not inherited by handlers, and the
  access lines are logged by the workers, so `when_ready` in the master is
  the wrong hook).
- `GET /api/health/` (`backend/api/health.py`, #50) checks a database round
  trip and free disk space, 200 or 503. `deploy.sh` polls it after the
  restart and fails if it does not answer 200 with the pulled commit within
  30 seconds. The commit (`backend/peded/version.py` reads `.git` directly,
  no git subprocess) is only in the answer for a loopback caller with no
  proxy headers, so `deploy.sh` must keep asking Gunicorn on `127.0.0.1:8000`
  and every Nginx location must keep setting `X-Forwarded-*`. Through Nginx
  the commit is hidden on purpose: the repo is public and a commit names the
  fixes a server lacks.
- `deploy.sh` restarts itself (`exec`, guarded by `PEDEDIT_DEPLOY_REEXEC`)
  when its own `git pull` changes it. Without that, bash finishes the old
  copy and any newly added step is skipped on the deploy that brings it in
  (the changelog step was, #79).
- Before the build `deploy.sh` runs `frontend/scripts/changelog.mjs` (#79),
  which needs outbound HTTPS to api.github.com and writes the gitignored
  `frontend/public/changelog.json`. A failure keeps the previous file and
  does not stop the deploy. It must never write a tracked file, or the next
  `git pull` would refuse to run.
- After a healthy restart `deploy.sh` prints `manage.py usage_stats` (#78).
  It runs after the deploy is live and its failure is swallowed, so keep
  anything that must gate a deploy before the health check.
- The health check is what uptime monitoring polls (UptimeRobot, which only
  reads the status code and sends `HEAD` by default). It cannot see Nginx or
  the frontend build, since Nginx serves `frontend/dist` without touching
  Gunicorn, so monitoring needs a second check on `/`. There is no Node
  process in production.
- The Nginx vhost has an `access_log off` location for the health check.
  Neither Nginx nor the unit file is installed by `deploy.sh`. The installed
  vhost has been edited by Certbot (TLS) and by hand (`server_name`), so a
  change to `pededit-nginx.conf` is merged into it by hand, never copied over
  it.
- `pededit-nginx.conf` — serves the Vite build, proxies `/api/` and `/admin/`
  to Gunicorn, serves `/djstatic/`. `/llms.txt` and `/docs/` (#200) have
  their own locations: a 404 instead of the app for a missing file, and
  `.md` as `text/markdown`, which Nginx's mime.types lacks. They were added
  after the installed vhost, so merge them in by hand.
  The `location /` `try_files` has `$uri.html` (#202), which serves the
  prerendered guides (`/guides/<slug>` from `dist/guides/<slug>.html`);
  without it they still work, as the app, but crawlers get the landing page
  HTML. Merge that by hand too.
- `pededit.json.example` — template for the config file.
- The landing page tells users what the server keeps (#178, `YourData` in
  `frontend/src/pages/LandingPage.tsx`): request logs with the time, the
  address requested (an API address contains the pedigree's id, which for an
  anonymous pedigree is its key), the browser and the IP address, never the
  request body; that deleting removes the row at once; and what backups keep
  (`backupStatement`, below). Nginx logs with its default format, Gunicorn
  to the journal, and how long either is kept is set on the box, not here.
  Change that text when backups (#48), error reporting (#49), rate limiting
  (#47) or anything else here changes what is kept or where it is sent. A
  proxy or CDN in front of Nginx sees every pedigree in transit and belongs
  in that text too.
- Error reporting (#49) goes to Rollbar and is off until the config has
  `rollbar_access_token` (post_server_item, Django reads it) and
  `rollbar_client_access_token` (post_client_item, `deploy.sh` passes it to
  the build as `VITE_ROLLBAR_ACCESS_TOKEN`, so the frontend only changes on a
  rebuild). A `Content-Security-Policy` added to the vhost must allow
  `https://api.rollbar.com` in `connect-src`. `dist/assets/*.js.map` are
  published on purpose so Rollbar can download them; do not block `.map` in
  Nginx. See INSTALL.md step 12.

## Production hardening (#47)

- `deploy.sh` runs `manage.py check --deploy --fail-level WARNING` first,
  before the build and the migration, so a refusal leaves the running site
  alone. It passes only with `"https": true` in the site config
  (`backend/peded/security.py`). A warning that is accepted on purpose is
  silenced there by name with the reason; never loosen the fail level.
- `SECURE_SSL_REDIRECT` and Nginx must agree. Django sees plain HTTP from
  Gunicorn and learns the real scheme from `X-Forwarded-Proto`
  (`SECURE_PROXY_SSL_HEADER`), which every proxied location sets from
  `$scheme`. A new proxied location without that header redirects for ever.
  The health check is exempt from the redirect because `deploy.sh` asks for
  it over HTTP on loopback.
- pededit.com answers through Cloudflare (`server: cloudflare` in the
  response headers, seen 2026-11-16), which the install guide does not
  assume. Two things follow. `$scheme` at Nginx is what Cloudflare used to
  reach the origin, so the redirect loops unless Cloudflare fetches over
  https. And `X-Forwarded-For` has two entries by the time it reaches
  Gunicorn, so `"num_proxies"` must be 2 there (1 counts Cloudflare's
  address, not the visitor's), unless Nginx is set up with `real_ip_header
  CF-Connecting-IP`, in which case it stays 1.
- HSTS is sent from two places: Django for `/api/` and `/admin/`
  (`hsts_seconds`), Nginx for the frontend and `/djstatic/` (`add_header` in
  each location with one of its own, because Nginx does not inherit
  `add_header` into those). Not at server level, or proxied answers carry it
  twice. Both start at 3600 and are raised together. No preload.
- Rate limits are DRF throttles (`backend/api/throttling.py`), counted in a
  database cache table that `deploy.sh` creates with `createcachetable`. No
  Redis or memcached: the limited requests are rare, and one more service on
  a single VPS is not worth it. Nginx `limit_req` is not configured; it is
  the place for flood protection on the unlimited endpoints if that is ever
  needed.
- Static files stay with Nginx (decided, #47): it already serves the Vite
  build, so `/djstatic/` is one more `location`, and `whitenoise` would add a
  dependency and put static requests through Gunicorn's three workers for no
  gain. Revisit only if Nginx goes away.

## Database backups (#48)

- `backup.sh` (nightly from `pededit-backup.timer`, as user `pededit`):
  `pg_dump` custom format to a temporary name, checked, renamed, then
  retention, then the off-box mirror. `--predeploy` is what `deploy.sh` runs
  before `migrate` (no off-box copy, so a deploy does not depend on the
  remote; the next nightly run mirrors it). `--check` is the preflight
  `deploy.sh` runs before the build. `restore-test.sh` restores a dump into a
  scratch database and checks it. Like the other units, the service and
  timer are installed by hand (INSTALL.md step 13), not by `deploy.sh`,
  which only creates `/var/backups/pededit`.
- **Privacy fact: no dump is kept longer than `BACKUP_MAX_AGE_DAYS` (7
  days by default), and users are told so** (#183). Deleting removes the row
  at once, but every dump taken while it existed keeps it until it is
  deleted, on the server and off it. Retention is by age from the UTC time
  in the file name: the newest dump of each day and the newest 5 pre-deploy
  dumps, none past the limit. Each run deletes what is past it *before* it
  dumps, and mirrors that off the box, so a dump that fails every night still
  cannot keep an old one; the cost is that after a week of failures there
  is no backup left, which `BACKUP_PING_URL` is there to catch. The cut is a
  day less than the limit, less an hour for the timer's random delay, so a
  dump is gone before it is N days old even with one night missed.
- The landing page and the Delete account dialog state the limit
  (`frontend/src/utils/backupStatement.ts`), and that backups are never used
  to bring back a deleted pedigree or account (the maintainer does not
  undelete). `deploy.sh` passes the limit to the build as
  `VITE_BACKUP_MAX_DAYS` only while `pededit-backup.timer` is enabled; with
  it off nothing deletes old dumps on time, so the page names no limit and
  says only that a copy is taken at each update. Enabling or disabling the
  timer changes the page at the next deploy. Whether the off-box copies are
  encrypted and where they are held is set on the server
  (`/etc/pededit/backup.env`), not in this repo: ask the maintainer before
  stating either. A bucket with versioning or object lock keeps deleted
  copies for its own expiry rule, which must not be longer than the limit.
- The off-box copy mirrors (`rclone sync`, `rsync --delete`), so remote
  retention equals local. `BACKUP_MAX_REMOTE_DELETE` stops a run that would
  delete many remote dumps, which is what an emptied local directory looks
  like. Encryption is GnuPG to a public key file (`--recipient-file`, no
  keyring on the server); chosen over `age` because gpg is in a stock Ubuntu
  install. Only the off-box copies are encrypted (`offsite/*.gpg`): the
  local dumps sit beside the live database, and the restore test must read
  them.
- With no destination configured the script warns `LOCAL ONLY` on every
  run and still exits 0. Whether that is the case on pededit.com is the
  maintainer's to say.
- `pg_dump` runs as the app's role from `database_url` (password in the
  environment, never in arguments). It fails if any table in the database
  is owned by another role, which is the right outcome but surprising: a
  scratch table made as `postgres` breaks the nightly backup.
- `bash deploy/test-backup.sh` tests retention, the failure paths and the
  mirror with `pg_dump`, `pg_restore` and `rclone` stubbed, so it needs no
  database. It is not in CI. Run it after any change to `backup.sh`. There
  is no `shellcheck` in the dev environment; `bash -n` at least. A real
  dump and restore need PostgreSQL: a throwaway cluster works without root
  (`/usr/lib/postgresql/*/bin/initdb` and `pg_ctl` under `/tmp`).
