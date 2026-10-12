# deploy/ — agent notes

Production runs on a single Ubuntu VPS at pededit.com: Gunicorn behind Nginx,
managed by systemd. Full walkthrough is in `INSTALL.md` (the "Production
Deployment" half).

- `deploy.sh` — the update script. Pulls `main` into `/opt/pededit`, runs
  `npm ci`, builds the frontend with the OAuth client IDs pulled from
  `/etc/pededit/pededit.json`, installs Python deps with uv, migrates,
  collects static, restarts the `pededit` service. Run it as root on the box.
- `pededit.service` — systemd unit for Gunicorn as user `pededit`.
- `pededit-nginx.conf` — serves the Vite build, proxies `/api/` and `/admin/`
  to Gunicorn, serves `/djstatic/`.
- `pededit.json.example` — template for the config file.

Still to do from Phase 8: Django security settings hardening, rate limiting,
a health-check endpoint, Sentry, automated database backups.
