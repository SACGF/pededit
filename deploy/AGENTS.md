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
- `GET /api/health/` (`backend/api/health.py`, #50) reports the git commit of
  the checkout (`backend/peded/version.py` reads `.git` directly, no git
  subprocess) and a database round trip. `deploy.sh` polls it after the
  restart and fails if it does not answer 200 with the pulled commit within
  30 seconds. The Nginx vhost has an `access_log off` location for it.
  Neither Nginx nor the unit file is re-copied by `deploy.sh`; a change to
  either has to be installed by hand (INSTALL.md steps 6 and 7).
- `pededit-nginx.conf` — serves the Vite build, proxies `/api/` and `/admin/`
  to Gunicorn, serves `/djstatic/`.
- `pededit.json.example` — template for the config file.

Still to do (#47 to #49): Django security settings hardening, rate limiting,
Sentry, automated database backups.
