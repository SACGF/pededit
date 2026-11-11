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
  to Gunicorn, serves `/djstatic/`.
- `pededit.json.example` — template for the config file.

Still to do (#47 to #49): Django security settings hardening, rate limiting,
Sentry, automated database backups.
